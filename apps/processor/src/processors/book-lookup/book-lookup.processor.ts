import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GoogleBooksService } from '../services/google-books.service';

@Processor('book-lookup')
export class BookLookupProcessor extends WorkerHost {
  constructor(
    private readonly googleBooksService: GoogleBooksService,
    @InjectQueue('book-download') private readonly bookDownloadQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ title: string; author: string; fiction: boolean }>) {
    const { title, author, fiction } = job.data;
    const book = await this.googleBooksService.searchBook(title, author);

    if (!book) {
      return {
        message: `No matching book found for "${title}" by "${author}"`,
      };
    }

    await this.bookDownloadQueue.add('download', {
      title,
      author,
      fiction,
      bookId: book.id,
      isbn: book.volumeInfo.industryIdentifiers?.find(
        (id) => id.type === 'ISBN_13',
      )?.identifier,
    });
    return { message: 'Book found, proceeding to download' };
  }
}
