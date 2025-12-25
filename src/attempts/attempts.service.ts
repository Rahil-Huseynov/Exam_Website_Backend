import { Injectable, BadRequestException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { randomBytes } from "crypto"
import { Prisma } from "@prisma/client"

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

@Injectable()
export class AttemptsService {
  constructor(private prisma: PrismaService) {}

  private genToken() {
    return randomBytes(32).toString("hex")
  }

  async createOneTimeExamToken(bankId: string, userId: number, ttlMinutes = 10) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } })
    if (!bank) throw new BadRequestException("Bank not found")

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new BadRequestException("User not found")

    const token = this.genToken()
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)

    await this.prisma.examToken.create({
      data: { token, bankId, userId, expiresAt },
    })

    return { token, expiresAt }
  }

  
 async createAttemptWithToken(
  bankId: string,
  userId: number,
  token: string,
): Promise<{ attempt: any; remainingBalance: string }> {
  if (!token) throw new BadRequestException("Exam token is required")

  return this.prisma.$transaction(async (tx) => {
    const row = await tx.examToken.findUnique({ where: { token } })
    if (!row) throw new BadRequestException("Invalid exam token")

    if (row.bankId !== bankId || row.userId !== userId) {
      throw new BadRequestException("Exam token does not match this exam/user")
    }
    if (row.expiresAt.getTime() < Date.now()) throw new BadRequestException("Exam token expired")

    if (row.attemptId) {
      const existing = await tx.attempt.findUnique({ where: { id: row.attemptId } })
      if (existing) {
        const u = await tx.user.findUnique({ where: { id: userId }, select: { balance: true } })
        const remainingBalance = u?.balance ? round2(asDec(u.balance)).toFixed(2) : "0.00"
        return { attempt: existing, remainingBalance }
      }
    }

    const locked = await tx.examToken.updateMany({
      where: {
        token,
        bankId,
        userId,
        usedAt: null,
        attemptId: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() }, 
    })
    if (locked.count === 0) {
      const again = await tx.examToken.findUnique({ where: { token } })
      if (again?.attemptId) {
        const existing = await tx.attempt.findUnique({ where: { id: again.attemptId } })
        if (existing) {
          const u = await tx.user.findUnique({ where: { id: userId }, select: { balance: true } })
          const remainingBalance = u?.balance ? round2(asDec(u.balance)).toFixed(2) : "0.00"
          return { attempt: existing, remainingBalance }
        }
      }
      throw new BadRequestException("Exam token already used")
    }

    const bank = await tx.questionBank.findUnique({
      where: { id: bankId },
      select: { id: true, price: true },
    })
    if (!bank) {
      await tx.examToken.update({ where: { token }, data: { usedAt: null } })
      throw new BadRequestException("Bank not found")
    }

    const price = round2(asDec(bank.price))
    if (price.lessThan(0)) {
      await tx.examToken.update({ where: { token }, data: { usedAt: null } })
      throw new BadRequestException("Invalid exam price")
    }

    const availableCount = await tx.question.count({
      where: { bankId, correctOptionId: { not: null } },
    })
    if (availableCount < 1) {
      await tx.examToken.update({ where: { token }, data: { usedAt: null } })
      throw new BadRequestException("Bu imtahanda təsdiqlənmiş sual yoxdur")
    }

    const updated = await tx.user.updateMany({
      where: { id: userId, balance: { gte: price } },
      data: { balance: { decrement: price } },
    })

    if (updated.count === 0) {
      await tx.examToken.update({ where: { token }, data: { usedAt: null } })
      throw new BadRequestException("Balansda kifayət qədər vəsait yoxdur")
    }

    const u2 = await tx.user.findUnique({ where: { id: userId }, select: { balance: true } })
    const remainingBalance = u2?.balance ? round2(asDec(u2.balance)).toFixed(2) : "0.00"

    const attempt = await tx.attempt.create({
      data: { bankId, userId, status: "IN_PROGRESS" },
    })

    await tx.examToken.update({
      where: { token },
      data: { attemptId: attempt.id },
    })

    return { attempt, remainingBalance }
  })
}

  async revokeToken(bankId: string, userId: number, token: string) {
    const row = await this.prisma.examToken.findUnique({ where: { token } })
    if (!row) return 0

    if (row.bankId !== bankId || row.userId !== userId) return 0
    if (row.usedAt) return 0

    const updated = await this.prisma.examToken.updateMany({
      where: { token, bankId, userId, usedAt: null },
      data: { usedAt: new Date() },
    })

    return updated.count
  }

  async deleteToken(bankId: string, userId: number, token: string) {
    const row = await this.prisma.examToken.findUnique({ where: { token } })
    if (!row) return 0
    if (row.bankId !== bankId || row.userId !== userId) return 0

    const deleted = await this.prisma.examToken.deleteMany({
      where: { token, bankId, userId },
    })

    return deleted.count
  }

  async getAttemptQuestions(attemptId: string, userId: number) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { id: true, userId: true, bankId: true, status: true },
    })

    if (!attempt) throw new BadRequestException("Attempt not found")
    if (attempt.userId !== userId) throw new BadRequestException("This attempt does not belong to this user")
    if (attempt.status !== "IN_PROGRESS") throw new BadRequestException("Attempt is finished")

    const questions = await this.prisma.question.findMany({
      where: { bankId: attempt.bankId, correctOptionId: { not: null } },
      include: { options: true },
    })

    if (!questions.length) throw new BadRequestException("No questions found for this exam")

    const picked = shuffle(questions).slice(0, 25)

    return picked.map((q) => ({
      id: q.id,
      text: q.text,
      options: shuffle(q.options).map((o) => ({ id: o.id, text: o.text })),
    }))
  }

  async answer(attemptId: string, questionId: string, selectedOptionId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } })
    if (!attempt) throw new BadRequestException("Attempt not found")
    if (attempt.status !== "IN_PROGRESS") throw new BadRequestException("Attempt is finished")

    const q = await this.prisma.question.findFirst({
      where: { id: questionId, bankId: attempt.bankId },
      select: { id: true, correctOptionId: true },
    })
    if (!q || !q.correctOptionId) throw new BadRequestException("Question not found or not validated")

    const option = await this.prisma.questionOption.findFirst({
      where: { id: selectedOptionId, questionId },
      select: { id: true },
    })
    if (!option) throw new BadRequestException("Selected option does not belong to this question")

    const isCorrect = q.correctOptionId === selectedOptionId

    const ans = await this.prisma.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: { selectedOptionId, isCorrect },
      create: { attemptId, questionId, selectedOptionId, isCorrect },
    })

    return { isCorrect, answerId: ans.id }
  }

  async finish(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    })
    if (!attempt) throw new BadRequestException("Attempt not found")
    if (attempt.status !== "IN_PROGRESS") return attempt

    const correct = attempt.answers.filter((a) => a.isCorrect).length

    const total = await this.prisma.question.count({
      where: { bankId: attempt.bankId, correctOptionId: { not: null } },
    })

    return this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        status: "FINISHED",
        finishedAt: new Date(),
        score: correct,
        total,
      },
    })
  }

  async summary(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    })
    if (!attempt) throw new BadRequestException("Attempt not found")

    const answered = attempt.answers.length
    const correct = attempt.answers.filter((a) => a.isCorrect).length

    return {
      attemptId: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      answered,
      correct,
      score: attempt.score,
      total: attempt.total,
    }
  }

  async userAttempts(userId: number) {
    return this.prisma.attempt.findMany({
      where: { userId },
      include: {
        bank: {
          include: {
            topic: { include: { course: true } },
            university: true,
            subject: true,
          },
        },
      },
      orderBy: { startedAt: "desc" },
    })
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
            correctOptionId: true,
            options: { select: { id: true, text: true } },
          },
        },
        selectedOption: { select: { id: true, text: true } },
      },
      orderBy: { createdAt: "asc" },
    })
  }
}
