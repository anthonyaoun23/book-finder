import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RekognitionService } from './rekognition.service';
import { TextractService } from './textract.service';
import { Logger } from '@nestjs/common';

@Processor('book-processing')
export class BookProcessor extends WorkerHost {
  private readonly logger = new Logger(BookProcessor.name);

  constructor(
    private readonly rekognitionService: RekognitionService,
    private readonly textractService: TextractService,
  ) {
    super();
  }

  async process(job: Job<{ url: string }>) {
    return this.handleJob(job);
  }

  async handleJob(job: Job<{ url: string }>) {
    const { url } = job.data;
    this.logger.log(`Processing job ${job.id} for image: ${url}`);

    // Step 1: Validate the image contains a book
    const isBook = await this.rekognitionService.detectBook(url);
    if (!isBook) {
      this.logger.warn(`Image at ${url} does not contain a book`);
      return;
    }

    // Step 2: Extract text from the book cover
    const text = await this.textractService.extractTextFromImage(url);
    this.logger.log(`Extracted text from ${url}: ${text}`);

    // Placeholder for next steps (e.g., book identification)
    return { text }; // Return result for potential future use
  }
}
