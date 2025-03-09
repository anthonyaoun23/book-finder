import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { init } from '@repo/nestjs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  init(app);
}
bootstrap();
