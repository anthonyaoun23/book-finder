import { Processor } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DbService } from '../../db/db.service';
import { BaseProcessor } from '../../utils/base-processor';
import { ProcessLogger } from '../../utils/process-logger.decorator';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

@Processor('file-upload')
export class FileUploadProcessor extends BaseProcessor {
  private readonly s3: S3Client;
  private readonly bucketName: string;
  private readonly tempDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DbService,
    @InjectQueue('image-analysis') private readonly imageQueue: Queue,
  ) {
    super();

    this.s3 = new S3Client({
      region: this.configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.bucketName = this.configService.getOrThrow('AWS_BUCKET_NAME');
    this.tempDir = this.configService.get('TEMP_DIR') || '/tmp';
  }

  @ProcessLogger()
  async process(
    job: Job<{ uploadId: string; fileName: string; fileBase64: string }>,
  ) {
    const { uploadId, fileName, fileBase64 } = job.data;
    this.log(`Processing file upload for uploadId=${uploadId}`, { uploadId });

    const tempFilePath = path.join(this.tempDir, `${uploadId}-${fileName}`);

    try {
      const fileBuffer = Buffer.from(fileBase64, 'base64');
      await writeFileAsync(tempFilePath, fileBuffer);

      // Upload to S3
      const sanitizedFileName = encodeURIComponent(fileName).replace(
        /%20/g,
        '_',
      );
      const fileStream = fs.createReadStream(tempFilePath);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: sanitizedFileName,
        Body: fileStream,
      });
      await this.s3.send(command);

      const imageUrl = `https://${this.bucketName}.s3.amazonaws.com/${sanitizedFileName}`;
      await unlinkAsync(tempFilePath);

      await this.db.upload.update({
        where: { id: uploadId },
        data: { imageUrl, status: 'processing' },
      });

      this.log(`Queueing image analysis for upload ${uploadId}`, { uploadId });
      await this.imageQueue.add(
        'process',
        { uploadId },
        { attempts: 2, backoff: 5000 },
      );

      return { success: true, imageUrl };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.error(
        `Error uploading file for upload ${uploadId}: ${errorMessage}`,
        undefined,
        {
          uploadId,
        },
      );

      if (fs.existsSync(tempFilePath)) {
        await unlinkAsync(tempFilePath).catch(() => null);
      }

      await this.db.upload.update({
        where: { id: uploadId },
        data: { status: 'failed' },
      });

      throw error;
    }
  }
}
