import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { EmailsController } from "./emails.controller"
import { EmailsService } from "./emails.service"
@Module({
  imports: [ConfigModule],
  controllers: [EmailsController],
  providers: [EmailsService],
  exports: [EmailsService],
})
export class EmailsModule {}
