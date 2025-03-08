import { Module } from '@nestjs/common';
import { BookProcessor } from './book.processor';
import { RekognitionService } from './rekognition.service';
import { TextractService } from './textract.service';
import { OpenAIService } from './openai.service';
import { GoogleBooksService } from './google-books.service';
import { LibgenService } from './libgen.service';
import { BookFormatHandlerService } from './book-format-handler.service';

@Module({
  providers: [
    BookProcessor,
    RekognitionService,
    TextractService,
    OpenAIService,
    GoogleBooksService,
    LibgenService,
    BookFormatHandlerService,
  ],
})
export class ProcessorModule {}
