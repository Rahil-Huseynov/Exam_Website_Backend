import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  Body,
  Get,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CarImagesService } from './car-images.service';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AuthGuard } from '@nestjs/passport';

@Controller('car-images')
export class CarImagesController {
  constructor(private readonly carImagesService: CarImagesService) { }
  @UseGuards(AuthGuard('jwt'))
  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + extname(file.originalname));
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          'image/jpeg',  // jpg, jpeg
          'image/png',   // png
          'image/gif',   // gif
          'image/webp',  // webp
          'image/bmp',   // bmp
          'image/tiff',  // tiff
          'image/svg+xml' // svg
        ];

        if (!allowedTypes.includes(file.mimetype)) {
          return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
      },

    }),
  )
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('userCarId') userCarId: number,
  ) {
    const processedFiles: string[] = [];

    for (const file of files) {
      const outputFilename = `resized-${file.filename}`;
      const outputPath = path.join('./uploads', outputFilename);

      await sharp(file.path)
        .resize(1368, 768, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toFile(outputPath);

      await fs.unlink(file.path);

      processedFiles.push(outputFilename);
    }

    return this.carImagesService.addImages(userCarId, processedFiles);
  }

  @Get(':userCarId')
  async getImages(@Param('userCarId') userCarId: string) {
    return this.carImagesService.getImagesByUserCar(Number(userCarId));
  }
  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  async deleteImage(@Param('id') id: string) {
    return this.carImagesService.deleteImage(Number(id));
  }
}