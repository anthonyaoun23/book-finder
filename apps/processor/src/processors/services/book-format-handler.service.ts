import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfjs from 'pdfjs-dist';
import { EPub } from 'epub2';
import { LLMService } from './llm.service';
pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.mjs';

export interface ContentExtractionResult {
  pageNumber: number;
  text: string;
  format: 'pdf' | 'epub';
}

interface EpubTocElement {
  id: string;
  title: string;
  order: number;
  href: string;
}

// Define types for PDF.js
interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getTextContent(): Promise<PDFTextContent>;
}

interface PDFTextContent {
  items: PDFTextItem[];
}

interface PDFTextItem {
  str?: string;
  [key: string]: any;
}

interface EpubFlowElement {
  id: string;
  href: string;
  mediaType?: string;
}

// Optional page mapping info from EPUB
interface PageMapping {
  pageId: string;
  href: string;
  pageNumber: string;
}

abstract class BookFormatHandler {
  protected readonly logger: Logger;
  protected previousPages: string[] = [];

  constructor(protected readonly llmService: LLMService) {
    this.logger = new Logger(this.constructor.name);
  }

  abstract extractPageText(
    filePath: string,
    pageNumber: number,
  ): Promise<string>;
}

class PdfFormatHandler extends BookFormatHandler {
  async extractPageText(pdfPath: string, pageNumber: number): Promise<string> {
    try {
      if (!fs.existsSync(pdfPath))
        throw new Error(`PDF file not found: ${pdfPath}`);
      const data = new Uint8Array(fs.readFileSync(pdfPath));

      // Type assertion for PDF.js to resolve TypeScript errors
      const pdfjsDocument = await (pdfjs as any).getDocument({ data }).promise;
      // Cast to our interface type
      const pdfDocument = pdfjsDocument as PDFDocumentProxy;

      if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
        throw new Error(
          `Invalid page number: ${pageNumber}. PDF has ${pdfDocument.numPages} pages.`,
        );
      }
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      return textContent.items
        .filter((item) => 'str' in item)
        .map((item) => item.str || '')
        .join(' ');
    } catch (error) {
      this.logger.error(
        `Error extracting PDF page ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }
}

class EpubFormatHandler extends BookFormatHandler {
  // Approximate number of characters that constitute a "page" of text
  private readonly BOOKS_CHARS_PER_PAGE = 3000;
  private readonly BOOKS_WORDS_PER_PAGE = 400;

  async extractPageText(epubPath: string, pageNumber: number): Promise<string> {
    try {
      this.logger.debug(
        `Extracting text from EPUB: ${epubPath}, page: ${pageNumber}`,
      );
      if (!fs.existsSync(epubPath)) {
        throw new Error(`EPUB file not found: ${epubPath}`);
      }

      // Initialize EPub with default image and link roots
      const epub = await EPub.createAsync(epubPath, '/images/', '/links/');
      this.logger.debug(`EPUB loaded successfully: ${epubPath}`);

      // flow contains the chapter list
      if (!epub.flow || !Array.isArray(epub.flow)) {
        throw new Error('EPUB flow not found or invalid');
      }

      this.logger.debug(`EPUB flow has ${epub.flow.length} chapters`);

      // Try to find page map if available
      const pageMapping = await this.extractPageMapping(epub);
      if (pageMapping.length > 0) {
        this.logger.debug(
          `Found page mapping with ${pageMapping.length} pages`,
        );

        // If we have page mapping and the requested page is in range
        if (pageNumber <= pageMapping.length) {
          const pageMappingEntry = pageMapping[pageNumber - 1];
          if (pageMappingEntry) {
            this.logger.debug(
              `Using page mapping entry: ${JSON.stringify(pageMappingEntry)}`,
            );

            // Use the page mapping to get content
            try {
              const chapterIdByHref = this.findChapterIdByHref(
                epub.flow,
                pageMappingEntry.href,
              );
              if (chapterIdByHref) {
                this.logger.debug(
                  `Found chapter ID ${chapterIdByHref} for page ${pageNumber}`,
                );

                // Get chapter content
                const chapterContent = await this.getEpubChapter(
                  epub,
                  chapterIdByHref,
                );
                if (chapterContent) {
                  const pageContent = this.extractContentAtPageBoundary(
                    chapterContent,
                    pageMappingEntry.href,
                  );
                  return pageContent;
                }
              }
            } catch (error) {
              this.logger.warn(
                `Failed to extract page using mapping: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        }
      }

