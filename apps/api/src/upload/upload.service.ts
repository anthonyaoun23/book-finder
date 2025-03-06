import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class UploadService {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
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
}
