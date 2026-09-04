import { Module } from "@nestjs/common"
import { BanksController } from "./banks.controller"
import { BanksService } from "./banks.service"
import { PrismaModule } from "src/prisma/prisma.module"

@Module({
  imports: [PrismaModule],
  controllers: [BanksController],
  providers: [BanksService],
  exports: [BanksService],
})
export class BanksModule {}