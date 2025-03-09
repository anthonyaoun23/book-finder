import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BookFormatHandlerService } from '../services/book-format-handler.service';
import { DbService } from '../../db/db.service';
import { BaseProcessor } from '../../utils/base-processor';
import { ProcessLogger } from '../../utils/process-logger.decorator';

@Processor('content-extraction')
export class ContentExtractionProcessor extends BaseProcessor {
  constructor(
    private readonly bookFormatHandler: BookFormatHandlerService,
    private readonly db: DbService,
  ) {
    super();
  }

  @ProcessLogger()
  async process(
    job: Job<{
      uploadId: string;
      bookPath: string;
      fiction: boolean;
      title: string;
      author: string;
    }>,
  ) {
    const { uploadId, bookPath, fiction, title, author } = job.data;
    this.log(`Processing content extraction for "${title}" by ${author}`, {
      uploadId,
      bookPath,
      fiction,
    });

    try {
      // Find the first content page in the book
      this.debug(`Finding first content page in book`, {
        uploadId,
        bookPath,
        maxPagesToCheck: 20,
        fiction,
      });

      const contentPage = await this.bookFormatHandler.findFirstContentPage(
        bookPath,
        20,
        { fiction },
      );

      // Handle case where no content page is found
      if (!contentPage) {
        this.warn(`No content page found in book`, {
          uploadId,
          bookPath,
        });

        await this.db.upload.update({
          where: { id: uploadId },
          data: { status: 'failed' },
        });
        return { message: 'Content extraction failed' };
      }

      // Determine which page to extract based on fiction/non-fiction
      const targetPageNumber = fiction
        ? contentPage.pageNumber + 1
        : contentPage.pageNumber;
      
      this.debug(`Selected page ${targetPageNumber} for extraction`, {
        uploadId,
        contentPageFound: contentPage.pageNumber,
        targetPage: targetPageNumber,
        isFiction: fiction,
      });

      // Extract the text from the target page
      this.debug(`Extracting text from page ${targetPageNumber}`, {
        uploadId,
        bookPath,
      });

      const targetPageText = await this.bookFormatHandler.extractPageText(
        bookPath,
        targetPageNumber,
      );

      // Handle case where text extraction fails
      if (!targetPageText) {
        this.warn(`Failed to extract text from page ${targetPageNumber}`, {
          uploadId,
          bookPath,
          pageNumber: targetPageNumber,
        });

        await this.db.upload.update({
          where: { id: uploadId },
          data: { status: 'failed' },
        });
        return { message: `Failed to extract page ${targetPageNumber}` };
      }

      // Log successful text extraction
      this.debug(`Successfully extracted ${targetPageText.length} characters from page`, {
        uploadId,
        pageNumber: targetPageNumber,
        textLength: targetPageText.length,
      });

      // Create or update the book in the database
      this.debug(`Upserting book record in database`, {
        uploadId,
        title,
        author,
        fiction,
      });

      const book = await this.db.book.upsert({
        where: {
          title_author_fiction: { title, author, fiction },
        },
        create: {
          title,
          author,
          fiction,
          pageContent: targetPageText,
        },
        update: {
          pageContent: targetPageText,
        },
      });

      // Update the upload record to link to the book
      this.log(`Content extraction successful, updating upload record`, {
        uploadId,
        bookId: book.id,
      });

      await this.db.upload.update({
        where: { id: uploadId },
        data: {
          bookId: book.id,
          status: 'completed',
        },
      });

      return { pageNumber: targetPageNumber, text: targetPageText };
    } catch (error: unknown) {
      // Handle errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      this.error(
        `Error extracting content from book "${title}" by ${author}`,
        errorStack,
        { uploadId, bookPath },
      );
      
      // Update the upload status to failed
      await this.db.upload.update({
        where: { id: uploadId },
        data: { status: 'failed' },
      }).catch((updateError: unknown) => {
        const updateErrorMessage = updateError instanceof Error 
          ? updateError.message 
          : String(updateError);
        
        this.error(
          `Failed to update upload status to failed: ${updateErrorMessage}`,
        );
      });
      
      throw error;
    }
  }
}
