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

const norm = (s?: string) => (s || "").trim().replace(/\s+/g, " ")
const key = (s?: string) => norm(s).toLowerCase()

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

// ---------------- Images helpers ----------------
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
    body: {
      title?: string
      year?: number | string
      price?: number | string
      questionCount?: number | string
      random?: boolean
    },
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
      if (!Number.isInteger(qc) || qc < 1)
        throw new BadRequestException("questionCount is invalid")
      data.questionCount = qc
    }

    if (body.random !== undefined) {
      data.random =
        typeof body.random === "boolean"
          ? body.random
          : body.random === "true"
    }

    const updated = await this.prisma.questionBank.update({
      where: { id: bankId },
      data,
      include: {
        university: true,
        subject: true,
        _count: { select: { questions: true } },

        questions: {
          orderBy: { sort: "asc" },
          include: {
            options: true,
            images: { orderBy: { sort: "asc" } },
          },
        },
      },
    })

    return {
      id: updated.id,
      title: updated.title,
      year: updated.year,
      price: Number(updated.price),

      questionCount: updated.questionCount ?? 1,
      random: updated.random,
      questionsTotal: updated._count.questions,

      university: updated.university,
      subject: updated.subject,

      questions: updated.questions,
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
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } })
    if (!bank) throw new BadRequestException("Bank not found")

    const questions = await this.prisma.question.findMany({
      where: { bankId },
      orderBy: { sort: "asc" },
      include: {
        options: true,
        images: { orderBy: { sort: "asc" } },
      },
    })

    return {
      bankId,
      questions,
    }
  }

  async reorderQuestions(bankId: string, orderedIds: string[]) {
    if (!orderedIds?.length) {
      throw new BadRequestException("orderedIds boş ola bilməz")
    }

    const qs = await this.prisma.question.findMany({
      where: { id: { in: orderedIds } },
      select: { id: true, bankId: true },
    })

    if (qs.length !== orderedIds.length) {
      throw new BadRequestException("Bəzi suallar tapılmadı")
    }

    if (qs.some(q => q.bankId !== bankId)) {
      throw new BadRequestException("Sual başqa banka aiddir")
    }

    await this.prisma.$transaction(async tx => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.question.update({
          where: { id: orderedIds[i] },
          data: { sort: i },
        })
      }
    })

    return { ok: true }
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
  async createQuestion(
    bankId: string,
    dto: CreateQuestionDto & { imageUrls?: string[] },
  ) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } })
    if (!bank) throw new BadRequestException("Bank not found")

    const text = norm(dto.text)
    if (!text) throw new BadRequestException("Question text is required")

    const rawOpts = (dto.options || []).map(o => norm(o.text)).filter(Boolean)
    if (rawOpts.length < 2) throw new BadRequestException("Minimum 2 variant")

    const seen = new Set<string>()
    const options: string[] = []
    for (const o of rawOpts.slice(0, 5)) {
      if (!seen.has(key(o))) {
        seen.add(key(o))
        options.push(o)
      }
    }

    const correctText = dto.correctAnswerText ? norm(dto.correctAnswerText) : null
    if (correctText && !options.find(o => key(o) === key(correctText))) {
      throw new BadRequestException("Correct answer option-lar içində olmalıdır")
    }

    const last = await this.prisma.question.findFirst({
      where: { bankId },
      orderBy: { sort: "desc" },
      select: { sort: true },
    })

    const sort = (last?.sort ?? -1) + 1

    const created = await this.prisma.$transaction(async tx => {
      const q = await tx.question.create({
        data: {
          bankId,
          text,
          sort,
          correctAnswerText: correctText,
        },
      })

      let correctOptionId: string | null = null

      for (const opt of options) {
        const o = await tx.questionOption.create({
          data: { questionId: q.id, text: opt },
        })
        if (correctText && key(o.text) === key(correctText)) {
          correctOptionId = o.id
        }
      }

      if (correctOptionId) {
        await tx.question.update({
          where: { id: q.id },
          data: { correctOptionId },
        })
      }

      return tx.question.findUnique({
        where: { id: q.id },
        include: { options: true },
      })
    })

    return created
  }


  // ---------------- Update question (text/options/correct), images ayrı endpoint ilə ----------------

  async updateQuestion(questionId: string, dto: UpdateQuestionDto) {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    })
    if (!q) throw new BadRequestException("Question not found")

    const newText = dto.text !== undefined ? norm(dto.text) : undefined
    const newCorrect = dto.correctAnswerText !== undefined ? norm(dto.correctAnswerText) : undefined

    return this.prisma.$transaction(async tx => {
      if (newText) {
        await tx.question.update({
          where: { id: questionId },
          data: { text: newText },
        })
      }

      if (newCorrect !== undefined) {
        if (newCorrect) {
          const match = q.options.find(o => key(o.text) === key(newCorrect))
          if (!match) throw new BadRequestException("Correct option tapılmadı")

          await tx.question.update({
            where: { id: questionId },
            data: {
              correctAnswerText: newCorrect,
              correctOptionId: match.id,
            },
          })
        } else {
          await tx.question.update({
            where: { id: questionId },
            data: { correctAnswerText: null, correctOptionId: null },
          })
        }
      }

      return tx.question.findUnique({
        where: { id: questionId },
        include: { options: true, images: true },
      })
    })
  }

  async deleteQuestion(questionId: string) {
    await this.prisma.question.delete({ where: { id: questionId } })
    return { ok: true }
  }

  // ---------------- Import direct (supports imageUrls[]) ----------------
  async importQuestionsDirect(bankId: string, dto: ImportQuestionsDirectDto) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } })
    if (!bank) throw new BadRequestException("Bank not found")

    const qs = dto.questions || []
    if (!qs.length) throw new BadRequestException("No questions")

    const result = await this.prisma.$transaction(async (tx) => {
      const createdIds: string[] = []
      let createdCount = 0
      let skippedImagesTotal = 0

      for (const q of qs) {
        const qText = normText((q as any).text || "")
        if (!qText) continue

        const rawOptions = ((q as any).options || []).map((o: any) => o?.text ?? "")
        const cleaned = rawOptions.map(normOpt).filter(Boolean)
        if (cleaned.length < 2) continue

        const seen = new Set<string>()
        const uniqueOpts: string[] = []
        for (const t of cleaned) {
          const k = t.toLowerCase()
          if (seen.has(k)) continue
          seen.add(k)
          uniqueOpts.push(t)
        }

        const finalOpts = uniqueOpts.slice(0, 5)
        if (finalOpts.length < 2) continue

        const desiredCorrect = (q as any).correctAnswerText ? normOpt((q as any).correctAnswerText) : ""
        const correctInOptions = desiredCorrect
          ? finalOpts.find((x) => x.toLowerCase() === desiredCorrect.toLowerCase()) || null
          : null

        const rawImageUrls = (q as any).imageUrls || []
        const rawCount = Array.isArray(rawImageUrls) ? rawImageUrls.filter(Boolean).length : 0

        const normalizedImages = (Array.isArray(rawImageUrls) ? rawImageUrls : [])
          .map((u: any) => normalizeAndPersistImageUrl(String(u || "")))
          .filter((x: any): x is string => !!x)

        skippedImagesTotal += Math.max(0, rawCount - normalizedImages.length)
        const question = await tx.question.create({
          data: {
            bankId,
            text: qText,
            correctAnswerText: correctInOptions,
            correctOptionId: null,
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
        })

        await tx.questionOption.createMany({
          data: finalOpts.map((text) => ({ questionId: question.id, text })),
          skipDuplicates: true,
        })

        if (correctInOptions) {
          const opts = await tx.questionOption.findMany({
            where: { questionId: question.id },
            select: { id: true, text: true },
          })

          const match = opts.find((o) => o.text.trim().toLowerCase() === correctInOptions.trim().toLowerCase())

          if (match) {
            await tx.question.update({
              where: { id: question.id },
              data: {
                correctOptionId: match.id,
                correctAnswerText: match.text,
              },
            })
          } else {
            await tx.question.update({
              where: { id: question.id },
              data: { correctOptionId: null },
            })
          }
        }

        createdCount++
        createdIds.push(question.id)
      }

      return { createdCount, createdIds, skippedImagesTotal }
    })

    return { ok: true, ...result }
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

  async getExamQuestions(examId: string) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: examId } })
    if (!bank) throw new BadRequestException("Exam not found")

    const take = bank.questionCount ?? 25

    let questions = await this.prisma.question.findMany({
      where: {
        bankId: examId,
        correctOptionId: { not: null },
      },
      include: {
        options: true,
        images: { orderBy: { sort: "asc" } },
      },
      orderBy: { sort: "asc" },
    })

    if (bank.random) {
      questions = shuffle(questions)
    }

    questions = questions.slice(0, take)

    return questions.map(q => ({
      id: q.id,
      text: q.text,
      images: q.images,
      options: bank.random ? shuffle(q.options) : q.options,
    }))
  }
}
