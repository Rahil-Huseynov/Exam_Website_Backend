import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserCarsService } from './user-cars.service';
import { UserCarsController } from './user-cars.controller';
import { PushModule } from 'src/push/push.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, PushModule], 
  controllers: [UserCarsController],
  providers: [UserCarsService, PrismaService],
})
export class UserCarsModule { }
