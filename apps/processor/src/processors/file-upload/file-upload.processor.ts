import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DbService } from '../../db/db.service';
import { BaseProcessor } from '../../utils/base-processor';
import { ProcessLogger } from '../../utils/process-logger.decorator';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

/**
 * Processor that handles file uploads to S3
 * This separates the API from having to handle resource-intensive uploads
 */
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

  /**
   * Process a file upload job
   * @param job Job containing upload details
   */
  @ProcessLogger()
  async process(job: Job<{ uploadId: string; fileName: string; fileBase64: string }>) {
    const { uploadId, fileName, fileBase64 } = job.data;
    
    this.log(`Processing file upload for ${fileName}`, { uploadId });

    // Create a temporary file path
    const tempFilePath = path.join(this.tempDir, `${uploadId}-${fileName}`);
    
    try {
      // Convert base64 to buffer
      const fileBuffer = Buffer.from(fileBase64, 'base64');
      
      // Write buffer to temporary file
      this.debug(`Writing to temporary file: ${tempFilePath}`, { uploadId });
      await writeFileAsync(tempFilePath, fileBuffer);
      
      // Ensure filename doesn't contain problematic characters
      const sanitizedFileName = encodeURIComponent(fileName).replace(/%20/g, '_');

      // Upload file to S3 using the file stream instead of buffer
      this.debug(`Uploading file to S3: ${sanitizedFileName}`, { uploadId });
      const fileStream = fs.createReadStream(tempFilePath);
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: sanitizedFileName,
        Body: fileStream,
      });
      
      await this.s3.send(command);
      const imageUrl = `https://${this.bucketName}.s3.amazonaws.com/${sanitizedFileName}`;
      this.debug(`File uploaded successfully to ${imageUrl}`, { uploadId });

      // Clean up temporary file
      await unlinkAsync(tempFilePath);
      this.debug(`Cleaned up temporary file: ${tempFilePath}`, { uploadId });

      // Update upload status in database
      this.debug(`Updating upload record ${uploadId} with image URL`, { uploadId });
      await this.db.upload.update({
        where: { id: uploadId },
        data: { 
          imageUrl,
          status: 'processing'
        },
      });

      // Queue image analysis job
      this.log(`Queueing image analysis for upload ${uploadId}`, { uploadId });
      await this.imageQueue.add(
        'process',
        { uploadId, imageUrl },
        { attempts: 2, backoff: 5000 },
      );

      return { success: true, imageUrl };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.error(
        `Error uploading file for upload ${uploadId}: ${errorMessage}`,
        errorStack,
        { uploadId }
      );

      // Clean up temporary file if it exists
      try {
        if (fs.existsSync(tempFilePath)) {
          await unlinkAsync(tempFilePath);
          this.debug(`Cleaned up temporary file after error: ${tempFilePath}`, { uploadId });
        }
      } catch (cleanupError) {
        this.warn(`Failed to clean up temporary file: ${tempFilePath}`, { uploadId });
      }

      // Update upload status to failed
      try {
        await this.db.upload.update({
          where: { id: uploadId },
          data: { status: 'failed' }
        });
      } catch (dbError: unknown) {
        const dbErrorMessage = dbError instanceof Error ? dbError.message : String(dbError);
        this.error(`Failed to update upload status: ${dbErrorMessage}`, undefined, { uploadId });
      }

      throw error;
    }
  }
} 