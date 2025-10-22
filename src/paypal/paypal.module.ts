import { Module } from '@nestjs/common';
import { PaypalService } from './paypal.service';
import { PaypalController } from './paypal.controller';
import { ConfigModule } from '@nestjs/config';
import { CarsModule } from '../cars/cars.module'; 

@Module({
  imports: [ConfigModule, CarsModule], 
  providers: [PaypalService],
  controllers: [PaypalController],
})
export class PaypalModule {}
