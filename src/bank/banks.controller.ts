import {
  Controller,
  Get,
  Param,
  NotFoundException,
} from "@nestjs/common"
import { BanksService } from "./banks.service"

@Controller("banks")
export class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Get(":id")
  async getOne(@Param("id") id: string) {
    const bank = await this.banks.findOne(id)
    if (!bank) {
      throw new NotFoundException("Exam / bank not found")
    }
    return bank
  }
}