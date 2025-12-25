import { Controller, Get, Param } from "@nestjs/common";
import { AttemptsService } from "./attempts.service";

@Controller()
export class UsersAttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Get("users/:userId/attempts")
  async userAttempts(@Param("userId") userId: string) {
    const rows = await this.attempts.userAttempts(Number(userId));

    const attempts = rows.map((a: any) => ({
      ...a,
      completedAt: a.finishedAt ?? null,
      totalQuestions: a.total ?? null,
      exam: {
        id: a.bank?.id,
        title: a.bank?.title ?? a.bank?.name,
        price: a.bank?.price != null ? Number(a.bank.price) : 0,
        year: a.bank?.year,
      },
    }));

    return { attempts };
  }
}
