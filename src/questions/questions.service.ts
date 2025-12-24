import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import { CreateExamDto } from "./dto/create-exam.dto";
import { ImportQuestionsDirectDto } from "./dto/import-direct.dto";
import { UpdateQuestionDto } from "./dto/update-question.dto";
import { CreateQuestionDto } from "./dto/create-question.dto";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toTrimmedString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function normText(s: string) {
  return (s || "").trim().replace(/\s+/g, " ");
}

function normKey(s: string) {
  return normText(s).toLowerCase();
}

@Injectable()
export class QuestionsService {
  constructor(private prisma: PrismaService) {}

  async listUniversities() {
    return this.prisma.university.findMany({ orderBy: { createdAt: "desc" } });
  }

  async createUniversity(data: {
    name: string;
    nameAz?: string;
    nameEn?: string;
    nameRu?: string;
    logo?: string | null;
  }) {
    const name = toTrimmedString(data.name);
    if (!name) throw new BadRequestException("University name is required");

    return this.prisma.university.create({
      data: {
        name,
        nameAz: data.nameAz?.trim(),
        nameEn: data.nameEn?.trim(),
        nameRu: data.nameRu?.trim(),
        logo: data.logo?.trim() || null,
      },
    });
  }

  async listSubjects() {
    return this.prisma.subject.findMany({ orderBy: { createdAt: "desc" } });
  }

  async createSubject(data: { name: string; nameAz?: string; nameEn?: string; nameRu?: string }) {
    const name = toTrimmedString(data.name);
    if (!name) throw new BadRequestException("Subject name is required");

    return this.prisma.subject.create({
      data: {
        name,
        nameAz: data.nameAz?.trim(),
        nameEn: data.nameEn?.trim(),
        nameRu: data.nameRu?.trim(),
      },
    });
  }

  private async ensureAnyTopicForUniversity(universityId: string) {
    let anyTopic = await this.prisma.topic.findFirst();
    if (anyTopic) return anyTopic;

    const uni = await this.prisma.university.findUnique({ where: { id: universityId } });
    if (!uni) throw new BadRequestException("University not found");

    const faculty = await this.prisma.faculty.create({
      data: { name: "Default Faculty", universityId },
    });

    const course = await this.prisma.course.create({
      data: { title: "Default Course", facultyId: faculty.id },
    });

    anyTopic = await this.prisma.topic.create({
      data: { title: "Default Topic", courseId: course.id },
    });

    return anyTopic;
  }

  async createExam(dto: CreateExamDto) {
    const title = toTrimmedString(dto.title);
    if (!title) throw new BadRequestException("Title is required");

    const year = Number(dto.year);
    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      throw new BadRequestException("Year is invalid");
    }

