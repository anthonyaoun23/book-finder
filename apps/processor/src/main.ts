import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  // Set log level to debug to see all logs
  Logger.overrideLogger(['debug', 'log', 'warn', 'error']);
  
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3002);
  
  Logger.log(`Application is running on port ${process.env.PORT ?? 3002}`, 'Bootstrap');
}
bootstrap();
