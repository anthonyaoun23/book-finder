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
      if (!title || !author) {
        this.logger.warn(
          `Book detected in ${url}, but title or author missing`,
        );
        return {
          message:
            'Book detected, but title or author could not be determined. Please take a clearer photo or enter details manually.',
          title,
          author,
          fiction,
        };
      }

      this.logger.log(
        `Book detected in ${url}: "${title}" by "${author}" (fiction: ${fiction})`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing image ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
