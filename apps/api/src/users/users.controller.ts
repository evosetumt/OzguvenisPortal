import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ArrayMaxSize, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateIf,
} from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

class CreateUserDto {
  @IsEmail() @MaxLength(190) email: string;
  @IsString() @MinLength(2) @MaxLength(150) fullName: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @Nullable() @IsString() @MaxLength(120) title?: string | null;
  @Nullable() @IsInt() departmentId?: number | null;
  @Nullable() @IsString() @MaxLength(20) erpRepCode?: string | null; // Netsis plasiyer kodu
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsInt({ each: true }) roleIds?: number[];
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) fullName?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) password?: string;
  @Nullable() @IsString() @MaxLength(30) phone?: string | null;
  @Nullable() @IsString() @MaxLength(120) title?: string | null;
  @Nullable() @IsInt() departmentId?: number | null;
  @Nullable() @IsString() @MaxLength(20) erpRepCode?: string | null; // Netsis plasiyer kodu
  @IsOptional() @IsIn(['active', 'disabled']) status?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsInt({ each: true }) roleIds?: number[];
}

class DepartmentDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @Nullable() @IsInt() parentId?: number | null;
  @Nullable() @IsInt() managerId?: number | null;
}

class UpdateDepartmentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @Nullable() @IsInt() parentId?: number | null;
  @Nullable() @IsInt() managerId?: number | null;
}

@Controller()
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly events: EventsService) {}

  /** Görev atama ve davet seçicileri için rehber: tüm giriş yapmış kullanıcılara açık, hassas alan içermez. */
  @Get('users/directory')
  directory() {
    return this.prisma.user.findMany({
      where: { deletedAt: null, status: 'active' },
      select: { id: true, fullName: true, avatarUrl: true, departmentId: true, title: true, presence: true },
      orderBy: { fullName: 'asc' },
    });
  }

  @Get('users')
  @RequirePermission('user.manage')
  async list() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true, email: true, fullName: true, phone: true, title: true, avatarUrl: true, status: true, lastLoginAt: true, erpRepCode: true,
        department: { select: { id: true, name: true } },
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
      orderBy: { fullName: 'asc' },
    });
    return users.map(({ roles, ...u }) => ({ ...u, roles: roles.map((r) => r.role) }));
  }

  @Post('users')
  @RequirePermission('user.manage')
  async create(@CurrentUser() me: AuthUser, @Body() dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Bu e-posta zaten kayıtlı');
    const u = await this.prisma.user.create({
      data: {
        email,
        fullName: dto.fullName.trim(),
        phone: dto.phone,
        title: dto.title?.trim() || null,
        departmentId: dto.departmentId ?? null,
        erpRepCode: dto.erpRepCode?.trim() || null,
        passwordHash: await bcrypt.hash(dto.password, 10),
        roles: { create: (dto.roleIds ?? []).map((roleId) => ({ roleId })) },
      },
    });
    const { password: _, ...logged } = dto;
    await this.audit.log(me.id, 'user.create', 'user', u.id, logged);
    return { id: u.id };
  }

  @Patch('users/:id')
  @RequirePermission('user.manage')
  async update(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!u) throw new NotFoundException();
    if (id === me.id && dto.status === 'disabled') throw new BadRequestException('Kendi hesabınızı pasifleştiremezsiniz');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          fullName: dto.fullName?.trim(),
          phone: dto.phone,
          title: dto.title === undefined ? undefined : dto.title?.trim() || null,
          departmentId: dto.departmentId,
          erpRepCode: dto.erpRepCode === undefined ? undefined : dto.erpRepCode?.trim() || null,
          status: dto.status,
          passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
        },
      });
      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: dto.roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
    });
    const { password, ...logged } = dto;
    await this.audit.log(me.id, 'user.update', 'user', id, { ...logged, passwordChanged: !!password });
    // Rolü veya durumu değişen kullanıcının açık oturumu yetkilerini hemen yenilesin (pasifse oturumu kapanır).
    if (dto.roleIds || dto.status) this.events.emit('auth.changed', me.id, { userIds: [id] });
    return { ok: true };
  }

  @Get('departments')
  departments() {
    return this.prisma.department.findMany({
      select: { id: true, name: true, parentId: true, manager: { select: { id: true, fullName: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Post('departments')
  @RequirePermission('user.manage')
  async createDepartment(@CurrentUser() me: AuthUser, @Body() dto: DepartmentDto) {
    const d = await this.prisma.department.create({ data: { name: dto.name.trim(), parentId: dto.parentId, managerId: dto.managerId } });
    await this.audit.log(me.id, 'department.create', 'department', d.id, dto);
    return d;
  }

  @Patch('departments/:id')
  @RequirePermission('user.manage')
  async updateDepartment(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDepartmentDto) {
    if (dto.parentId === id) throw new BadRequestException('Departman kendi alt birimi olamaz');
    const d = await this.prisma.department.update({ where: { id }, data: { name: dto.name?.trim(), parentId: dto.parentId, managerId: dto.managerId } });
    await this.audit.log(me.id, 'department.update', 'department', id, dto);
    return d;
  }
}
