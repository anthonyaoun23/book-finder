import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ChatCompletionContentPart,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
} from 'openai/resources';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Interface for the book analysis result
 */
interface BookAnalysisResult {
  isBook: boolean;
  title: string | null;
  author: string | null;
  fiction: boolean | null;
}

@Injectable()
export class OpenAIService {
  private readonly openai: OpenAI;
  private readonly s3: S3Client;
  private readonly logger = new Logger(OpenAIService.name);

  constructor(private readonly configService: ConfigService) {
    // Initialize the OpenAI client with API key
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });

    // Initialize the S3 client with AWS credentials
    this.s3 = new S3Client({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  async analyzeImage(s3Url: string): Promise<BookAnalysisResult> {
    // Parse S3 URL and generate a signed URL
    const url = new URL(s3Url);
    const bucket = url.hostname.split('.')[0];
    const key = decodeURIComponent(url.pathname.substring(1));

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.s3, command, {
        expiresIn: 3600,
      });

      // Prompt for the Vision API
      const prompt = `
        Analyze the image and determine if there is a book present. If a book is detected, extract the title and author from the book cover.
        Ignore any text that is not part of the book title or author name.
      `;

      // Define the function schema
      const functionDefinition = {
        name: 'analyze_book_image',
        description:
          'Analyze an image to detect if a book is present and extract the title and author.',
        parameters: {
          type: 'object',
          properties: {
            isBook: {
              type: 'boolean',
              description: 'Whether a book is detected in the image.',
            },
            title: {
              type: 'string',
              description: 'The title of the book, or null if not found.',
            },
            author: {
              type: 'string',
              description: 'The author of the book, or null if not found.',
            },
            fiction: {
              type: 'boolean',
              description:
                'Whether the book is fiction (true) or non-fiction (false), or null if not determined.',
            },
          },
          required: ['isBook', 'title', 'author', 'fiction'],
        },
      } as const;

      // Create content array with text and image URL
      const textContent: ChatCompletionContentPartText = {
        type: 'text',
        text: prompt,
      };

      const imageContent: ChatCompletionContentPartImage = {
        type: 'image_url',
        image_url: {
          url: signedUrl,
          detail: 'high', // Use high detail for better recognition of text on books
        },
      };

      const content: ChatCompletionContentPart[] = [textContent, imageContent];

      // Create the API request
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Ensure this model supports Vision API
        messages: [
          {
            role: 'user',
            content,
          },
        ],
        functions: [functionDefinition],
        function_call: { name: 'analyze_book_image' },
        max_tokens: 300,
      });

      // Parse the structured response
      const choice = response.choices[0];
      const toolCalls = choice?.message?.tool_calls;
      const functionCall = choice?.message?.function_call;

      // Check for either tool_calls (newer API) or function_call (older API)
      if (
        toolCalls &&
        toolCalls.length > 0 &&
        toolCalls[0]?.function?.name === 'analyze_book_image'
      ) {
        // Handle tool_calls format
        const args = toolCalls[0]?.function?.arguments || '{}';
        const result = JSON.parse(args) as BookAnalysisResult;

        this.logger.debug(
          `OpenAI response for ${s3Url}: ${JSON.stringify(result)}`,
        );

        return result;
      } else if (functionCall && functionCall.name === 'analyze_book_image') {
        // Handle function_call format
        const args = functionCall.arguments || '{}';
        const result = JSON.parse(args) as BookAnalysisResult;

        this.logger.debug(
          `OpenAI response for ${s3Url}: ${JSON.stringify(result)}`,
        );

        return result;
      } else {
        throw new Error('Expected function call not found in response');
      }
    } catch (error) {
      this.logger.error(
        `OpenAI error for ${s3Url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
