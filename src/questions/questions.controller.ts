import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CommitQuestionsDto, CreateAttemptDto, AnswerDto } from "./dto";
import { QuestionsService } from "./questions.service";
import { AttemptsService } from "./attempts.service";

@Controller()
export class QuestionsController {
  constructor(private qs: QuestionsService, private attempts: AttemptsService) {}

  @Post("banks/:bankId/questions/commit")
  async commit(@Param("bankId") bankId: string, @Body() dto: CommitQuestionsDto) {
    return this.qs.commit(bankId, dto);
  }

  @Get("banks/:bankId/questions")
  async getQuiz(@Param("bankId") bankId: string, @Query("limit") limit?: string) {
    const questions = await this.qs.getQuizQuestions(bankId, limit ? Number(limit) : 20);
    return { questions };
  }

  @Post("banks/:bankId/attempts")
  async createAttempt(@Param("bankId") bankId: string, @Body() dto: CreateAttemptDto) {
    const attempt = await this.attempts.createAttempt(bankId, dto.userId);
    return { attemptId: attempt.id };
  }

  @Post("attempts/:attemptId/answer")
  async answer(@Param("attemptId") attemptId: string, @Body() dto: AnswerDto) {
    return this.attempts.answer(attemptId, dto.questionId, dto.selectedOptionId);
  }

  @Post("attempts/:attemptId/finish")
  async finish(@Param("attemptId") attemptId: string) {
    const a = await this.attempts.finish(attemptId);
    return { attemptId: a.id, status: a.status, score: a.score, total: a.total };
  }

  @Get("attempts/:attemptId/summary")
  async summary(@Param("attemptId") attemptId: string) {
    return this.attempts.summary(attemptId);
  }

  @Get("users/:userId/attempts")
  async userAttempts(@Param("userId") userId: string) {
    const attempts = await this.attempts.userAttempts(Number(userId));
    return { attempts };
  }

  @Get("attempts/:attemptId/answers")
  async attemptAnswers(@Param("attemptId") attemptId: string) {
    const answers = await this.attempts.attemptAnswers(attemptId);
    return { answers };
  }
}
