import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedNotifications } from './seeds/notifications';
import { seedErp } from './seeds/erp';
import { seedWorkflow } from './seeds/workflow';
import { seedTracking } from './seeds/tracking';
import { seedWhatsapp } from './seeds/whatsapp';
import { seedChat } from './seeds/chat';

const prisma = new PrismaClient();

// Modül izin kodları: modül.eylem
const PERMISSIONS: [string, string][] = [
  ['user.read', 'Kullanıcıları görüntüle'],
  ['user.manage', 'Kullanıcı ve rol yönet'],
  ['task.read', 'Görevleri görüntüle'],
  ['task.write', 'Görev oluştur/düzenle'],
  ['calendar.read', 'Takvimi görüntüle'],
  ['order.read', 'Siparişleri görüntüle (Netsis)'],
  ['quote.read', 'Teklifleri görüntüle (Netsis)'],
  ['shipment.read', 'Teslimat bilgilerini görüntüle (Netsis)'],
  ['account.read', 'Cari hesapları görüntüle (Netsis)'],
  ['report.read', 'Raporları görüntüle'],
  ['expense.create', 'Masraf gir'],
  ['expense.approve', 'Masraf onayla (yönetici)'],
  ['expense.accounting', 'Masraf muhasebe onayı'],
  ['tracking.read', 'Süre takibini görüntüle'],
  ['tracking.write', 'Süre takibi kaydı yönet'],
  ['workflow.design', 'BPMN akışlarını tasarla'],
  ['notification.manage', 'Bildirim kurallarını yönet'],
  ['erp.manage', 'Netsis senkronunu yönet'],
  ['whatsapp.send', 'WhatsApp mesajı gönder'],
  ['payment.read', 'Ödeme takibini görüntüle'],
  ['payment.manage', 'Ödeme kaydı yönet (çek, kredi kartı, vergi...)'],
  ['chat.audit', 'Sohbet arşivi: tüm sohbetler, silinen mesajlar ve geri getirme'],
];

// rol -> [izin kodu, kapsam]
// Kural: personel yalnızca kendi açtığı ve kendisine açılan (atanan / izleyici / davetli) kayıtları görür;
// yönetici görev, takvim, analiz ve süre takibinde her şeyi görür. Masraf onayı ve Netsis kayıtları departman / plasiyer bazlıdır.
const ROLES: Record<string, [string, string][]> = {
  Yönetici: [
    ['user.read', 'all'], ['task.read', 'all'], ['task.write', 'all'],
    ['calendar.read', 'all'], ['order.read', 'department'], ['quote.read', 'department'],
    ['shipment.read', 'department'], ['report.read', 'all'], ['expense.create', 'own'],
    ['expense.approve', 'department'], ['tracking.read', 'all'],
    ['payment.read', 'department'], ['payment.manage', 'department'],
  ],
  Muhasebe: [
    ['task.read', 'own'], ['task.write', 'own'], ['calendar.read', 'own'], ['account.read', 'all'],
    ['report.read', 'own'], ['expense.create', 'own'], ['expense.accounting', 'all'],
    ['payment.read', 'all'], ['payment.manage', 'all'],
  ],
  Personel: [
    ['task.read', 'own'], ['task.write', 'own'], ['calendar.read', 'own'], ['expense.create', 'own'],
    ['payment.read', 'own'],
  ],
};

async function main() {
  for (const [code, label] of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: { label }, create: { code, label } });
  }
  const perms = await prisma.permission.findMany();
  const byCode = new Map(perms.map((p) => [p.code, p.id]));

  const admin = await prisma.role.upsert({
    where: { name: 'Admin' }, update: {}, create: { name: 'Admin', description: 'Tüm yetkiler' },
  });
  for (const p of perms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: admin.id, permissionId: p.id } },
      update: { scope: 'all' }, create: { roleId: admin.id, permissionId: p.id, scope: 'all' },
    });
  }

  // Varsayılan roller yalnızca ilk kurulumda yetkilendirilir; sonradan Ayarlar → Roller ve yetkiler'de yapılan
  // değişiklikler seed tekrar çalışınca ezilmez (rol zaten varsa yetkilerine dokunulmaz).
  for (const [name, list] of Object.entries(ROLES)) {
    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) continue;
    const role = await prisma.role.create({ data: { name } });
    for (const [code, scope] of list) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: byCode.get(code)!, scope } });
    }
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@ozguvenis.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Degistir!12345';
  const user = await prisma.user.upsert({
    where: { email }, update: {},
    create: { email, fullName: 'Sistem Yöneticisi', passwordHash: await bcrypt.hash(password, 10) },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: admin.id } },
    update: {}, create: { userId: user.id, roleId: admin.id },
  });

  // Masraf eşiği (TL): bu tutar ve altı otomatik onay
  await prisma.setting.upsert({
    where: { key: 'expense.autoApproveLimit' }, update: {}, create: { key: 'expense.autoApproveLimit', value: '50' },
  });

  // Varsayılan kanban kolonları (tüm projeler için)
  const STATUSES: [string, boolean][] = [['Yapılacak', false], ['Devam ediyor', false], ['İncelemede', false], ['Tamamlandı', true]];
  if ((await prisma.taskStatus.count({ where: { projectId: null } })) === 0) {
    for (const [i, [name, isDone]] of STATUSES.entries()) {
      await prisma.taskStatus.create({ data: { name, isDone, sortOrder: i } });
    }
  }
  if ((await prisma.project.count()) === 0) {
    await prisma.project.createMany({
      data: [
        { name: 'İş emri', color: '#3b82f6', ownerId: user.id, pinned: true },
        { name: 'Filo', color: '#34d399', ownerId: user.id },
        { name: 'Sözleşmeler', color: '#fb923c', ownerId: user.id },
      ],
    });
  }

  // Modüllerin varsayılan verileri (her biri tekrar çalıştırılabilir olmalı)
  for (const fn of [seedNotifications, seedErp, seedWorkflow, seedTracking, seedWhatsapp, seedChat]) await fn(prisma);

  console.log(`Seed tamam. Yönetici: ${email}`);
}

main().finally(() => prisma.$disconnect());