    const priceNumber = typeof dto.price === "string" ? Number(dto.price) : Number(dto.price);
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      throw new BadRequestException("Price is invalid");
    }

    const uni = await this.prisma.university.findUnique({ where: { id: dto.universityId } });
    if (!uni) throw new BadRequestException("University not found");

    const subj = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subj) throw new BadRequestException("Subject not found");

    const anyTopic = await this.ensureAnyTopicForUniversity(dto.universityId);

    const created = await this.prisma.questionBank.create({
      data: {
        name: title,
        title,
        year,
        price: new Prisma.Decimal(priceNumber),
        universityId: dto.universityId,
        subjectId: dto.subjectId,
        topicId: anyTopic.id,
      },
      include: {
        university: true,
        subject: true,
        _count: { select: { questions: true } },
      },
    });

    return {
      id: created.id,
      title: created.title,
      year: created.year,
      price: Number(created.price),
      questionCount: created._count.questions,
      university: created.university,
      subject: created.subject,
    };
  }

  async getExams(filter: { universityId?: string; subjectId?: string; year?: number }) {
    const rows = await this.prisma.questionBank.findMany({
      where: {
        ...(filter.universityId ? { universityId: filter.universityId } : {}),
        ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
        ...(filter.year ? { year: filter.year } : {}),
      },
      include: {
        university: true,
        subject: true,
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((b) => ({
      id: b.id,
      title: b.title,
      year: b.year,
      price: Number(b.price),
      questionCount: b._count.questions,
      university: b.university,
      subject: b.subject,
    }));
  }

  async getExamQuestions(examId: string) {
    const qs = await this.prisma.question.findMany({
      where: { bankId: examId, correctOptionId: { not: null } },
      include: { options: true },
      orderBy: { createdAt: "desc" },
    });

    return qs.map((q) => ({
      id: q.id,
      text: q.text,
      options: shuffle(q.options).map((o) => ({ id: o.id, text: o.text })),
    }));
  }

  async listBankQuestions(bankId: string) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } });
    if (!bank) throw new BadRequestException("Exam/Bank not found");

    const qs = await this.prisma.question.findMany({
      where: { bankId },
      include: { options: true },
      orderBy: { createdAt: "desc" },
    });

    return {
      bankId,
      questions: qs.map((q) => ({
        id: q.id,
        text: q.text,
        correctAnswerText: q.correctAnswerText,
        correctOptionId: q.correctOptionId,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
      })),
    };
  }

  async importQuestionsDirect(bankId: string, dto: ImportQuestionsDirectDto) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } });
    if (!bank) throw new BadRequestException("Exam/Bank not found");

    const created = await this.prisma.$transaction(async (tx) => {
      const result: { id: string }[] = [];

      for (const q of dto.questions) {
        const qText = normText(q.text);
        if (!qText) continue;

        const correctText = normText(q.correctAnswerText || "");

        const rawOptions = (q.options || []).map((o) => normText(o.text)).filter(Boolean);
        if (rawOptions.length < 2) continue;

        const seen = new Set<string>();
        const options: string[] = [];
        for (const ot of rawOptions.slice(0, 5)) {
          const k = normKey(ot);
          if (seen.has(k)) continue;
          seen.add(k);
          options.push(ot);
        }
        if (options.length < 2) continue;

        let correctInOptions: string | null = null;
        if (correctText) {
          const found = options.find((ot) => normKey(ot) === normKey(correctText));
          if (!found) {
            throw new BadRequestException(`Correct answer not found in options: "${correctText}"`);
          }
          correctInOptions = found;
        }

        const question = await tx.question.create({
          data: {
            bankId,
            text: qText,
            correctAnswerText: correctInOptions,
            correctOptionId: null,
          },
        });

        let correctOptionId: string | null = null;

        for (const ot of options) {
          const createdOpt = await tx.questionOption.create({
            data: { questionId: question.id, text: ot },
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

        result.push({ id: question.id });
      }

      return result;
    });

    return { count: created.length, questions: created };
  }

  async createQuestion(bankId: string, dto: CreateQuestionDto) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } });
    if (!bank) throw new BadRequestException("Exam/Bank not found");

    const qText = normText(dto.text);
    if (!qText) throw new BadRequestException("Question text is required");

    const rawOptions = (dto.options || []).map((o) => normText(o.text)).filter(Boolean);
    if (rawOptions.length < 2) throw new BadRequestException("Minimum 2 variant olmalıdır.");

    const seen = new Set<string>();
    const options: string[] = [];
    for (const ot of rawOptions.slice(0, 5)) {
      const k = normKey(ot);
      if (seen.has(k)) continue;
      seen.add(k);
      options.push(ot);
    }
    if (options.length < 2) throw new BadRequestException("Minimum 2 unikal variant olmalıdır.");

    let correctInOptions: string | null = null;
    const desiredCorrect = dto.correctAnswerText ? normText(dto.correctAnswerText) : "";
    if (desiredCorrect) {
      const found = options.find((ot) => normKey(ot) === normKey(desiredCorrect));
      if (!found) throw new BadRequestException("Doğru cavab mətni variantların içində olmalıdır.");
      correctInOptions = found;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          bankId,
          text: qText,
          correctAnswerText: correctInOptions,
          correctOptionId: null,
        },
      });

      let correctOptionId: string | null = null;

      for (const ot of options) {
        const createdOpt = await tx.questionOption.create({
          data: { questionId: question.id, text: ot },
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

      const full = await tx.question.findUnique({
        where: { id: question.id },
        include: { options: true },
      });

      return full!;
    });

    return {
      id: created.id,
      text: created.text,
      correctAnswerText: created.correctAnswerText,
      correctOptionId: created.correctOptionId,
      options: created.options.map((o) => ({ id: o.id, text: o.text })),
    };
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto) {
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    });
    if (!existing) throw new BadRequestException("Question not found");

    const newText = dto.text !== undefined ? normText(dto.text) : undefined;

    const optionsProvided = Array.isArray(dto.options);

    const newCorrectText = dto.correctAnswerText !== undefined ? normText(dto.correctAnswerText) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (newText !== undefined) {
        if (!newText) throw new BadRequestException("Question text cannot be empty");
        await tx.question.update({
          where: { id: questionId },
          data: { text: newText },
        });
      }

      if (optionsProvided) {
        const raw = (dto.options || []).map((o) => normText(o.text)).filter(Boolean);
        if (raw.length < 2) throw new BadRequestException("Minimum 2 variant olmalıdır.");

        const seen = new Set<string>();
        const finalOptions: string[] = [];
        for (const ot of raw.slice(0, 5)) {
          const k = normKey(ot);
          if (seen.has(k)) continue;
          seen.add(k);
          finalOptions.push(ot);
        }
        if (finalOptions.length < 2) throw new BadRequestException("Minimum 2 unikal variant olmalıdır.");

        await tx.questionOption.deleteMany({ where: { questionId } });

        let createdCorrectOptionId: string | null = null;

        for (const ot of finalOptions) {
          const createdOpt = await tx.questionOption.create({
            data: { questionId, text: ot },
          });

          if (newCorrectText && normKey(createdOpt.text) === normKey(newCorrectText)) {
            createdCorrectOptionId = createdOpt.id;
          }
        }

        if (newCorrectText && !createdCorrectOptionId) {
          throw new BadRequestException("correctAnswerText option-ların içində olmalıdır.");
        }

        await tx.question.update({
          where: { id: questionId },
          data: {
            correctAnswerText: newCorrectText !== undefined ? (newCorrectText || null) : existing.correctAnswerText,
            correctOptionId:
              newCorrectText !== undefined
                ? (createdCorrectOptionId || null)
                : existing.correctOptionId,
          },
        });
      } else {
        if (newCorrectText !== undefined) {
          if (newCorrectText) {
            const match = existing.options.find((o) => normKey(o.text) === normKey(newCorrectText));
            if (!match) throw new BadRequestException("correctAnswerText mövcud variantların içində olmalıdır.");
            await tx.question.update({
              where: { id: questionId },
              data: {
                correctAnswerText: newCorrectText,
                correctOptionId: match.id,
              },
            });
          } else {
            await tx.question.update({
              where: { id: questionId },
              data: {
                correctAnswerText: null,
                correctOptionId: null,
              },
            });
          }
        }
      }

      const full = await tx.question.findUnique({
        where: { id: questionId },
        include: { options: true },
      });

      return full!;
    });

    return {
      id: updated.id,
      text: updated.text,
      correctAnswerText: updated.correctAnswerText,
      correctOptionId: updated.correctOptionId,
      options: updated.options.map((o) => ({ id: o.id, text: o.text })),
    };
  }

  async deleteQuestion(questionId: string) {
    const q = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!q) throw new BadRequestException("Question not found");

    await this.prisma.question.delete({ where: { id: questionId } });
    return { ok: true };
  }

  async deleteBank(bankId: string) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id: bankId } });
    if (!bank) throw new BadRequestException("Exam/Bank not found");

    await this.prisma.questionBank.delete({ where: { id: bankId } });
    return { ok: true };
  }
}
