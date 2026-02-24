import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      throw new UnauthorizedException(
        'ADMIN_PASSWORD is not configured on the server.',
      );
    }

    const req = ctx.switchToHttp().getRequest();
    const provided =
      req.headers['x-admin-password'] ||
      req.query?.key;

    if (provided !== password) {
      throw new UnauthorizedException('Invalid password.');
    }

    return true;
  }
}
