import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CreateNewsDto } from "./dto/create-news.dto"
import { UpdateNewsDto } from "./dto/update-news.dto"
import { NewsQueryDto } from "./dto/news-query.dto"
import { EmailsService } from "src/emails/emails.service"

type Lang = "az" | "en" | "ru"

function pickLang<T>(lang: Lang, az: T, en?: T | null, ru?: T | null) {
  if (lang === "en") return (en ?? az) as T
  if (lang === "ru") return (ru ?? az) as T
  return az
}

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name)

  constructor(
    private prisma: PrismaService,
    private mailService: EmailsService,
  ) { }

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
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
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
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
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
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.news.count({ where }),
    ])

    return {
      items,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    }
  }

  async getById(id: string, lang: Lang = "az") {
    const item = await this.prisma.news.findFirst({
      where: { id, isPublished: true },
      include: {
        admin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })

    if (!item) throw new NotFoundException("News not found")

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
  async create(adminId: number | null, dto: CreateNewsDto) {
    const isPublished = !!dto.isPublished
    const publishedAt = isPublished ? new Date() : null

    const news = await this.prisma.news.create({
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

    // Yalnız published olduqda email göndər
    if (isPublished) {
      this.sendNewsToAllUsers(news).catch((err) => {
        this.logger.error("News email göndərilərkən xəta:", err)
      })
    }

    return news
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

    const updated = await this.prisma.news.update({
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

    // Draft-dan published-ə keçəndə email göndər
    if (!existing.isPublished && isPublished) {
      this.sendNewsToAllUsers(updated).catch((err) => {
        this.logger.error("News email göndərilərkən xəta:", err)
      })
    }

    return updated
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
    if (existing.isPublished) {
      throw new BadRequestException("Already published")
    }

    const updated = await this.prisma.news.update({
      where: { id },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
    })

    this.sendNewsToAllUsers(updated).catch((err) => {
      this.logger.error("Publish email xətası:", err)
    })

    return updated
  }

  /**
   * Yeni xəbəri bütün istifadəçilərə email ilə göndərir (şəkil daxil).
   * Background-da işləyir, create/update-i yavaşlatmır.
   */
  private async sendNewsToAllUsers(news: {
    id: string
    titleAz: string
    titleEn: string | null
    titleRu: string | null
    contentAz: string
    contentEn: string | null
    contentRu: string | null
    imageUrl: string | null
  }) {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    })

    if (users.length === 0) return

    const title = news.titleAz
    const content = news.contentAz
    const imageUrl = news.imageUrl

    // SMTP rate-limit üçün batch
    const batchSize = 20
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize)

      await Promise.allSettled(
        batch.map((user) =>
          this.mailService.sendNewsNotification({
            to: user.email,
            name:
              [user.firstName, user.lastName].filter(Boolean).join(" ") ||
              "İstifadəçi",
            title,
            content,
            imageUrl,
            newsId: news.id,
          }),
        ),
      )
    }

    this.logger.log(`News #${news.id} → ${users.length} istifadəçiyə göndərildi`)
  }
}