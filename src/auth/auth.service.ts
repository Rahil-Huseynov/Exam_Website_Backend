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

    const html = ``;
    await transporter.sendMail({
      from: ` <${this.config.get('SMTP_USER')}>`,
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
            lastName: existingUser.lastName,
            role: existingUser.role,
            createdAt: existingUser.createdAt,
          },
        };
      }

      user = await this.prisma.user.update({
        where: { email },
        data: {
          hash: (record as any).hash,
          firstName: (record as any).firstName ?? existingUser.firstName,
          lastName: (record as any).lastName ?? existingUser.lastName,
          role: (record as any).role ?? existingUser.role,
          isEmailVerified: true,
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: (record as any).email,
          hash: (record as any).hash,
          firstName: (record as any).firstName ?? null,
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
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
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
}
