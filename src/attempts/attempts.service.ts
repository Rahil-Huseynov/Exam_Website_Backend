import { Injectable, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { Prisma } from "@prisma/client"
import { randomBytes } from "crypto"

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function asDec(v: Prisma.Decimal | string | number) {
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(String(v))
}

function round2(d: Prisma.Decimal) {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

function norm(s?: string | null) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

@Injectable()
export class AttemptsService {
  constructor(private prisma: PrismaService) { }

  private genToken() {
    return randomBytes(32).toString("hex")
  }

  async userAttempts(userId: number, status?: "FINISHED" | "IN_PROGRESS") {
    const where: any = { userId }

    if (status === "FINISHED") {
      where.status = "FINISHED"
      where.finishedAt = { not: null }
    }

    if (status === "IN_PROGRESS") {
      where.status = "IN_PROGRESS"
    }

    const rows = await this.prisma.attempt.findMany({
      where,
      orderBy: { startedAt: "desc" },
      include: {
        bank: {
          include: {
            university: true,
            subject: true,
            topic: { include: { course: true } },
          },
        },
      },
    })

    return rows.map((a) => ({
      id: a.id,
      status: a.status,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      score: a.score,
      total: a.total,
      bank: a.bank,
    }))
  }
  async createOneTimeExamToken(bankId: string, userId: number, ttlMinutes = 10) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } })
    if (!bank) throw new BadRequestException("Bank not found")

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new BadRequestException("User not found")

    const token = this.genToken()
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)

    await this.prisma.examToken.create({
      data: {
        token,
        bankId,
        userId,
        expiresAt,
      },
    })

    return { token, expiresAt }
  }
  async revokeToken(bankId: string, userId: number, token: string) {
    const now = new Date()
    const res = await this.prisma.examToken.updateMany({
      where: { bankId, userId, token, usedAt: null },
      data: { usedAt: now },
    })
    return res.count
  }

  async deleteToken(bankId: string, userId: number, token: string) {
    const res = await this.prisma.examToken.deleteMany({
      where: { bankId, userId, token, usedAt: null },
    })
    return res.count
  }

  async createAttemptWithToken(bankId: string, userId: number, token: string) {
    const now = new Date()

    return this.prisma.$transaction(async (tx) => {
      const bank = await tx.questionBank.findUnique({ where: { id: bankId } })
      if (!bank) throw new BadRequestException("Bank not found")

      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) throw new BadRequestException("User not found")

      const existingAttempt = await tx.attempt.findFirst({
        where: { userId, bankId, status: "IN_PROGRESS" },
        orderBy: { startedAt: "desc" },
      })
      if (existingAttempt) {
        return { attempt: existingAttempt, remainingBalance: user.balance.toString() }
      }

      const tokenRow = await tx.examToken.findUnique({ where: { token } })
      if (!tokenRow) throw new BadRequestException("Token not found")
      if (tokenRow.bankId !== bankId || tokenRow.userId !== userId) throw new BadRequestException("Token mismatch")
      if (tokenRow.usedAt) throw new BadRequestException("Token already used")
      if (tokenRow.expiresAt.getTime() < now.getTime()) throw new BadRequestException("Token expired")
      if (tokenRow.attemptId) throw new BadRequestException("Token already used")

      const price = asDec(bank.price)
      const bal = asDec(user.balance)
      if (bal.lessThan(price)) throw new BadRequestException("Insufficient balance")

      const newBal = round2(bal.minus(price))

      const attempt = await tx.attempt.create({
        data: {
          userId,
          bankId,
          status: "IN_PROGRESS",
          startedAt: now,
        },
      })

      await tx.examToken.update({
        where: { id: tokenRow.id },
        data: {
          usedAt: now,
          attemptId: attempt.id,
        },
      })

      await tx.user.update({
        where: { id: userId },
        data: { balance: newBal },
      })

      return { attempt, remainingBalance: newBal.toString() }
    })
  }
  async getAttemptQuestions(attemptId: string, userId: number) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
    })
    if (!attempt) throw new BadRequestException("Attempt not found")
    if (attempt.userId !== userId) throw new BadRequestException("Attempt does not belong to user")

    const questions = await this.prisma.question.findMany({
      where: { bankId: attempt.bankId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        text: true,
        imageUrl: true,
        options: { select: { id: true, text: true } },
      },
    })

    if (!questions.length) throw new BadRequestException("No questions found for this exam")

    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: { questionId: true, selectedOptionId: true, isCorrect: true },
    })

    const answeredMap = new Map(answers.map((a) => [a.questionId, a]))

    return questions.map((q) => ({
      ...q,
      answered: answeredMap.has(q.id),
      selectedOptionId: answeredMap.get(q.id)?.selectedOptionId ?? null,
    }))
  }
  async answer(attemptId: string, questionId: string, selectedOptionId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } })
    if (!attempt) throw new BadRequestException("Attempt not found")
    if (attempt.status !== "IN_PROGRESS") throw new BadRequestException("Attempt is not in progress")

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        bankId: true,
        correctOptionId: true,
        correctAnswerText: true,
      },
    })
    if (!question) throw new BadRequestException("Question not found")
    if (question.bankId !== attempt.bankId) throw new BadRequestException("Question does not belong to this exam")

    const option = await this.prisma.questionOption.findUnique({
      where: { id: selectedOptionId },
      select: { id: true, questionId: true, text: true },
    })
    if (!option) throw new BadRequestException("Option not found")
    if (option.questionId !== questionId) throw new BadRequestException("Option does not belong to this question")

    let isCorrect = false

    if (question.correctOptionId) {
      isCorrect = question.correctOptionId === selectedOptionId
    } else if (question.correctAnswerText) {
      isCorrect = norm(option.text) === norm(question.correctAnswerText)
    }

    const row = await this.prisma.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: { selectedOptionId, isCorrect },
      create: {
        attemptId,
        questionId,
        selectedOptionId,
        isCorrect,
      },
      select: {
        id: true,
        attemptId: true,
        questionId: true,
        selectedOptionId: true,
        isCorrect: true,
      },
    })

    return row
  }
  async finish(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { id: true, bankId: true, status: true },
    })
    if (!attempt) throw new BadRequestException("Attempt not found")

    const total = await this.prisma.question.count({
      where: { bankId: attempt.bankId },
    })

    const correct = await this.prisma.attemptAnswer.count({
      where: { attemptId, isCorrect: true },
    })

    const answered = await this.prisma.attemptAnswer.count({
      where: { attemptId },
    })

    const wrong = total - correct 
    const unanswered = total - answered

    const row =
      attempt.status === "FINISHED"
        ? await this.prisma.attempt.findUnique({ where: { id: attemptId } })
        : await this.prisma.attempt.update({
          where: { id: attemptId },
          data: {
            status: "FINISHED",
            finishedAt: new Date(),
            total,
            score: correct,
          },
        })

    return {
      attemptId: row!.id,
      status: row!.status,
      score: row!.score,
      total: row!.total,
      correct,
      wrong,
      answered,
      unanswered,
    }
  }

  async summary(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        bank: {
          include: {
            university: true,
            subject: true,
            topic: { include: { course: true } },
          },
        },
      },
    })
    if (!attempt) throw new BadRequestException("Attempt not found")
    const total = await this.prisma.question.count({
      where: { bankId: attempt.bankId },
    })

    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: { isCorrect: true },
    })

    const correct = answers.filter((a) => a.isCorrect).length

    const wrong = total - correct

    return {
      attemptId: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      score: correct,
      total,
      stats: {
        answered: answers.length,
        correct,
        wrong,
      },
      exam: attempt.bank,
    }
  }


  async attemptAnswers(attemptId: string) {
    return this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: {
        id: true,
        questionId: true,
        selectedOptionId: true,
        isCorrect: true,
        createdAt: true,
        question: {
          select: {
            id: true,
            text: true,
            imageUrl: true,
            correctOptionId: true,
            correctAnswerText: true,
            options: { select: { id: true, text: true } },
          },
        },
        selectedOption: { select: { id: true, text: true } },
      },
      orderBy: { createdAt: "asc" },
    })
  }

  async reviewAttempt(attemptId: string, userId: number) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        bank: {
          include: {
            university: true,
            subject: true,
            topic: { include: { course: true } },
          },
        },
      },
    })

    if (!attempt) throw new BadRequestException("Attempt not found")
    if (attempt.userId !== userId) throw new BadRequestException("This attempt does not belong to this user")

    const answers = await this.attemptAnswers(attemptId)

    const correct = answers.filter((a) => a.isCorrect).length
    const wrong = answers.length - correct

    const items = answers.map((a) => {
      const opts = a.question.options
      const dbCorrectId = a.question.correctOptionId
      const dbCorrectText = a.question.correctAnswerText

      let correctOption = dbCorrectId ? opts.find((o) => o.id === dbCorrectId) : null

      if (!correctOption && dbCorrectText) {
        const target = norm(dbCorrectText)
        if (target) {
          correctOption = opts.find((o) => norm(o.text) === target) || null
        }
      }

      const resolvedCorrectOptionId = correctOption?.id ?? dbCorrectId ?? null
      const resolvedCorrectOptionText = correctOption?.text ?? (dbCorrectText || null)

      return {
        answerId: a.id,
        createdAt: a.createdAt,
        isCorrect: a.isCorrect,
        question: {
          id: a.question.id,
          text: a.question.text,
          imageUrl: a.question.imageUrl,
          options: opts,
          correctOptionId: resolvedCorrectOptionId,   
          correctOptionText: resolvedCorrectOptionText,
        },
        selected: {
          id: a.selectedOption.id,
          text: a.selectedOption.text,
        },
      }
    })

    return {
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
        score: attempt.score,
        total: attempt.total,
      },
      exam: {
        id: attempt.bank.id,
        title: attempt.bank.title,
        year: attempt.bank.year,
        price: attempt.bank.price,
        university: attempt.bank.university,
        subject: attempt.bank.subject,
        topic: attempt.bank.topic,
      },
      stats: {
        answered: answers.length,
        correct,
        wrong,
      },
      items,
    }
  }

  async cleanupInProgress(userId: number) {
    const res = await this.prisma.attempt.deleteMany({
      where: { userId, status: "IN_PROGRESS" },
    })
    return res.count
  }
}
