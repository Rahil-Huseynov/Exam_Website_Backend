import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private allowedOrigins = [
    'http://localhost:3000',
  ];

  use(req: Request, res: Response, next: NextFunction) {
    const origin = req.headers.origin;
    if (!origin) {
      throw new ForbiddenException('Origin header missing');
    }
    if (this.allowedOrigins.includes(origin)) {
      next();
    } else {
      throw new ForbiddenException('Origin not allowed');
    }
  }
}
