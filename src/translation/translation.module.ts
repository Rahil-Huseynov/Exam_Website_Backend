import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [
    CacheModule.register({
      store: redisStore as any,
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      ttl: Number(process.env.REDIS_TTL || 3600),
    }),
  ],
  controllers: [TranslationController],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationModule {}
