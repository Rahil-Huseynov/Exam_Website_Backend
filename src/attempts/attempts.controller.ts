import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { AttemptsService } from "./attempts.service";
import { CreateAttemptDto } from "./dto/create-attempt.dto";
import { AnswerDto } from "./dto/answer.dto";

@Controller()
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post("banks/:bankId/attempts")
  async createAttempt(@Param("bankId") bankId: string, @Body() dto: CreateAttemptDto) {
    return this.attempts.createAttempt(bankId, Number(dto.userId));
  }

  @Post("attempts/:attemptId/answer")
  async answer(@Param("attemptId") attemptId: string, @Body() dto: AnswerDto) {
    return this.attempts.answer(attemptId, dto.questionId, dto.selectedOptionId);
  }

  @Post("attempts/:attemptId/finish")
  async finish(@Param("attemptId") attemptId: string) {
    return this.attempts.finish(attemptId);
  }

  @Get("attempts/:attemptId/summary")
  async summary(@Param("attemptId") attemptId: string) {
    return this.attempts.summary(attemptId);
  }

  @Get("attempts/:attemptId/answers")
  async answers(@Param("attemptId") attemptId: string) {
    const answers = await this.attempts.attemptAnswers(attemptId);
    return { answers };
  }
}
