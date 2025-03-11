import { Processor, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { LLMService } from '../services/llm.service';
import { DbService } from '../../db/db.service';
import { BaseProcessor } from '../../utils/base-processor';
import { ProcessLogger } from '../../utils/process-logger.decorator';

@Processor('image-analysis')
export class ImageAnalysisProcessor extends BaseProcessor {
  constructor(
    private readonly llmService: LLMService,
    @InjectQueue('book-lookup') private readonly bookLookupQueue: Queue,
    private readonly db: DbService,
  ) {
    super();
  }

  @ProcessLogger()
  async process(job: Job<{ uploadId: string }>) {
    const { uploadId } = job.data;
    this.log(`Processing image analysis for uploadId=${uploadId}`, {
      uploadId,
    });

    try {
      const upload = await this.db.upload.findUnique({
        where: { id: uploadId },
      });

      if (!upload) {
        this.error(`Upload not found for uploadId=${uploadId}`);
        return { message: 'Upload not found' };
      }

      const imageUrl = upload.imageUrl;
      if (!imageUrl) {
        this.error(`Upload has no imageUrl for uploadId=${uploadId}`);
        return { message: 'Upload has no imageUrl' };
      }

      const analysis = await this.llmService.analyzeCoverImage(imageUrl);
      this.log(`Analysis: ${JSON.stringify(analysis)}`);
      if (!analysis || !analysis.isBook || analysis.confidence < 0.1) {
        this.warn(`OpenAI says it's NOT a book or confidence is low`, {
          uploadId,
          analysis,
        });
        await this.db.upload.update({
          where: { id: uploadId },
          data: {
            status: 'failed',
            confidence: analysis?.confidence ?? 0.0,
            rawOpenAIJson: JSON.stringify(analysis),
          },
        });
        return { message: 'Not recognized as a book. Please retake photo.' };
      }

      await this.db.upload.update({
        where: { id: uploadId },
        data: {
          extractedTitle: analysis.title ?? undefined,
          extractedAuthor: analysis.author ?? undefined,
          extractedFiction: analysis.fiction ?? null,
          confidence: analysis.confidence,
          rawOpenAIJson: JSON.stringify(analysis),
        },
      });

      this.log(`Queueing book lookup for upload ${uploadId}`, { uploadId });
      await this.bookLookupQueue.add('lookup', {
        uploadId,
        title: analysis.title,
        author: analysis.author,
        fiction: analysis.fiction,
      });

      return { message: 'Proceeding to book lookup' };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.error(
        `Error uploading file for upload ${uploadId}: ${errorMessage}`,
        undefined,
        {
          uploadId,
        },
      );

      await this.db.upload.update({
        where: { id: uploadId },
        data: { status: 'failed' },
      });

      throw error;
    }
  }
}
