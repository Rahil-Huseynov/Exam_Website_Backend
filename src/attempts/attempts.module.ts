import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AttemptsService } from "./attempts.service";
import { AttemptsController } from "./attempts.controller";
import { AiModule } from "src/ai-checker/ai.module";
import { PrismaModule } from "src/prisma/prisma.module";
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [
    PrismaModule,
    AiModule, 
    ScheduleModule.forRoot(),
  ],
  controllers: [AttemptsController],
  providers: [AttemptsService, PrismaService],
  exports: [AttemptsService],
})
export class AttemptsModule {}
