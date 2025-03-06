import { Module } from '@nestjs/common';
import { BookProcessor } from './book.processor';
import { RekognitionService } from './rekognition.service';
import { TextractService } from './textract.service';

@Module({
  providers: [BookProcessor, RekognitionService, TextractService],
})
export class ProcessorModule {}
