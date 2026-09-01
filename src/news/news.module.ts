import { Module } from "@nestjs/common"
import { NewsController } from "./news.controller"
import { NewsService } from "./news.service"
import { PrismaService } from "../prisma/prisma.service"
import { PrismaModule } from "src/prisma/prisma.module"
import { EmailsModule } from "src/emails/emails.module"

@Module({
  imports: [PrismaModule, EmailsModule],
  controllers: [NewsController],
  providers: [NewsService, PrismaService],
  exports: [NewsService],
})
export class NewsModule { }