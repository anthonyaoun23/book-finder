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
import { SkipThrottle, Throttle } from '@nestjs/throttler';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @Throttle({ 'file-upload': { limit: 3, ttl: 60000 } })
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
    const { uploadId } = await this.uploadService.uploadFile(
      file.originalname,
      file.buffer,
    );

    return {
      message: 'File upload queued for processing',
      uploadId,
    };
  }

  @Get()
  @SkipThrottle({ 'file-upload': true })
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getAllUploads() {
    return this.uploadService.getAllUploads();
  }

  @Get(':id/status')
  @SkipThrottle({ 'file-upload': true })
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getUploadStatus(@Param('id') id: string) {
    return this.uploadService.getUploadStatus(id);
  }
}
