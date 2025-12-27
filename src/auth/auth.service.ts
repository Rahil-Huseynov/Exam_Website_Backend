import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon from 'argon2';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  LoginAuthDto,
  RegisterAdminAuthDto,
  RegisterAuthDto,
  UpdateUserDto,
} from './dto';
import { randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';
import { Prisma } from 'generated/prisma';
import * as cron from 'node-cron';
import { join } from 'path';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {
    cron.schedule('* * * * *', async () => {
      try {
        const cutoff = new Date(Date.now() - 5 * 60 * 1000);
        const result = await this.prisma.user.deleteMany({
          where: {
            isEmailVerified: false,
            createdAt: { lt: cutoff },
          },
        });
        if (result.count > 0) {
          this.logger.log(`Deleted ${result.count} unverified user(s) older than 5 minutes`);
        }
      } catch (err) {
        this.logger.error('Error in cron job while deleting unverified users:', err);
      }
    });
  }

  private genPublicId(length = 12) {
    return randomBytes(length)
      .toString("base64url")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase()
      .slice(0, length)
  }

  private async generateUniquePublicId(length = 12) {
    for (let i = 0; i < 10; i++) {
      const publicId = this.genPublicId(length)

      const exists = await this.prisma.user.findUnique({
        where: { publicId },
      })

      if (!exists) return publicId
    }

    throw new BadRequestException("publicId yaratmaq alınmadı")
  }

  async signToken(
    userId: number,
    email: string,
    isAdmin: boolean,
    role: string,
  ): Promise<{ access_token: string }> {
    const payload = {
      sub: userId,
      email,
      isAdmin,
      role,
    };
    const secret = this.config.get('JWT_SECRET');
    const token = await this.jwt.signAsync(payload, {
      expiresIn: '7d',
      secret: secret,
    });

    return {
      access_token: token,
    };
  }

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  private normalizeMoney(d: any) {
    const n = Number(d)
    if (!Number.isFinite(n)) return "0.00"
    return n.toFixed(2)
  }

  private async upsertEmailVerificationFromDto(dto: RegisterAuthDto) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000);
    const hashedPassword = await argon.hash(dto.password);

    const createData: any = {
      email: dto.email,
      hash: hashedPassword,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      role: dto.role ?? 'client',
      code,
      expires,
    };

    try {
      const rec = await this.prisma.emailVerification.upsert({
        where: { email: dto.email },
        update: {
          code: createData.code,
          expires: createData.expires,
          hash: createData.hash,
          firstName: createData.firstName,
          lastName: createData.lastName,
          role: createData.role,
          updatedAt: new Date() as any,
        } as any,
        create: createData as any,
      });

      try {
        await this.sendVerificationEmail(dto.email, code);
      } catch (err) {
        this.logger.warn('Failed to send verification email: ' + ((err as any)?.message ?? err));
      }

      return rec;
    } catch (err) {
      this.logger.error('Error upserting email verification: ' + ((err as any)?.message ?? err));
      throw err;
    }
  }

  private async sendVerificationEmail(to: string, code: string) {
    const transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: +this.config.get('SMTP_PORT'),
      secure: +this.config.get('SMTP_PORT') === 465,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });

    const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
        background: linear-gradient(135deg, #f5f7fa 0%, #f0f4f8 100%);
        padding: 40px 20px;
        min-height: 100vh;
      }
      
      .container {
        max-width: 500px;
        margin: 0 auto;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
        overflow: hidden;
      }
      
      .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 40px 30px;
        text-align: center;
        color: white;
      }
      
      .logo {
         display:block;
         margin: 0 auto 12px;
         width: 140px;
         max-width: 45%;
         height: auto;
       }
      
      .header h1 {
        font-size: 28px;
        font-weight: 700;
        margin-bottom: 8px;
        letter-spacing: -0.5px;
      }
      
      .header p {
        font-size: 14px;
        opacity: 0.9;
        font-weight: 500;
      }
      
      .content {
        padding: 40px 30px;
        text-align: center;
      }
      
      .intro {
        font-size: 15px;
        color: #666;
        margin-bottom: 32px;
        line-height: 1.6;
      }
      
      .code-box {
        background: linear-gradient(135deg, #f5f7fa 0%, #f0f4f8 100%);
        border: 2px solid #e8eef7;
        border-radius: 12px;
        padding: 32px 24px;
        margin-bottom: 32px;
      }
      
      .code-label {
        font-size: 12px;
        color: #999;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 12px;
        font-weight: 600;
      }
      
      .code {
        font-size: 36px;
        font-weight: 700;
        letter-spacing: 8px;
        color: #667eea;
        font-family: 'Courier New', monospace;
        word-spacing: 12px;
      }
      
      .validity {
        font-size: 13px;
        color: #999;
        margin-bottom: 24px;
        line-height: 1.6;
      }
      
      .validity strong {
        color: #667eea;
        font-weight: 600;
      }
      
      .warning {
        background: #fef3f2;
        border-left: 4px solid #f97066;
        padding: 12px 16px;
        border-radius: 6px;
        font-size: 12px;
        color: #7a2f2f;
        text-align: left;
        margin-top: 24px;
      }
      
      .footer {
        background: #f9fafb;
        padding: 24px 30px;
        text-align: center;
        border-top: 1px solid #e5e7eb;
      }
      
      .footer p {
        font-size: 12px;
        color: #999;
      }
      
      .footer a {
        color: #667eea;
        text-decoration: none;
      }
      
      .footer a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
      <a href="https://carvia.pl/" target="_blank">
    <img class="logo" src="https://api.carvia.pl/uploads/Logo.png" alt="logo" />
      </a>
        </div>
        <h1>Email Verification</h1>
        <p>Secure your account</p>
      </div>
      
      <div class="content">
        <p class="intro">Enter the verification code below to confirm your email address and complete your registration.</p>
        
        <div class="code-box">
          <div class="code-label">Your Code</div>
          <div class="code">${code}</div>
        </div>
        
        <p class="validity">This code is valid for <strong>5 minutes</strong>. Please enter it in your browser window.</p>
        
        <div class="warning">
          <strong>Didn't request this?</strong> If you didn't sign up for Carvia.pl, you can safely ignore this email.
        </div>
      </div>
      
      <div class="footer">
        <p>© ${new Date().getFullYear()} <strong>Carvia.pl</strong> • <a href="#">Privacy Policy</a></p>
      </div>
    </div>
  </body>
  </html>
`;
    await transporter.sendMail({
      from: `"Carvia.pl" <${this.config.get('SMTP_USER')}>`,
      to,
      subject: 'Your verification code',
      html,
    });
  }

  private async sendWelcomeEmail(to: string, name?: string) {
    const transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: +this.config.get('SMTP_PORT'),
      secure: +this.config.get('SMTP_PORT') === 465,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });

    const safeName = name ?? 'User';
    const html = ``;

    try {
      await transporter.sendMail({
        from: ` <${this.config.get('SMTP_USER')}>`,
        to,
        subject: 'Welcome to ... — Account activated',
        html,
      });
    } catch (err) {
      const msg = (err as any)?.message ?? String(err);
      this.logger.warn(`Failed to send welcome email: ${msg}`);
    }
  }

  async userSignup(dto: RegisterAuthDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser && existingUser.isEmailVerified) {
      throw new ForbiddenException('Email already in use');
    }

    await this.upsertEmailVerificationFromDto(dto);

    return {
      success: true,
      message: 'Verification code sent to your email (check spam). Complete verification to activate account.',
      email: dto.email,
    };
  }

  async verifyEmail(email: string, code: string) {
    const record = await this.prisma.emailVerification.findFirst({
      where: { email, code },
      orderBy: { createdAt: 'desc' as any },
    });

    if (!record) throw new BadRequestException('Invalid verification code');
    if (record.expires < new Date()) {
      await this.prisma.emailVerification.deleteMany({ where: { email } });
      throw new BadRequestException('Verification code expired');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    let user;
    if (existingUser) {
      if (existingUser.isEmailVerified) {
        await this.prisma.emailVerification.deleteMany({ where: { email } });
        const token = await this.signToken(existingUser.id, existingUser.email, false, existingUser.role ?? 'client');
        return {
          success: true,
          message: 'Email already verified',
          access_token: token.access_token,
          user: {
            id: existingUser.id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            publicId: existingUser.publicId ?? null,
            lastName: existingUser.lastName,
            role: existingUser.role,
            createdAt: existingUser.createdAt,
          },
        };
      }

      const needPublicId = !existingUser.publicId
      user = await this.prisma.user.update({
        where: { email },
        data: {
          hash: (record as any).hash,
          firstName: (record as any).firstName ?? existingUser.firstName,
          lastName: (record as any).lastName ?? existingUser.lastName,
          role: (record as any).role ?? existingUser.role,
          isEmailVerified: true,
          ...(needPublicId ? { publicId: await this.generateUniquePublicId(16) } : {}),
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: (record as any).email,
          hash: (record as any).hash,
          firstName: (record as any).firstName ?? null,
          publicId: await this.generateUniquePublicId(16),
          lastName: (record as any).lastName ?? null,
          role: (record as any).role ?? 'client',
          isEmailVerified: true,
        },
      });
    }

    await this.prisma.emailVerification.deleteMany({ where: { email } });
    try {
      await this.sendWelcomeEmail(user.email, user.firstName ?? undefined);
    } catch (err) {
      this.logger.warn('Welcome email failed: ' + ((err as any)?.message ?? err));
    }

    const token = await this.signToken(user.id, user.email, false, user.role ?? 'client');

    return {
      success: true,
      message: 'Email verified and user activated',
      access_token: token.access_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        publicId: user.publicId ?? null,
        lastName: user.lastName,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }

  async resendVerification(email: string) {
    const record = await this.prisma.emailVerification.findUnique({ where: { email } });
    if (!record) throw new BadRequestException('User not found or no pending verification');

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser && existingUser.isEmailVerified) {
      return { success: true, message: 'Email already verified' };
    }

    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newExpires = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.emailVerification.update({
      where: { email },
      data: { code: newCode, expires: newExpires, updatedAt: new Date() } as any,
    });

    try {
      await this.sendVerificationEmail(email, newCode);
    } catch (err) {
      this.logger.warn('Failed to resend verification email: ' + ((err as any)?.message ?? err));
    }

    return { success: true, message: 'Verification code resent' };
  }

  async signin(dto: LoginAuthDto) {
    const admin = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    if (admin) {
      const pwMatches = await argon.verify(admin.hash, dto.password);
      if (!pwMatches) throw new ForbiddenException('Email or password is incorrect');
      const token = await this.signToken(admin.id, admin.email, true, admin.role ?? 'admin');
      return {
        accessToken: token.access_token,
        admin: { id: admin.id, firstName: admin.firstName, lastName: admin.lastName, email: admin.email, role: admin.role ?? 'admin' },
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new ForbiddenException('User not found');
    const pwMatches = await argon.verify(user.hash, dto.password);
    if (!pwMatches) throw new ForbiddenException('Email or password is incorrect');
    if (!user.isEmailVerified) throw new ForbiddenException('Email not verified');

    return {
      accessToken: (await this.signToken(user.id, user.email, false, user.role ?? 'client')).access_token,
    };
  }

  async getAllUsers(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;

    const where = search
      ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      }
      : {};

    const [users, totalCount] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: where as any,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          publicId: true,
          email: true,
          createdAt: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      }),
      this.prisma.user.count({ where: where as any }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      users,
      totalCount,
      totalPages,
      currentPage: page,
    };
  }

  async getAllAdmins(page = 1, limit = 10, search = "") {
    const skip = (page - 1) * limit;

    const where = search
      ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ] as Prisma.AdminWhereInput[],
      }
      : {};

    const [admins, total] = await Promise.all([
      this.prisma.admin.findMany({
        skip,
        take: limit,
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      }),
      this.prisma.admin.count({ where }),
    ]);

    return {
      users: admins,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getRecentUsers(limit = 5) {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return users.map(u => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      role: u.role,
      joinDate: u.createdAt.toISOString().split('T')[0],
    }));
  }

  async updateAdmin(id: number, dto: Partial<RegisterAdminAuthDto>) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) throw new ForbiddenException('Admin not found');
    const updateData: any = { ...dto };
    if (dto.password) {
      updateData.hash = await argon.hash(dto.password);
      delete updateData.password;
    }

    try {
      const updatedAdmin = await this.prisma.admin.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      });

      return updatedAdmin;
    } catch (error) {
      throw error;
    }
  }

  async deleteAdmin(id: number) {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    if (!admin) {
      throw new ForbiddenException("Admin tapılmadı");
    }

    await this.prisma.admin.delete({
      where: { id },
    });

    return { message: "Admin uğurla silindi" };
  }

  async putUser(userId: number, dto: Partial<UpdateUserDto>) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) {
        throw new BadRequestException('Bu email artıq istifadə olunur');
      }
    }
    const allowed: Partial<any> = {};
    if (dto.firstName !== undefined) allowed.firstName = dto.firstName;
    if (dto.lastName !== undefined) allowed.lastName = dto.lastName;
    if (dto.email !== undefined) allowed.email = dto.email;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: allowed,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });

    return updatedUser;
  }

  async deleteUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({
        where: { userId },
      }),
      this.prisma.user.delete({
        where: { id: userId },
      }),
    ]);
    return { message: 'User deleted successfully' };
  }

  async getUserById(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        publicId: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        balance: true,
      },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    const balanceNum = Number(user.balance);
    const balanceFixed = Number.isFinite(balanceNum) ? balanceNum.toFixed(2) : "0.00";

    return {
      ...user,
      balance: balanceFixed,
    };
  }

  async getAdminById(adminId: number) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    });

    if (!admin) {
      throw new ForbiddenException('Admin not found');
    }

    return admin;
  }

  async adminSignup(dto: RegisterAdminAuthDto) {
    const existingAdmin = await this.prisma.admin.findUnique({
      where: { email: dto.email },
    });

    if (existingAdmin) {
      throw new ForbiddenException("Email already in use");
    }

    const hash = await argon.hash(dto.password);

    try {
      const admin = await this.prisma.admin.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          hash,
          role: dto.role,
        },
      });

      return {
        message: "Admin created successfully",
        adminId: admin.id,
      };
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ForbiddenException("Email already in use");
      }
      throw error;
    }
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new ForbiddenException('İstifadəçi tapılmadı');

    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await this.prisma.passwordResetToken.create({
      data: {
        token,
        expires,
        user: { connect: { id: user.id } },
      },
    });

    const baseUrl = this.config.get('FRONTEND_URL');
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

    await this.sendResetEmail(user.email, resetUrl);

    return { message: 'Şifrə sıfırlama linki e-poçt ünvanınıza göndərildi.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenRecord = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!tokenRecord) throw new BadRequestException('Yanlış və ya istifadə olunmuş token.');
    if (tokenRecord.expires < new Date()) {
      await this.prisma.passwordResetToken.delete({ where: { token } });
      throw new BadRequestException('Token vaxtı keçib.');
    }

    const hashedPassword = await argon.hash(newPassword);

    await this.prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { hash: hashedPassword },
    });

    await this.prisma.passwordResetToken.delete({ where: { token } });

    return { message: 'Şifrə uğurla dəyişdirildi.' };
  }

  private async sendResetEmail(to: string, resetUrl: string) {
    const transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: +this.config.get('SMTP_PORT'),
      secure: +this.config.get('SMTP_PORT') === 465,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });
    const logoPath = join(process.cwd(), 'public', 'Logo', '');
    await transporter.sendMail({
      from: ` <${this.config.get('SMTP_USER')}>`,
      to,
      subject: 'Password Reset',
      html: ``,
    });
  }

  async checkToken(token: string) {
    const tokenRecord = await this.prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!tokenRecord) return false;
    if (tokenRecord.expires < new Date()) {
      await this.prisma.passwordResetToken.delete({ where: { token } });
      return false;
    }
    return true;
  }

  async updatePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new ForbiddenException('İstifadəçi tapılmadı');
    }
    const isPasswordCorrect = await argon.verify(user.hash, currentPassword);
    if (!isPasswordCorrect) {
      throw new ForbiddenException('Cari şifrə yanlışdır');
    }
    const newHashedPassword = await argon.hash(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { hash: newHashedPassword },
    });
    return { message: 'Şifrə uğurla yeniləndi' };
  }

  async adminTopUpByPublicId(publicIdRaw: string, amountNum: number, adminId?: number) {
    const publicId = (publicIdRaw || "").trim().toUpperCase()
    if (!publicId) throw new BadRequestException("publicId boş ola bilməz")

    const amount = new Prisma.Decimal(amountNum)
    if (amount.lte(0)) throw new BadRequestException("amount düzgün deyil")

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { publicId } as any,
        select: { id: true, publicId: true, email: true, firstName: true, lastName: true, balance: true },
      })
      if (!user) throw new BadRequestException("User tapılmadı")

      const balanceBefore = new Prisma.Decimal(user.balance as any)
      const balanceAfter = balanceBefore.add(amount).toDecimalPlaces(2)

      const updated = await tx.user.update({
        where: { publicId } as any,
        data: { balance: balanceAfter },
        select: { id: true, publicId: true, email: true, firstName: true, lastName: true, balance: true },
      })

      await tx.balanceTransaction.create({
        data: {
          userId: updated.id,
          adminId: adminId ?? null,
          amount: amount.toDecimalPlaces(2),
          currency: "AZN",
          type: "ADMIN_TOPUP",
          note: `Admin topup (+${Number(amount).toFixed(2)} AZN)`,
          balanceBefore: balanceBefore.toDecimalPlaces(2),
          balanceAfter: balanceAfter.toDecimalPlaces(2),
        },
      })

      return {
        ok: true,
        publicId: updated.publicId,
        added: Number(amount).toFixed(2),
        oldBalance: this.normalizeMoney(balanceBefore),
        newBalance: this.normalizeMoney(balanceAfter),
        user: { ...updated, balance: this.normalizeMoney(updated.balance) },
      }
    })
  }


  async getUserByPublicIdPublic(publicIdRaw: string) {
    const publicId = (publicIdRaw || "").trim().toUpperCase()
    if (!publicId) throw new BadRequestException("publicId boş ola bilməz")

    const user = await this.prisma.user.findUnique({
      where: { publicId } as any,
      select: {
        id: true,
        publicId: true,
        email: true,
        firstName: true,
        lastName: true,
        balance: true,
        createdAt: true,
      },
    })
    if (!user) throw new BadRequestException("User tapılmadı")

    return {
      ok: true,
      user: { ...user, balance: this.normalizeMoney(user.balance) },
    }
  }

  async getBalanceHistory(userId: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit

    const [total, items] = await this.prisma.$transaction([
      this.prisma.balanceTransaction.count({ where: { userId } }),
      this.prisma.balanceTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          bank: { select: { id: true, title: true, year: true, price: true } },
          attempt: { select: { id: true, startedAt: true, finishedAt: true, status: true } },
          admin: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        },
      }),
    ])

    return { page, limit, total, items }
  }
}
