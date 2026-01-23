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
      await this.prisma.$connect();

      await this.archiveLogs();
    } catch (err) {
      this.logger.warn(
        'Log archive cron skipped: database not reachable',
      );
    }
  }

  public async archiveLogs(): Promise<{ filePath?: string; deleted: number }> {
    try {
      const logs = await this.prisma.log.findMany({
        orderBy: { createdAt: 'asc' },
      });

      if (!logs.length) {
        this.logger.log('No logs to archive today.');
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
            const time = log.createdAt.toISOString();
            return `[${time}] ${(log as any).level ?? 'INFO'}: ${
              (log as any).message ?? JSON.stringify(log)
            }`;
          })
          .join('\n') + '\n';

      await fs.appendFile(filePath, content, 'utf8');

      const result = await this.prisma.log.deleteMany();

      this.logger.log(
        `Archived ${logs.length} logs to ${filePath}, deleted ${result.count} from DB`,
      );

      return { filePath, deleted: result.count };
    } catch (err) {
      this.logger.warn(
        'Archive skipped: database not reachable or IO error',
      );
      return { deleted: 0 };
    }
  }
}
