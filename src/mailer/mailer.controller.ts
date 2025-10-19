import { Controller, Post, HttpException, HttpStatus, Body } from "@nestjs/common"
import { MailerService } from "./mailer.service"
import { SendEmailDto } from "./dto/send-email.dto"

@Controller("api/send-email")
export class MailerController {
    constructor(private readonly mailerService: MailerService) { }

    @Post()
    async sendEmail(@Body() body: SendEmailDto) {
        try {
            if (body.carTitle && body.from && body.message) {
                await this.mailerService.sendCarInquiry({
                    to: body.to,
                    carTitle: body.carTitle,
                    name: body.name,
                    sellerName: body.sellerName,
                    from: body.from,
                    phone: body.phone,
                    message: body.message,
                })
            } else {
                await this.mailerService.sendMail(body.to, body.subject, body.message)
            }

            return {
                success: true,
                message: "Email uğurla göndərildi 🚀"
            }
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    message: "Email göndərilməsində xəta",
                    error: error.message,
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
            )
        }
    }
}