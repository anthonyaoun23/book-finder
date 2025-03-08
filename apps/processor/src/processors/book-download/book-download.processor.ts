import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LibgenService } from '../services/libgen.service';

@Processor('book-download')
export class BookDownloadProcessor extends WorkerHost {
  constructor(
    private readonly libgenService: LibgenService,
    @InjectQueue('content-extraction')
    private readonly contentExtractionQueue: Queue,
  ) {
    super();
  }

  async process(
    job: Job<{
      title: string;
      author: string;
      fiction: boolean;
      bookId: string;
      isbn: string;
    }>,
  ) {
    const { title, author, fiction } = job.data;
    const authorLastName = author.split(' ').pop() || author;
    const bookPath = await this.libgenService.findAndDownloadBook(
      title,
      authorLastName,
      process.env.DOWNLOAD_DIR || './downloads',
      'pdf',
    );

    if (!bookPath) {
      return {
        message: `No book found on LibGen for "${title}" by "${authorLastName}"`,
      };
    }

    await this.contentExtractionQueue.add('extract', { bookPath, fiction });
    return { message: 'Book downloaded, proceeding to content extraction' };
  }
}
