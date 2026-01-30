import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join, extname } from 'path';
import { Response } from 'express';
import { PdfConverterService } from './pdfconverter.service';
import * as fs from 'fs';
import * as crypto from 'crypto';

@Controller('pdfconverter')
export class PdfConverterController {
  private readonly logger = new Logger(PdfConverterController.name);

  constructor(private readonly pdfService: PdfConverterService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const randomName = Array(16)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');

          const dir = join(process.cwd(), 'uploads', 'pdf', randomName);
          try {
            fs.mkdirSync(dir, { recursive: true });
          } catch (err) {
          }
          cb(null, dir);
        },

        filename: (req: any, file: Express.Multer.File, cb) => {
          const fileHash = crypto.randomBytes(12).toString('hex'); // 24 hex simvol
          const ext = extname(file.originalname) || '.pdf';
          const savedName = `${fileHash}${ext}`;

          try {
            req.savedFileHash = fileHash;
            req.savedFilename = savedName;
          } catch (e) {
            /* ignore */
          }

          cb(null, savedName);
        },
      }),

      fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new Error('Yalnız PDF faylları qəbul olunur!'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadPdf(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    if (!file) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send('PDF göndərilməyib!');
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const savedFilename = (file.filename as string) || ((res as any).req?.savedFilename as string);
    const savedHash = ((res as any).req?.savedFileHash as string) || null;

    const useName = savedFilename ?? file.filename;
    const useBase = savedHash ?? (useName ? useName.replace(/\.[^.]+$/, '') : Date.now().toString(16));

    try {
      const result = await this.pdfService.processPdfWithProgress(
        file.path,
        useBase, 
        (percent) => {
          res.write(`data: ${percent}\n\n`);
        },
      );

      if (!result.success || !result.outputFilename) {
        res.write(`data: error\n\n`);
        res.end();
        return;
      }

      res.write(`data: done:${encodeURIComponent(result.outputFilename)}\n\n`);
      res.end();
    } catch (err: any) {
      this.logger.error(err?.message || err);
      res.write(`data: error\n\n`);
      res.end();
    }
  }
}
