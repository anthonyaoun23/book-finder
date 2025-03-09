import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { DbModule } from '../db/db.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'file-upload',
            ttl: Number(configService.getOrThrow('UPLOAD_RATE_TTL')) * 1000,
            limit: Number(configService.getOrThrow('UPLOAD_RATE_LIMIT')),
          },
          {
            name: 'default',
            ttl: Number(configService.getOrThrow('DEFAULT_RATE_TTL', '60')) * 1000,
            limit: Number(configService.getOrThrow('DEFAULT_RATE_LIMIT', '25')),
          },
        ],
      }),
      inject: [ConfigService],
    }),
    DbModule,
    BullModule.registerQueue({
      name: 'image-analysis',
    }),
  ],
  controllers: [UploadController],
  providers: [
    UploadService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class UploadModule {}
