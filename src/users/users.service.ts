import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException("User not found");
    return user;
  }

  async getBalance(userId: number) {
    const user = await this.getUser(userId);
    return { userId: user.id, balance: user.balance };
  }

  async addBalance(userId: number, amount: number) {
    const user = await this.getUser(userId);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { balance: user.balance + amount },
      select: { id: true, balance: true },
    });
    return updated;
  }
}
