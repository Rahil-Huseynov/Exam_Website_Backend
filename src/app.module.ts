import {
  MiddlewareConsumer,
  Module,
  RequestMethod,
  NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AdminSeederModule } from './admin-seed/admin-seeder.module';
import { LogsModule } from './logspage/logs.module';
import { QuestionsModule } from './questions/questions.module';
import { UsersModule } from './users/users.module';
import { AttemptsModule } from './attempts/attempts.module';
import { NewsModule } from './news/news.module';
import { EmailsModule } from './emails/emails.module';
import { OriginCheckMiddleware } from './common/middleware/origin-check.middleware';
import { SecurityLogMiddleware } from './common/middleware/security-log.middleware';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { CustomCacheInterceptor } from './common/interceptors/custom-cache.interceptor';
import { AiModule } from './ai-checker/ai.module';
import { PdfConverterModule } from './pdf-converter/pdfconverter.module';
import { FeatureModule } from './feature/feature.module';
import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    LogsModule,
    EmailsModule,
    AdminSeederModule,
    AiModule,
    QuestionsModule,
    UsersModule,
    AttemptsModule,
    NewsModule,
    PaymentModule,
    PdfConverterModule,
    FeatureModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    CacheModule.register({
      ttl: 60,
      max: 100,
    }),
  ],

  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CustomCacheInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(OriginCheckMiddleware, SecurityLogMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
