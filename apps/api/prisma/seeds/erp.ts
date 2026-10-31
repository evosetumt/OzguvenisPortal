import type { PrismaClient } from '@prisma/client';

/**
 * Netsis modülü varsayılanları: yöneticiler departmanlarının (plasiyer kodlarının) cari hesaplarını görebilir.
 * Var olan rol yetkisine dokunulmaz (yönetimden değiştirilmiş olabilir).
 */
export async function seedErp(prisma: PrismaClient) {
  const GRANTS: [string, string, string][] = [
    ['Yönetici', 'account.read', 'department'],
  ];
  for (const [roleName, code, scope] of GRANTS) {
    const [role, perm] = await Promise.all([
      prisma.role.findUnique({ where: { name: roleName } }),
      prisma.permission.findUnique({ where: { code } }),
    ]);
    if (!role || !perm) continue;
    const exists = await prisma.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } } });
    if (!exists) await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id, scope } });
  }
}
