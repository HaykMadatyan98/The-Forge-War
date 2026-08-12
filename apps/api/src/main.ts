import './env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { rateLimitMiddleware } from './security/rate-limit';
import { assertProductionConfig } from './security/prod-config';
import { isProduction } from './auth/session-cookie';

async function bootstrap() {
  assertProductionConfig();

  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();
  // Correct client IP / HTTPS behind Caddy/Nginx/Cloudflare
  expressApp.set('trust proxy', process.env.TRUST_PROXY === '0' ? false : 1);

  app.use(
    helmet({
      contentSecurityPolicy: false, // API only; browsers hit web app
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(json({ limit: process.env.JSON_BODY_LIMIT || '2mb' }));
  app.use(rateLimitMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const origins = (process.env.WEB_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.setGlobalPrefix('v1');

  const port = Number(process.env.PORT ?? 8787);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(
    `TFW API :${port}/v1  env=${isProduction() ? 'production' : 'dev'} origins=${origins.join(',')}`,
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
