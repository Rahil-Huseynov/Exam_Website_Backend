import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AdminSeederModule } from './admin-seed/admin-seeder.module';
import { OriginCheckMiddleware } from './common/middleware/origin-check.middleware';
import { join } from 'path';
import { LogsModule } from './logspage/logs.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { ServeStaticModule } from '@nestjs/serve-static';
import { CacheModule } from '@nestjs/cache-manager';
import { CustomCacheInterceptor } from './common/interceptors/custom-cache.interceptor';
import { PdfModule } from './pdf/pdf.module';
import { QuestionsModule } from './questions/questions.module';
import { UsersModule } from './users/users.module';

@Module({
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
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, LogsModule, UserModule, AdminSeederModule, PrismaModule, PdfModule, QuestionsModule, UsersModule,

  ServeStaticModule.forRoot({
    rootPath: join(__dirname, '..', 'uploads'),
    serveRoot: '/uploads',
  }),
  CacheModule.register({
    ttl: 60,
    max: 100,
  }),
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(OriginCheckMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
