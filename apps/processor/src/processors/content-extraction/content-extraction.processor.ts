import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DbService } from '../../db/db.service';
import { BaseProcessor, ProcessLogger } from '../../utils';
import { BookFormatHandlerService } from '../services/book-format-handler.service';
import { LLMService } from '../services/llm.service';
@Processor('content-extraction')
export class ContentExtractionProcessor extends BaseProcessor {
  constructor(
    private readonly db: DbService,
    private readonly bookFormatHandler: BookFormatHandlerService,
    private readonly llmService: LLMService,
  ) {
    super();
  }

  @ProcessLogger()
  async process(
    job: Job<{
      uploadId: string;
      localFilePath: string;
    }>,
  ) {
    const { uploadId, localFilePath } = job.data;
    this.log(`Content extraction for ${uploadId}`, { uploadId, localFilePath });

    const upload = await this.db.upload.findUnique({
      where: { id: uploadId },
    });
    if (!upload) {
      this.warn(`Upload not found for ID: ${uploadId}`);
      return;
    }
    if (upload.status !== 'processing') {
      this.debug(`Upload not in processing state: ${upload.status}`);
      return;
    }

    const fiction = upload.extractedFiction ?? false;
    try {
      const maxPages = 20;
      let foundPages = 0;
      let chosenPageNumber = -1;
      for (let i = 1; i <= maxPages; i++) {
        const rawText = await this.bookFormatHandler.extractPageText(
          localFilePath,
          i,
        );
        if (!rawText) continue;

        const truncatedText = rawText.slice(0, 1000);
        const classification = await this.llmService.classifyPageContent(
          truncatedText,
          i,
          fiction,
        );

        if (classification === 'CONTENT') {
          foundPages++;
          if (fiction && foundPages === 2) {
            chosenPageNumber = i;
            break;
          } else if (!fiction && foundPages === 1) {
            chosenPageNumber = i;
            break;
          }
        }
      }

      if (chosenPageNumber < 1) {
        this.warn(
          `No page found that was classified as content. Fallback to page 1.`,
          {
            uploadId,
          },
        );
        chosenPageNumber = 1;
      }

      const finalRawText = await this.bookFormatHandler.extractPageText(
        localFilePath,
        chosenPageNumber,
      );
      if (!finalRawText) {
        this.warn(`Could not extract text from page ${chosenPageNumber}.`, {
          uploadId,
        });
        await this.db.upload.update({
          where: { id: uploadId },
          data: { status: 'failed' },
        });
        return;
      }

      const nicelyFormatted =
        await this.llmService.formatExtractedSnippet(finalRawText);

      const title =
        upload.refinedTitle || upload.extractedTitle || 'Unknown Title';
      const author =
        upload.refinedAuthor || upload.extractedAuthor || 'Unknown Author';
      const book = await this.db.book.upsert({
        where: {
          title_author_fiction: {
            title,
            author,
            fiction,
          },
        },
        create: {
          title,
          author,
          fiction,
          pageContent: nicelyFormatted,
        },
        update: {
          pageContent: nicelyFormatted,
        },
      });

      await this.db.upload.update({
        where: { id: uploadId },
        data: {
          bookId: book.id,
          status: 'completed',
        },
      });

      return {
        pageNumber: chosenPageNumber,
        text: nicelyFormatted,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.error(`Error extracting content: ${errorMessage}`, undefined, {
        uploadId,
      });
      await this.db.upload.update({
        where: { id: uploadId },
        data: { status: 'failed' },
      });
      throw error;
    }
  }
}
