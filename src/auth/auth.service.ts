import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon from 'argon2';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginAuthDto, RegisterAdminAuthDto, RegisterAuthDto, UpdateUserDto } from './dto';
import { randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';
import { Prisma } from 'generated/prisma';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) { }


  async userSignup(dto: RegisterAuthDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
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
          role: dto.role,
        },
      });

      return {
        success: true,
        message: "User created successfully",
        accessToken: (await this.signToken(user.id, user.email, false, user.role ?? "client")).access_token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          phoneCode: user.phoneCode,
          role: user.role,
          createdAt: user.createdAt,
        },
      };
    } catch (error) {
      throw error;
    }
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
        premiumExpiresAt:car.premiumExpiresAt,
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

    await this.prisma.user.delete({
      where: { id: userId },
    });

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

    await transporter.sendMail({
      from: `"Carify.pl" <${this.config.get('SMTP_USER')}>`,
      to,
      subject: 'Password Reset',
      html: `
      
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
           <tr>
            <td style="padding: 48px 40px 32px; text-align: center; background: linear-gradient(360deg, #fafafa 0%, #e5e5e5 100%); border-radius: 16px 16px 0 0;">
              <!-- Replaced SVG with emoji icon for email client compatibility -->
      <div style="padding: 40px 30px; text-align: center;">
        <h1 style="margin: 0; color: #000; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;"><img style="width: 130px;" src="https://i.ibb.co/RkLLwNWP/4.png" alt="4"></h1>
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
                © ${new Date().getFullYear()} Carify.pl | All rights reserved
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
