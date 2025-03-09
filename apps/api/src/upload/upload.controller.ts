import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Get,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { Throttle } from '@nestjs/throttler';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @Throttle({ default: { limit: 0, ttl: 0 } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10000000 }), // 10MB limit
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

    const upload = await this.uploadService.createUpload(url);
    await this.uploadService.queueUpload(upload.id, url);

    return {
      message: 'File uploaded and processing started',
      uploadId: upload.id,
    };
  }

  @Get()
  @Throttle({
    'file-upload': { limit: 0, ttl: 0 },
    default: { limit: 20, ttl: 60000 },
  })
  async getAllUploads() {
    return this.uploadService.getAllUploads();
  }

  @Get(':id/status')
  @Throttle({ default: { limit: 0, ttl: 0 } })
  async getUploadStatus(@Param('id') id: string) {
    return this.uploadService.getUploadStatus(id);
  }
}
