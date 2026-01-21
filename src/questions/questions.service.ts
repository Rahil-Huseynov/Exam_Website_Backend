import { Injectable, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { Prisma } from "@prisma/client"
import { CreateExamDto } from "./dto/create-exam.dto"
import { ImportQuestionsDirectDto } from "./dto/import-direct.dto"
import { UpdateQuestionDto } from "./dto/update-question.dto"
import { CreateQuestionDto } from "./dto/create-question.dto"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function toTrimmedString(v: unknown) {
  return typeof v === "string" ? v.trim() : ""
}
function normText(s: string) {
  return (s || "").trim().replace(/\s+/g, " ")
}
function normKey(s: string) {
  return normText(s).toLowerCase()
}
function tryDeletePublicUpload(publicPath?: string | null) {
  try {
    if (!publicPath) return
    if (!publicPath.startsWith("/uploads/")) return
    const abs = path.join(process.cwd(), publicPath.replace(/^\//, ""))
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
  } catch { }
}
function normOpt(s: string) {
  const t = normText(s)
  return t.replace(/^[A-Ea-e]\s*[\)\.\:\-]\s*/g, "").trim()
}
function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}
function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex")
}
function isLikelyDataUrl(s: string) {
  return /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/i.test(s || "")
}
function isBlobUrl(s: string) {
  return /^blob:/i.test(s || "")
}
function isPublicUploadsPath(s: string) {
  return typeof s === "string" && s.startsWith("/uploads/")
}
function dataUrlToBuffer(dataUrl: string) {
  const m = String(dataUrl).match(/^data:(image\/[a-z0-9\+\-\.]+);base64,(.+)$/i)
  if (!m) return null
  const mime = m[1]
  const b64 = m[2]
  const buf = Buffer.from(b64, "base64")
  return { mime, buf }
}
function extFromMime(mime: string) {
  const m = (mime || "").toLowerCase()
  if (m === "image/png") return ".png"
  if (m === "image/jpeg" || m === "image/jpg") return ".jpg"
  if (m === "image/webp") return ".webp"
  if (m === "image/svg+xml") return ".svg"
  return ""
}
function normalizeAndPersistImageUrl(raw: string) {
  const u = String(raw || "").trim()
  if (!u) return null
  if (isBlobUrl(u)) return null
  if (isPublicUploadsPath(u)) return u
  if (isLikelyDataUrl(u)) {
    const parsed = dataUrlToBuffer(u)
    if (!parsed) return null
    const { mime, buf } = parsed
    const ext = extFromMime(mime)
    if (!ext) return null
    const max = 8 * 1024 * 1024
    if (buf.length > max) return null
    const dir = path.join(process.cwd(), "uploads", "question")
    ensureDir(dir)
    const rnd = Math.random().toString(16).slice(2)
    const filename = `${Date.now()}-${rnd}${ext}`
    const abs = path.join(dir, filename)
    fs.writeFileSync(abs, buf)
    return `/uploads/question/${filename}`
  }
  return null
}
@Injectable()
export class QuestionsService {
  constructor(private prisma: PrismaService) { }
  // ---------------- Universities ----------------
  async listUniversities() {
    return this.prisma.university.findMany({ orderBy: { createdAt: "desc" } })
  }
  async createUniversity(data: { name: string; nameAz?: string; nameEn?: string; nameRu?: string; logo?: string | null }) {
    const name = toTrimmedString(data.name)
    if (!name) throw new BadRequestException("University name is required")
    return this.prisma.university.create({
      data: {
        name,
        nameAz: data.nameAz?.trim(),
        nameEn: data.nameEn?.trim(),
        nameRu: data.nameRu?.trim(),
        logo: data.logo?.trim() || null,
      },
    })
  }
  async setUniversityLogo(universityId: string, logoPublicPath: string) {
    const existing = await this.prisma.university.findUnique({ where: { id: universityId } })
    if (!existing) throw new BadRequestException("University not found")
    tryDeletePublicUpload(existing.logo)
    return this.prisma.university.update({
      where: { id: universityId },
      data: { logo: (logoPublicPath || "").trim() || null },
    })
  }
  async updateUniversity(
    universityId: string,
    body: { name?: string; nameAz?: string; nameEn?: string; nameRu?: string; logo?: string | null },
  ) {
    const existing = await this.prisma.university.findUnique({ where: { id: universityId } })
    if (!existing) throw new BadRequestException("University not found")
    if (body.name !== undefined) {
      const nm = (body.name || "").trim()
      if (!nm) throw new BadRequestException("University name is required")
    }
    if (body.logo !== undefined && body.logo !== existing.logo) {
      tryDeletePublicUpload(existing.logo)
    }
    return this.prisma.university.update({
      where: { id: universityId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.nameAz !== undefined ? { nameAz: body.nameAz?.trim() || null } : {}),
        ...(body.nameEn !== undefined ? { nameEn: body.nameEn?.trim() || null } : {}),
        ...(body.nameRu !== undefined ? { nameRu: body.nameRu?.trim() || null } : {}),
        ...(body.logo !== undefined ? { logo: body.logo?.trim() || null } : {}),
      },
    })
  }
  async deleteUniversity(universityId: string) {
    const existing = await this.prisma.university.findUnique({ where: { id: universityId } })
    if (!existing) throw new BadRequestException("University not found")
    tryDeletePublicUpload(existing.logo)
    await this.prisma.university.delete({ where: { id: universityId } })
    return { ok: true }
  }
  // ---------------- Subjects ----------------
  async listSubjects() {
    return this.prisma.subject.findMany({ orderBy: { createdAt: "desc" } })
  }
  async createSubject(data: { name: string; nameAz?: string; nameEn?: string; nameRu?: string }) {
    const name = toTrimmedString(data.name)
    if (!name) throw new BadRequestException("Subject name is required")
    return this.prisma.subject.create({
      data: {
        name,
        nameAz: data.nameAz?.trim(),
        nameEn: data.nameEn?.trim(),
        nameRu: data.nameRu?.trim(),
      },
    })
  }
  async updateSubject(subjectId: string, body: { name?: string; nameAz?: string; nameEn?: string; nameRu?: string }) {
    const existing = await this.prisma.subject.findUnique({ where: { id: subjectId } })
    if (!existing) throw new BadRequestException("Subject not found")
    if (body.name !== undefined) {
      const nm = (body.name || "").trim()
      if (!nm) throw new BadRequestException("Subject name is required")
    }
    return this.prisma.subject.update({
      where: { id: subjectId },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.nameAz !== undefined ? { nameAz: body.nameAz?.trim() || null } : {}),
        ...(body.nameEn !== undefined ? { nameEn: body.nameEn?.trim() || null } : {}),
        ...(body.nameRu !== undefined ? { nameRu: body.nameRu?.trim() || null } : {}),
      },
    })
  }
  async deleteSubject(subjectId: string) {
    const existing = await this.prisma.subject.findUnique({ where: { id: subjectId } })
    if (!existing) throw new BadRequestException("Subject not found")
    await this.prisma.subject.delete({ where: { id: subjectId } })
    return { ok: true }
  }
  // ---------------- Exam creation helper ----------------
  private async ensureAnyTopicForUniversity(universityId: string) {
    let anyTopic = await this.prisma.topic.findFirst()
    if (anyTopic) return anyTopic
    const uni = await this.prisma.university.findUnique({ where: { id: universityId } })
    if (!uni) throw new BadRequestException("University not found")
    const faculty = await this.prisma.faculty.create({ data: { name: "Default Faculty", universityId } })
    const course = await this.prisma.course.create({ data: { title: "Default Course", facultyId: faculty.id } })
    anyTopic = await this.prisma.topic.create({ data: { title: "Default Topic", courseId: course.id } })
    return anyTopic
  }
  // ---------------- Exams/Banks ----------------
  async createExam(dto: CreateExamDto) {
    const title = toTrimmedString(dto.title)
    if (!title) throw new BadRequestException("Title is required")
    const year = Number(dto.year)
    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      throw new BadRequestException("Year is invalid")
    }
    const priceNumber = Number(dto.price)
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      throw new BadRequestException("Price is invalid")
    }
    const questionCount =
      dto.questionCount !== undefined ? Number(dto.questionCount) : undefined
    if (questionCount !== undefined) {
      if (!Number.isInteger(questionCount) || questionCount < 1) {
        throw new BadRequestException("questionCount is invalid")
      }
    }
    const uni = await this.prisma.university.findUnique({
      where: { id: dto.universityId },
    })
    if (!uni) throw new BadRequestException("University not found")
    const subj = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
    })
    if (!subj) throw new BadRequestException("Subject not found")
    const anyTopic = await this.ensureAnyTopicForUniversity(dto.universityId)
    const created = await this.prisma.questionBank.create({
      data: {
        name: title,
        title,
        year,
        price: new Prisma.Decimal(priceNumber),
        durationMinutes: dto.durationMinutes,
        random: dto.random ?? true,
        questionCount: questionCount ?? 25,
        universityId: dto.universityId,
        subjectId: dto.subjectId,
        topicId: anyTopic.id,
      },
      include: {
        university: true,
        subject: true,
        _count: { select: { questions: true } },
      },
    })
    return {
      id: created.id,
      title: created.title,
      year: created.year,
      price: Number(created.price),
      durationMinutes: created.durationMinutes,
      random: created.random,
      questionCount: created.questionCount,
      questionsTotal: created._count.questions,
      university: created.university,
      subject: created.subject,
    }
  }
  async getExams(filter: { universityId?: string; subjectId?: string; year?: number; search?: string; page?: number; limit?: number }) {
    const page = filter.page ?? 1
    const limit = filter.limit ?? 10
    const skip = (page - 1) * limit
    const where: Prisma.QuestionBankWhereInput = {
      ...(filter.universityId ? { universityId: filter.universityId } : {}),
      ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
      ...(filter.year ? { year: filter.year } : {}),
      ...(filter.search ? {
        OR: [
          { title: { contains: filter.search, mode: "insensitive" } },
          { university: { name: { contains: filter.search, mode: "insensitive" } } },
          { subject: { name: { contains: filter.search, mode: "insensitive" } } },
        ],
      } : {}),
    }
    const rows = await this.prisma.questionBank.findMany({
      where,
      skip,
      take: limit,
      include: {
        university: true,
        subject: true,
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    return rows.map((b) => ({
      id: b.id,
      title: b.title,
      year: b.year,
      price: Number(b.price),
      durationMinutes: b.durationMinutes,
      questionCount: b.questionCount ?? 1,
      random: b.random,
      questionsTotal: b._count.questions,
      totalQuestions: b._count.questions,
      university: b.university,
      subject: b.subject,
    }))
  }
  async updateBank(
    bankId: string,
    body: { title?: string; year?: number | string; price?: number | string; questionCount?: number | string; random?: boolean; durationMinutes?: number },
  ) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } })
    if (!bank) throw new BadRequestException("Exam/Bank not found")
    const data: any = {}
    if (body.title !== undefined) {
      const title = String(body.title || "").trim()
      if (!title) throw new BadRequestException("Title is required")
      data.title = title
      data.name = title
    }
    if (body.year !== undefined) {
      const year = Number(body.year)
      if (!Number.isInteger(year) || year < 1900 || year > 3000) {
        throw new BadRequestException("Year is invalid")
      }
      data.year = year
    }
    if (body.price !== undefined) {
      const priceNumber = Number(body.price)
      if (!Number.isFinite(priceNumber) || priceNumber < 0) {
        throw new BadRequestException("Price is invalid")
      }
      data.price = new Prisma.Decimal(priceNumber)
    }
    if (body.questionCount !== undefined) {
      const qc = Number(body.questionCount)
      if (!Number.isInteger(qc) || qc < 1) throw new BadRequestException("questionCount is invalid")
      data.questionCount = qc
    }
    if (body.durationMinutes !== undefined) {
      const durationMinutes = Number(body.durationMinutes)
      if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
        throw new BadRequestException("durationMinutes is invalid")
      }
      data.durationMinutes = durationMinutes
    }
    if (body.random !== undefined) {
      data.random = Boolean(body.random)
    }
    const updated = await this.prisma.questionBank.update({
      where: { id: bankId },
      data,
      include: {
        university: true,
        subject: true,
        _count: { select: { questions: true } },
      },
    })
    return {
      id: updated.id,
      title: updated.title,
      year: updated.year,
      price: Number(updated.price),
      durationMinutes: Number(updated.durationMinutes),
      questionCount: updated.questionCount ?? 1,
      random: updated.random,
      questionsTotal: updated._count.questions,
      university: updated.university,
      subject: updated.subject,
    }
  }
  async deleteBank(bankId: string) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } })
    if (!bank) throw new BadRequestException("Exam/Bank not found")
    await this.prisma.questionBank.delete({ where: { id: bankId } })
    return { ok: true }
  }
  // ---------------- Questions listing with images ----------------
  async listBankQuestions(bankId: string) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } });
    if (!bank) throw new BadRequestException('Exam/Bank not found');
    const qs = await this.prisma.question.findMany({
      where: { bankId },
      include: {
        options: {
          include: {
            images: { orderBy: { sort: 'asc' } },
          },
        },
        images: { orderBy: { sort: 'asc' } },
      },
      orderBy: { sort: 'asc' },
    });
    return {
      bankId,
      questions: qs.map((q) => ({
        id: q.id,
        text: q.text,
        correctAnswerText: q.correctAnswerText,
        correctOptionId: q.correctOptionId,
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          images: o.images.map((im) => ({ id: im.id, url: im.url, sort: im.sort })),
        })),
        images: q.images.map((im) => ({ id: im.id, url: im.url, sort: im.sort })),
      })),
    };
  }
  // ---------------- Multi-image actions ----------------
  async addQuestionImages(questionId: string, imageUrls: string[]) {
    const q = await this.prisma.question.findUnique({ where: { id: questionId } })
    if (!q) throw new BadRequestException("Question not found")
    const normalized = (imageUrls || [])
      .map((u) => normalizeAndPersistImageUrl(u))
      .filter((x): x is string => !!x)
    if (!normalized.length) throw new BadRequestException("No valid image urls")
    const last = await this.prisma.questionImage.findFirst({
      where: { questionId },
      orderBy: { sort: "desc" },
      select: { sort: true },
    })
    const start = (last?.sort ?? -1) + 1
    await this.prisma.questionImage.createMany({
      data: normalized.map((url, i) => ({
        questionId,
        url,
        urlHash: sha256Hex(url),
        sort: start + i,
      })),
      skipDuplicates: true,
    })
    const images = await this.prisma.questionImage.findMany({
      where: { questionId },
      orderBy: { sort: "asc" },
    })
    return { ok: true, questionId, images }
  }
  async deleteQuestionImage(imageId: string) {
    const img = await this.prisma.questionImage.findUnique({ where: { id: imageId } })
    if (!img) throw new BadRequestException("QuestionImage not found")
    tryDeletePublicUpload(img.url)
    await this.prisma.questionImage.delete({ where: { id: imageId } })
    return { ok: true }
  }
  // ---------------- Create question (supports imageUrls[]) ----------------
  async createQuestion(bankId: string, dto: CreateQuestionDto & { imageUrls?: string[] }) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } })
    if (!bank) throw new BadRequestException("Exam/Bank not found")
    const qText = normText(dto.text)
    if (!qText) throw new BadRequestException("Question text is required")
    const rawOptions = (dto.options || []).map((o) => normText(o.text)).filter(Boolean)
    if (rawOptions.length < 2) throw new BadRequestException("Minimum 2 variant olmalıdır.")
    const seen = new Set<string>()
    const options: string[] = []
    for (const ot of rawOptions.slice(0, 5)) {
      const k = normKey(ot)
      if (seen.has(k)) continue
      seen.add(k)
      options.push(ot)
    }
    if (options.length < 2) throw new BadRequestException("Minimum 2 unikal variant olmalıdır.")
    let correctInOptions: string | null = null
    const desiredCorrect = dto.correctAnswerText ? normText(dto.correctAnswerText) : ""
    if (desiredCorrect) {
      const found = options.find((ot) => normKey(ot) === normKey(desiredCorrect))
      if (!found) throw new BadRequestException("Doğru cavab mətni variantların içində olmalıdır.")
      correctInOptions = found
    }
    const imageUrlsRaw = (dto.imageUrls || []).map((u) => String(u || "").trim()).filter(Boolean)
    const imageUrls = imageUrlsRaw
      .map((u) => normalizeAndPersistImageUrl(u))
      .filter((x): x is string => !!x)
    const created = await this.prisma.$transaction(async (tx) => {
      const maxSortRow = await tx.question.findFirst({
        where: { bankId },
        orderBy: { sort: "desc" },
        select: { sort: true },
      })
      const nextSort = (maxSortRow?.sort ?? 0) + 1
      const question = await tx.question.create({
        data: {
          bankId,
          text: qText,
          correctAnswerText: correctInOptions,
          correctOptionId: null,
          sort: nextSort,
          images: imageUrls.length
            ? { create: imageUrls.map((url, i) => ({ url, urlHash: sha256Hex(url), sort: i })) }
            : undefined,
        },
        include: { options: true, images: true },
      })
      let correctOptionId: string | null = null
      for (const ot of options) {
        const createdOpt = await tx.questionOption.create({
          data: { questionId: question.id, text: ot },
        })
        if (correctInOptions && normKey(createdOpt.text) === normKey(correctInOptions)) {
          correctOptionId = createdOpt.id
        }
      }
      if (correctOptionId) {
        await tx.question.update({
          where: { id: question.id },
          data: { correctOptionId },
        })
      }
      const full = await tx.question.findUnique({
        where: { id: question.id },
        include: { options: true, images: { orderBy: { sort: "asc" } } },
      })
      return full!
    })
    return {
      id: created.id,
      text: created.text,
      correctAnswerText: created.correctAnswerText,
      correctOptionId: created.correctOptionId,
      options: created.options.map((o) => ({ id: o.id, text: o.text })),
      images: created.images.map((im) => ({ id: im.id, url: im.url, sort: im.sort })),
    }
  }
  // ---------------- Update question (text/options/correct), images ayrı endpoint ilə ----------------
  async updateQuestion(
    questionId: string,
    dto: UpdateQuestionDto & { sort?: number | string },
  ) {
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        options: { include: { images: true } },
        images: true,
      },
    });
    if (!existing) {
      throw new BadRequestException("Question not found");
    }
    const newText = dto.text !== undefined ? normText(dto.text) : undefined;
    const optionsProvided = Array.isArray(dto.options);
    const newCorrectText = dto.correctAnswerText !== undefined ? normText(dto.correctAnswerText) : undefined;
    const newSort = dto.sort !== undefined ? Number(dto.sort) : undefined;
    const shouldReplaceImages = "imageUrls" in dto;
    if (newSort !== undefined && (!Number.isInteger(newSort) || newSort < 0)) {
      throw new BadRequestException("Sort must be a non-negative integer");
    }
    if (newText !== undefined && !newText) {
      throw new BadRequestException("Question text cannot be empty");
    }
    const updatedQuestion = await this.prisma.$transaction(async (tx) => {
      if (newText !== undefined) {
        await tx.question.update({
          where: { id: questionId },
          data: { text: newText },
        });
      }
      if (newSort !== undefined) {
        await tx.question.update({
          where: { id: questionId },
          data: { sort: newSort },
        });
      }
      if (shouldReplaceImages) {
        const newRawUrls = (dto.imageUrls || []).map(u => String(u).trim()).filter(Boolean)
        const newUrlsSet = new Set(newRawUrls)
        const existingImages = await tx.questionImage.findMany({
          where: { questionId },
        });
        existingImages.forEach((im) => {
          if (!newUrlsSet.has(im.url)) {
            tryDeletePublicUpload(im.url);
          }
        });
        await tx.questionImage.deleteMany({
          where: { questionId },
        });
        const normalized = newRawUrls
          .map(normalizeAndPersistImageUrl)
          .filter((x): x is string => !!x);
        if (normalized.length > 0) {
          await tx.questionImage.createMany({
            data: normalized.map((url, i) => ({
              questionId,
              url,
              urlHash: sha256Hex(url),
              sort: i,
            })),
          });
        }
      }
      let newCorrectOptionId: string | null = null;
      if (optionsProvided) {
        const dtoOptions = dto.options || [];
        if (dtoOptions.length < 2) {
          throw new BadRequestException("Minimum 2 variant olmalıdır.");
        }
        const seen = new Set<string>();
        const finalOpts: { text: string; imageUrls: string[] }[] = [];
        const allNewOptImageUrls = new Set<string>()
        for (const o of dtoOptions) {
          const text = normText(o.text);
          if (!text) continue;
          const key = normKey(text);
          if (seen.has(key)) continue;
          seen.add(key);
          const imageUrls = (o.imageUrls || [])
            .map(u => String(u).trim())
            .filter(Boolean);
          imageUrls.forEach(u => allNewOptImageUrls.add(u))
          const normalizedOptImages = imageUrls
            .map(normalizeAndPersistImageUrl)
            .filter((x): x is string => !!x);
          finalOpts.push({ text, imageUrls: normalizedOptImages });
        }
        if (finalOpts.length < 2) {
          throw new BadRequestException("Minimum 2 unikal variant olmalıdır.");
        }
        const existingOptions = await tx.questionOption.findMany({
          where: { questionId },
          include: { images: true },
        });
        for (const opt of existingOptions) {
          for (const im of opt.images) {
            if (!allNewOptImageUrls.has(im.url)) {
              tryDeletePublicUpload(im.url);
            }
          }
        }
        await tx.questionOptionImage.deleteMany({
          where: { questionOption: { questionId } },
        });
        await tx.questionOption.deleteMany({
          where: { questionId },
        });
        for (const opt of finalOpts) {
          const createdOpt = await tx.questionOption.create({
            data: {
              questionId,
              text: opt.text,
              images: opt.imageUrls.length
                ? {
                  create: opt.imageUrls.map((url, i) => ({
                    url,
                    urlHash: sha256Hex(url),
                    sort: i,
                  })),
                }
                : undefined,
            },
          });
          if (newCorrectText && normKey(createdOpt.text) === normKey(newCorrectText)) {
            newCorrectOptionId = createdOpt.id;
          }
        }
        if (newCorrectText && !newCorrectOptionId) {
          throw new BadRequestException("correctAnswerText variantların içində olmalıdır.");
        }
      }
      else if (newCorrectText !== undefined) {
        if (newCorrectText) {
          const match = existing.options.find(
            (o) => normKey(o.text) === normKey(newCorrectText),
          );
          if (!match) {
            throw new BadRequestException(
              "correctAnswerText mövcud variantların içində olmalıdır.",
            );
          }
          newCorrectOptionId = match.id;
        } else {
          newCorrectOptionId = null;
        }
      } else {
        newCorrectOptionId = existing.correctOptionId;
      }
      await tx.question.update({
        where: { id: questionId },
        data: {
          correctAnswerText: newCorrectText !== undefined ? (newCorrectText || null) : existing.correctAnswerText,
          correctOptionId: newCorrectOptionId,
        },
      });
      const refreshed = await tx.question.findUnique({
        where: { id: questionId },
        include: {
          options: {
            include: {
              images: { orderBy: { sort: "asc" } },
            },
          },
          images: { orderBy: { sort: "asc" } },
        },
      });
      if (!refreshed) {
        throw new Error("Question disappeared during transaction – this should never happen");
      }
      return refreshed;
    });
    return {
      id: updatedQuestion.id,
      text: updatedQuestion.text,
      correctAnswerText: updatedQuestion.correctAnswerText,
      correctOptionId: updatedQuestion.correctOptionId,
      sort: updatedQuestion.sort,
      options: updatedQuestion.options.map((o) => ({
        id: o.id,
        text: o.text,
        images: o.images.map((im) => ({
          id: im.id,
          url: im.url,
          sort: im.sort,
        })),
      })),
      images: updatedQuestion.images.map((im) => ({
        id: im.id,
        url: im.url,
        sort: im.sort,
      })),
    };
  }
  async deleteQuestion(questionId: string) {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { images: true, options: { include: { images: true } } },
    })
    if (!q) throw new BadRequestException("Question not found")
    for (const im of q.images) tryDeletePublicUpload(im.url)
    for (const opt of q.options) {
      for (const im of opt.images) tryDeletePublicUpload(im.url)
    }
    await this.prisma.question.delete({ where: { id: questionId } })
    return { ok: true }
  }
  // ---------------- Import direct (supports imageUrls[]) ----------------
  async importQuestionsDirect(bankId: string, dto: ImportQuestionsDirectDto) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } });
    if (!bank) {
      throw new BadRequestException("Bank not found");
    }
    const questionsInput = dto.questions ?? [];
    if (!Array.isArray(questionsInput) || questionsInput.length === 0) {
      throw new BadRequestException("Ən azı bir sual göndərilməlidir (questions array-i boşdur)");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const createdIds: string[] = [];
      let createdCount = 0;
      let skippedCount = 0;
      let skippedImagesTotal = 0;
      const maxSortRow = await tx.question.findFirst({
        where: { bankId },
        orderBy: { sort: "desc" },
        select: { sort: true },
      });
      let currentSort = (maxSortRow?.sort ?? 0) + 1;
      for (const q of questionsInput) {
        const qText = normText(q.text ?? "");
        if (!qText) {
          skippedCount++;
          continue;
        }
        const inputOptions = Array.isArray(q.options) ? q.options : [];
        if (inputOptions.length < 2) {
          skippedCount++;
          continue;
        }
        const seen = new Set<string>();
        const finalOpts: { text: string; imageUrls: string[] }[] = [];
        for (const opt of inputOptions) {
          const optText = normText(opt.text ?? "");
          if (!optText) continue;
          const key = normKey(optText);
          if (seen.has(key)) continue;
          seen.add(key);
          const optImageUrls = Array.isArray(opt.imageUrls) ? opt.imageUrls : [];
          const normalizedOptImages = optImageUrls
            .map((u) => normalizeAndPersistImageUrl(String(u ?? "")))
            .filter((x): x is string => !!x);
          skippedImagesTotal += optImageUrls.length - normalizedOptImages.length;
          finalOpts.push({
            text: optText,
            imageUrls: normalizedOptImages,
          });
        }
        if (finalOpts.length < 2) {
          skippedCount++;
          continue;
        }
        const desiredCorrect = q.correctAnswerText ? normText(q.correctAnswerText) : "";
        let correctInOptions: string | null = null;
        if (desiredCorrect) {
          const found = finalOpts.find((opt) => normKey(opt.text) === normKey(desiredCorrect));
          if (found) {
            correctInOptions = found.text;
          }
        }
        const rawImageUrls = Array.isArray(q.imageUrls) ? q.imageUrls : [];
        const normalizedImages = rawImageUrls
          .map((u) => normalizeAndPersistImageUrl(String(u ?? "")))
          .filter((x): x is string => !!x);
        skippedImagesTotal += rawImageUrls.length - normalizedImages.length;
        const question = await tx.question.create({
          data: {
            bankId,
            text: qText,
            correctAnswerText: correctInOptions,
            correctOptionId: null,
            sort: currentSort++,
            images: normalizedImages.length
              ? {
                create: normalizedImages.map((url, i) => ({
                  url,
                  urlHash: sha256Hex(url),
                  sort: i,
                })),
              }
              : undefined,
          },
        });
        let correctOptionId: string | null = null;
        for (const opt of finalOpts) {
          const createdOpt = await tx.questionOption.create({
            data: {
              questionId: question.id,
              text: opt.text,
              images: opt.imageUrls.length
                ? {
                  create: opt.imageUrls.map((url, i) => ({
                    url,
                    urlHash: sha256Hex(url),
                    sort: i,
                  })),
                }
                : undefined,
            },
          });
          if (correctInOptions && normKey(createdOpt.text) === normKey(correctInOptions)) {
            correctOptionId = createdOpt.id;
          }
        }
        if (correctOptionId) {
          await tx.question.update({
            where: { id: question.id },
            data: { correctOptionId },
          });
        }
        createdCount++;
        createdIds.push(question.id);
      }
      return {
        createdCount,
        createdIds,
        skippedCount,
        skippedImagesTotal,
      };
    });
    return {
      ok: true,
      message: `${result.createdCount} sual uğurla əlavə olundu, ${result.skippedCount} sual keçildi`,
      ...result,
    };
  }
  // ---------------- Years ----------------
  async listExamYears(filter: { universityId?: string; subjectId?: string }) {
    const rows = await this.prisma.questionBank.findMany({
      where: {
        ...(filter.universityId ? { universityId: filter.universityId } : {}),
        ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
      },
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    })
    return { years: rows.map((r) => r.year).filter((y) => typeof y === "number") }
  }
  async getAttemptQuestions(attemptId: string, userId: number) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } })
    if (!attempt) throw new BadRequestException("Attempt not found")
    if (attempt.userId !== userId) throw new BadRequestException("Attempt does not belong to user")
    const bank = await this.prisma.questionBank.findUnique({
      where: { id: attempt.bankId },
      select: { questionCount: true, random: true },
    })
    const total = bank?.questionCount || 1
    const existing = await this.prisma.attemptQuestion.findMany({
      where: { attemptId },
      orderBy: { order: "asc" },
      include: {
        question: {
          select: {
            id: true,
            text: true,
            images: { select: { url: true, sort: true } },
            options: { select: { id: true, text: true } },
            correctOptionId: true,
            correctAnswerText: true,
          },
        },
      },
    })
    let questions: any[] = []
    if (existing.length === 0) {
      let allQuestions: any[] = []
      if (!bank?.random) {
        allQuestions = await this.prisma.question.findMany({
          where: { bankId: attempt.bankId, correctOptionId: { not: null } },
          orderBy: { sort: "asc" },
          include: {
            options: true,
            images: { orderBy: { sort: "asc" } },
          },
          take: total,
        })
      } else {
        const all = await this.prisma.question.findMany({
          where: { bankId: attempt.bankId, correctOptionId: { not: null } },
          include: {
            options: true,
            images: { orderBy: { sort: "asc" } },
          },
        })
        allQuestions = shuffle(all).slice(0, total)
      }
      const picked = allQuestions
      await this.prisma.attemptQuestion.createMany({
        data: picked.map((q, idx) => ({
          attemptId,
          questionId: q.id,
          order: idx + 1,
        })),
        skipDuplicates: true,
      })
      questions = picked
    } else {
      questions = existing.map((x) => x.question).slice(0, total)
    }
    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: { questionId: true, selectedOptionId: true },
    })
    const answeredMap = new Map(answers.map((a) => [a.questionId, a]))
    return questions.map((q) => {
      const opts = shuffle(q.options as { id: string; text: string }[])
      return {
        id: q.id,
        text: q.text,
        images: q.images,
        options: opts.map((o) => ({ id: o.id, text: o.text })),
        answered: answeredMap.has(q.id),
        selectedOptionId: answeredMap.get(q.id)?.selectedOptionId ?? null,
      }
    })
  }
}