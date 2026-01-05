import { Body, Controller, Post, UsePipes, ValidationPipe } from "@nestjs/common"
import { ContactDto } from "./dto/contact.dto"
import { EmailsService } from "./emails.service"

@Controller("emails")
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Post("contact")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async contact(@Body() dto: ContactDto) {
    await this.emailsService.sendContactEmail(dto)
    return { ok: true, message: "Contact message sent" }
  }
}
