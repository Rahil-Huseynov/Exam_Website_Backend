import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { AiController } from "./ai.controller";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  providers: [AiService, PrismaService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
