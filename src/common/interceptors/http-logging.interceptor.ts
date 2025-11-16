import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  private getClientIp(request: any): string {
    const xForwardedFor = request.headers['x-forwarded-for'];
    if (xForwardedFor) {
      const ip = Array.isArray(xForwardedFor)
        ? xForwardedFor[0]
        : xForwardedFor.split(',')[0].trim();
      return this.normalizeIp(ip);
    }
    if (request.ips && request.ips.length > 0) {
      return this.normalizeIp(request.ips[0]);
    }
    if (request.ip) {
      return this.normalizeIp(request.ip);
    }
    return this.normalizeIp(request.socket?.remoteAddress || 'unknown');
  }

  private normalizeIp(rawIp: string): string {
    if (!rawIp) return 'unknown';
    if (rawIp === '::1') return 'localhost';
    if (rawIp === '127.0.0.1') return 'localhost';
    if (rawIp.startsWith('::ffff:')) return rawIp.replace('::ffff:', '');
    return rawIp;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const start = Date.now();

    return next.handle().pipe(
      tap(async () => {
        const duration = Date.now() - start;

        const user = req.user ?? null;
        const userId = user?.id ?? null;
        const userName = user?.email ?? null;
        const userRole =
          user && ['admin', 'superadmin', 'client'].includes(user.role)
            ? user.role
            : null;

        const ip = this.getClientIp(req);

        await this.prisma.log.create({
          data: {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration,
            userId,
            userName,
            userRole,
            ip,
          },
        });
      }),
    );
  }
}
