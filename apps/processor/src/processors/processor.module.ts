import { Module } from '@nestjs/common';
import { ImageAnalysisProcessor } from './image-analysis/image-analysis.processor';
import { BookLookupProcessor } from './book-lookup/book-lookup.processor';
import { BookDownloadProcessor } from './book-download/book-download.processor';
import { ContentExtractionProcessor } from './content-extraction/content-extraction.processor';
import { OpenAIService } from './services/openai.service';
import { GoogleBooksService } from './services/google-books.service';
import { LibgenService } from './services/libgen.service';
import { BookFormatHandlerService } from './services/book-format-handler.service';
import { RekognitionService } from './services/rekognition.service';
import { TextractService } from './services/textract.service';
import { BullModule } from '@nestjs/bullmq';
import { DbService } from '../db/db.service';
@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'image-analysis' },
      { name: 'book-lookup' },
      { name: 'book-download' },
      { name: 'content-extraction' },
    ),
  ],
  providers: [
    ImageAnalysisProcessor,
    BookLookupProcessor,
    BookDownloadProcessor,
    ContentExtractionProcessor,
    OpenAIService,
    GoogleBooksService,
    LibgenService,
    BookFormatHandlerService,
    RekognitionService,
    TextractService,
    DbService,
  ],
})
export class ProcessorModule {}
