import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GoogleBooksService } from '../services/google-books.service';
import { DbService } from '../../db/db.service';
import { BaseProcessor, ProcessLogger } from '../../utils';

@Processor('book-lookup')
export class BookLookupProcessor extends BaseProcessor {
  constructor(
    private readonly googleBooksService: GoogleBooksService,
    @InjectQueue('book-download') private readonly bookDownloadQueue: Queue,
    private readonly db: DbService,
  ) {
    super();
  }

  @ProcessLogger()
  async process(
    job: Job<{
      uploadId: string;
      title: string;
      author: string;
      fiction: boolean;
    }>,
  ) {
    const { uploadId, title, author, fiction } = job.data;
    this.log(`Processing book lookup for "${title}" by ${author}`, {
      uploadId,
      title,
      author,
    });

    try {
      this.debug(`Searching for book details via Google Books API`, {
        uploadId,
        title,
        author,
      });
      const book = await this.googleBooksService.searchBook(title, author);

      if (!book) {
        this.warn(`No matching book found on Google Books`, {
          uploadId,
          title,
          author,
        });

        await this.db.upload.update({
          where: { id: uploadId },
          data: { status: 'failed' },
        });
        return {
          message: `No matching book found for "${title}" by "${author}"`,
        };
      }

      this.debug(`Book found on Google Books`, {
        uploadId,
        googleBookId: book.id,
        title: book.volumeInfo.title,
        authors: book.volumeInfo.authors,
      });

      const isbn = book.volumeInfo.industryIdentifiers?.find(
        (id) => id.type === 'ISBN_13',
      )?.identifier;

      this.debug(`Book identifiers found`, {
        uploadId,
        googleBookId: book.id,
        isbn: isbn || 'Not found',
      });

      this.log(`Queueing book download`, {
        uploadId,
        title,
        author,
        googleBookId: book.id,
      });

      await this.bookDownloadQueue.add('download', {
        uploadId,
        title,
        author,
        fiction,
        bookId: book.id,
        isbn,
      });

      return { message: 'Book found, proceeding to download' };
    } catch (error: unknown) {
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.error(
        `Error processing book lookup for "${title}" by ${author}`,
        errorStack,
        { uploadId, title, author },
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

          this.error(
            `Failed to update upload status to failed: ${updateErrorMessage}`,
          );
        });

      throw error;
    }
  }
}
