import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  // rawBody: payment webhooks are verified against the exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService<Env, true>);

  app.enableCors({ origin: config.get('WEB_URL'), credentials: true });
  app.enableShutdownHooks();

  await app.listen(config.get('PORT'));
}

void bootstrap();
