import { NestFactory, Reflector, HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { PrismaService } from './prisma/prisma.service';
import { ApiKeyGuard } from './guard/api-key.guard';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CustomCacheInterceptor } from './common/interceptors/custom-cache.interceptor';
import * as compression from 'compression';
import * as helmetImport from 'helmet';
import * as rateLimitImport from 'express-rate-limit';
import * as express from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'debug', 'log', 'verbose'],
  });

  const expressApp = app.getHttpAdapter().getInstance();

  // Body parsers
  expressApp.use(express.json({ limit: '50mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Helmet + compression
  const helmet = (helmetImport as any).default ?? helmetImport;
  app.use((helmet as any)({ contentSecurityPolicy: false }));
  app.use(compression({ threshold: 0 }));

  // Allowed origins
  const allowedOrigins = [
    'https://carvia-project.netlify.app',
    'https://carvia.pl',
    'http://carvia.pl',
    'https://www.carvia.pl',
    'http://www.carvia.pl',
    'http://localhost:3000',
    'http://217.64.24.9:3000',
    'https://217.64.24.9:3000',
  ];

  // Enable CORS (ARRAY form, safer)
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Rate limiter — skip OPTIONS requests
  const rateLimit = (rateLimitImport as any).default ?? rateLimitImport;
  app.set('trust proxy', 1);
  expressApp.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: 'Çox sorgu göndərirsiniz, bir az sonra yenidən cəhd edin.',
      skip: (req) => req.method === 'OPTIONS',
    }),
  );

  // Static headers + CLI blocker
  expressApp.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });

  expressApp.use((req, res, next) => {
    const ua = (req.headers['user-agent'] || '').toString().toLowerCase();
    if (ua.includes('curl') || ua.includes('wget') || ua.includes('httpie')) {
      return res.status(403).send('CLI sorgulara icazə verilmir.');
    }
    next();
  });

  // Guards / interceptors / pipes
  const configService = app.get(ConfigService);
  app.useGlobalGuards(new ApiKeyGuard(configService));

  const cacheManager = app.get(CACHE_MANAGER);
  const reflector = app.get(Reflector);
  const prisma = app.get(PrismaService);
  const httpAdapterHost = app.get(HttpAdapterHost);

  app.useGlobalInterceptors(
    new CustomCacheInterceptor(cacheManager, reflector, httpAdapterHost),
    new HttpLoggingInterceptor(prisma),
  );

  expressApp.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      const origin = req.headers.origin as string | undefined;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
      return res.sendStatus(204);
    }
    next();
  });


  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`✅ Server running on http://0.0.0.0:${port}`);
}

bootstrap();
