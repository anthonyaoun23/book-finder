import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../db/db.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class UploadService {
  constructor(
    private readonly configService: ConfigService,
    private readonly db: DbService,
    @InjectQueue('file-upload') private readonly fileUploadQueue: Queue,
  ) {}

  /**
   * Queue a file upload job instead of directly uploading to S3
   * This offloads the heavy lifting to the processor application
   */
  async uploadFile(fileName: string, file: Buffer) {
    // Create an initial upload record in the database
    const upload = await this.createUpload();

    // Convert buffer to base64 string for reliable queue transport
    const fileBase64 = file.toString('base64');

    // Queue the file upload job
    await this.fileUploadQueue.add(
      'upload',
      {
        uploadId: upload.id,
        fileName,
        fileBase64,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    );

    return { uploadId: upload.id };
  }

  /**
   * Create an initial upload record with pending status and no imageUrl
   * The processor will update this record with the imageUrl after S3 upload
   */
  async createUpload() {
    const upload = await this.db.upload.create({
      data: {
        status: 'pending',
        imageUrl: null,
      },
    });
    return upload;
  }

  /**
   * Get the status of an upload
   */
  async getUploadStatus(uploadId: string) {
    const upload = await this.db.upload.findUnique({
      where: { id: uploadId },
      include: { book: true },
    });
    if (!upload) {
      throw new NotFoundException('Upload not found');
    }
    return upload;
  }

  /**
   * Get all uploads with their associated books
   */
  async getAllUploads() {
    return this.db.upload.findMany({
      include: { book: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
