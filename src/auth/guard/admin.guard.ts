import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('User not authenticated');

    const allowedRoles = ['admin', 'superadmin'];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Only admins or superadmins can access this resource');
    }

    return true;
  }
}
