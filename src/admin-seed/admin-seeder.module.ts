import { Module } from '@nestjs/common';
import { AdminSeederService } from './admin-seeder.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [AdminSeederService],
})
export class AdminSeederModule {}
