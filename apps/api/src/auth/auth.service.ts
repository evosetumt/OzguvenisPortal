import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const RANK: Record<string, number> = { own: 1, department: 2, all: 3 };
/** "Beni hatırla": oturum bu süre boyunca açık kalır, her kullanımda (yenilemede) süre baştan başlar. */
const REMEMBER_TTL = process.env.JWT_REMEMBER_EXPIRES_IN ?? '7d';
const userInclude = { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } as const;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(email: string, password: string, remember = false) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null },
      include: userInclude,
    });
    // Kullanıcı yoksa da hash karşılaştır; yanıt süresi sızıntısını azaltır.
    const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!user || !ok || user.status !== 'active') throw new UnauthorizedException('E-posta veya şifre hatalı');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.auditLog.create({ data: { userId: user.id, action: 'auth.login', diff: JSON.stringify({ remember }) } });
    return this.issue(user, remember);
  }

  /**
   * Oturumu yeniler: izinler veritabanından tekrar okunur (rol değişikliği hemen yansır),
   * pasifleştirilen kullanıcının oturumu burada biter. "Beni hatırla" süresi her yenilemede baştan başlar.
   */
  async refresh(userId: number, remember: boolean) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: userInclude });
    if (!user || user.status !== 'active') throw new UnauthorizedException('Oturum sona erdi');
    return this.issue(user, remember);
  }

  private async issue(user: Prisma.UserGetPayload<{ include: typeof userInclude }>, remember: boolean) {
    // Birden fazla rolden gelen izinlerde en geniş kapsam geçerli olur.
    const permissions: Record<string, string> = {};
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        const cur = permissions[rp.permission.code];
        if (!cur || RANK[rp.scope] > RANK[cur]) permissions[rp.permission.code] = rp.scope;
      }
    }
    const payload = { id: user.id, email: user.email, departmentId: user.departmentId, permissions, rem: remember };
    return {
      token: await this.jwt.signAsync(payload, remember ? { expiresIn: REMEMBER_TTL } : {}),
      remember,
      user: { id: user.id, email: user.email, fullName: user.fullName, permissions },
    };
  }

  async changePassword(userId: number, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new UnauthorizedException('Mevcut şifre hatalı');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 10) } });
    await this.prisma.auditLog.create({ data: { userId, action: 'auth.password_change' } });
  }
}
