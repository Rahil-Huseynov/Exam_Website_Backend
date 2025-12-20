import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as fs from "fs";
import * as path from "path";
import { parseQuestionsFromText, DraftQuestion } from "./pdf.parser";

const pdfParse: (dataBuffer: Buffer) => Promise<{ text?: string }> = require("pdf-parse");

@Injectable()
export class PdfService {
  constructor(private prisma: PrismaService) {}

  async createImport(bankId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException("PDF file is required");

    const rec = await this.prisma.pdfImport.create({
      data: {
        bankId,
        originalName: file.originalname,
        storageKey: file.filename,
        status: "PENDING",
      },
    });

    await this.parseImport(rec.id);
    return rec;
  }

  async parseImport(pdfImportId: string) {
    const imp = await this.prisma.pdfImport.findUnique({ where: { id: pdfImportId } });
    if (!imp) throw new BadRequestException("PdfImport not found");

    const uploadDir = process.env.UPLOAD_DIR || "uploads";
    const abs = path.join(process.cwd(), uploadDir, imp.storageKey);
    if (!fs.existsSync(abs)) throw new BadRequestException("File not found");

    try {
      const buf = fs.readFileSync(abs);
      const data = await pdfParse(buf);
      const extractedText = (data?.text || "").trim();

      await this.prisma.pdfImport.update({
        where: { id: pdfImportId },
        data: { extractedText, status: "PARSED" },
      });

      return extractedText;
    } catch (e) {
      await this.prisma.pdfImport.update({
        where: { id: pdfImportId },
        data: { status: "FAILED" },
      });
      throw e;
    }
  }

  async getDraft(pdfImportId: string): Promise<DraftQuestion[]> {
    const imp = await this.prisma.pdfImport.findUnique({ where: { id: pdfImportId } });
    if (!imp || imp.status !== "PARSED" || !imp.extractedText) {
      throw new BadRequestException("PDF is not parsed yet");
    }
    return parseQuestionsFromText(imp.extractedText);
  }
}
