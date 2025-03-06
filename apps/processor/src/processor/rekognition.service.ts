import { Injectable, Logger } from '@nestjs/common';
import {
  RekognitionClient,
  DetectLabelsCommand,
} from '@aws-sdk/client-rekognition';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RekognitionService {
  private readonly rekognition: RekognitionClient;
  private readonly logger = new Logger(RekognitionService.name);

  constructor(private readonly configService: ConfigService) {
    this.rekognition = new RekognitionClient({
      region: this.configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async detectBook(s3Url: string): Promise<boolean> {
    const url = new URL(s3Url);
    const bucket = url.hostname.split('.')[0];
    const key = decodeURIComponent(url.pathname.substring(1));

    const command = new DetectLabelsCommand({
      Image: {
        S3Object: {
          Bucket: bucket,
          Name: key,
        },
      },
      MaxLabels: 10,
      MinConfidence: 75, // Confidence threshold
    });

    try {
      const response = await this.rekognition.send(command);
      const labels = response.Labels?.map((label) => label.Name) || [];
      this.logger.debug(`Detected labels for ${s3Url}: ${labels.join(', ')}`);
      return labels.includes('Book');
    } catch (error) {
      this.logger.error(
        `Rekognition error for ${s3Url}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
