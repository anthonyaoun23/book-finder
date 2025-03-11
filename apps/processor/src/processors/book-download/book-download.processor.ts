import { Processor, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DbService } from '../../db/db.service';
import { BaseProcessor, ProcessLogger } from '../../utils';
import { LibgenService } from '../services/libgen.service';
import { ConfigService } from '@nestjs/config';
@Processor('book-download')
export class BookDownloadProcessor extends BaseProcessor {
  constructor(
    private readonly db: DbService,
    private readonly libgenService: LibgenService,
    private readonly configService: ConfigService,
    @InjectQueue('content-extraction')
    private readonly contentExtractionQueue: Queue,
  ) {
    super();
  }

  @ProcessLogger()
  async process(job: Job<{ uploadId: string }>) {
    const { uploadId } = job.data;
    this.log(`Book download start for upload ${uploadId}`, { uploadId });

    const upload = await this.db.upload.findUnique({ where: { id: uploadId } });
    if (!upload) {
      this.warn(`Upload not found: ${uploadId}`);
      return;
    }
    if (upload.status !== 'processing') {
      this.debug(
        `Not in processing state. Skipping. Current status: ${upload.status}`,
      );
      return;
    }

    const title = upload.refinedTitle || upload.extractedTitle;
    const author = upload.refinedAuthor || upload.extractedAuthor;
    const fiction = upload.extractedFiction ?? false;

    if (!title || !author) {
      this.warn(`No valid title/author. Marking failed.`, { uploadId });
      await this.db.upload.update({
        where: { id: uploadId },
        data: { status: 'failed' },
      });
      return;
    }

    this.log(`Attempting LibGen for: "${title}" by ${author}`, { uploadId });

    try {
      const downloadDir =
        this.configService.get('DOWNLOAD_DIR') || './downloads';
      const bookPath = await this.libgenService.findAndDownloadBook(
        title,
        author.split(' ').pop() || '',
        downloadDir,
        'pdf',
        fiction,
        // TODO: Add isbn
      );

      if (!bookPath) {
        this.warn(`No book found on LibGen. Marking failed.`, { uploadId });
        await this.db.upload.update({
          where: { id: uploadId },
          data: { status: 'failed' },
        });
        return;
      }

      // Next step: content extraction
      await this.contentExtractionQueue.add('extract', {
        uploadId,
        localFilePath: bookPath,
      });

      return { message: 'Downloaded. Proceeding to content extraction.' };
    } catch (err) {
      this.error(`Error downloading book: ${String(err)}`, undefined, {
        uploadId,
      });
      await this.db.upload.update({
        where: { id: uploadId },
        data: { status: 'failed' },
      });
      throw err;
    }
  }
}
