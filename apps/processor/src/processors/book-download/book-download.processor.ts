import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LibgenService } from '../services/libgen.service';
import { DbService } from '../../db/db.service';
import { BaseProcessor, ProcessLogger } from '../../utils';

@Processor('book-download')
export class BookDownloadProcessor extends BaseProcessor {
  constructor(
    private readonly libgenService: LibgenService,
    @InjectQueue('content-extraction')
    private readonly contentExtractionQueue: Queue,
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
      bookId: string;
      isbn: string;
    }>,
  ) {
    const { uploadId, title, author, fiction, isbn } = job.data;
    this.log(`Processing book download for "${title}" by ${author}`, {
      uploadId,
      title,
      author,
      isbn: isbn || 'Not available',
    });

    try {
      const authorLastName = author.split(' ').pop() || author;
      this.debug(`Using author last name for search: ${authorLastName}`, {
        uploadId,
        fullName: author,
        lastName: authorLastName,
      });

      const downloadDir = process.env.DOWNLOAD_DIR || './downloads';
      this.debug(`Using download directory: ${downloadDir}`, {
        uploadId,
      });

      this.debug(`Attempting to find and download book from Libgen`, {
        uploadId,
        title,
        author: authorLastName,
        format: 'pdf',
        fiction,
      });

      const bookPath = await this.libgenService.findAndDownloadBook(
        title,
        authorLastName,
        downloadDir,
        'pdf',
        fiction,
      );

      if (!bookPath) {
        this.warn(`No book found on LibGen`, {
          uploadId,
          title,
          author: authorLastName,
        });

        await this.db.upload.update({
          where: { id: uploadId },
          data: { status: 'failed' },
        });
        return {
          message: `No book found on LibGen for "${title}" by "${authorLastName}"`,
        };
      }

      this.log(`Book successfully downloaded: ${bookPath}`, {
        uploadId,
        bookPath,
      });

      this.log(`Queueing content extraction for book`, {
        uploadId,
        bookPath,
        title,
        author,
      });

      await this.contentExtractionQueue.add('extract', {
        uploadId,
        bookPath,
        fiction,
        title,
        author,
      });
      return { message: 'Book downloaded, proceeding to content extraction' };
    } catch (error: unknown) {
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.error(`Error downloading book "${title}" by ${author}`, errorStack, {
        uploadId,
        title,
        author,
      });

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
