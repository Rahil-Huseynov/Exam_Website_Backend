import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Response } from 'express';
import { PdfConverterService } from './pdfconverter.service';
import * as fs from 'fs';

@Controller('pdfconverter')
export class PdfConverterController {
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

          const dir = join('./uploads/pdf', randomName);
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          cb(null, file.originalname);
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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await this.pdfService.processPdfWithProgress(
      file.path,
      file.originalname,
      (percent) => {
        res.write(`data: ${percent}\n\n`);
      },
    );

    if (!result.success || !result.outputFilename) {
      res.write(`data: error\n\n`);
      res.end();
      return;
    }

    res.write(`data: done:${result.outputFilename}\n\n`);
    res.end();
  }
}