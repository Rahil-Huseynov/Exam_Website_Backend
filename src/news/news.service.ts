import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CreateNewsDto } from "./dto/create-news.dto"
import { UpdateNewsDto } from "./dto/update-news.dto"
import { NewsQueryDto } from "./dto/news-query.dto"

type Lang = "az" | "en" | "ru"

function pickLang<T>(lang: Lang, az: T, en?: T | null, ru?: T | null) {
  if (lang === "en") return (en ?? az) as T
  if (lang === "ru") return (ru ?? az) as T
  return az
}

@Injectable()
export class NewsService {
  constructor(private prisma: PrismaService) {}

  async listPublished(q: NewsQueryDto) {
    const page = q.page ?? 1
    const limit = Math.min(q.limit ?? 20, 100)
    const skip = (page - 1) * limit
    const lang: Lang = (q.lang || "az") as Lang

    const where: any = { isPublished: true }

    const [items, total] = await Promise.all([
      this.prisma.news.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          admin: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.news.count({ where }),
    ])

    const mapped = items.map((n) => ({
      id: n.id,
      title: pickLang(lang, n.titleAz, n.titleEn, n.titleRu),
      content: pickLang(lang, n.contentAz, n.contentEn, n.contentRu),
      imageUrl: n.imageUrl,
      isPublished: n.isPublished,
      publishedAt: n.publishedAt,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      admin: n.admin,
      lang,
    }))

    return {
      items: mapped,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    }
  }

  async listAllAdmin(q: NewsQueryDto) {
    const page = q.page ?? 1
    const limit = Math.min(q.limit ?? 20, 100)
    const skip = (page - 1) * limit

    const where: any = {}

    const [items, total] = await Promise.all([
      this.prisma.news.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          admin: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.news.count({ where }),
    ])

    return {
      items,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    }
  }

  async getById(id: string, lang?: Lang) {
    const item = await this.prisma.news.findUnique({
      where: { id },
      include: {
        admin: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    })
    if (!item) throw new NotFoundException("News not found")

    if (lang) {
      return {
        id: item.id,
        title: pickLang(lang, item.titleAz, item.titleEn, item.titleRu),
        content: pickLang(lang, item.contentAz, item.contentEn, item.contentRu),
        imageUrl: item.imageUrl,
        isPublished: item.isPublished,
        publishedAt: item.publishedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        admin: item.admin,
        lang,
      }
    }

    return item
  }

  async create(adminId: number | null, dto: CreateNewsDto) {
    const isPublished = !!dto.isPublished
    const publishedAt = isPublished ? new Date() : null

    return this.prisma.news.create({
      data: {
        titleAz: dto.titleAz,
        titleEn: dto.titleEn ?? null,
        titleRu: dto.titleRu ?? null,

        contentAz: dto.contentAz,
        contentEn: dto.contentEn ?? null,
        contentRu: dto.contentRu ?? null,

        imageUrl: dto.imageUrl ?? null,

        isPublished,
        publishedAt,
        adminId: adminId ?? null,
      },
    })
  }

  async update(id: string, dto: UpdateNewsDto) {
    const existing = await this.prisma.news.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException("News not found")

    let publishedAt = existing.publishedAt
    let isPublished = existing.isPublished

    if (typeof dto.isPublished === "boolean") {
      isPublished = dto.isPublished
      if (dto.isPublished && !existing.publishedAt) publishedAt = new Date()
      if (!dto.isPublished) publishedAt = null
    }

    return this.prisma.news.update({
      where: { id },
      data: {
        titleAz: dto.titleAz,
        titleEn: dto.titleEn === undefined ? undefined : dto.titleEn,
        titleRu: dto.titleRu === undefined ? undefined : dto.titleRu,

        contentAz: dto.contentAz,
        contentEn: dto.contentEn === undefined ? undefined : dto.contentEn,
        contentRu: dto.contentRu === undefined ? undefined : dto.contentRu,

        imageUrl: dto.imageUrl === undefined ? undefined : dto.imageUrl,

        isPublished,
        publishedAt,
      },
    })
  }

  async remove(id: string) {
    const existing = await this.prisma.news.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException("News not found")

    await this.prisma.news.delete({ where: { id } })
    return { ok: true }
  }

  async publishNow(id: string) {
    const existing = await this.prisma.news.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException("News not found")
    if (existing.isPublished) throw new BadRequestException("Already published")

    return this.prisma.news.update({
      where: { id },
      data: { isPublished: true, publishedAt: new Date() },
    })
  }
}
