import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PERMISSIONS_KEY } from '../common/permissions.decorator';
import { SessionService } from './session.service';

export interface AuthUser {
  id: number;
  email: string;
  departmentId: number | null;
  permissions: Record<string, string>; // izin kodu -> kapsam (all|department|own)
  rem?: boolean; // "beni hatırla" ile açılan oturum
  tv?: number; // oturum sürümü (User.tokenVersion); eski jetonlarda yok → 0
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector, private readonly sessions: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException();
    let user: AuthUser;
    try {
      user = (await this.jwt.verifyAsync(token)) as AuthUser;
    } catch {
      throw new UnauthorizedException();
    }
    // İmza tek başına yetmez: pasifleştirilen/silinen kullanıcının veya iptal edilmiş oturumun jetonu reddedilir.
    if (!(await this.sessions.isValid(user.id, user.tv))) throw new UnauthorizedException('Oturum sona erdi');
    req.user = user;
    const required = this.reflector.get<string[] | undefined>(PERMISSIONS_KEY, ctx.getHandler());
    if (required?.length && !required.some((c) => c in user.permissions)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
