import {
  Body,
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EmailService } from './email.service';
import { SendEmailDto } from './dto/send-email.dto';

@Controller('emails')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @UsePipes(new ValidationPipe({ transform: true }))
  @UseInterceptors(FilesInterceptor('attachments', 10, { storage: memoryStorage() }))
  async sendEmail(@Body() body: any, @UploadedFiles() files?: Express.Multer.File[]) {
    const recipients = this.normalizeRecipients(body.recipients);
    if (!recipients.length) throw new BadRequestException('Recipients are required');

    const context = body.context || {
      title: body.subject || 'No title',
      body: body.message || '',
    };

    const dto: SendEmailDto = {
      subject: body.subject,
      message: body.message,
      context,
      recipients,
    };

    return this.emailService.sendMail(dto, files);
  }

  private normalizeRecipients(recipients: any): string[] {
    if (!recipients) return [];
    if (Array.isArray(recipients)) return recipients;
    if (typeof recipients === 'string') {
      try {
        const parsed = JSON.parse(recipients);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return recipients.split(/[;,\s]+/).filter(Boolean);
      }
    }
    return [];
  }
}
