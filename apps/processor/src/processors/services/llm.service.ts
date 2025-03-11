import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
} from 'openai/resources';

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  coverAnalysisFunction,
  coverAnalysisSystemPrompt,
} from '../../prompts/cover-analysis.prompt';
import {
  pageClassificationFunction,
  pageClassificationSystemPrompt,
  pageClassificationUserPrompt,
} from '../../prompts/page-classification.prompt';
import {
  formatSnippetFunction,
  formatSnippetSystemPrompt,
  formatSnippetUserPrompt,
} from '../../prompts/format-snippet.prompt';

export interface BookAnalysisResult {
  isBook: boolean;
  confidence: number;
  title: string | null;
  author: string | null;
  fiction: boolean | null;
}

@Injectable()
export class LLMService {
  private readonly openai: OpenAI;
  private readonly s3: S3Client;
  private readonly logger = new Logger(LLMService.name);

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow('OPENAI_API_KEY'),
    });

    this.s3 = new S3Client({
      region: this.configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  public async analyzeCoverImage(
    s3Url: string,
  ): Promise<BookAnalysisResult | null> {
    try {
      const signedUrl = await this.createPresignedUrl(s3Url);
      const systemMsg: ChatCompletionContentPartText = {
        type: 'text',
        text: coverAnalysisSystemPrompt,
      };

      const imgUrl: ChatCompletionContentPartImage = {
        type: 'image_url',
        image_url: {
          url: signedUrl,
        },
      };

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [systemMsg, imgUrl],
          },
        ],
        functions: [coverAnalysisFunction],
        function_call: { name: coverAnalysisFunction.name },
        max_tokens: 500,
      });

      const functionArgs = this.extractFunctionArguments(response);
      if (!functionArgs) {
        this.logger.warn(`No function call arguments returned from OpenAI.`);
        return null;
      }

      const result: BookAnalysisResult = {
        isBook: functionArgs.isBook,
        confidence: functionArgs.confidence,
        title: functionArgs.title,
        author: functionArgs.author,
        fiction: functionArgs.fiction,
      };

      return result;
    } catch (err) {
      this.logger.error(`Failed analyzing cover image: ${String(err)}`);
      return null;
    }
  }

  public async classifyPageContent(
    pageText: string,
    pageNumber: number,
    isFiction?: boolean,
  ): Promise<'CONTENT' | 'FRONTMATTER'> {
    try {
      const systemMsg: OpenAI.Chat.ChatCompletionMessageParam = {
        role: 'system',
        content: pageClassificationSystemPrompt,
      };
      const userMsg: OpenAI.Chat.ChatCompletionMessageParam = {
        role: 'user',
        content: pageClassificationUserPrompt(pageText, pageNumber, isFiction),
      };

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [systemMsg, userMsg],
        functions: [pageClassificationFunction],
        function_call: { name: pageClassificationFunction.name },
        temperature: 0.0,
      });

      const args = this.extractFunctionArguments(response);
      if (args && args.classification === 'CONTENT') {
        return 'CONTENT';
      } else {
        return 'FRONTMATTER';
      }
    } catch (err) {
      this.logger.error(`Error in page classification: ${String(err)}`);
      return 'CONTENT';
    }
  }

  public async formatExtractedSnippet(pageText: string): Promise<string> {
    try {
      const systemMsg: OpenAI.Chat.ChatCompletionMessageParam = {
        role: 'system',
        content: formatSnippetSystemPrompt,
      };
      const userMsg: OpenAI.Chat.ChatCompletionMessageParam = {
        role: 'user',
        content: formatSnippetUserPrompt(pageText),
      };

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [systemMsg, userMsg],
        functions: [formatSnippetFunction],
        function_call: { name: formatSnippetFunction.name },
        temperature: 0.2,
      });

      const args = this.extractFunctionArguments(response);
      if (args && args.formattedText) {
        return args.formattedText;
      } else {
        return pageText;
      }
    } catch (err) {
      this.logger.error(`Error formatting snippet: ${String(err)}`);
      return pageText;
    }
  }

  private extractFunctionArguments(
    completion: OpenAI.Chat.ChatCompletion,
  ): Record<string, any> | null {
    const choice = completion?.choices?.[0];
    if (!choice) return null;

    // Handle the newer tool_calls format
    const toolCall = choice.message?.tool_calls?.[0];
    if (toolCall) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        return parsed;
      } catch (err) {
        this.logger.error(
          `Failed to parse tool_call arguments: ${String(err)}`,
        );
        return null;
      }
    }

    // Handle the older function_call format
    const functionCall = choice.message?.function_call;
    if (functionCall) {
      try {
        const parsed = JSON.parse(functionCall.arguments);
        return parsed;
      } catch (err) {
        this.logger.error(
          `Failed to parse function_call arguments: ${String(err)}`,
        );
        return null;
      }
    }

    return null;
  }

  private async createPresignedUrl(s3Url: string): Promise<string> {
    const url = new URL(s3Url);
    const bucket = url.hostname.split('.')[0];
    const key = decodeURIComponent(url.pathname.substring(1));

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return await getSignedUrl(this.s3, command, { expiresIn: 3600 });
  }
}
