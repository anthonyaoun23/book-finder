import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OpenAIService } from '../services/openai.service';

@Processor('image-analysis')
export class ImageAnalysisProcessor extends WorkerHost {
  constructor(
    private readonly openaiService: OpenAIService,
    @InjectQueue('book-lookup') private readonly bookLookupQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ url: string }>) {
    const { url } = job.data;
    const analysis = await this.openaiService.analyzeImage(url);

    if (!analysis.isBook) {
      return {
        message:
          'No book detected. Please retake the photo to clearly show a book cover.',
      };
    }
    if (!analysis.title || !analysis.author || analysis.fiction === null) {
      return {
        message:
          'Book detected, but incomplete data. Please retake the photo to ensure the title and author are clear.',
        title: analysis.title,
        author: analysis.author,
        fiction: analysis.fiction,
      };
    }

    await this.bookLookupQueue.add('lookup', {
      title: analysis.title,
      author: analysis.author,
      fiction: analysis.fiction,
    });
    return { message: 'Image analyzed, proceeding to book lookup' };
  }
}
