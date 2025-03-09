import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { init } from '@repo/nestjs';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  logger.log('Starting Book Finder Processor application');

  await init(app);

  logger.log('Processor initialized and ready to process jobs');
}

// Start the application
bootstrap().catch((err) => {
  console.error('Failed to start processor application:', err);
  process.exit(1);
});
