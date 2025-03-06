import { Module } from '@nestjs/common';
import { BookProcessor } from './book.processor';
import { RekognitionService } from './rekognition.service';
import { TextractService } from './textract.service';
import { OpenAIService } from './openai.service';
@Module({
  providers: [
    BookProcessor,
    RekognitionService,
    TextractService,
    OpenAIService,
  ],
})
export class ProcessorModule {}
