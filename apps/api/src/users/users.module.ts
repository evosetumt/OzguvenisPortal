import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { ProfileController } from './profile.controller';
import { RolesController } from './roles.controller';

@Module({ imports: [AuthModule], controllers: [UsersController, ProfileController, RolesController] })
export class UsersModule {}
