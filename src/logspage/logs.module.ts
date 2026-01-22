import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogArchiveService } from './log-archive.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],   
  controllers: [LogsController],
  providers: [LogArchiveService],
})
export class LogsModule {}
