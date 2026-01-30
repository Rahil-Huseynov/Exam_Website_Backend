import { Module } from '@nestjs/common';
import { PdfConverterService } from './pdfconverter.service';
import { PdfConverterController } from './pdfconverter.controller';

@Module({
    controllers: [PdfConverterController],
    providers: [PdfConverterService],
})
export class PdfConverterModule { }
