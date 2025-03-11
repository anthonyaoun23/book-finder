import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfjs from 'pdfjs-dist';
import { EPub } from 'epub2';

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

  constructor(protected readonly openaiService: OpenAIService) {
    this.logger = new Logger(this.constructor.name);
  }

  abstract extractPageText(
    filePath: string,
    pageNumber: number,
  ): Promise<string>;

  abstract findFirstContentPage(
    filePath: string,
    maxPagesToCheck?: number,
    bookInfo?: { title?: string; author?: string; fiction?: boolean | null },
  ): Promise<ContentExtractionResult | null>;

  async isActualContent(
    pageText: string,
    pageNumber: number,
    bookInfo?: { title?: string; author?: string; fiction?: boolean | null },
  ): Promise<boolean> {
    try {
      if (!pageText || pageText.trim().length < 50) {
        this.logger.debug(`Page ${pageNumber} is too short, skipping`);
        return false;
      }

      const textSample = pageText.substring(0, 1000);
      const previewText = textSample.substring(0, 200).replace(/\n/g, ' ');
      this.logger.debug(`Analyzing page ${pageNumber}: "${previewText}..."`);

      for (const prevPage of this.previousPages) {
        const similarity = this.calculateSimilarity(pageText, prevPage);
        if (similarity > 0.8) {
          this.logger.debug(
            `Page ${pageNumber} is similar to previous (${similarity.toFixed(2)}), skipping`,
          );
          return false;
        }
      }
      this.previousPages.push(pageText);
      if (this.previousPages.length > 5) this.previousPages.shift();

      const prompt = `
You are analyzing a page from a book to determine if it contains actual content or frontmatter.
${bookInfo?.fiction !== undefined ? `The book is ${bookInfo.fiction ? 'fiction' : 'non-fiction'}.` : ''}

FRONTMATTER includes:
- Title pages
- Copyright information
- Dedication pages
- Table of contents
- Prefaces
- Forewords
- Acknowledgments
- Lists of figures/tables
- Publisher information
- ISBN numbers
- Edition notices
- Quotes
- Illustrations
- Tables
- Equations
- Code
- Lists
- Footnotes
- Endnotes

ACTUAL CONTENT includes:
- The main text of the book
- Chapter content
- The beginning of the narrative or informational content
- The start of Introduction (if it's the main content, not a foreword) or Chapter 1

Here is the text from page ${pageNumber}:
"""
${textSample}
"""

${bookInfo?.title ? `The book title is: ${bookInfo.title}` : ''}
${bookInfo?.author ? `The book author is: ${bookInfo.author}` : ''}

Is this page ACTUAL CONTENT or FRONTMATTER? Answer with just one word: "CONTENT" or "FRONTMATTER".
      `;

      const response = await this.openaiService.getCompletion(prompt);
      const decision = response.trim().toUpperCase();
      const isContent = decision === 'CONTENT';
      this.logger.debug(`OpenAI decision for page ${pageNumber}: ${decision}`);
      return isContent;
    } catch (error) {
      this.logger.error(
        `Error analyzing page ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true; // Proceed on error to avoid stalling
    }
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(
      text1
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
    const words2 = new Set(
      text2
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
    if (words1.size === 0 || words2.size === 0) return 0;
    let intersection = 0;
    for (const word of words1) if (words2.has(word)) intersection++;
    const union = words1.size + words2.size - intersection;
    return intersection / union;
  }
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

  async findFirstContentPage(
    pdfPath: string,
    maxPagesToCheck = 20,
    bookInfo?: { title?: string; author?: string; fiction?: boolean | null },
  ): Promise<ContentExtractionResult | null> {
    try {
      this.logger.log(`Finding first content page in PDF: ${pdfPath}`);
      this.previousPages = [];
      if (!fs.existsSync(pdfPath))
        throw new Error(`PDF file not found: ${pdfPath}`);
      const data = new Uint8Array(fs.readFileSync(pdfPath));

      // Type assertion for PDF.js to resolve TypeScript errors
      const pdfjsDocument = await (pdfjs as any).getDocument({ data }).promise;
      // Cast to our interface type
      const pdfDocument = pdfjsDocument as PDFDocumentProxy;

      const numPages = Math.min(pdfDocument.numPages, maxPagesToCheck);

      for (let i = 1; i <= numPages; i++) {
        const pageText = await this.extractPageText(pdfPath, i);
        if (!pageText) continue;
        if (await this.isActualContent(pageText, i, bookInfo)) {
          this.logger.log(`Found content on PDF page ${i}`);
          return { pageNumber: i, text: pageText, format: 'pdf' };
        }
      }

      this.logger.warn(`No content found in first ${numPages} pages of PDF`);
      const firstPageText = await this.extractPageText(pdfPath, 1);
      if (firstPageText) {
        this.logger.log('Returning first page as fallback');
        return { pageNumber: 1, text: firstPageText, format: 'pdf' };
      }
      return null;
    } catch (error) {
      this.logger.error(
        `Error in PDF content search: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

class EpubFormatHandler extends BookFormatHandler {
  // Approximate number of characters that constitute a "page" of text
  private readonly CHARACTERS_PER_PAGE = 1500;
  // Maximum number of words to extract for a "page"
  private readonly WORDS_PER_PAGE = 250;

  // Apple Books typically fits about this many characters per page on default settings
  private readonly APPLE_BOOKS_CHARS_PER_PAGE = 2000;
  private readonly APPLE_BOOKS_WORDS_PER_PAGE = 300;

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
              // Fall back to standard approach
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

      if (plainText.length <= this.APPLE_BOOKS_CHARS_PER_PAGE) {
        return plainText; // If it's already short, just return it all
      }

      // Split by words and take the first portion
      const words = plainText.split(/\s+/);
      const pageWords = words.slice(0, this.APPLE_BOOKS_WORDS_PER_PAGE);

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
      return fullText.slice(0, this.APPLE_BOOKS_CHARS_PER_PAGE); // Fallback to simple slicing
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

  async findFirstContentPage(
    epubPath: string,
    maxPagesToCheck = 20,
    bookInfo?: { title?: string; author?: string; fiction?: boolean | null },
  ): Promise<ContentExtractionResult | null> {
    try {
      this.logger.log(`Finding first content page in EPUB: ${epubPath}`);
      this.previousPages = [];

      if (!fs.existsSync(epubPath)) {
        throw new Error(`EPUB file not found: ${epubPath}`);
      }

      // Initialize EPub with default image and link roots
      const epub = await EPub.createAsync(epubPath, '/images/', '/links/');

      if (epub.metadata) {
        this.logger.log(
          `EPUB metadata: ${JSON.stringify({
            title: epub.metadata.title,
            creator: epub.metadata.creator,
          })}`,
        );
      }

      // Check for page mapping
      const pageMapping = await this.extractPageMapping(epub);
      let hasPageMapping = pageMapping.length > 0;

      // flow contains the chapter list - this is what we need for extracting content
      if (!epub.flow || !Array.isArray(epub.flow)) {
        throw new Error('EPUB flow not found or invalid');
      }

      this.logger.log(`EPUB flow contains ${epub.flow.length} items`);
      if (epub.flow.length > 0) {
        // Log a sample of flow items
        const sample = epub.flow.slice(0, Math.min(3, epub.flow.length));
        this.logger.debug(`Flow sample: ${JSON.stringify(sample, null, 2)}`);
      }

      if (hasPageMapping) {
        this.logger.log(
          `EPUB has page mapping with ${pageMapping.length} pages`,
        );

        // Try to find first content page using page mapping
        const contentPageIndex = await this.findFirstContentPageFromMapping(
          epub,
          pageMapping,
          Math.min(pageMapping.length, maxPagesToCheck),
          bookInfo,
        );

        if (contentPageIndex !== null) {
          const pageMapEntry = pageMapping[contentPageIndex];
          if (pageMapEntry) {
            this.logger.log(
              `Found content at page mapping entry: ${JSON.stringify(pageMapEntry)}`,
            );

            // Find the chapter for this page
            const chapterId = this.findChapterIdByHref(
              epub.flow,
              pageMapEntry.href,
            );
            if (chapterId) {
              const chapterContent = await this.getEpubChapter(epub, chapterId);
              const pageContent = this.extractContentAtPageBoundary(
                chapterContent,
                pageMapEntry.href,
              );

              return {
                pageNumber: contentPageIndex + 1, // 1-indexed page number
                text: pageContent,
                format: 'epub',
              };
            }
          }
        }

        // If we couldn't find content using page mapping, fall back to flow-based approach
        this.logger.warn(
          'Could not find content using page mapping, falling back to chapter analysis',
        );
      }

      // toc is the table of contents
      const toc = epub.toc || [];
      this.logger.log(`EPUB TOC contains ${toc.length} items`);
      if (toc.length > 0) {
        // Log a sample of TOC items
        const sample = toc.slice(0, Math.min(3, toc.length));
        this.logger.debug(`TOC sample: ${JSON.stringify(sample, null, 2)}`);
      }

      // Convert TOC to our internal format with safe type conversion
      const normalizedToc: EpubTocElement[] = [];
      for (const item of toc) {
        // Skip items without id or href
        if (!item || !item.id || !item.href) {
          this.logger.debug(
            `Skipping TOC item without id or href: ${JSON.stringify(item)}`,
          );
          continue;
        }

        normalizedToc.push({
          id: String(item.id),
          title: String(item.title || ''),
          order: typeof item.order === 'number' ? item.order : 0,
          href: String(item.href),
        });
      }
      this.logger.debug(`Normalized ${normalizedToc.length} TOC items`);

      // Continue with the rest of the findFirstContentPage method as before...

      // Convert flow to array of chapter IDs for better handling
      const flowIds: string[] = [];
      const flowHrefToId = new Map<string, string>();

      for (const item of epub.flow) {
        if (item && typeof item === 'object' && item.id) {
          flowIds.push(String(item.id));

          // Create a mapping from href to id for TOC matching
          if (item.href) {
            flowHrefToId.set(String(item.href), String(item.id));
          }
        } else {
          this.logger.debug(
            `Skipping flow item without id: ${JSON.stringify(item)}`,
          );
        }
      }
      this.logger.debug(`Extracted ${flowIds.length} valid flow IDs`);

      // The rest of the method continues as before...
      // ... existing code for TOC analysis, sequential chapter check, etc.

      if (normalizedToc.length > 0) {
        const firstContentChapter = await this.findFirstContentChapterFromTOC(
          normalizedToc,
          flowHrefToId,
          bookInfo?.fiction ?? null,
        );

        if (firstContentChapter) {
          const { id, title } = firstContentChapter;
          this.logger.log(
            `TOC suggests first content chapter: "${title}" (id: ${id})`,
          );

          try {
            this.logger.debug(
              `Attempting to fetch content for chapter ID: ${id}`,
            );
            const chapterContent = await this.getEpubChapter(epub, id);

            if (chapterContent) {
              // Find the index of this chapter in the flow
              const flowIndex = flowIds.indexOf(id);
              const pageNumber = flowIndex !== -1 ? flowIndex + 1 : 1;

              // Extract just the first page worth of content
              const pageContent = this.extractFirstPageContent(chapterContent);
              this.logger.debug(
                `Extracted first page content, length: ${pageContent.length} characters`,
              );

              return {
                pageNumber,
                text: pageContent,
                format: 'epub',
              };
            }
          } catch (error) {
            this.logger.warn(
              `Failed to load chapter "${title}" with ID "${id}": ${error instanceof Error ? error.message : String(error)}`,
            );
          }

          this.logger.warn(
            `Failed to load chapter "${title}", falling back to sequential check`,
          );
        }
      }

      this.logger.log('Falling back to sequential chapter check');
      const chaptersToCheck = Math.min(epub.flow.length, maxPagesToCheck);

      for (let i = 0; i < chaptersToCheck; i++) {
        const flowItem = epub.flow[i] as EpubFlowElement;
        if (!flowItem || !flowItem.id) {
          this.logger.debug(
            `Skipping flow item at index ${i}: ${JSON.stringify(flowItem)}`,
          );
          continue;
        }

        try {
          this.logger.debug(
            `Checking chapter ${i + 1} with ID: ${flowItem.id}`,
          );
          const chapterContent = await this.getEpubChapter(epub, flowItem.id);
          if (!chapterContent) {
            this.logger.debug(`No content found for ID: ${flowItem.id}`);
            continue;
          }

          // Strip HTML and extract a reasonable amount of content for analysis
          const textContent = this.stripHtml(chapterContent);
          const analysisSample = textContent.slice(0, 1000); // Use first 1000 chars for content analysis

          this.logger.debug(
            `Chapter ${i + 1} content sample length: ${analysisSample.length} characters`,
          );

          if (await this.isActualContent(analysisSample, i + 1, bookInfo)) {
            this.logger.log(`Found content on EPUB chapter ${i + 1}`);

            // Extract just the first page worth of content
            const pageContent = this.extractFirstPageContent(chapterContent);

            return {
              pageNumber: i + 1,
              text: pageContent,
              format: 'epub',
            };
          } else {
            this.logger.debug(
              `Chapter ${i + 1} was not classified as actual content`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error reading chapter ${i + 1} with ID ${flowItem.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.warn(`No content found in first ${chaptersToCheck} chapters`);

      if (epub.flow.length > 0) {
        const firstFlowItem = epub.flow[0] as EpubFlowElement;
        if (firstFlowItem && firstFlowItem.id) {
          try {
            this.logger.debug(
              `Falling back to first chapter with ID: ${firstFlowItem.id}`,
            );
            const firstChapterContent = await this.getEpubChapter(
              epub,
              firstFlowItem.id,
            );

            // Extract just the first page worth of content
            const pageContent = this.extractFirstPageContent(
              firstChapterContent || 'No content found.',
            );

            return {
              pageNumber: 1,
              text: pageContent,
              format: 'epub',
            };
          } catch (error) {
            this.logger.error(
              `Error reading first chapter with ID ${firstFlowItem.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } else {
          this.logger.error('First flow item has no valid ID');
        }
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error in EPUB content search: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Find the first content page using the EPUB's page mapping
   */
  private async findFirstContentPageFromMapping(
    epub: any,
    pageMapping: PageMapping[],
    maxPagesToCheck: number,
    bookInfo?: { title?: string; author?: string; fiction?: boolean | null },
  ): Promise<number | null> {
    try {
      this.logger.debug(
        `Analyzing ${Math.min(pageMapping.length, maxPagesToCheck)} pages from page mapping`,
      );

      for (let i = 0; i < Math.min(pageMapping.length, maxPagesToCheck); i++) {
        const pageMap = pageMapping[i];
        if (!pageMap) continue;

        const chapterId = this.findChapterIdByHref(epub.flow, pageMap.href);

        if (!chapterId) {
          this.logger.debug(
            `Couldn't find chapter ID for page ${i + 1} with href ${pageMap.href}`,
          );
          continue;
        }

        try {
          const chapterContent = await this.getEpubChapter(epub, chapterId);
          if (!chapterContent) {
            this.logger.debug(
              `No content found for page ${i + 1} chapter ID: ${chapterId}`,
            );
            continue;
          }

          // Extract content at the page boundary
          const pageContent = this.extractContentAtPageBoundary(
            chapterContent,
            pageMap.href,
          );
          const analysisSample = this.stripHtml(pageContent).slice(0, 1000);

          if (await this.isActualContent(analysisSample, i + 1, bookInfo)) {
            this.logger.log(
              `Found content on page mapping ${i + 1}, page number: ${pageMap.pageNumber}`,
            );
            return i; // Return 0-indexed page
          }
        } catch (error) {
          this.logger.error(
            `Error analyzing page mapping ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      return null; // No content page found in mapping
    } catch (error) {
      this.logger.error(
        `Error in page mapping analysis: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
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

  private async findFirstContentChapterFromTOC(
    tocItems: EpubTocElement[],
    flowHrefToId: Map<string, string>,
    fiction: boolean | null,
  ): Promise<{ id: string; title: string } | null> {
    try {
      this.logger.debug(
        `Analyzing TOC with ${tocItems.length} items to find first content chapter`,
      );
      this.logger.debug(
        `TOC titles: ${JSON.stringify(tocItems.map((item) => item.title))}`,
      );

      let prompt = `
I need to find the first chapter with actual content based on its table of contents.

Book Information:
- Table of Contents: ${JSON.stringify(tocItems.map((item) => item.title))}

Please analyze this table of contents and identify which item is most likely the first chapter with actual content (not frontmatter).
Ignore items likely to be:
- Title pages
- Copyright pages
- Dedication pages
- Table of contents
- Forewords or prefaces
- Introductions (unless part of the main content)
      `;

      if (fiction === true) {
        prompt += `
Since this is a fiction book, the first content is typically the start of the story, such as "Chapter 1" or "Prologue".
Look for entries indicating the narrative's beginning.
        `;
      } else if (fiction === false) {
        prompt += `
Since this is a non-fiction book, the first content is typically the first main chapter after introductory material,
like "Chapter 1" or a topic-specific title beyond "Introduction" or "Preface".
        `;
      } else {
        prompt += `
The book's genre is unknown. Assume non-fiction unless titles strongly suggest fiction (e.g., "Prologue").
        `;
      }

      prompt += `
Return just the index number (0-based) of the item that is the start of the actual content. Return only a number.
      `;

      const response = await this.openaiService.getCompletion(prompt);
      const contentIndex = parseInt(response.trim(), 10);
      this.logger.debug(
        `OpenAI suggested TOC index ${contentIndex} as the start of content`,
      );

      if (
        isNaN(contentIndex) ||
        contentIndex < 0 ||
        contentIndex >= tocItems.length
      ) {
        this.logger.warn(`Invalid TOC index from OpenAI: ${response}`);
        return null;
      }

      const selectedTocItem = tocItems[contentIndex];
      if (!selectedTocItem) {
        this.logger.warn(`TOC item at index ${contentIndex} is undefined`);
        return null;
      }

      this.logger.debug(
        `Selected TOC item: ${JSON.stringify(selectedTocItem)}`,
      );

      // Extract the base href without fragment
      const hrefBase =
        selectedTocItem.href.split('#')[0] || selectedTocItem.href;
      this.logger.debug(`Extracted base href without fragment: ${hrefBase}`);

      // Get the chapter ID from the href
      const chapterId = flowHrefToId.get(hrefBase);
      if (!chapterId) {
        this.logger.warn(`No matching flow ID found for TOC href: ${hrefBase}`);
        this.logger.debug(
          `Available flow href mappings: ${Array.from(flowHrefToId.entries())
            .map(([href, id]) => `${href} -> ${id}`)
            .join(', ')}`,
        );

        // Try alternate matching approaches
        let matchedId: string | undefined;

        // Try endings match
        for (const [href, id] of flowHrefToId.entries()) {
          if (href.endsWith(hrefBase) || hrefBase.endsWith(href)) {
            this.logger.debug(`Found partial match: "${href}" with ID "${id}"`);
            matchedId = id;
            break;
          }
        }

        if (!matchedId) {
          return null;
        }

        this.logger.debug(`Using partial match with ID: ${matchedId}`);
        return {
          id: matchedId,
          title: selectedTocItem.title,
        };
      }

      this.logger.debug(
        `Found matching flow ID "${chapterId}" for TOC href "${hrefBase}"`,
      );

      return {
        id: chapterId,
        title: selectedTocItem.title,
      };
    } catch (error) {
      this.logger.error(
        `Error analyzing TOC: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

@Injectable()
export class BookFormatHandlerService {
  private readonly logger = new Logger(BookFormatHandlerService.name);
  private readonly handlers: { [key: string]: BookFormatHandler };

  constructor(private readonly openaiService: OpenAIService) {
    this.handlers = {
      '.pdf': new PdfFormatHandler(openaiService),
      '.epub': new EpubFormatHandler(openaiService),
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

  async findFirstContentPage(
    filePath: string,
    maxPagesToCheck = 20,
    bookInfo?: { title?: string; author?: string; fiction?: boolean | null },
  ): Promise<ContentExtractionResult | null> {
    try {
      return await this.getHandler(filePath).findFirstContentPage(
        filePath,
        maxPagesToCheck,
        bookInfo,
      );
    } catch (error) {
      this.logger.error(
        `Error finding content page: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
