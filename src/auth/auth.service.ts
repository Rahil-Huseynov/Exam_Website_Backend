import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon from 'argon2';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginAuthDto, RegisterAdminAuthDto, RegisterAuthDto, UpdateUserDto } from './dto';
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
      expiresIn: '1d',
      secret: secret,
    });

    return {
      access_token: token,
    };
  }

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  private async createAndSendVerificationCode(userId: number, email: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 5 * 60 * 1000);
    try {
      await this.prisma.emailVerification.deleteMany({ where: { userId } });
    } catch (e) {
    }

    await this.prisma.emailVerification.create({
      data: {
        code,
        expires,
        user: { connect: { id: userId } },
      },
    });

    await this.sendVerificationEmail(email, code);
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
        <img class="logo" src="cid:carvia-logo" alt="logo" />
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
    const logoPath = join(process.cwd(), 'public', 'Logo', 'carvia.png');
    await transporter.sendMail({
      from: `"Carvia.pl" <${this.config.get('SMTP_USER')}>`,
      to,
      subject: 'Your verification code',
      attachments: [
        {
          filename: 'carvia.png',
          path: logoPath,
          cid: 'carvia-logo'
        }
      ],
      html,
    });
  }

  async userSignup(dto: RegisterAuthDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      if (!existingUser.isEmailVerified) {
        await this.createAndSendVerificationCode(existingUser.id, existingUser.email);
        return {
          success: true,
          message: 'Verification code resent to your email',
          email: existingUser.email,
        };
      }
      throw new ForbiddenException('Email already in use');
    }

    const hash = await argon.hash(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          hash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phoneNumber: dto.phoneNumber,
          phoneCode: dto.phoneCode,
          role: dto.role ?? 'client',
          isEmailVerified: false,
        },
      });

      await this.createAndSendVerificationCode(user.id, user.email);

      return {
        success: true,
        message: "Verification code sent to your email",
        email: user.email,
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ForbiddenException('Email already in use');
      }
      throw error;
    }
  }

  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('User not found');

    const tokenRecord = await this.prisma.emailVerification.findFirst({
      where: { userId: user.id, code },
      orderBy: { createdAt: 'desc' },
    });

    if (!tokenRecord) throw new BadRequestException('Invalid verification code');
    if (tokenRecord.expires < new Date()) {
      await this.prisma.emailVerification.deleteMany({ where: { userId: user.id } });
      throw new BadRequestException('Verification code expired');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { isEmailVerified: true } });
    await this.prisma.emailVerification.deleteMany({ where: { userId: user.id } });
    const token = await this.signToken(user.id, user.email, false, user.role ?? 'client');

    return {
      success: true,
      message: 'Email verified and user activated',
      access_token: token.access_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('User not found');
    if (user.isEmailVerified) return { success: true, message: 'Email already verified' };
    await this.createAndSendVerificationCode(user.id, user.email);
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
      include: { userCars: { include: { images: true } } },
    });

    if (!user) throw new ForbiddenException('User not found');
    const pwMatches = await argon.verify(user.hash, dto.password);
    if (!pwMatches) throw new ForbiddenException('Email or password is incorrect');
    if (!user.isEmailVerified) throw new ForbiddenException('Email not verified');

    return {
      accessToken: (await this.signToken(user.id, user.email, false, user.role ?? 'client')).access_token,
      user: this.formatUserWithCars(user),
    };
  }

  private formatUserWithCars(user: any) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      phoneCode: user.phoneCode,
      role: user.role,
      createdAt: user.createdAt,
      userCars: user.userCars?.map(car => ({
        id: car.id,
        brand: car.brand,
        model: car.model,
        year: car.year,
        publicId: car.publicId,
        price: car.price,
        mileage: car.mileage,
        fuel: car.fuel,
        transmission: car.transmission,
        condition: car.condition,
        color: car.color,
        location: car.location,
        city: car.city,
        gearbox: car.gearbox,
        viewcount: car.viewcount,
        premiumExpiresAt: car.premiumExpiresAt,
        status: car.status,
        description: car.description,
        features: car.features,
        name: car.name,
        SaleType: car.SaleType,
        vinCode: car.vinCode,
        allCarsListId: car.allCarsListId ?? car.allCar?.id ?? null,
        phone: car.phone,
        email: car.email,
        createdAt: car.createdAt,
        updatedAt: car.updatedAt,
        images: car.images?.map(img => ({ id: img.id, url: img.url })),
      })),
    };
  }

  async getUserWithCars(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userCars: {
          orderBy: { createdAt: 'desc' },
          include: {
            images: true,
            allCar: { include: { images: true } },
          },
        },
      },
    });

    if (!user) throw new ForbiddenException('User not found');
    return this.formatUserWithCars(user);
  }

  async getAllUsers(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;

    const where = search
      ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phoneNumber: { contains: search, mode: "insensitive" } },
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
          email: true,
          createdAt: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          phoneCode: true,
          role: true,
          userCars: true,
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
    if (dto.phoneNumber !== undefined) allowed.phoneNumber = dto.phoneNumber;
    if (dto.phoneCode !== undefined) allowed.phoneCode = dto.phoneCode;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: allowed,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        phoneCode: true,
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
        firstName: true,
        lastName: true,
        role: true,
        phoneNumber: true,
        phoneCode: true,
        createdAt: true,
        userCars: true
      },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    return user;
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
    const logoPath = join(process.cwd(), 'public', 'Logo', 'carvia.png');
    await transporter.sendMail({
      from: `"Carvia.pl" <${this.config.get('SMTP_USER')}>`,
      to,
      subject: 'Password Reset',
      attachments: [
        {
          filename: 'carvia.png',
          path: logoPath,
          cid: 'carvia-logo'
        }
      ],
      html: `
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
           <tr>
            <td style="padding: 48px 40px 32px; text-align: center; background: linear-gradient(360deg, #fafafa 0%, #e5e5e5 100%); border-radius: 16px 16px 0 0;">
 <div style="padding: 40px 30px; text-align: center;">
        <h1 style="margin: 0; color: #000; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;"><img style="width: 130px;" src="cid:carvia-logo" alt="4"></h1>
      </div>
              <h1 style="margin: 0; color: #000; font-size: 28px; font-weight: 700; line-height: 1.3;">Password Reset</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.6;">
                Hello,
              </p>
              <p style="margin: 0 0 32px; color: #374151; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to set a new password:
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: all 0.3s ease;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 40px;">
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px 20px; border-radius: 8px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600; line-height: 1.6;">
                  ⚠️ Important: This link is valid for 1 hour only.
                </p>
              </div>
              
              <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; background-color: #f9fafb; border-radius: 0 0 16px 16px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 13px; text-align: center; line-height: 1.6;">
                This is an automated message, please do not reply.
              </p>
              <p style="margin: 12px 0 0; color: #9ca3af; font-size: 13px; text-align: center; line-height: 1.6;">
  © 2025 All rights reserved.
                © ${new Date().getFullYear()} Carvia.pl | All rights reserved
                              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
         `,
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
}
