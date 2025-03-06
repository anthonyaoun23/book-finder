import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessorModule } from './processor/processor.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow('REDIS_HOST'),
          port: configService.getOrThrow('REDIS_PORT'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'book-processing',
    }),
    ProcessorModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
