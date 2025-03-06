import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RekognitionService } from './rekognition.service';
import { TextractService } from './textract.service';
import { Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
@Processor('book-processing')
export class BookProcessor extends WorkerHost {
  private readonly logger = new Logger(BookProcessor.name);

  constructor(
    private readonly rekognitionService: RekognitionService,
    private readonly textractService: TextractService,
    private readonly openaiService: OpenAIService,
  ) {
    super();
  }

  async process(job: Job<{ url: string }>) {
    return this.processImage(job.data.url);
  }

  async processImage(url: string) {
    try {
      const { isBook, title, author } =
        await this.openaiService.analyzeImage(url);

      if (!isBook) {
        this.logger.log(`No book detected in image: ${url}`);
        return { message: 'No book detected' };
      }

      if (!title || !author) {
        this.logger.warn(
          `Book detected in ${url}, but title or author missing`,
        );
        return { message: 'Book detected, but incomplete data', title, author };
      }

      this.logger.log(`Book detected in ${url}: "${title}" by ${author}`);
      return { title, author };
    } catch (error) {
      this.logger.error(
        `Error processing image ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
