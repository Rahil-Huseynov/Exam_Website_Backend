import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PdfController } from "./pdf.controller";
import { PdfService } from "./pdf.service";

@Module({
  imports: [PrismaModule],
  controllers: [PdfController],
  providers: [PdfService],
})
export class PdfModule {}
