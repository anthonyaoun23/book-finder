import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OpenAIService } from '../services/openai.service';
import { DbService } from '../../db/db.service';
import { BaseProcessor } from '../../utils/base-processor';
import { ProcessLogger } from '../../utils/process-logger.decorator';

@Processor('image-analysis')
export class ImageAnalysisProcessor extends BaseProcessor {
  constructor(
    private readonly openaiService: OpenAIService,
    @InjectQueue('book-lookup') private readonly bookLookupQueue: Queue,
    private readonly db: DbService,
  ) {
    super();
  }

  @ProcessLogger()
  async process(job: Job<{ uploadId: string; imageUrl: string }>) {
    const { uploadId, imageUrl } = job.data;
    this.log(`Processing image analysis for upload ${uploadId}`, {
      uploadId,
      imageUrl,
    });

    try {
      this.debug('Calling OpenAI for image analysis', { uploadId });
      const analysis = await this.openaiService.analyzeImage(imageUrl);
      this.debug('Received OpenAI analysis', {
        uploadId,
        title: analysis.title,
        author: analysis.author,
        isBook: analysis.isBook,
      });

      await this.db.upload.update({
        where: { id: uploadId },
        data: {
          extractedTitle: analysis.title,
          extractedAuthor: analysis.author,
          extractedFiction: analysis.fiction,
        },
      });
      this.debug('Updated upload with analysis results', { uploadId });

      if (
        !analysis.isBook ||
        !analysis.title ||
        !analysis.author ||
        analysis.fiction === null
      ) {
        this.warn(`Invalid book analysis for upload ${uploadId}`, {
          uploadId,
          isBook: analysis.isBook,
          hasTitle: !!analysis.title,
          hasAuthor: !!analysis.author,
          hasFiction: analysis.fiction !== null,
        });

        await this.db.upload.update({
          where: { id: uploadId },
          data: { status: 'failed' },
        });
        return { message: 'Invalid image or incomplete data' };
      }

      this.debug('Checking for existing book', {
        uploadId,
        title: analysis.title,
        author: analysis.author,
      });

      const existingBook = await this.db.book.findFirst({
        where: {
          title: analysis.title,
          author: analysis.author,
          fiction: analysis.fiction,
        },
      });

      if (existingBook && existingBook.pageContent) {
        this.log(
          `Book already exists in database: "${existingBook.title}" by ${existingBook.author}`,
          {
            uploadId,
            bookId: existingBook.id,
          },
        );

        await this.db.upload.update({
          where: { id: uploadId },
          data: {
            bookId: existingBook.id,
            status: 'completed',
          },
        });
        return { message: 'Book already processed' };
      }

      this.log(
        `Queueing book lookup for "${analysis.title}" by ${analysis.author}`,
        { uploadId },
      );
      await this.bookLookupQueue.add('lookup', {
        uploadId,
        title: analysis.title,
        author: analysis.author,
        fiction: analysis.fiction,
      });

      return { message: 'Proceeding to book lookup' };
    } catch (error: unknown) {
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.error(
        `Error processing image analysis for upload ${uploadId}`,
        errorStack,
        { uploadId },
      );

      await this.db.upload
        .update({
          where: { id: uploadId },
          data: { status: 'failed' },
        })
        .catch((updateError: unknown) => {
          const updateErrorMessage =
            updateError instanceof Error
              ? updateError.message
              : String(updateError);
          const updateErrorStack =
            updateError instanceof Error ? updateError.stack : undefined;

          this.error(
            `Failed to update upload status to failed: ${updateErrorMessage}`,
            updateErrorStack,
          );
        });

      throw error;
    }
  }
}
