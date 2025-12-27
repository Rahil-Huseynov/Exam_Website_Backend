import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ValidationPipe,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { diskStorage } from "multer"
import { extname } from "path"

import { NewsService } from "./news.service"
import { CreateNewsDto } from "./dto/create-news.dto"
import { UpdateNewsDto } from "./dto/update-news.dto"
import { NewsQueryDto } from "./dto/news-query.dto"

function safeFileName(originalName: string) {
  const base = originalName
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9.\-_]/g, "")
    .toLowerCase()
  const rnd = Math.random().toString(16).slice(2)
  return `${Date.now()}-${rnd}-${base}`
}

@Controller("news")
export class NewsController {
  constructor(private news: NewsService) {}

  @Get()
  async listPublished(@Query(new ValidationPipe({ transform: true })) q: NewsQueryDto) {
    return this.news.listPublished(q)
  }

  @Get(":id")
  async getOne(
    @Param("id") id: string,
    @Query(new ValidationPipe({ transform: true })) q: NewsQueryDto,
  ) {
    const lang = (q.lang || "az") as "az" | "en" | "ru"
    return this.news.getById(id, lang)
  }


  @Get("admin/all")
  async listAllAdmin(@Query(new ValidationPipe({ transform: true })) q: NewsQueryDto) {
    return this.news.listAllAdmin(q)
  }

  @Post("admin")
  async create(
    @Req() req: any,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateNewsDto,
  ) {
    const adminId = req?.user?.id ? Number(req.user.id) : null
    return this.news.create(adminId, dto)
  }

  @Patch("admin/:id")
  async update(
    @Param("id") id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateNewsDto,
  ) {
    return this.news.update(id, dto)
  }

  @Patch("admin/:id/publish")
  async publishNow(@Param("id") id: string) {
    return this.news.publishNow(id)
  }

  @Delete("admin/:id")
  async remove(@Param("id") id: string) {
    return this.news.remove(id)
  }

  @Post("admin/upload-image")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: "./uploads/news",
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname || "").toLowerCase()
          cb(null, safeFileName(file.originalname.replace(ext, "") + ext))
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ok = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.mimetype)
        cb(ok ? null : new BadRequestException("Only image files allowed"), ok)
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("File is required")
    const url = `/uploads/news/${file.filename}`
    return { url }
  }
}
