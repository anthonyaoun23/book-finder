import { Injectable, Logger } from '@nestjs/common';
import {
  TextractClient,
  AnalyzeDocumentCommand,
} from '@aws-sdk/client-textract';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TextractService {
  private readonly textract: TextractClient;
  private readonly logger = new Logger(TextractService.name);

  constructor(private readonly configService: ConfigService) {
    this.textract = new TextractClient({
      region: this.configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async extractTextFromImage(s3Url: string): Promise<string> {
    const url = new URL(s3Url);
    const bucket = url.hostname.split('.')[0];
    const key = decodeURIComponent(url.pathname.substring(1));

    const command = new AnalyzeDocumentCommand({
      Document: {
        S3Object: {
          Bucket: bucket,
          Name: key,
        },
      },
      FeatureTypes: ['LAYOUT', 'FORMS'],
    });

    try {
      const response = await this.textract.send(command);
      const text =
        response.Blocks?.filter((block) => block.BlockType === 'LINE')
          .map((block) => block.Text)
          .join('\n') || '';
      this.logger.debug(`Textract response for ${s3Url}: ${text}`);
      return text;
    } catch (error) {
      this.logger.error(
        `Textract error for ${s3Url}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Extract text from binary image data using AWS Textract
   * @param imageBuffer Binary image data (e.g., from a screenshot)
   * @returns Extracted text
   */
  async extractText(imageBuffer: Buffer | Uint8Array): Promise<string> {
    const command = new AnalyzeDocumentCommand({
      Document: {
        Bytes:
          imageBuffer instanceof Buffer
            ? imageBuffer
            : Buffer.from(imageBuffer),
      },
      FeatureTypes: ['LAYOUT', 'FORMS'],
    });

    try {
      const response = await this.textract.send(command);
      const text =
        response.Blocks?.filter((block) => block.BlockType === 'LINE')
          .map((block) => block.Text)
          .join('\n') || '';
      this.logger.debug(
        `Textract response for binary image: ${text.substring(0, 100)}...`,
      );
      return text;
    } catch (error) {
      this.logger.error(
        `Textract error for binary image: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
