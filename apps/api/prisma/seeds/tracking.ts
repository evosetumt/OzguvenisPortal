import type { PrismaClient } from '@prisma/client';

/** Süre takibi: rollerin ek izinleri ve hatırlatma ayarları. */
export async function seedTracking(prisma: PrismaClient) {
  // rol -> [izin, kapsam]: Yönetici tüm kayıtları yönetir, Muhasebe tüm sözleşme/poliçeleri görür.
  const grants: Record<string, [string, string][]> = {
    Yönetici: [['tracking.write', 'all']],
    Muhasebe: [['tracking.read', 'all'], ['tracking.write', 'all']],
  };
  for (const [roleName, list] of Object.entries(grants)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) continue;
    for (const [code, scope] of list) {
      const perm = await prisma.permission.findUnique({ where: { code } });
      if (!perm) continue;
      // Var olan atama elle değiştirilmiş olabilir; yalnızca yoksa ekle.
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id, scope },
      });
    }
  }

  // Araç bakım tarihi için kaç gün önceden uyarılacağı
  await prisma.setting.upsert({
    where: { key: 'tracking.vehicleServiceReminderDays' },
    update: {},
    create: { key: 'tracking.vehicleServiceReminderDays', value: '7' },
  });
}
