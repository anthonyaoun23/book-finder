import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DbService } from '../db/db.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
@Injectable()
export class UploadService {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DbService,
    @InjectQueue('image-analysis') private readonly imageQueue: Queue,
  ) {
    this.s3 = new S3Client({
      region: this.configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    });
    this.bucketName = this.configService.getOrThrow('AWS_BUCKET_NAME');
  }

  async uploadFile(fileName: string, file: Buffer) {
    // Ensure filename doesn't contain problematic characters
    const sanitizedFileName = encodeURIComponent(fileName).replace(/%20/g, '_');

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: sanitizedFileName,
      Body: file,
    });
    await this.s3.send(command);
    const url = `https://${this.bucketName}.s3.amazonaws.com/${sanitizedFileName}`;

    return { url };
  }

  async createUpload(imageUrl: string) {
    const upload = await this.db.upload.create({
      data: {
        imageUrl,
        status: 'pending',
      },
    });
    return upload;
  }

  async queueUpload(uploadId: string, imageUrl: string) {
    await this.imageQueue.add(
      'process',
      { uploadId, imageUrl },
      { attempts: 2, backoff: 5000 },
    );
  }

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
}
