import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AttemptsService } from "./attempts.service";
import { AttemptsController } from "./attempts.controller";

@Module({
  controllers: [AttemptsController],
  providers: [AttemptsService, PrismaService],
  exports: [AttemptsService],
})
export class AttemptsModule {}
