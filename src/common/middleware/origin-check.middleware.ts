import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private allowedOrigins = [
    'http://localhost:3000',
    'http://217.64.24.9:3003',
    'https://imtahanver.net',
    'http://imtahanver.net',
    'https://www.imtahanver.net',
    'http://www.imtahanver.net',
  ];

  use(req: Request, res: Response, next: NextFunction) {
    const origin = req.headers.origin;

    // Server-to-Server, SSR və Facebook botlarında origin olmay bilər, keçidə icazə veririk
    if (!origin) {
      return next();
    }

    if (this.allowedOrigins.includes(origin)) {
      next();
    } else {
      throw new ForbiddenException('Origin not allowed');
    }
  }
}