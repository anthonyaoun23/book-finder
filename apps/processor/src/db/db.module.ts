import { Module } from '@nestjs/common';
import { DbService } from './db.service';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'file-upload' },
      { name: 'image-analysis' },
    ),
  ],
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
