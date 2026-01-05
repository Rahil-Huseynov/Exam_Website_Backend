import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as argon from 'argon2';

@Injectable()
export class AdminSeederService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) { }

  async onModuleInit() {
    const SuperadminEmail = this.config.get<string>('SUPER_ADMIN_EMAIL');
    const SuperadminPassword = this.config.get<string>('SUPER_ADMIN_PASSWORD');
    const SuperadminRole = this.config.get<string|undefined>('SUPER_ADMIN_ROLE');
    const SuperadminFirstName = this.config.get<string>('SUPER_ADMIN_FIRSTNAME');
    const SuperadminLastName = this.config.get<string>('SUPER_ADMIN_LASTNAME');

    if (!SuperadminEmail || !SuperadminPassword || !SuperadminRole || !SuperadminFirstName || !SuperadminLastName) {
      throw new ForbiddenException('Credentials incorrect');
    }

    const existingAdmin = await this.prisma.admin.findUnique({
      where: { email: SuperadminEmail },
    });

    if (!existingAdmin) {
      const hash = await argon.hash(SuperadminPassword);
      await this.prisma.admin.create({
        data: {
          firstName: SuperadminFirstName,
          lastName: SuperadminLastName,
          email: SuperadminEmail,
          hash,
          role: SuperadminRole
        },
      });

      console.log('✅ Admin istifadəçi yaradıldı:', SuperadminEmail);
    } else {
      console.log('ℹ️ Admin artıq mövcuddur:', SuperadminEmail);
    }
  }
}
