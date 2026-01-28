import { Injectable, BadRequestException, Inject, forwardRef } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { AttemptStatus } from "@prisma/client";
import { AiService } from "src/ai-checker/ai.service";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    ;[a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function asDec(v: Prisma.Decimal | string | number) {
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(String(v));
}
function round2(d: Prisma.Decimal) {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
function norm(s?: string | null) {
  return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

@Injectable()
export class AttemptsService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) { }

  private genToken() {
    return randomBytes(32).toString("hex");
  }

  async userAttempts(userId: number, status?: string | string[]) {
    const uid = userId;
    const where: any = { userId: uid };

    if (status) {
      if (Array.isArray(status)) {
        where.OR = status.map(s => {
          if (s === "FINISHED") return { status: "FINISHED", finishedAt: { not: null } };
          return { status: s };
        });
      } else {
        if (status === "FINISHED") {
          where.status = "FINISHED";
          where.finishedAt = { not: null };
        } else {
          where.status = status;
        }
      }
    }

    const rows = await this.prisma.attempt.findMany({
      where,
      orderBy: [
        { finishedAt: "desc" },
        { startedAt: "desc" },
      ],
      include: {
        bank: {
          include: {
            university: true,
            subject: true,
            topic: { include: { course: true } },
          },
        },
      },
    });

    return rows.map((a) => ({
      id: a.id,
      status: a.status,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      score: a.score,
      total: a.total,
      bank: a.bank,
    }));
  }

  async createOneTimeExamToken(bankId: string, userId: number, ttlMinutes = 10) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const bank = await tx.questionBank.findUnique({ where: { id: bankId } });
      if (!bank) throw new BadRequestException("Bank not found");
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new BadRequestException("User not found");
      const inProgress = await tx.attempt.findFirst({
        where: { userId, bankId, status: "IN_PROGRESS" },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      });
      if (inProgress) {
        await tx.attemptAnswer.deleteMany({ where: { attemptId: inProgress.id } });
        await tx.attemptQuestion.deleteMany({ where: { attemptId: inProgress.id } });
        await tx.examToken.updateMany({
          where: { attemptId: inProgress.id },
          data: { attemptId: null },
        });
        await tx.attempt.delete({ where: { id: inProgress.id } });
      }
      await tx.examToken.deleteMany({
        where: { bankId, userId, usedAt: null },
      });
      const price = asDec(bank.price);
      const bal = asDec(user.balance);
      if (bal.lessThan(price)) throw new BadRequestException("Insufficient balance");
      const newBal = round2(bal.minus(price));
      const token = this.genToken();
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
      const tokenRow = await tx.examToken.create({
        data: { token, bankId, userId, expiresAt },
      });
      await tx.user.update({
        where: { id: userId },
        data: { balance: newBal },
      });
      await tx.balanceTransaction.create({
        data: {
          userId,
          bankId,
          attemptId: null,
          type: "EXAM_DEBIT",
          amount: round2(price.mul(-1)),
          balanceBefore: round2(bal),
          balanceAfter: round2(newBal),
          note: `Exam token created: ${bank.title} (${bank.year}) • non-refundable`,
        },
      });
      return { token: tokenRow.token, expiresAt };
    });
  }

  async revokeToken(bankId: string, userId: number, token: string) {
    const now = new Date();
    const res = await this.prisma.examToken.updateMany({
      where: { bankId, userId, token, usedAt: null },
      data: { usedAt: now },
    });
    return res.count;
  }

  async deleteToken(bankId: string, userId: number, token: string) {
    const res = await this.prisma.examToken.deleteMany({
      where: { bankId, userId, token, usedAt: null },
    });
    return res.count;
  }

  async createAttemptWithToken(bankId: string, userId: number, token: string) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const bank = await tx.questionBank.findUnique({ where: { id: bankId } });
      if (!bank) throw new BadRequestException("Bank not found");
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new BadRequestException("User not found");
      const existingAttempt = await tx.attempt.findFirst({
        where: { userId, bankId, status: "IN_PROGRESS" },
        orderBy: { startedAt: "desc" },
      });
      if (existingAttempt) {
        return { attempt: existingAttempt, remainingBalance: user.balance.toString() };
      }
      const tokenRow = await tx.examToken.findUnique({ where: { token } });
      if (!tokenRow) throw new BadRequestException("Token not found");
      if (tokenRow.bankId !== bankId || tokenRow.userId !== userId) throw new BadRequestException("Token mismatch");
      if (tokenRow.usedAt) throw new BadRequestException("Token already used");
      if (tokenRow.expiresAt.getTime() < now.getTime()) throw new BadRequestException("Token expired");
      if (tokenRow.attemptId) throw new BadRequestException("Token already used");
      const attempt = await tx.attempt.create({
        data: {
          userId,
          bankId,
          status: "IN_PROGRESS",
          startedAt: now,
        },
      });
      await tx.examToken.update({
        where: { id: tokenRow.id },
        data: {
          usedAt: now,
          attemptId: attempt.id,
        },
      });
      return { attempt, remainingBalance: user.balance.toString() };
    });
  }

  async getAttemptQuestions(attemptId: string, userId: number) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new BadRequestException("Attempt not found");
    if (attempt.userId !== userId) throw new BadRequestException("Attempt does not belong to user");

    const bank = await this.prisma.questionBank.findUnique({
      where: { id: attempt.bankId },
      select: { questionCount: true, random: true, type: true },
    });
    if (!bank) throw new BadRequestException("Exam/Bank not found");

    const total = bank.questionCount || 1;

    const existing = await this.prisma.attemptQuestion.findMany({
      where: { attemptId },
      orderBy: { order: "asc" },
      include: {
        question: {
          select: {
            id: true,
            text: true,
            prompt: true,
            images: { select: { url: true, sort: true } },
            options: { select: { id: true, text: true } },
            correctOptionId: true,
            correctAnswerText: true,
          },
        },
      },
    });

    let questions: any[] = [];

    if (existing.length === 0) {
      let allQuestions: any[] = [];
      if (!bank?.random) {
        allQuestions = await this.prisma.question.findMany({
          where: { bankId: attempt.bankId },
          orderBy: { sort: "asc" },
          include: {
            options: true,
            images: { orderBy: { sort: "asc" } },
          },
          take: total,
        });
      } else {
        const all = await this.prisma.question.findMany({
          where: { bankId: attempt.bankId },
          include: {
            options: true,
            images: { orderBy: { sort: "asc" } },
          },
        });
        allQuestions = shuffle(all).slice(0, total);
      }

      await this.prisma.attemptQuestion.createMany({
        data: allQuestions.map((q, idx) => ({
          attemptId,
          questionId: q.id,
          order: idx + 1,
        })),
        skipDuplicates: true,
      });

      questions = allQuestions;
    } else {
      questions = existing.map((x) => x.question).slice(0, total);
    }

    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: { questionId: true, selectedOptionId: true, studentTextAnswer: true, flag: true },
    });
    const answeredMap = new Map(answers.map((a) => [a.questionId, a]));

    return questions.map((q) => {
      const opts = bank.type === 'TEST' ? shuffle(q.options as { id: string; text: string }[]) : [];
      const ans = answeredMap.get(q.id);
      return {
        id: q.id,
        text: q.text,
        prompt: q.prompt,
        images: q.images,
        options: opts.map((o) => ({ id: o.id, text: o.text })),
        answered: !!ans,
        selectedOptionId: ans?.selectedOptionId ?? null,
        studentTextAnswer: ans?.studentTextAnswer ?? null,
        flag: ans?.flag ?? false,
      };
    });
  }

  async answer(
    attemptId: string,
    questionId: string,
    selectedOptionId?: string,
    studentTextAnswer?: string,
    flag: boolean = false
  ) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new BadRequestException("Attempt not found");
    if (attempt.status !== "IN_PROGRESS") throw new BadRequestException({ message: "Attempt is not in progress" });

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        bankId: true,
        bank: { select: { type: true } },
        correctOptionId: true,
        correctAnswerText: true,
      },
    });
    if (!question) throw new BadRequestException({ message: "Question not found" });
    if (question.bankId !== attempt.bankId)
      throw new BadRequestException({ message: "Question does not belong to this exam" });

    const bankType = question.bank.type;

    let isCorrect: boolean | null = null;
    const data: any = { flag };

    if (bankType === "TEST") {
      if (!selectedOptionId)
        throw new BadRequestException({ message: "Selected option is required for TEST type" });

      const option = await this.prisma.questionOption.findUnique({
        where: { id: selectedOptionId },
        select: { id: true, questionId: true, text: true },
      });

      if (!option) throw new BadRequestException({ message: "Option not found" });
      if (option.questionId !== questionId)
        throw new BadRequestException({ message: "Option does not belong to this question" });

      if (question.correctOptionId) {
        isCorrect = question.correctOptionId === selectedOptionId;
      } else if (question.correctAnswerText) {
        isCorrect = norm(option.text) === norm(question.correctAnswerText);
      }

      data.selectedOptionId = selectedOptionId;
      data.isCorrect = isCorrect;
      data.studentTextAnswer = null;
    } else if (bankType === "WRITING") {
      if (!studentTextAnswer)
        throw new BadRequestException({ message: "Student text answer is required for WRITING type" });
      if (selectedOptionId)
        throw new BadRequestException({ message: "Selected option is not allowed for WRITING type" });

      data.studentTextAnswer = studentTextAnswer;
      data.selectedOptionId = null;
      data.isCorrect = null;
      data.score = null;
    } else {
      throw new BadRequestException({ message: "Invalid bank type" });
    }

    const row = await this.prisma.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: data,
      create: {
        attemptId,
        questionId,
        ...data,
      },
      select: {
        id: true,
        attemptId: true,
        questionId: true,
        selectedOptionId: true,
        studentTextAnswer: true,
        isCorrect: true,
        score: true,
        flag: true,
      },
    });

    return row;
  }


  async finish(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { bank: true },
    });
    if (!attempt) throw new BadRequestException("Attempt not found");

    const bankType = attempt.bank.type;
    const total = attempt.bank?.questionCount || 1;

    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
    });
    const answered = answers.length;
    const unanswered = total - answered;

    let status: AttemptStatus = AttemptStatus.FINISHED;
    let score = 0;
    let correct = 0;
    let wrong = 0;

    if (bankType === "TEST") {
      correct = answers.filter((a) => a.isCorrect).length;
      wrong = answered - correct;
      score = correct;

      const updated = await this.prisma.attempt.update({
        where: { id: attemptId },
        data: {
          status: "FINISHED",
          finishedAt: new Date(),
          total,
          score,
        },
      });

      return {
        attemptId: updated.id,
        status: updated.status,
        score: updated.score,
        total: updated.total,
        correct,
        wrong,
        answered,
        unanswered,
      };
    } else if (bankType === "WRITING") {
      if (unanswered > 0) throw new BadRequestException("All questions must be answered before finishing WRITING exam");

      for (const ans of answers) {
        const exists = await this.prisma.aiCheckedAnswer.findFirst({ where: { attemptAnswerId: ans.id } });
        if (!exists) {
          const checked = await this.prisma.aiCheckedAnswer.create({
            data: {
              attemptAnswerId: ans.id,
              status: "PENDING",
            },
          });
          try {
            this.aiService.enqueueWritingCheck(checked.id);
          } catch (err) {
          }
        } else {
          if (exists.status === 'FAILED') {
            await this.prisma.aiCheckedAnswer.update({
              where: { id: exists.id },
              data: { status: 'PENDING' },
            });
            try {
              this.aiService.enqueueWritingCheck(exists.id);
            } catch { }
          }
        }
      }

      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: {
          status: "WAITING_AI",
          finishedAt: new Date(),
          total,
          score: 0,
        },
      });

      return {
        attemptId: attempt.id,
        status: "WAITING_AI",
        score: 0,
        total,
        correct: 0,
        wrong: 0,
        answered,
        unanswered: 0,
      };
    } else {
      throw new BadRequestException("Invalid bank type");
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
    });
    if (!attempt) throw new BadRequestException("Attempt not found");
    const total = attempt.bank?.questionCount || 1;
    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: { isCorrect: true },
    });
    const answered = answers.length;
    const correct = answers.filter((a) => a.isCorrect).length;
    const wrong = total - correct;
    const unanswered = total - answered;
    return {
      attemptId: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      score: correct,
      total,
      stats: {
        answered,
        correct,
        wrong,
        unanswered,
      },
      exam: attempt.bank,
    };
  }

  async attemptAnswers(attemptId: string) {
    return this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: {
        id: true,
        questionId: true,
        selectedOptionId: true,
        studentTextAnswer: true,
        isCorrect: true,
        flag: true,
        createdAt: true,
        question: {
          select: {
            id: true,
            text: true,
            images: true,
            correctOptionId: true,
            correctAnswerText: true,
            options: { select: { id: true, text: true } },
          },
        },
        selectedOption: { select: { id: true, text: true } },
      },
      orderBy: { createdAt: "asc" },
    });
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
    });
    if (!attempt) throw new BadRequestException("Attempt not found");
    if (attempt.userId !== userId) throw new BadRequestException("This attempt does not belong to this user");
    const aq = await this.prisma.attemptQuestion.findMany({
      where: { attemptId },
      orderBy: { order: "asc" },
      include: {
        question: {
          select: {
            id: true,
            text: true,
            images: { select: { url: true, sort: true } },
            correctOptionId: true,
            correctAnswerText: true,
            options: { select: { id: true, text: true } },
          },
        },
      },
    });
    if (aq.length === 0) {
      await this.getAttemptQuestions(attemptId, userId);
      const aq2 = await this.prisma.attemptQuestion.findMany({
        where: { attemptId },
        orderBy: { order: "asc" },
        include: {
          question: {
            select: {
              id: true,
              text: true,
              images: { select: { url: true, sort: true } },
              correctOptionId: true,
              correctAnswerText: true,
              options: { select: { id: true, text: true } },
            },
          },
        },
      });
      if (aq2.length === 0) throw new BadRequestException("Attempt questions not generated");
      var attemptQuestions = aq2;
    } else {
      var attemptQuestions = aq;
    }
    const bankQc = attempt.bank?.questionCount;
    const total = (typeof bankQc === "number" && bankQc > 0) ? bankQc : 1;
    const picked = attemptQuestions.slice(0, total);
    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: {
        id: true,
        questionId: true,
        selectedOptionId: true,
        studentTextAnswer: true,
        isCorrect: true,
        score: true,
        feedback: true,
        flag: true,
        createdAt: true,
        selectedOption: { select: { id: true, text: true } },
      },
    });
    const ansMap = new Map(answers.map((a) => [a.questionId, a]));
    const answeredCount = answers.length;
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const wrongCount = total - correctCount;
    const unansweredCount = total - answeredCount;
    const items = picked.map((row) => {
      const q = row.question;
      const a = ansMap.get(q.id) ?? null;
      const opts = q.options;
      const dbCorrectId = q.correctOptionId;
      const dbCorrectText = q.correctAnswerText;
      let correctOption = dbCorrectId ? opts.find((o) => o.id === dbCorrectId) : null;
      if (!correctOption && dbCorrectText) {
        const target = norm(dbCorrectText);
        if (target) {
          correctOption = opts.find((o) => norm(o.text) === target) || null;
        }
      }
      const resolvedCorrectOptionId = correctOption?.id ?? dbCorrectId ?? null;
      const resolvedCorrectOptionText = correctOption?.text ?? (dbCorrectText || null);
      return {
        order: row.order,
        answered: !!a,
        answerId: a?.id ?? null,
        createdAt: a?.createdAt ?? null,
        isCorrect: a?.isCorrect ?? null,
        score: a?.score ?? null,
        feedback: a?.feedback ?? null,
        flag: a?.flag ?? false,
        question: {
          id: q.id,
          text: q.text,
          imageUrl: q.images,
          options: opts,
          correctOptionId: resolvedCorrectOptionId,
          correctOptionText: resolvedCorrectOptionText,
        },
        selected: a?.selectedOption
          ? {
            id: a.selectedOption?.id,
            text: a.selectedOption?.text,
          }
          : null,
        studentTextAnswer: a?.studentTextAnswer ?? null,
      };
    });
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
        total,
        answered: answeredCount,
        correct: correctCount,
        wrong: wrongCount,
        unanswered: unansweredCount,
      },
      items,
    };
  }

  async cleanupInProgress(userId: number) {
    const res = await this.prisma.attempt.deleteMany({
      where: { userId, status: "IN_PROGRESS" },
    });
    return res.count;
  }

  async balanceHistory(userId: number, page = 1, limit = 20) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (p - 1) * l;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.balanceTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: l,
        include: {
          bank: {
            select: {
              id: true,
              title: true,
              year: true,
              price: true,
              university: true,
              subject: true,
              topic: { include: { course: true } },
            },
          },
          attempt: {
            select: { id: true, status: true, startedAt: true, finishedAt: true, score: true, total: true },
          },
          admin: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        },
      }),
      this.prisma.balanceTransaction.count({ where: { userId } }),
    ]);
    return {
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l),
      items: items.map((x) => ({
        id: x.id,
        type: x.type,
        amount: x.amount.toString(),
        balanceBefore: x.balanceBefore.toString(),
        balanceAfter: x.balanceAfter.toString(),
        note: x.note,
        createdAt: x.createdAt,
        bank: x.bank,
        attempt: x.attempt,
        admin: x.admin
          ? {
            id: x.admin.id,
            email: x.admin.email,
            name: `${x.admin.firstName ?? ""} ${x.admin.lastName ?? ""}`.trim(),
            role: x.admin.role,
          }
          : null,
      })),
    };
  }

  async adminListResults(params: {
    page?: number;
    limit?: number;
    q?: string;
    status?: "FINISHED" | "IN_PROGRESS";
  }) {
    const p = Math.max(1, Number(params.page) || 1);
    const l = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (p - 1) * l;
    const q = String(params.q || "").trim();
    const status = params.status;
    const where: any = {};
    if (status === "FINISHED") {
      where.status = "FINISHED";
      where.finishedAt = { not: null };
    } else if (status === "IN_PROGRESS") {
      where.status = "IN_PROGRESS";
    }
    if (q) {
      where.OR = [
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { firstName: { contains: q, mode: "insensitive" } } },
        { user: { lastName: { contains: q, mode: "insensitive" } } },
        { user: { publicId: { contains: q, mode: "insensitive" } } },
        { bank: { title: { contains: q, mode: "insensitive" } } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attempt.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip,
        take: l,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, publicId: true } },
          bank: {
            include: {
              university: true,
              subject: true,
              topic: { include: { course: true } },
            },
          },
        },
      }),
      this.prisma.attempt.count({ where }),
    ]);
    return {
      page: p,
      limit: l,
      total,
      pages: Math.max(1, Math.ceil(total / l)),
      items: items.map((a) => ({
        id: a.id,
        status: a.status,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
        score: a.score,
        total: a.total,
        user: a.user,
        bank: a.bank,
      })),
    };
  }

  async setFlag(attemptId: string, questionId: string, flag: boolean) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new BadRequestException("Attempt not found");
    const row = await this.prisma.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      create: {
        attemptId,
        questionId,
        selectedOptionId: null,
        isCorrect: null,
        flag,
      },
      update: { flag },
      select: {
        id: true,
        attemptId: true,
        questionId: true,
        flag: true,
        selectedOptionId: true,
        isCorrect: true,
        createdAt: true,
      },
    });
    return row;
  }

  async updateAttemptAfterAi(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { bank: true },
    });
    if (!attempt || attempt.bank.type !== "WRITING" || attempt.status !== "WAITING_AI") return;

    const aiChecks = await this.prisma.aiCheckedAnswer.findMany({
      where: {
        attemptAnswer: { attemptId },
      },
    });
    const allDone = aiChecks.length > 0 && aiChecks.every((check) => check.status === "DONE");
    if (!allDone) return;

    let totalScore = 0;
    for (const check of aiChecks) {
      totalScore += check.score || 0;
      await this.prisma.attemptAnswer.update({
        where: { id: check.attemptAnswerId },
        data: {
          score: check.score,
          feedback: check.feedback,
          isCorrect: (check.score || 0) > 0,
        },
      });
    }

    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        status: "FINISHED",
        score: totalScore,
        finishedAt: new Date(),
        total: aiChecks.length * 10,
      },
    });
  }
}
