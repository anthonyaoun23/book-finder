import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OpenAIService } from './services/openai.service';
import { GoogleBooksService } from './services/google-books.service';
import { LibgenService } from './services/libgen.service';
import {
  BookFormatHandlerService,
  ContentExtractionResult,
} from './services/book-format-handler.service';
import * as path from 'path';

@Processor('book-processing')
export class BookProcessor extends WorkerHost {
  private readonly logger = new Logger(BookProcessor.name);
  private readonly downloadDir = process.env.DOWNLOAD_DIR || './downloads';

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly googleBooksService: GoogleBooksService,
    private readonly libgenService: LibgenService,
    private readonly bookFormatHandler: BookFormatHandlerService,
  ) {
    super();
  }

  async process(job: Job<{ url: string }>) {
    return this.processImage(job.data.url);
  }

  async processImage(url: string) {
    try {
      this.logger.log(`Processing image from URL: ${url}`);

      // 1. Analyze the image with OpenAI to get book details
      const { isBook, title, author, fiction } =
        await this.openaiService.analyzeImage(url);

      // 2. If no book is detected, instruct user to retake the photo
      if (!isBook) {
        this.logger.log(`No book detected in image: ${url}`);
        return {
          message:
            'No book detected. Please retake the photo to clearly show a book cover.',
        };
      }

      // 3. If incomplete data, prompt for a better photo or manual entry
      if (!title || !author || fiction === null) {
        this.logger.warn(
          `Book detected in ${url}, but title, author, or genre missing`,
        );
        return {
          message:
            'Book detected, but incomplete data. Please retake the photo to ensure the title and author are clear.',
          title,
          author,
          fiction,
        };
      }

      // 4. Look up the book in Google Books
      this.logger.log(
        `Book detected in ${url}: "${title}" by "${author}" (fiction: ${fiction})`,
      );

      const book = await this.googleBooksService.searchBook(title, author);

      // 5. Try to find and download the book from LibGen
      let bookPath: string | null = null;
      let contentPage: ContentExtractionResult | null = null;
      let bookFormat: 'pdf' | 'epub' | null = null;

      try {
        // Extract the author's last name
        const authorLastName = author.split(' ').pop() || author;

        this.logger.log(
          `Searching for book on LibGen: "${title}" by ${authorLastName}`,
        );

        // Try to download the book, preferring PDF but accepting EPUB if PDF is not available
        bookPath = await this.libgenService.findAndDownloadBook(
          title,
          authorLastName,
          this.downloadDir,
          'pdf', // Preferred format
        );

        if (bookPath) {
          // Determine the format from the file extension
          const ext = path.extname(bookPath).toLowerCase();
          bookFormat = ext === '.pdf' ? 'pdf' : ext === '.epub' ? 'epub' : null;

          this.logger.log(
            `Successfully downloaded book from LibGen: ${bookPath} (${bookFormat})`,
          );

          // 6. Extract the first page of actual content
          if (bookFormat) {
            this.logger.log(
              `Extracting content from ${bookFormat.toUpperCase()}: ${bookPath}`,
            );

            // Pass book information to help with content detection
            contentPage = await this.bookFormatHandler.findFirstContentPage(
              bookPath,
              20, // Max pages to check
              { title, author, fiction }, // Pass book info for context
            );

            if (contentPage) {
              this.logger.log(
                `Found first content page: ${contentPage.pageNumber} (${contentPage.format})`,
              );

              // Log the extracted content (first 500 characters)
              const previewText = contentPage.text.substring(0, 500);
              const truncated =
                contentPage.text.length > 500 ? '...(truncated)' : '';
              this.logger.log(
                `Extracted content preview:\n${previewText}${truncated}`,
              );

              // Log full content at debug level
              this.logger.debug(`Full extracted content:\n${contentPage.text}`);
            } else {
              this.logger.warn(
                `Could not find content page in ${bookFormat.toUpperCase()}: ${bookPath}`,
              );
            }
          }
        } else {
          this.logger.warn(
            `No book found on LibGen for: "${title}" by ${authorLastName}`,
          );
        }
      } catch (error) {
        // Don't fail the whole process if LibGen download fails
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Error processing book: ${errorMessage}`);
      }

      if (book) {
        this.logger.log(`Found book on Google Books: ${book.id}`);

        // 7. Return the result
        return {
          title,
          author,
          fiction,
          bookId: book.id,
          isbn:
            book.volumeInfo?.industryIdentifiers?.find(
              (id) => id.type === 'ISBN_13',
            )?.identifier || null,
          bookPath: bookPath ? path.basename(bookPath) : null,
          bookFormat,
          contentPage: contentPage
            ? {
                pageNumber: contentPage.pageNumber,
                text: contentPage.text,
                format: contentPage.format,
              }
            : null,
          message: `Successfully extracted content from "${title}" by ${author}.${
            contentPage
              ? ` First content page extracted from ${contentPage.format.toUpperCase()}.`
              : bookPath
                ? ` ${bookFormat?.toUpperCase()} downloaded but content extraction failed.`
                : ''
          }`,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error processing image: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
