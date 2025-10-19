import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { SendEmailDto } from './dto/send-email.dto';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: Number(this.config.get<string>('SMTP_PORT') || 587),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  private buildEmailTemplate(
    subject: string,
    context: SendEmailDto['context'],
    message: string,
  ): string {
    const year = new Date().getFullYear();
    const { title, body, button } = context;

    return `
      <!DOCTYPE html>
      <html lang="az">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
              body { margin: 0; padding: 0; background-color: #f4f7f6; font-family: Arial, sans-serif; }
              table { border-collapse: collapse; width: 100%; }
              td { padding: 0; }
          </style>
      </head>
      <body>
          <table style="max-width="800px; background-color: #f4f7f6; padding: 40px 0;">
              <tr style="max-width="800px">
                  <td align="center">
                      <table style="max-width: 800px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                          <tr>
                              <td style="background: linear-gradient(360deg, #fafafa 0%, #e5e5e5 100%); padding: 40px 30px; text-align: center;">
                                  <img class="logo" src="https://i.ibb.co/RkLLwNWP/4.png" alt="logo" />
                                  <h1 style="margin: 0; font-size: 26px;">You have a new message</h1>
                              </td>
                          </tr>
                          <tr>
                              <td style="padding: 40px; color: #333333; font-size: 16px; line-height: 1.7;">
                                  <h2 style="font-size: 22px;">${title}</h2>
                                  <div>${body}</div>
                                  ${
                                    button
                                      ? `<div style="margin-top: 30px; text-align:center;">
                                             <a href="${button.link}" style="padding: 12px 25px; background:#007bff; color:#fff; text-decoration:none; border-radius:5px; font-weight:bold;">
                                               ${button.text}
                                             </a>
                                         </div>`
                                      : ''
                                  }
                                  <p style="margin-top:30px;">Best regards,<br>Carify.pl Team</p>
                              </td>
                          </tr>
                          <tr>
                              <td style="background-color: #f9f9f9; color: #888888; text-align: center; padding: 20px; font-size: 12px;">
                                  &copy; ${year} Carify.pl | All rights reserved.
                              </td>
                          </tr>
                      </table>
                  </td>
              </tr>
          </table>
      </body>
      </html>
    `;
  }

  async sendMail(dto: SendEmailDto, files?: Express.Multer.File[]) {
    try {
      const attachments = (files || []).map(file => ({
        filename: file.originalname,
        content: file.buffer,
        contentType: file.mimetype,
      }));

      const htmlContent = this.buildEmailTemplate(dto.subject, dto.context, dto.message ?? dto.context.title);

      const textContent = `${dto.context.title}\n\n${dto.context.body.replace(/<[^>]+>/g, '')}\n\n${
        dto.context.button ? `${dto.context.button.text}: ${dto.context.button.link}` : ''
      }`;

      const mailOptions = {
        to: dto.recipients.join(', '),
        subject: dto.subject,
        text: textContent,
        html: htmlContent,
        attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent: ${info.messageId}`);
      return { success: true, info };
    } catch (error) {
      this.logger.error('Email send failed', error);
      throw new InternalServerErrorException('Failed to send email');
    }
  }
}
