import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_ROLE, PERMISSION_BY_CODE, PERMISSION_CATALOG, type Scope } from '../common/permission-catalog';

class RoleDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  /** izin kodu → kapsam; null: yetki kaldırılır. Gönderilmeyen izinler değişmez. */
  @IsOptional() @IsObject() permissions?: Record<string, Scope | null>;
}

/**
 * Roller ve modül yetkileri (user.manage). Admin rolü her zaman tüm yetkilere sahiptir, değiştirilemez.
 * Değişiklik, o roldeki kullanıcıların açık oturumlarına hemen yansır (auth.changed → istemci jetonunu yeniler).
 */
@Controller()
@UseGuards(AuthGuard)
export class RolesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly events: EventsService) {}

  @Get('permissions/catalog')
  @RequirePermission('user.manage')
  catalog() {
    return PERMISSION_CATALOG;
  }

  @Get('roles')
  @RequirePermission('user.manage')
  async roles() {
    const rows = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: { select: { code: true } } } }, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id, name: r.name, description: r.description, userCount: r._count.users, locked: r.name === ADMIN_ROLE,
      permissions: Object.fromEntries(r.permissions.map((p) => [p.permission.code, p.scope])),
    }));
  }

  @Post('roles')
  @RequirePermission('user.manage')
  async create(@CurrentUser() me: AuthUser, @Body() dto: RoleDto) {
    const name = dto.name.trim();
    if (await this.prisma.role.findUnique({ where: { name } })) throw new ConflictException('Bu adda bir rol var');
    const r = await this.prisma.role.create({ data: { name, description: dto.description?.trim() || null } });
    await this.audit.log(me.id, 'role.create', 'role', r.id, { name });
    return { id: r.id };
  }

  @Patch('roles/:id')
  @RequirePermission('user.manage')
  async update(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw new NotFoundException('Rol bulunamadı');
    if (role.name === ADMIN_ROLE) throw new BadRequestException('Admin rolü her zaman tüm yetkilere sahiptir; değiştirilemez');
    if (dto.name && dto.name.trim() !== role.name && (await this.prisma.role.findUnique({ where: { name: dto.name.trim() } }))) {
      throw new ConflictException('Bu adda bir rol var');
    }

    const changes = Object.entries(dto.permissions ?? {});
    for (const [code, scope] of changes) {
      const def = PERMISSION_BY_CODE.get(code);
      if (!def) throw new BadRequestException(`Bilinmeyen yetki: ${code}`);
      if (scope !== null && !def.scopes.includes(scope)) throw new BadRequestException(`${def.label}: geçersiz kapsam`);
    }
    // Kendini kilitleme: yöneticinin kendi rollerinden user.manage'i kaldırıp hiçbir rolde kalmaması engellenir.
    if (dto.permissions && dto.permissions['user.manage'] === null) {
      const others = await this.prisma.userRole.count({
        where: { userId: me.id, roleId: { not: id }, role: { permissions: { some: { permission: { code: 'user.manage' } } } } },
      });
      const mine = await this.prisma.userRole.count({ where: { userId: me.id, roleId: id } });
      if (mine && !others) throw new BadRequestException('Bu rolden kullanıcı yönetimi yetkisini kaldırırsanız kendi erişiminizi kaybedersiniz');
    }

    const perms = await this.prisma.permission.findMany({ where: { code: { in: changes.map(([c]) => c) } } });
    const idOf = new Map(perms.map((p) => [p.code, p.id]));
    await this.prisma.$transaction(async (tx) => {
      if (dto.name || dto.description !== undefined) {
        await tx.role.update({ where: { id }, data: { name: dto.name?.trim(), description: dto.description === undefined ? undefined : dto.description.trim() || null } });
      }
      for (const [code, scope] of changes) {
        const permissionId = idOf.get(code);
        if (!permissionId) continue; // katalogda var ama veritabanında yoksa (seed çalışmamış) atla
        if (scope === null) await tx.rolePermission.deleteMany({ where: { roleId: id, permissionId } });
        else await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: id, permissionId } }, create: { roleId: id, permissionId, scope }, update: { scope } });
      }
    });

    const before = Object.fromEntries(role.permissions.map((p) => [p.permission.code, p.scope]));
    await this.audit.log(me.id, 'role.update', 'role', id, {
      name: dto.name, permissions: Object.fromEntries(changes.map(([c, s]) => [c, { önce: before[c] ?? null, sonra: s }])),
    });
    await this.notifyMembers(id);
    return (await this.roles()).find((r) => r.id === id);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermission('user.manage')
  async remove(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException('Rol bulunamadı');
    if (role.name === ADMIN_ROLE) throw new BadRequestException('Admin rolü silinemez');
    if (role._count.users) throw new BadRequestException(`Bu role atanmış ${role._count.users} kullanıcı var; önce rollerini değiştirin`);
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log(me.id, 'role.delete', 'role', id, { name: role.name });
  }

  /** Roldeki kullanıcıların açık oturumları yetkilerini hemen yenilesin. */
  private async notifyMembers(roleId: number) {
    const users = await this.prisma.userRole.findMany({ where: { roleId }, select: { userId: true } });
    if (users.length) this.events.emit('auth.changed', null, { userIds: users.map((u) => u.userId) });
  }
}
