import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CommitQuestionsDto } from "./dto";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class QuestionsService {
  constructor(private prisma: PrismaService) {}

  async commit(bankId: string, dto: CommitQuestionsDto) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } });
    if (!bank) throw new BadRequestException("Bank not found");

    const createdQuestions: { id: string }[] = [];

    for (const q of dto.questions) {
      if (!q.text?.trim()) continue;
      if (!q.options || q.options.length < 2) continue;

      const correct = q.options.find((o) => o.tempOptionId === q.correctTempOptionId);
      if (!correct) throw new BadRequestException(`Correct option not found for question: ${q.tempId}`);

      const created = await this.prisma.question.create({
        data: {
          bankId,
          text: q.text.trim(),
          sourcePdfId: dto.sourcePdfId,
          options: { create: q.options.map((o) => ({ text: o.text.trim() })) },
        },
        include: { options: true },
      });

      const correctOpt = created.options.find((o) => o.text.trim() === correct.text.trim());
      if (!correctOpt) throw new BadRequestException("Correct option mapping failed");

      await this.prisma.question.update({
        where: { id: created.id },
        data: {
          correctOptionId: correctOpt.id,
          correctAnswerText: correctOpt.text,
        },
      });

      createdQuestions.push({ id: created.id });
    }

    return { count: createdQuestions.length, questions: createdQuestions };
  }

  async getQuizQuestions(bankId: string, limit = 20) {
    const qs = await this.prisma.question.findMany({
      where: { bankId, correctOptionId: { not: null } },
      include: { options: true },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return qs.map((q) => ({
      id: q.id,
      text: q.text,
      options: shuffle(q.options).map((o) => ({ id: o.id, text: o.text })),
    }));
  }
}
