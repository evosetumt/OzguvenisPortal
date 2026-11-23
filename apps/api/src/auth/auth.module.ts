import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { SessionService } from './session.service';
import { LoginLimiter } from './login-limiter';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) throw new Error('JWT_SECRET en az 32 karakter olmalı');
        return { secret, signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '12h' } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, SessionService, LoginLimiter],
  exports: [AuthGuard, JwtModule, SessionService],
})
export class AuthModule {}
