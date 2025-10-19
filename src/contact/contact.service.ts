import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { ContactDto } from './dto/contact.dto';

const PRIMARY_COLOR = '#0f6fff'; 
const SECONDARY_COLOR = '#f6f8fb';
const TEXT_COLOR = '#111827';
const MUTED_COLOR = '#6b7280';
const BORDER_COLOR = '#e6e9ee';
const CARD_BG = '#ffffff';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: Number(this.config.get<number>('SMTP_PORT') || 587),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  private isValidEmail(email?: string) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private escape(input?: string) {
    if (!input) return '';
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private getBaseTemplate(content: string, title: string) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${title}</title>
          <style>
            /* Use a modern system font stack; many email clients will fall back to system fonts */
            :root{
              --primary: ${PRIMARY_COLOR};
              --bg: ${SECONDARY_COLOR};
              --card: ${CARD_BG};
              --text: ${TEXT_COLOR};
              --muted: ${MUTED_COLOR};
              --border: ${BORDER_COLOR};
            }
            html,body{
              margin:0;
              padding:0;
              background: var(--bg);
              -webkit-font-smoothing:antialiased;
              -moz-osx-font-smoothing:grayscale;
              font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
              color: var(--text);
            }
            .outer {
              width:100%;
              padding:28px 16px;
              box-sizing:border-box;
            }
            .container {
              max-width: 680px;
              margin: 0 auto;
              background: var(--card);
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 8px 30px rgba(17,24,39,0.06);
              border: 1px solid rgba(17,24,39,0.04);
            }
            .header {
              padding: 36px 28px;
              text-align: center;
              background: linear-gradient(180deg, rgba(15,111,255,0.08), rgba(15,111,255,0.03));
            }
            .logo {
              display:block;
              margin: 0 auto 12px;
              width: 140px;
              max-width: 45%;
              height: auto;
            }
            .h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 700;
              color: var(--text);
              letter-spacing: -0.2px;
            }
            .sub {
              margin-top:8px;
              font-size: 14px;
              color: var(--muted);
            }
            .content {
              padding: 30px 28px;
              line-height: 1.6;
              font-size: 16px;
            }
            .lead {
              font-size: 16px;
              color: var(--text);
              margin-bottom:18px;
            }
            .data-table {
              width:100%;
              border-collapse:collapse;
              margin: 14px 0 22px;
            }
            .data-table th, .data-table td {
              text-align:left;
              padding:12px 10px;
              border-bottom: 1px solid var(--border);
              vertical-align: top;
              font-size:15px;
            }
            .data-table th {
              width:160px;
              background: transparent;
              color: var(--muted);
              font-weight: 600;
            }
            .message-box {
              background: #f8fafc;
              padding:16px;
              border-radius:8px;
              border:1px solid var(--border);
              font-size:15px;
              color: var(--text);
            }
            .footer {
              padding: 18px 20px;
              background: #fafbfd;
              border-top: 1px solid var(--border);
              text-align:center;
              font-size:13px;
              color: var(--muted);
            }
            a.cta {
              display:inline-block;
              margin-top:18px;
              background: var(--primary);
              color: #fff;
              text-decoration:none;
              padding:10px 18px;
              border-radius:8px;
              font-weight:600;
              font-size:15px;
            }
            @media (max-width:480px){
              .container{ border-radius:10px; }
              .header{ padding:24px 18px; }
              .content{ padding:20px 16px; }
              .h1{ font-size:22px; }
              .data-table th{ width:120px; font-size:14px; }
            }
          </style>
      </head>
      <body>
        <div class="outer">
          <div class="container">
            ${content}
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getOwnerEmailHtml(payload: ContactDto) {
    const escapedName = this.escape(payload.name);
    const escapedEmail = this.escape(payload.email);
    const escapedPhone = this.escape(payload.phone || '—');
    const escapedSubject = this.escape(payload.subject);
    const escapedMessage = this.escape(payload.message).replace(/\n/g, '<br/>');

    const content = `
      <div class="header">
        <img class="logo" src="https://i.ibb.co/RkLLwNWP/4.png" alt="logo" />
        <h1 class="h1">New Contact Form Submission</h1>
        <div class="sub">A new message was submitted through your website contact form.</div>
      </div>

      <div class="content">
        <p class="lead">Details from the submission are below:</p>

        <table class="data-table" cellspacing="0" cellpadding="0" role="presentation">
          <tr>
            <th>Name</th>
            <td>${escapedName}</td>
          </tr>
          <tr>
            <th>Email</th>
            <td><a href="mailto:${escapedEmail}" style="color:${PRIMARY_COLOR}; text-decoration:none;">${escapedEmail}</a></td>
          </tr>
          <tr>
            <th>Phone</th>
            <td>${escapedPhone}</td>
          </tr>
          <tr>
            <th>Subject</th>
            <td>${escapedSubject}</td>
          </tr>
        </table>

        <p style="font-weight:600; margin:0 0 8px;">Message</p>
        <div class="message-box">${escapedMessage}</div>

        <!-- Optional CTA (mail owner or view in dashboard) -->
        <div style="margin-top:20px; text-align:left;">
          <a class="cta" href="mailto:${escapedEmail}?subject=Re:${encodeURIComponent(escapedSubject)}">Reply to sender</a>
        </div>
      </div>

      <div class="footer">
        This email was sent automatically via your contact form.
      </div>
    `;

    return this.getBaseTemplate(content, `New Contact: ${payload.subject}`);
  }

  private getUserEmailHtml(payload: ContactDto) {
    const escapedName = this.escape(payload.name);
    const escapedMessage = this.escape(payload.message).replace(/\n/g, '<br/>');

    const content = `
      <div class="header">
        <img class="logo" src="https://i.ibb.co/RkLLwNWP/4.png" alt="logo" />
        <h1 class="h1">Thanks for contacting us!</h1>
        <div class="sub">We received your message and will reply as soon as possible.</div>
      </div>

      <div class="content">
        <p class="lead">Hello ${escapedName},</p>

        <p>Thanks for reaching out. Below is a copy of your message for your records:</p>

        <div style="margin-top:10px;">
          <p style="font-weight:600; margin:0 0 8px; color:${PRIMARY_COLOR};">Your message</p>
          <div class="message-box">${escapedMessage}</div>
        </div>

        <p style="margin-top:18px;">If you need to add more information, simply reply to this email or contact us via our website.</p>

        <p style="margin-top:20px; font-weight:600;">Best regards,<br/>Carify.pl Team</p>
      </div>

      <div class="footer">
        This is an automated response. Please do not reply to this address.
      </div>
    `;

    return this.getBaseTemplate(content, `Thank You: ${payload.subject}`);
  }

  async sendContactEmail(payload: ContactDto) {
    const siteOwnerRaw = this.config.get<string>('TO_EMAIL') || '';
    const siteOwnerList = siteOwnerRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (siteOwnerList.length === 0) {
      this.logger.error('No site owner (TO_EMAIL) configured, and fallback failed.');
      throw new BadRequestException('No recipient configured for the site owner.');
    }

    const mailFrom =
      this.config.get<string>('SMTP_FROM') ||
      this.config.get<string>('SMTP_USER') ||
      'no-reply@example.com';

    const ownerMailHtml = this.getOwnerEmailHtml(payload);
    const userMailHtml = this.getUserEmailHtml(payload);
    const ownerMail = {
      from: mailFrom,
      to: siteOwnerList.join(', '),
      subject: `New Contact Message: ${payload.subject}`,
      html: ownerMailHtml,
    };
    const userMail = {
      from: mailFrom,
      to: payload.email,
      subject: `Thank You for Contacting Us — ${payload.subject}`,
      html: userMailHtml,
    };

    try {
      await this.transporter.verify();
      this.logger.log(`SMTP transport OK. Sending to owner: ${ownerMail.to}`);
      const ownerInfo = await this.transporter.sendMail(ownerMail);
      this.logger.log(`Owner mail sent: ${ownerInfo.messageId}`);
      if (this.isValidEmail(payload.email)) {
        const userInfo = await this.transporter.sendMail(userMail);
        this.logger.log(`User confirmation mail sent: ${userInfo.messageId}`);
      } else {
        this.logger.warn(`Skipping user confirmation because invalid email: ${payload.email}`);
      }
      return { ok: true };
    } catch (err) {
      this.logger.error('Failed to send contact emails', err as any);
      throw err;
    }
  }
}
