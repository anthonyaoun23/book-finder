import { Processor, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DbService } from '../../db/db.service';
import { BaseProcessor, ProcessLogger } from '../../utils';
import { GoogleBooksService } from '../services/google-books.service';

@Processor('book-lookup')
export class BookLookupProcessor extends BaseProcessor {
  constructor(
    private readonly db: DbService,
    private readonly googleBooksService: GoogleBooksService,
    @InjectQueue('book-download') private readonly bookDownloadQueue: Queue,
  ) {
    super();
  }

  @ProcessLogger()
  async process(job: Job<{ uploadId: string }>) {
    const { uploadId } = job.data;
    this.log(`Book lookup for upload ${uploadId}`, { uploadId });

    const upload = await this.db.upload.findUnique({ where: { id: uploadId } });
    if (!upload) {
      this.warn(`Upload not found: ${uploadId}`);
      return;
    }

    if (upload.status !== 'processing') {
      this.debug(`Upload status not "processing", skipping: ${upload.status}`);
      return;
    }

    const title = upload.refinedTitle || upload.extractedTitle;
    const author = upload.refinedAuthor || upload.extractedAuthor;

    if (!title || !author) {
      this.warn(`No title or author to look up. Marking failed.`, { uploadId });
      await this.db.upload.update({
        where: { id: uploadId },
        data: { status: 'failed' },
      });
      return;
    }

    this.debug(
      `Searching Google Books with title="${title}", author="${author}"`,
    );

    try {
      const googleBook = await this.googleBooksService.searchBook(
        title,
        author,
      );
      if (!googleBook) {
        this.warn(`GoogleBooks: no match found.`, {
          uploadId,
        });
        // TODO: fallback to alternative search
      } else {
        const volumeInfo = googleBook.volumeInfo;
        const refinedTitle = volumeInfo.title;
        const refinedAuthor = volumeInfo.authors
          ? volumeInfo.authors[0]
          : author;

        // TODO: additional enrichment
        // const fiction = volumeInfo.categories?.includes('Fiction');
        // const isbn = volumeInfo.industryIdentifiers?.find(
        //   (id) => id.type === 'ISBN_13',
        // )?.identifier;

        await this.db.upload.update({
          where: { id: uploadId },
          data: {
            refinedTitle,
            refinedAuthor,
          },
        });
      }
    } catch (err) {
      this.error(`GoogleBooks error: ${String(err)}`);
    }

    await this.bookDownloadQueue.add('download', { uploadId });
    return { message: 'Book lookup complete, proceeding to download' };
  }
}
