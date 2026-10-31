import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PERMISSIONS_KEY } from '../common/permissions.decorator';

export interface AuthUser {
  id: number;
  email: string;
  departmentId: number | null;
  permissions: Record<string, string>; // izin kodu -> kapsam (all|department|own)
  rem?: boolean; // "beni hatırla" ile açılan oturum
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException();
    try {
      req.user = (await this.jwt.verifyAsync(token)) as AuthUser;
    } catch {
      throw new UnauthorizedException();
    }
    const required = this.reflector.get<string[] | undefined>(PERMISSIONS_KEY, ctx.getHandler());
    if (required?.length && !required.some((c) => c in (req.user as AuthUser).permissions)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
