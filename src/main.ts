import { HttpAdapterHost, NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { PrismaService } from './prisma/prisma.service';
import { ApiKeyGuard } from './guard/api-key.guard';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CustomCacheInterceptor } from './common/interceptors/custom-cache.interceptor';
import * as compression from 'compression';
import * as express from 'express';
import * as helmetImport from 'helmet';
import * as rateLimitImport from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'debug', 'log', 'verbose'],
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const configService = app.get(ConfigService);
  app.useGlobalGuards(new ApiKeyGuard(configService));

  const helmet = (helmetImport as any).default ?? helmetImport;
  const rateLimit = (rateLimitImport as any).default ?? rateLimitImport;

  app.use((helmet as any)({ contentSecurityPolicy: false }));

  const cacheManager = app.get(CACHE_MANAGER);
  const reflector = app.get(Reflector);
  const httpAdapterHost = app.get(HttpAdapterHost);
  const prisma = app.get(PrismaService);

  app.use(compression({ threshold: 0 }));

  app.useGlobalInterceptors(
    new CustomCacheInterceptor(cacheManager, reflector, httpAdapterHost),
    new HttpLoggingInterceptor(prisma),
  );

  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });

  app.use((req, res, next) => {
    const ua = (req.headers['user-agent'] || '').toString().toLowerCase();
    if (ua.includes('curl') || ua.includes('wget') || ua.includes('httpie')) {
      return res.status(403).send('CLI sorgulara icaz? verilmir.');
    }
    next();
  });

  app.use(
    (rateLimit as any)({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: 'ï¿½ox sorgu gï¿½nd?rirsiniz, bir az sonra yenid?n c?hd edin.',
    }),
  );

  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'https://carifypl.netlify.app',
        'https://carvia.pl',
        'http://localhost:3000',
      ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Statik IP-d? ?lï¿½atanliq
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port, '0.0.0.0');

  console.log(`?? Server running on http://0.0.0.0:${port}`);
}

bootstrap();
