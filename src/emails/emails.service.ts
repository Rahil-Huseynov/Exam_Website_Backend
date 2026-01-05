import { Injectable, InternalServerErrorException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as nodemailer from "nodemailer"
import { ContactDto } from "./dto/contact.dto"

@Injectable()
export class EmailsService {
  constructor(private readonly config: ConfigService) {}

  private createTransporter() {
    const host = this.config.get<string>("SMTP_HOST")
    const port = Number(this.config.get<string>("SMTP_PORT"))
    const user = this.config.get<string>("SMTP_USER")
    const pass = this.config.get<string>("SMTP_PASS")

    if (!host || !port || !user || !pass) {
      throw new InternalServerErrorException("SMTP config is missing")
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })
  }

  private brand() {
    return {
      siteName: "ImtahanVer.net",
      siteUrl: this.config.get<string>("APP_URL") || "https://imtahanver.net",
      logoUrl: this.config.get<string>("BRAND_LOGO_URL") || "https://api.imtahanver.net/uploads/Logo.png",
      supportEmail: this.config.get<string>("CONTACT_TO_EMAIL") || "info@imtahanver.net",
    }
  }

  async sendContactEmail(dto: ContactDto) {
    const transporter = this.createTransporter()
    const b = this.brand()

    const adminTo = b.supportEmail
    const from = `"${b.siteName}" <${this.config.get<string>("SMTP_USER")}>`

    const adminSubject = `Yeni əlaqə mesajı: ${dto.name}`
    const adminHtml = this.renderAdminContactEmail(dto)

    const userSubject = "Mesajınız qəbul olundu ✅"
    const userHtml = this.renderUserAutoReplyEmail(dto.name)

    try {
      await transporter.sendMail({
        from,
        to: adminTo,
        replyTo: dto.email,
        subject: adminSubject,
        html: adminHtml,
      })

      await transporter.sendMail({
        from,
        to: dto.email,
        subject: userSubject,
        html: userHtml,
      })
    } catch (e: any) {
      throw new InternalServerErrorException(e?.message || "Failed to send email")
    }
  }

  private renderAdminContactEmail(dto: ContactDto) {
    const b = this.brand()
    const safeMessage = this.escapeHtml(dto.message).replace(/\n/g, "<br/>")
    const subjectLine = dto.subject?.trim() ? this.escapeHtml(dto.subject.trim()) : "Contact form"

    return `
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" style="max-width:680px;width:100%;border-collapse:collapse;background:#ffffff;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 22px;background:linear-gradient(135deg,#667eea 0%,#764ba2 50%,#22c55e 100%);">
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="vertical-align:middle;">
                    <a href="${b.siteUrl}" target="_blank" style="text-decoration:none;">
                      <img src="${b.logoUrl}" alt="${b.siteName} logo" style="height:40px;max-width:180px;display:block;border:0;" />
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;background:rgba(255,255,255,.18);color:#fff;padding:8px 12px;border-radius:999px;font-size:12px;font-weight:600;">
                      Yeni Contact Mesajı
                    </span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:18px 0 0;color:#fff;font-size:22px;line-height:1.3;font-weight:800;">
                ${b.siteName} — Contact Form
              </h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,.9);font-size:14px;line-height:1.6;">
                Aşağıdakı məlumatlarla yeni müraciət gəldi.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 28px;">
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:14px 16px;border:1px solid #e5e7eb;border-radius:14px;background:#f9fafb;">
                    <p style="margin:0;color:#111827;font-size:13px;font-weight:700;">Ad Soyad</p>
                    <p style="margin:6px 0 0;color:#374151;font-size:15px;">${this.escapeHtml(dto.name)}</p>
                  </td>
                </tr>
                <tr><td style="height:12px;"></td></tr>
                <tr>
                  <td style="padding:14px 16px;border:1px solid #e5e7eb;border-radius:14px;background:#f9fafb;">
                    <p style="margin:0;color:#111827;font-size:13px;font-weight:700;">E-mail</p>
                    <p style="margin:6px 0 0;color:#374151;font-size:15px;">
                      <a href="mailto:${this.escapeHtml(dto.email)}" style="color:#4f46e5;text-decoration:none;font-weight:700;">
                        ${this.escapeHtml(dto.email)}
                      </a>
                    </p>
                  </td>
                </tr>
                <tr><td style="height:12px;"></td></tr>
                <tr>
                  <td style="padding:14px 16px;border:1px solid #e5e7eb;border-radius:14px;background:#f9fafb;">
                    <p style="margin:0;color:#111827;font-size:13px;font-weight:700;">Mövzu</p>
                    <p style="margin:6px 0 0;color:#374151;font-size:15px;">${subjectLine}</p>
                  </td>
                </tr>
              </table>

              <div style="margin-top:16px;padding:18px 18px;border-radius:16px;background:linear-gradient(180deg,#ffffff 0%,#f9fafb 100%);border:1px solid #e5e7eb;">
                <p style="margin:0 0 10px;color:#111827;font-size:13px;font-weight:800;">
                  Mesaj
                </p>
                <p style="margin:0;color:#374151;font-size:15px;line-height:1.8;">
                  ${safeMessage}
                </p>
              </div>

              <div style="margin-top:18px;padding:14px 16px;border-radius:14px;background:#ecfeff;border:1px solid #a5f3fc;">
                <p style="margin:0;color:#0e7490;font-size:13px;line-height:1.6;">
                  İpucu: Bu emaildə <b>Reply</b> etsən, cavab avtomatik user-in emailinə gedəcək (replyTo qurulub).
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px;background:#0b1220;">
              <p style="margin:0;color:rgba(255,255,255,.7);font-size:12px;line-height:1.6;text-align:center;">
                © ${new Date().getFullYear()} ${b.siteName} • Admin bildirişi
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
`
  }

  private renderUserAutoReplyEmail(name: string) {
    const b = this.brand()
    const safeName = this.escapeHtml(name)

    return `
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" style="max-width:640px;width:100%;border-collapse:collapse;background:#ffffff;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08);overflow:hidden;">
          <tr>
            <td style="padding:34px 32px;background:linear-gradient(135deg,#22c55e 0%,#16a34a 40%,#667eea 100%);text-align:center;">
              <a href="${b.siteUrl}" target="_blank" style="text-decoration:none;display:inline-block;">
                <img src="${b.logoUrl}" alt="${b.siteName} logo" style="height:44px;max-width:190px;display:block;border:0;margin:0 auto;" />
              </a>
              <h1 style="margin:18px 0 0;color:#fff;font-size:24px;line-height:1.25;font-weight:900;">
                Mesajınız qəbul olundu ✅
              </h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,.92);font-size:14px;line-height:1.7;">
                Ən qısa zamanda sizinlə əlaqə saxlanılacaq.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 32px;">
              <p style="margin:0 0 12px;color:#111827;font-size:16px;line-height:1.7;">
                Salam <b>${safeName}</b>,
              </p>
              <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.9;">
                Müraciətinizi aldıq. Komandamız mesajınızı nəzərdən keçirəcək və
                ehtiyac olarsa əlavə məlumat üçün sizinlə əlaqə saxlayacaq.
              </p>

              <div style="padding:16px 16px;border:1px solid #e5e7eb;border-radius:16px;background:#f9fafb;">
                <p style="margin:0;color:#111827;font-size:13px;font-weight:800;">
                  Əlaqə məlumatı
                </p>
                <p style="margin:8px 0 0;color:#374151;font-size:14px;line-height:1.8;">
                  E-mail: <a href="mailto:${b.supportEmail}" style="color:#4f46e5;text-decoration:none;font-weight:700;">${b.supportEmail}</a><br/>
                  Sayt: <a href="${b.siteUrl}" target="_blank" style="color:#4f46e5;text-decoration:none;font-weight:700;">${b.siteUrl}</a>
                </p>
              </div>

              <div style="margin-top:18px;padding:14px 16px;border-radius:14px;background:#fff7ed;border:1px solid #fed7aa;">
                <p style="margin:0;color:#9a3412;font-size:13px;line-height:1.7;">
                  Bu avtomatik göndərilən mesajdır — cavab yazmayın.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px;background:#0b1220;">
              <p style="margin:0;color:rgba(255,255,255,.7);font-size:12px;line-height:1.6;text-align:center;">
                © ${new Date().getFullYear()} ${b.siteName} • Bütün hüquqlar qorunur
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
`
  }

  private escapeHtml(input: string) {
    return String(input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }
}
