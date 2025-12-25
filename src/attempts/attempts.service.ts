import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { randomBytes } from "crypto";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class AttemptsService {
  constructor(private prisma: PrismaService) {}

  private genToken() {
    return randomBytes(32).toString("hex");
  }

  async createOneTimeExamToken(bankId: string, userId: number, ttlMinutes = 10) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } });
    if (!bank) throw new BadRequestException("Bank not found");

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException("User not found");

    const token = this.genToken();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.examToken.create({
      data: { token, bankId, userId, expiresAt },
    });

    return { token, expiresAt };
  }

  async createAttemptWithToken(bankId: string, userId: number, token: string) {
    if (!token) throw new BadRequestException("Exam token is required");

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.examToken.findUnique({ where: { token } });

      if (!row) throw new BadRequestException("Invalid exam token");
      if (row.bankId !== bankId || row.userId !== userId) {
        throw new BadRequestException("Exam token does not match this exam/user");
      }
      if (row.usedAt) throw new BadRequestException("Exam token already used");
      if (row.expiresAt.getTime() < Date.now()) throw new BadRequestException("Exam token expired");

      await tx.examToken.update({
        where: { token },
        data: { usedAt: new Date() },
      });

      return tx.attempt.create({
        data: { bankId, userId, status: "IN_PROGRESS" },
      });
    });
  }

  async revokeToken(bankId: string, userId: number, token: string) {
    const row = await this.prisma.examToken.findUnique({ where: { token } });
    if (!row) return 0;

    if (row.bankId !== bankId || row.userId !== userId) return 0;
    if (row.usedAt) return 0;

    const updated = await this.prisma.examToken.updateMany({
      where: { token, bankId, userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    return updated.count;
  }

  async deleteToken(bankId: string, userId: number, token: string) {
    const row = await this.prisma.examToken.findUnique({ where: { token } });
    if (!row) return 0;

    if (row.bankId !== bankId || row.userId !== userId) return 0;

    const deleted = await this.prisma.examToken.deleteMany({
      where: { token, bankId, userId },
    });

    return deleted.count;
  }


  async getAttemptQuestions(attemptId: string, userId: number) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { id: true, userId: true, bankId: true, status: true },
    });

    if (!attempt) throw new BadRequestException("Attempt not found");
    if (attempt.userId !== userId) throw new BadRequestException("This attempt does not belong to this user");

    if (attempt.status !== "IN_PROGRESS") {
      throw new BadRequestException("Attempt is finished");
    }

    const questions = await this.prisma.question.findMany({
      where: { bankId: attempt.bankId, correctOptionId: { not: null } },
      include: { options: true },
      orderBy: { createdAt: "desc" },
    });

    if (!questions.length) throw new BadRequestException("No questions found for this exam");

    return questions.map((q) => ({
      id: q.id,
      text: q.text,
      options: shuffle(q.options).map((o) => ({ id: o.id, text: o.text })),
    }));
  }

  async answer(attemptId: string, questionId: string, selectedOptionId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new BadRequestException("Attempt not found");
    if (attempt.status !== "IN_PROGRESS") throw new BadRequestException("Attempt is finished");

    const q = await this.prisma.question.findFirst({
      where: { id: questionId, bankId: attempt.bankId },
      select: { id: true, correctOptionId: true },
    });
    if (!q || !q.correctOptionId) throw new BadRequestException("Question not found or not validated");

    const option = await this.prisma.questionOption.findFirst({
      where: { id: selectedOptionId, questionId },
      select: { id: true },
    });
    if (!option) throw new BadRequestException("Selected option does not belong to this question");

    const isCorrect = q.correctOptionId === selectedOptionId;

    const ans = await this.prisma.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: { selectedOptionId, isCorrect },
      create: { attemptId, questionId, selectedOptionId, isCorrect },
    });

    return { isCorrect, answerId: ans.id };
  }

  async finish(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    });
    if (!attempt) throw new BadRequestException("Attempt not found");
    if (attempt.status !== "IN_PROGRESS") return attempt;

    const correct = attempt.answers.filter((a) => a.isCorrect).length;

    const total = await this.prisma.question.count({
      where: { bankId: attempt.bankId },
    });

    return this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        status: "FINISHED",
        finishedAt: new Date(),
        score: correct,
        total,
      },
    });
  }

  async summary(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    });
    if (!attempt) throw new BadRequestException("Attempt not found");

    const answered = attempt.answers.length;
    const correct = attempt.answers.filter((a) => a.isCorrect).length;

    return {
      attemptId: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      answered,
      correct,
      score: attempt.score,
      total: attempt.total,
    };
  }

  async userAttempts(userId: number) {
    return this.prisma.attempt.findMany({
      where: { userId },
      include: { bank: { include: { topic: { include: { course: true } } } } },
      orderBy: { startedAt: "desc" },
    });
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
    });
  }
}
