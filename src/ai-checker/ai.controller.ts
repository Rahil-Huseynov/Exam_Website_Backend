import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('question')
  async createQuestion(@Body() body: any) {
    const { bankId, prompt, title, answerKey, adminId } = body;
    return this.aiService.createQuestion(bankId, prompt, title, answerKey, adminId);
  }

  @Put('question/:id')
  async updateQuestion(@Param('id') id: string, @Body() body: any) {
    const { prompt, title, answerKey } = body;
    return this.aiService.updateQuestion(id, prompt, title, answerKey);
  }

  @Delete('question/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteQuestion(@Param('id') id: string) {
    await this.aiService.deleteQuestion(id);
    return;
  }

  @Get('questions')
  async getAll() {
    return this.aiService.getAllQuestions();
  }

  @Get('question/:id')
  async getOne(@Param('id') id: string) {
    return this.aiService.getQuestion(id);
  }

  @Post('submit')
  async submitAnswer(@Body() body: any) {
    const { userId, questionId, studentTextAnswer } = body;
    return this.aiService.submitTextAnswer(userId, questionId, studentTextAnswer);
  }

  @Get('result/checked/:id')
  async getResultChecked(@Param('id') id: string) {
    return this.aiService.getResultByCheckedId(id);
  }

  @Get('result/attempt/:id')
  async getResultAttempt(@Param('id') id: string) {
    return this.aiService.getResultByAttemptId(id);
  }

  @Post('recheck/checked/:id')
  async recheck(@Param('id') id: string) {
    return this.aiService.recheckAnswerByCheckedId(id);
  }
}
