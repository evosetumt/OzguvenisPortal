import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) password: string;
  /** Beni hatırla: 7 gün (JWT_REMEMBER_EXPIRES_IN); yoksa JWT_EXPIRES_IN ve tarayıcı kapanınca biter. */
  @IsOptional() @IsBoolean() remember?: boolean;
}

class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, !!dto.remember);
  }

  /** Süresi dolmamış jetonla yeni jeton alır (istemci açılışta ve periyodik olarak çağırır). */
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  refresh(@Req() req: { user: { id: number; rem?: boolean } }) {
    return this.auth.refresh(req.user.id, !!req.user.rem);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: { user: { id: number; permissions: Record<string, string> } }) {
    const u = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, fullName: true, avatarUrl: true, phone: true, title: true, presence: true, uiPrefs: true,
        department: { select: { id: true, name: true } },
      },
    });
    let uiPrefs: unknown = null;
    try { uiPrefs = u?.uiPrefs ? JSON.parse(u.uiPrefs) : null; } catch { /* bozuk kayıt yok sayılır */ }
    return { ...u, uiPrefs, permissions: req.user.permissions };
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  changePassword(@Req() req: { user: { id: number } }, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
