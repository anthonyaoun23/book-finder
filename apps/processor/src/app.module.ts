import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessorModule } from './processors/processor.module';
import { DbModule } from './db/db.module';
import { LoggerModule } from 'nestjs-pino';
import { HealthController } from './health.controller';
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
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.getOrThrow('REDIS_URL');

        try {
          const url = new URL(redisUrl);

          return {
            connection: {
              host: url.hostname,
              port: parseInt(url.port, 10) || 6379,
              username: url.username || undefined,
              password: url.password || undefined,
              family: 0,
              tls: url.protocol === 'rediss:' ? {} : undefined,
            },
          };
        } catch (error) {
          console.error('Error parsing REDIS_URL:', error);
          return {
            connection: {
              url: redisUrl,
              family: 0,
            },
          };
        }
      },
      inject: [ConfigService],
    }),
    ProcessorModule,
    DbModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
