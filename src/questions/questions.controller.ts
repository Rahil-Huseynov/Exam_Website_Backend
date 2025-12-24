import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { QuestionsService } from "./questions.service";
import { CreateExamDto } from "./dto/create-exam.dto";
import { ImportQuestionsDirectDto } from "./dto/import-direct.dto";
import { UpdateQuestionDto } from "./dto/update-question.dto";
import { CreateQuestionDto } from "./dto/create-question.dto";

@Controller("questions")
export class QuestionsController {
  constructor(private qs: QuestionsService) {}

  @Get("universities")
  async getUniversities() {
    return this.qs.listUniversities();
  }

  @Post("university")
  async createUniversity(
    @Body()
    body: { name: string; nameAz?: string; nameEn?: string; nameRu?: string; logo?: string | null },
  ) {
    return this.qs.createUniversity(body);
  }

  @Get("subjects")
  async getSubjects() {
    return this.qs.listSubjects();
  }

  @Post("subject")
  async createSubject(@Body() body: { name: string; nameAz?: string; nameEn?: string; nameRu?: string }) {
    return this.qs.createSubject(body);
  }

  @Get("exams")
  async getExams(
    @Query("universityId") universityId?: string,
    @Query("subjectId") subjectId?: string,
    @Query("year") year?: string,
  ) {
    return this.qs.getExams({
      universityId,
      subjectId,
      year: year ? Number(year) : undefined,
    });
  }

  @Post("exam")
  async createExam(@Body() dto: CreateExamDto) {
    return this.qs.createExam(dto);
  }

  @Get("exam/:examId")
  async getExamQuestions(@Param("examId") examId: string) {
    return this.qs.getExamQuestions(examId);
  }

  @Get("bank/:bankId/questions")
  async listBankQuestions(@Param("bankId") bankId: string) {
    return this.qs.listBankQuestions(bankId);
  }

  @Post("bank/:bankId/question")
  async createQuestion(@Param("bankId") bankId: string, @Body() dto: CreateQuestionDto) {
    return this.qs.createQuestion(bankId, dto);
  }

  @Post("bank/:bankId/questions")
  async createQuestionAlias(@Param("bankId") bankId: string, @Body() dto: CreateQuestionDto) {
    return this.qs.createQuestion(bankId, dto);
  }

  @Patch("question/:questionId")
  async updateQuestion(@Param("questionId") questionId: string, @Body() dto: UpdateQuestionDto) {
    return this.qs.updateQuestion(questionId, dto);
  }

  @Delete("question/:questionId")
  async deleteQuestion(@Param("questionId") questionId: string) {
    return this.qs.deleteQuestion(questionId);
  }
  @Delete("bank/:bankId")
  async deleteBank(@Param("bankId") bankId: string) {
    return this.qs.deleteBank(bankId);
  }
}

@Controller()
export class BankQuestionsController {
  constructor(private qs: QuestionsService) {}

  @Post("banks/:bankId/questions/import-direct")
  async importDirect(@Param("bankId") bankId: string, @Body() dto: ImportQuestionsDirectDto) {
    return this.qs.importQuestionsDirect(bankId, dto);
  }
}
