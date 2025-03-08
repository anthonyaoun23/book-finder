import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BookFormatHandlerService } from '../services/book-format-handler.service';

@Processor('content-extraction')
export class ContentExtractionProcessor extends WorkerHost {
  constructor(private readonly bookFormatHandler: BookFormatHandlerService) {
    super();
  }

  async process(job: Job<{ bookPath: string; fiction: boolean }>) {
    const { bookPath, fiction } = job.data;
    const contentPage = await this.bookFormatHandler.findFirstContentPage(
      bookPath,
      20,
      { fiction },
    );

    if (!contentPage) {
      return { message: 'Content extraction failed' };
    }

    // Adjust page based on fiction/non-fiction guideline
    const targetPageNumber = fiction
      ? contentPage.pageNumber + 1
      : contentPage.pageNumber;
    const targetPageText = await this.bookFormatHandler.extractPageText(
      bookPath,
      targetPageNumber,
    );

    if (!targetPageText) {
      return { message: `Failed to extract page ${targetPageNumber}` };
    }

    return {
      pageNumber: targetPageNumber,
      text: targetPageText,
      message: `Extracted ${fiction ? 'second' : 'first'} content page from "${bookPath}"`,
    };
  }
}
