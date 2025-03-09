import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessorModule } from './processors/processor.module';
import { DbModule } from './db/db.module';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: {
            singleLine: true,
          },
        },
      },
    }),
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
    ProcessorModule,
    DbModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
