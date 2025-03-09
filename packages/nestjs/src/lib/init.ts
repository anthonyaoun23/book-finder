import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Logger } from "nestjs-pino";

export async function init(app: INestApplication) {
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.useLogger(app.get(Logger));
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow('PORT');
  await app.listen(port);
  app
    .get(Logger)
    .log(
      `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
    );
}
