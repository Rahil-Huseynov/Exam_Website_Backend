import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class LogArchiveService {
  private readonly logger = new Logger(LogArchiveService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 * * *')
  async handleCron() {
    try {
      await this.archiveLogs();
    } catch {
      this.logger.warn('Log archive cron skipped');
    }
  }

  async archiveLogs(): Promise<{ filePath?: string; deleted: number }> {
    const logs = await this.prisma.log.findMany({
      orderBy: { createdAt: 'asc' },
    });

    if (!logs.length) {
      this.logger.log('No logs to archive');
      return { deleted: 0 };
    }

    const archiveDir =
      process.env.ARCHIVE_DIR ||
      path.join(process.cwd(), 'log-archive');

    await fs.mkdir(archiveDir, { recursive: true });

    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(archiveDir, `${today}.log`);

    const content =
      logs
        .map((log) => {
          return JSON.stringify({
            id: log.id,
            method: log.method,
            url: log.url,
            status: log.status,
            duration: log.duration,
            userId: log.userId,
            userName: log.userName,
            userRole: log.userRole,
            ip: log.ip,
            country: log.country,
            city: log.city,
            region: log.region,
            isp: log.isp,
            asn: log.asn,
            deviceType: log.deviceType,
            os: log.os,
            osVersion: log.osVersion,
            browser: log.browser,
            browserVer: log.browserVer,
            userAgent: log.userAgent,
            createdAt: log.createdAt,
          });
        })
        .join('\n') + '\n';

    await fs.appendFile(filePath, content, 'utf8');

    const result = await this.prisma.log.deleteMany();

    this.logger.log(
      `Archived ${result.count} logs → ${filePath}`,
    );

    return { filePath, deleted: result.count };
  }
}
