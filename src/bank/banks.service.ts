import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service" // öz path-ini yaz

@Injectable()
export class BanksService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    return this.prisma.questionBank.findUnique({
      where: { id },
      include: {
        university: true,
        subject: true,
        topic: true,
        _count: {
          select: { questions: true },
        },
      },
    })
  }
}