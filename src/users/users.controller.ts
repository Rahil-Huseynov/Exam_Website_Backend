import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { UsersService } from "./users.service";
import { AddBalanceDto } from "./user.dto";

@Controller("users")
export class UsersController {
  constructor(private users: UsersService) {}

  @Get(":userId/balance")
  async balance(@Param("userId") userId: string) {
    return this.users.getBalance(Number(userId));
  }

  // @Patch(":userId/balance/add")
  // async add(@Param("userId") userId: string, @Body() dto: AddBalanceDto) {
  //   const updated = await this.users.addBalance(Number(userId), dto.amount);
  //   return { userId: updated.id, balance: updated.balance };
  // }
}
