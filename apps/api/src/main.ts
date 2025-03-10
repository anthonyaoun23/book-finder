import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { init } from '@repo/nestjs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://book-finder-web-one.vercel.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });
  
  init(app);
}
bootstrap();
