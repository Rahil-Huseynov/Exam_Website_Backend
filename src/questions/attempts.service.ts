import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AttemptsService {
  constructor(private prisma: PrismaService) {}

  async createAttempt(bankId: string, userId: number) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } });
    if (!bank) throw new BadRequestException("Bank not found");

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException("User not found");

    return this.prisma.attempt.create({
      data: { bankId, userId, status: "IN_PROGRESS" },
    });
  }

  async answer(attemptId: string, questionId: string, selectedOptionId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new BadRequestException("Attempt not found");
    if (attempt.status !== "IN_PROGRESS") throw new BadRequestException("Attempt is finished");

    const q = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!q || !q.correctOptionId) throw new BadRequestException("Question not found or not validated");

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

    const total = attempt.answers.length;
    const correct = attempt.answers.filter((a) => a.isCorrect).length;

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
      include: { question: true, selectedOption: true },
      orderBy: { createdAt: "asc" },
    });
  }
}
