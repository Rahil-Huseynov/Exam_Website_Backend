import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  BadRequestException,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common"
import { AttemptsService } from "./attempts.service"
import { CreateAttemptDto } from "./dto/create-attempt.dto"
import { AnswerDto } from "./dto/answer.dto"
import { CreateAttemptWithTokenDto } from "./dto/create-attempt-with-token.dto"
import { RevokeTokenDto } from "./dto/revoke-token.dto"

import { JwtGuard } from "../auth/guard"

@Controller()
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Get("users/:userId/attempts")
  async userAttempts(
    @Param("userId") userId: string,
    @Query("status") status?: "FINISHED" | "IN_PROGRESS",
  ) {
    const uid = Number(userId)
    if (!userId || Number.isNaN(uid)) throw new BadRequestException("userId is required")

    const attempts = await this.attempts.userAttempts(uid, status)
    return { attempts }
  }

  @Post("banks/:bankId/exam-token")
  async createExamToken(@Param("bankId") bankId: string, @Body() dto: CreateAttemptDto) {
    if (dto.userId == null || Number.isNaN(Number(dto.userId))) {
      throw new BadRequestException("userId is required")
    }

    const { token, expiresAt } = await this.attempts.createOneTimeExamToken(bankId, Number(dto.userId), 10)
    return { ok: true, token, expiresAt, url: `/exam-token/${token}` }
  }

  @Post("banks/:bankId/attempts")
  async createAttempt(@Param("bankId") bankId: string, @Body() dto: CreateAttemptWithTokenDto) {
    if (dto.userId == null || Number.isNaN(Number(dto.userId))) {
      throw new BadRequestException("userId is required")
    }
    if (!dto.token) throw new BadRequestException("Exam token is required")

    const result = await this.attempts.createAttemptWithToken(bankId, Number(dto.userId), dto.token)

    return {
      attemptId: result.attempt.id,
      remainingBalance: result.remainingBalance,
    }
  }

  @Get("attempts/:attemptId/questions")
  async attemptQuestions(@Param("attemptId") attemptId: string, @Query("userId") userId?: string) {
    const uid = Number(userId)
    if (!userId || Number.isNaN(uid)) throw new BadRequestException("userId is required")

    const questions = await this.attempts.getAttemptQuestions(attemptId, uid)
    return { questions }
  }

  @Post("banks/:bankId/exam-token/revoke")
  async revokeExamToken(@Param("bankId") bankId: string, @Body() dto: RevokeTokenDto) {
    if (dto.userId == null || Number.isNaN(Number(dto.userId))) {
      throw new BadRequestException("userId is required")
    }
    if (!dto.token) throw new BadRequestException("token is required")

    const count = await this.attempts.revokeToken(bankId, Number(dto.userId), dto.token)
    return { ok: true, revoked: count > 0 }
  }

  @Post("banks/:bankId/exam-token/delete")
  async deleteExamToken(@Param("bankId") bankId: string, @Body() dto: RevokeTokenDto) {
    if (dto.userId == null || Number.isNaN(Number(dto.userId))) {
      throw new BadRequestException("userId is required")
    }
    if (!dto.token) throw new BadRequestException("token is required")

    const count = await this.attempts.deleteToken(bankId, Number(dto.userId), dto.token)
    return { ok: true, deleted: count > 0 }
  }

  @Post("attempts/:attemptId/answer")
  async answer(@Param("attemptId") attemptId: string, @Body() dto: AnswerDto) {
    return this.attempts.answer(attemptId, dto.questionId, dto.selectedOptionId)
  }

  @Post("attempts/:attemptId/finish")
  async finish(@Param("attemptId") attemptId: string) {
    const row = await this.attempts.finish(attemptId)

    return {
      attemptId: row.attemptId,
      status: row.status,
      score: row.score,
      total: row.total,
      stats: {
        answered: row.answered,
        correct: row.correct,
        wrong: row.wrong,
        unanswered: row.unanswered,
      },
    }
  }

  @Get("attempts/:attemptId/summary")
  async summary(@Param("attemptId") attemptId: string) {
    return this.attempts.summary(attemptId)
  }

  @Get("attempts/:attemptId/answers")
  async answers(@Param("attemptId") attemptId: string) {
    const answers = await this.attempts.attemptAnswers(attemptId)
    return { answers }
  }

  @Get("attempts/:attemptId/review")
  async review(@Param("attemptId") attemptId: string, @Query("userId") userId?: string) {
    const uid = Number(userId)
    if (!userId || Number.isNaN(uid)) throw new BadRequestException("userId is required")
    return this.attempts.reviewAttempt(attemptId, uid)
  }

  @UseGuards(JwtGuard)
  @Get("me/balance-history")
  async myBalanceHistory(
    @Req() req,
    @Query("page") page = "1",
    @Query("limit") limit = "20",
  ) {
    const userId = Number(req.user?.sub ?? req.user?.id)
    if (!userId || Number.isNaN(userId)) throw new BadRequestException("userId not found in token")

    const p = Math.max(1, parseInt(page, 10) || 1)
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))

    return this.attempts.balanceHistory(userId, p, l)
  }
}
