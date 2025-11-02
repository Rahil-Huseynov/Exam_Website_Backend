import { Injectable } from "@nestjs/common"
import { MailerService as NestMailerService } from "@nestjs-modules/mailer"
import { join } from "path"

@Injectable()
export class MailerService {
  constructor(private readonly nestMailer: NestMailerService) { }

  async sendCarInquiry(data: {
    to: string
    carTitle: string
    name: string | undefined
    from: string
    phone: string | undefined
    sellerName: string
    message: string
  }) {
    const subject = `Car Inquiry: ${data.carTitle}`

    const html = this.generateCarInquiryTemplate({
      subject,
      message: data.message,
      name: data.name ?? "",
      sellerName: data.sellerName,
      email: data.from,
      phone: data.phone,
      carTitle: data.carTitle,
    })
    const logoPath = join(process.cwd(), 'public', 'Logo', 'carifypl.png');

    return await this.nestMailer.sendMail({
      to: data.to,
      subject,
      html,
      attachments: [
        {
          filename: 'carifypl.png',
          path: logoPath,
          cid: 'carify-logo'
        }
      ],

    })
  }

  async sendMail(to: string, subject: string, message: string, context?: Record<string, any>) {
    const html = this.generateModernEmailTemplate(subject, message, context)
    const logoPath = join(process.cwd(), 'public', 'Logo', 'carifypl.png');

    return await this.nestMailer.sendMail({
      to,
      subject,
      html,
      attachments: [
        {
          filename: 'carifypl.png',
          path: logoPath,
          cid: 'carify-logo'
        }
      ],


    })
  }

  private generateCarInquiryTemplate(data: {
    subject: string
    message: string
    name: string
    sellerName: string
    email: string
    phone?: string
    carTitle: string
  }): string {
    return `

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="width: 100%; background-color: #f5f5f5; padding: 20px 0;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      
      <div style="background: linear-gradient(360deg, #fafafa 0%, #e5e5e5 100%); padding: 40px 30px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;"><img style="width: 130px;" src="cid:carify-logo" alt="4"></h1>
      </div>

      <div style="padding: 40px 30px; color: #333333; line-height: 1.6;">
        <h2 style="color: #667eea; font-size: 22px; margin-top: 0; margin-bottom: 20px; font-weight: 600;">${data.subject}</h2>
        
        <p style="margin: 0 0 16px 0; font-size: 16px; color: #555555;">Hello <strong>${data.sellerName}</strong>,</p>
        
        <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 24px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 15px; color: #333333; white-space: pre-wrap;">${data.message}</p>
        </div>

        <div style="height: 1px; background-color: #e9ecef; margin: 32px 0;"></div>
        
        <h3 style="color: #667eea; font-size: 18px; margin-bottom: 16px; font-weight: 600;">📋 Contact Information</h3>
        <div style="margin: 24px 0;">
          <div style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: 600; color: #667eea; display: inline-block; width: 120px;">Name:</span>
            <span style="color: #333333;">${data.name}</span>
          </div>
          <div style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: 600; color: #667eea; display: inline-block; width: 120px;">Email:</span>
            <span style="color: #333333;">${data.email}</span>
          </div>
          ${data.phone
        ? `
          <div style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: 600; color: #667eea; display: inline-block; width: 120px;">Phone:</span>
            <span style="color: #333333;">${data.phone}</span>
          </div>
          `
        : ""
      }
          <div style="padding: 12px 0;">
            <span style="font-weight: 600; color: #667eea; display: inline-block; width: 120px;">Car:</span>
            <span style="color: #333333;">${data.carTitle}</span>
          </div>
        </div>

        <div style="height: 1px; background-color: #e9ecef; margin: 32px 0;"></div>
        
        <p style="font-size: 14px; color: #6c757d; margin: 0;">This message was sent automatically. Please contact the sender directly to reply.</p>
      </div>

      <div style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
        <p style="font-size: 12px; color: #999; margin-top: 20px;">© ${new Date().getFullYear()} Carify.pl | All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `
  }

  private generateModernEmailTemplate(subject: string, message: string, context?: Record<string, any>): string {
    const contextRows = context
      ? Object.entries(context)
        .map(
          ([key, value]) => `
          <div style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
            <span style="font-weight: 600; color: #667eea; display: inline-block; width: 120px;">${key}:</span>
            <span style="color: #333333;">${value}</span>
          </div>
        `,
        )
        .join("")
      : ""

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="width: 100%; background-color: #f5f5f5; padding: 20px 0;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">✉️ ${subject}</h1>
      </div>

      <div style="padding: 40px 30px; color: #333333; line-height: 1.6;">
        <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 24px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 15px; color: #333333; white-space: pre-wrap;">${message}</p>
        </div>

        ${contextRows
        ? `
        <div style="height: 1px; background-color: #e9ecef; margin: 32px 0;"></div>
        <h3 style="color: #667eea; font-size: 18px; margin-bottom: 16px; font-weight: 600;">Additional Information</h3>
        <div style="margin: 24px 0;">
          ${contextRows}
        </div>
        `
        : ""
      }
      </div>

      <div style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
        <p style="margin: 8px 0; font-size: 14px; color: #6c757d; font-weight: 600;">Car Sales</p>
        <p style="font-size: 12px; color: #999; margin-top: 20px;">© ${new Date().getFullYear()} Car Sales. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>


    `
  }
}