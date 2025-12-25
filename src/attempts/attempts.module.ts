import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AttemptsService } from "./attempts.service";
import { AttemptsController } from "./attempts.controller";
import { UsersAttemptsController } from "./users-attempts.controller";

@Module({
  controllers: [AttemptsController, UsersAttemptsController],
  providers: [AttemptsService, PrismaService],
  exports: [AttemptsService],
})
export class AttemptsModule {}
