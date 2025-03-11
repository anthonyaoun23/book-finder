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

  async uploadFile(fileName: string, file: Buffer) {
    const upload = await this.createUpload();

    const fileBase64 = file.toString('base64');

    await this.fileUploadQueue.add(
      'upload',
      {
        uploadId: upload.id,
        fileName,
        fileBase64,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { uploadId: upload.id };
  }

  async createUpload() {
    const upload = await this.db.upload.create({
      data: {
        status: 'pending',
        imageUrl: null,
      },
    });
    return upload;
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

  async getAllUploads() {
    return this.db.upload.findMany({
      include: { book: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
