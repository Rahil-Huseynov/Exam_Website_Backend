import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CarsService } from './cars.service';
import { CarsController } from './car.controller';
import { CarsCronService } from './cars-cron.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [CarsController],
  exports: [CarsService],
  providers: [CarsService, CarsCronService, PrismaService],
})
export class CarsModule { }
