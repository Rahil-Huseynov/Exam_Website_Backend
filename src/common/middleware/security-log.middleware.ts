import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SecurityLogMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', async () => {
      try {
        const duration = Date.now() - start;
        const xff = req.headers['x-forwarded-for'] as string;
        const rawIp =
          xff?.split(',')[0]?.trim() ||
          req.socket.remoteAddress ||
          req.ip;

        const ip = rawIp?.replace(/^::ffff:/, '');
        const geo = ip ? geoip.lookup(ip) : null;
        const uaParser = new UAParser(req.headers['user-agent']);
        const device = uaParser.getDevice();
        const os = uaParser.getOS();
        const browser = uaParser.getBrowser();
        const user = (req as any).user;
        await this.prisma.log.create({
          data: {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration,
            userId: user?.id,
            userName: user?.username,
            userRole: user?.role,
            ip,
            country: geo?.country,
            city: geo?.city,
            region: geo?.region,
            isp: geo?.org,
            asn: geo?.asn,
            deviceType: device.type ?? 'desktop',
            os: os.name,
            osVersion: os.version,
            browser: browser.name,
            browserVer: browser.version,
            userAgent: req.headers['user-agent'],
          },
        });
      } catch (err) {
        console.error('Security log failed:', err);
      }
    });

    next();
  }
}
