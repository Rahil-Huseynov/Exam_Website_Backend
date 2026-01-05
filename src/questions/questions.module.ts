import { Module } from "@nestjs/common";
import { QuestionsService } from "./questions.service";
import { QuestionsController, BankQuestionsController } from "./questions.controller";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  controllers: [QuestionsController, BankQuestionsController],
  providers: [QuestionsService, PrismaService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
