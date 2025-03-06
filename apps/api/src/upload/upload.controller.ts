import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    @InjectQueue('book-processing') private readonly bookQueue: Queue,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10000000 }), // 1MB limit
          new FileTypeValidator({ fileType: 'image/*' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const { url } = await this.uploadService.uploadFile(
      file.originalname,
      file.buffer,
    );
    await this.bookQueue.add(
      'process',
      { url },
      { attempts: 3, backoff: 5000 },
    );
    return { message: 'File uploaded and processing started', url };
  }
}
