import { Controller, Post, Param, UseInterceptors, UploadedFile, Get } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import * as path from "path";
import { PdfService } from "./pdf.service";

function pdfFileFilter(req: any, file: any, cb: any) {
  if (file.mimetype !== "application/pdf") return cb(new Error("Only PDF allowed"), false);
  cb(null, true);
}

@Controller()
export class PdfController {
  constructor(private pdfService: PdfService) {}

  @Post("banks/:bankId/pdf")
  @UseInterceptors(
    FileInterceptor("file", {
      fileFilter: pdfFileFilter,
      limits: { fileSize: 20 * 1024 * 1024 },
      storage: diskStorage({
        destination: () => process.env.UPLOAD_DIR || "uploads",
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname) || ".pdf";
          cb(null, `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`);
        },
      }),
    }),
  )
  async uploadPdf(@Param("bankId") bankId: string, @UploadedFile() file: Express.Multer.File) {
    const rec = await this.pdfService.createImport(bankId, file);
    return { pdfImportId: rec.id };
  }

  @Get("pdf/:pdfImportId/draft")
  async getDraft(@Param("pdfImportId") pdfImportId: string) {
    const draft = await this.pdfService.getDraft(pdfImportId);
    return { draft };
  }
}
