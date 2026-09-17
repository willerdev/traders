import './solo-preload';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { SoloAppModule } from './solo.app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(SoloAppModule, {
    rawBody: true,
  });

  app.useStaticAssets(join(process.cwd(), 'uploads', 'setups'), {
    prefix: '/uploads/setups',
  });

  app.set('trust proxy', 1);

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = (process.env.FRONTEND_URL || 'http://localhost:3001')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

      if (process.env.NODE_ENV !== 'production') {
        allowed.push(
          'http://localhost:3001',
          'http://127.0.0.1:3001',
          'http://localhost:3000',
          'http://127.0.0.1:3000',
        );
      }

      const extra = process.env.SOLO_FRONTEND_URL?.trim();
      if (extra) allowed.push(extra.replace(/\/$/, ''));

      if (!origin || allowed.includes(origin)) {
        callback(null, origin ?? allowed[0]);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 4001;
  await app.listen(port);
  console.log(`Trade Guard Solo API running on http://localhost:${port}`);
}

bootstrap();