      // Fall back to flow-based chapter extraction if no page mapping or extraction failed
      if (pageNumber < 1 || pageNumber > epub.flow.length) {
        throw new Error(
          `Invalid chapter number: ${pageNumber}. EPUB has ${epub.flow.length} chapters.`,
        );
      }

      const flowItem = epub.flow[pageNumber - 1] as EpubFlowElement;
      this.logger.debug(
        `Getting flow item at index ${pageNumber - 1}: ${JSON.stringify(flowItem, null, 2)}`,
      );

      if (!flowItem || !flowItem.id) {
        throw new Error(`No valid flow item found at index ${pageNumber - 1}`);
      }

      // Use chapter ID for getChapter, not href
      this.logger.debug(`Fetching chapter with ID: ${flowItem.id}`);
      const chapterContent = await this.getEpubChapter(epub, flowItem.id);

      // Extract just the first page worth of content
      const pageContent = this.extractFirstPageContent(chapterContent || '');
      this.logger.debug(
        `Extracted first page content, length: ${pageContent.length} characters`,
      );

      return pageContent;
    } catch (error) {
      this.logger.error(
        `Error extracting EPUB chapter ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }

  /**
   * Extracts the first page worth of content from a longer chapter text using smart algorithms
   * that mimic how e-readers like Apple Books would paginate content.
   */
  private extractFirstPageContent(fullText: string): string {
    try {
      // First remove HTML tags
      const plainText = this.stripHtml(fullText);

      if (plainText.length <= this.BOOKS_CHARS_PER_PAGE) {
        return plainText; // If it's already short, just return it all
      }

      // Split by words and take the first portion
      const words = plainText.split(/\s+/);
      const pageWords = words.slice(0, this.BOOKS_WORDS_PER_PAGE);

      // Join back and ensure we end with a complete sentence if possible
      let pageText = pageWords.join(' ');

      // Try to end at a paragraph boundary for more natural page breaks
      const paragraphMatch = pageText.match(/(\n|\r\n|\r){2}[^\n\r]*$/);
      if (
        paragraphMatch &&
        paragraphMatch.index &&
        paragraphMatch.index > pageText.length / 2
      ) {
        // If we found a paragraph end in the second half, cut there
        pageText = pageText.slice(0, paragraphMatch.index);
        return pageText;
      }

      // Try to end at a sentence boundary for more natural page breaks
      const sentenceEndMatch = pageText.match(/[.!?][^.!?]*$/);
      if (
        sentenceEndMatch &&
        sentenceEndMatch.index &&
        sentenceEndMatch.index > pageText.length / 2
      ) {
        // If we found a sentence end in the second half of our excerpt, cut there
        pageText = pageText.slice(0, sentenceEndMatch.index + 1);
      }

      return pageText;
    } catch (error) {
      this.logger.error(
        `Error extracting page content: ${error instanceof Error ? error.message : String(error)}`,
      );
      return fullText.slice(0, this.BOOKS_CHARS_PER_PAGE); // Fallback to simple slicing
    }
  }

  /**
   * Extracts content at a specific page boundary using the page mapping href fragment
   */
  private extractContentAtPageBoundary(
    chapterContent: string,
    href: string,
  ): string {
    try {
      // Parse href to find fragment, which typically points to an anchor in the chapter
      const fragment = href.includes('#') ? href.split('#')[1] : null;

      if (!fragment) {
        // If no fragment, just use the start of the chapter
        return this.extractFirstPageContent(chapterContent);
      }

      // Try to find the fragment in the HTML content
      const htmlContent = chapterContent;
      const fragmentPattern = new RegExp(`id=["']${fragment}["']`, 'i');
      const match = htmlContent.match(fragmentPattern);

      if (!match || !match.index) {
        // If fragment not found, fall back to start of chapter
        return this.extractFirstPageContent(chapterContent);
      }

      // Extract content starting from the fragment position
      const contentFromFragment = htmlContent.substring(match.index);
      return this.extractFirstPageContent(contentFromFragment);
    } catch (error) {
      this.logger.error(
        `Error extracting content at page boundary: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.extractFirstPageContent(chapterContent);
    }
  }

  /**
   * Attempts to extract page mapping information from the EPUB file
   */
  private async extractPageMapping(epub: any): Promise<PageMapping[]> {
    const pageMapping: PageMapping[] = [];

    try {
      // Check if the EPUB has an OPF file with page-map
      const hasPageMap = epub.metadata && epub.metadata['page-map'];
      if (hasPageMap) {
        this.logger.debug('Found page-map in EPUB metadata');

        // Try to extract the page-map.xml file
        const pageMapId =
          typeof hasPageMap === 'string' ? hasPageMap : 'page-map.xml';

        // Get the page-map file content
        await new Promise<void>((resolve, reject) => {
          epub.getFile(
            pageMapId,
            (error: Error | null, data: Buffer, mimeType: string) => {
              if (error || !data) {
                this.logger.warn(
                  `Failed to get page-map file: ${error?.message || 'No data'}`,
                );
                resolve();
                return;
              }

              try {
                // Parse the XML data
                const content = data.toString('utf-8');
                // Simple regex-based parsing of page-map
                const pagePoints =
                  content.match(/<page[^>]*>[^<]*<\/page>/g) || [];

                for (const pagePoint of pagePoints) {
                  const idMatch = pagePoint.match(/id=["']([^"']*)["']/);
                  const hrefMatch = pagePoint.match(/href=["']([^"']*)["']/);
                  const nameMatch = pagePoint.match(/>([^<]*)</);

                  if (
                    idMatch &&
                    idMatch[1] &&
                    hrefMatch &&
                    hrefMatch[1] &&
                    nameMatch &&
                    nameMatch[1]
                  ) {
                    pageMapping.push({
                      pageId: idMatch[1],
                      href: hrefMatch[1],
                      pageNumber: nameMatch[1],
                    });
                  }
                }

                this.logger.debug(
                  `Extracted ${pageMapping.length} page mappings from page-map`,
                );
              } catch (parseError) {
                this.logger.error(
                  `Error parsing page-map: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
                );
              }

              resolve();
            },
          );
        });
      }

      // If no page mapping found or it's empty, check for pageList in Navigation
      if (
        pageMapping.length === 0 &&
        epub.navigation &&
        epub.navigation.pageList
      ) {
        this.logger.debug('Found page-list in EPUB navigation');
        const pageList = epub.navigation.pageList;

        // Process the page list
        for (let i = 0; i < pageList.length; i++) {
          const pageItem = pageList[i];
          if (pageItem && pageItem.href) {
            pageMapping.push({
              pageId: `page_${i + 1}`,
              href: pageItem.href,
              pageNumber: String(i + 1),
            });
          }
        }

        this.logger.debug(
          `Extracted ${pageMapping.length} page mappings from navigation pageList`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error extracting page mapping: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return pageMapping;
  }

  /**
   * Find chapter ID by its href
   */
  private findChapterIdByHref(flow: any[], href: string): string | null {
    // Extract base href without fragment
    const baseHref = href.includes('#') ? href.split('#')[0] : href;

    // Find matching chapter
    for (const item of flow) {
      if (item && typeof item === 'object' && item.href) {
        const itemHref = String(item.href);
        if (
          itemHref === baseHref ||
          (baseHref && itemHref.endsWith(baseHref)) ||
          (baseHref && baseHref.endsWith(itemHref))
        ) {
          return String(item.id);
        }
      }
    }

    return null;
  }
  // Helper method to get chapter content with Promise
  private getEpubChapter(epub: any, chapterId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.logger.debug(`Getting chapter content with ID: ${chapterId}`);

      epub.getChapter(chapterId, (error: Error | null, data: string) => {
        if (error) {
          this.logger.error(
            `Error in getChapter for ID ${chapterId}: ${error.message}`,
          );
          reject(error);
          return;
        }

        if (!data) {
          this.logger.warn(`No data returned for chapter ID: ${chapterId}`);
          resolve('');
          return;
        }

        this.logger.debug(
          `Successfully retrieved chapter ${chapterId}, length: ${data.length}`,
        );
        resolve(data);
      });
    });
  }

  private stripHtml(html: string): string {
    try {
      return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch (error) {
      this.logger.error(
        `Error stripping HTML: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }
}

@Injectable()
export class BookFormatHandlerService {
  private readonly logger = new Logger(BookFormatHandlerService.name);
  private readonly handlers: { [key: string]: BookFormatHandler };

  constructor(private readonly llmService: LLMService) {
    this.handlers = {
      '.pdf': new PdfFormatHandler(this.llmService),
      '.epub': new EpubFormatHandler(this.llmService),
    };
  }

  private getHandler(filePath: string): BookFormatHandler {
    const ext = path.extname(filePath).toLowerCase();
    const handler = this.handlers[ext];
    if (!handler) throw new Error(`Unsupported file format: ${ext}`);
    return handler;
  }

  async extractPageText(filePath: string, pageNumber: number): Promise<string> {
    return this.getHandler(filePath).extractPageText(filePath, pageNumber);
  }
}
