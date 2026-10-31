/**
 * Örnek (demo) veri: arayüzü dolu görmek ve denemek için.
 *   npm run db:demo            → ekler (önce eski demo verisini siler)
 *   npm run db:demo -- --sil   → yalnızca demo verisini siler
 * Demo kullanıcıları @demo.ozguvenis.local uzantılıdır, şifreleri DEMO_PASSWORD'dür. Üretimde çalıştırmayın.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DOMAIN = '@demo.ozguvenis.local';
const DEMO_PASSWORD = 'Demo!12345';
const PLATE_PREFIX = '34 DMO';
const DAY = 86400000;

// Tekrarlanabilir rastgelelik
let seed = 20261029;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const today = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };
const dayOffset = (n: number) => new Date(today().getTime() + n * DAY);
const at = (n: number, h: number) => new Date(today().getTime() + n * DAY + (h - 3) * 3600000); // TR saati ≈ UTC+3

const PEOPLE: [string, string, string][] = [
  ['Elif Karaca', 'Satış', 'Yönetici'],
  ['Mert Aydın', 'Satış', 'Personel'],
  ['Zeynep Öztürk', 'Satış', 'Personel'],
  ['Can Yıldız', 'Operasyon', 'Yönetici'],
  ['Selin Demir', 'Operasyon', 'Personel'],
  ['Burak Şahin', 'Operasyon', 'Personel'],
  ['Ayşe Koç', 'Muhasebe', 'Muhasebe'],
  ['Emre Arslan', 'Filo', 'Personel'],
];
const TITLES_BY_NAME: Record<string, string> = {
  'Elif Karaca': 'Satış Müdürü', 'Mert Aydın': 'Satış Temsilcisi', 'Zeynep Öztürk': 'Satış Temsilcisi', 'Can Yıldız': 'Operasyon Müdürü',
  'Selin Demir': 'Lojistik Uzmanı', 'Burak Şahin': 'Depo Sorumlusu', 'Ayşe Koç': 'Muhasebe Uzmanı', 'Emre Arslan': 'Filo Sorumlusu',
};
const PROJECTS: [string, string, boolean][] = [
  ['Yeni bayi açılışı', '#a07cff', true],
  ['Web sitesi yenileme', '#f2649f', false],
  ['Depo düzeni', '#22c3c0', false],
];
const TITLES: Record<string, string[]> = {
  'İş emri': ['Deneme Ltd yıllık sipariş girişi', 'Örnek Ticaret teklif revizyonu', 'Pompa yedek parça teklifi', 'Filtre siparişini Netsis\'e gir',
    'Bakım sözleşmesi teklifi hazırla', 'Fiyat listesi güncellemesi', 'Kampanya teklifleri', 'Sevkiyat planını onayla', 'Cari mutabakat mektupları',
    'Vadesi geçen alacak takibi', 'Bayi sipariş toplu girişi', 'İhracat proforma faturası'],
  Filo: ['34 DMO 01 kasko yenileme', 'Araç muayene randevusu', 'Lastik değişim planı', 'Yakıt kartı limitleri', 'Servis bakım kayıtları', 'Araç tahsis formları'],
  'Sözleşmeler': ['Depo kira sözleşmesi yenileme', 'Temizlik firması sözleşmesi', 'Yazılım lisans yenileme', 'Güvenlik hizmeti teklifleri', 'Kargo anlaşması revizyonu'],
  'Yeni bayi açılışı': ['Bayi sözleşme taslağı', 'Açılış etkinliği planı', 'Tabela ve görsel tasarım', 'İlk stok listesi', 'Bayi eğitim programı', 'Basın bülteni', 'Açılış bütçesi onayı'],
  'Web sitesi yenileme': ['Ana sayfa tasarımı', 'Ürün kataloğu sayfaları', 'İletişim formu', 'SEO metinleri', 'Mobil uyum testleri', 'Hosting taşıma'],
  'Depo düzeni': ['Raf etiketleme', 'Sayım planı', 'Forklift bakım', 'Giriş-çıkış akışı', 'İş güvenliği tatbikatı', 'Ambalaj malzemesi siparişi'],
};
const COMMENTS = ['Müşteriyle görüştüm, yarın dönüş yapacak.', 'Taslak ekte, kontrol eder misiniz?', 'Netsis\'e girildi.', 'Bütçe onayı bekleniyor.', 'Tamamdır, teşekkürler 👍', 'Tarihi bir hafta öteleyelim mi?'];
const SUBTASKS = ['Bilgileri topla', 'Taslak hazırla', 'Onaya gönder', 'Netsis\'e gir', 'Müşteriye ilet'];

async function remove() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.$transaction(async (tx) => {
    const convs = await tx.conversation.findMany({ where: { createdById: { in: ids } }, select: { id: true } });
    await tx.message.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { conversationId: { in: convs.map((c) => c.id) } }] } });
    await tx.conversationMember.deleteMany({ where: { OR: [{ userId: { in: ids } }, { conversationId: { in: convs.map((c) => c.id) } }] } });
    await tx.conversation.deleteMany({ where: { id: { in: convs.map((c) => c.id) } } });
    const tasks = await tx.task.findMany({ where: { OR: [{ createdById: { in: ids } }, { assigneeId: { in: ids } }] }, select: { id: true } });
    const tids = tasks.map((t) => t.id);
    const demoDepts = (await tx.department.findMany({ where: { name: { endsWith: ' (demo)' } }, select: { id: true } })).map((d) => d.id);
    await tx.payment.deleteMany({ where: { OR: [
      { createdById: { in: ids } }, { assigneeId: { in: ids } }, { paidById: { in: ids } }, { taskId: { in: tids } }, { departmentId: { in: demoDepts } },
    ] } });
    await tx.taskComment.deleteMany({ where: { OR: [{ taskId: { in: tids } }, { userId: { in: ids } }] } });
    await tx.taskWatcher.deleteMany({ where: { OR: [{ taskId: { in: tids } }, { userId: { in: ids } }] } });
    await tx.taskSubtask.deleteMany({ where: { taskId: { in: tids } } });
    await tx.task.deleteMany({ where: { id: { in: tids } } });
    const projects = await tx.project.findMany({ where: { ownerId: { in: ids } }, select: { id: true } });
    await tx.projectMember.deleteMany({ where: { OR: [{ projectId: { in: projects.map((p) => p.id) } }, { userId: { in: ids } }] } });
    await tx.project.deleteMany({ where: { id: { in: projects.map((p) => p.id) } } });
    const events = await tx.calendarEvent.findMany({ where: { ownerId: { in: ids } }, select: { id: true } });
    await tx.calendarEventAttendee.deleteMany({ where: { OR: [{ eventId: { in: events.map((e) => e.id) } }, { userId: { in: ids } }] } });
    await tx.calendarEvent.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    await tx.trackedItem.deleteMany({ where: { ownerId: { in: ids } } });
    await tx.vehicle.deleteMany({ where: { plate: { startsWith: PLATE_PREFIX } } });
    await tx.notification.deleteMany({ where: { userId: { in: ids } } });
    await tx.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await tx.department.updateMany({ where: { managerId: { in: ids } }, data: { managerId: null } });
    await tx.userRole.deleteMany({ where: { userId: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
    await tx.department.deleteMany({ where: { name: { endsWith: ' (demo)' } } });
  }, { timeout: 60000 });
  console.log(`Demo verisi silindi (${ids.length} kullanıcı).`);
}

async function create() {
  const admin = await prisma.user.findFirstOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@ozguvenis.local' } });
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.name, r.id]));
  const statuses = await prisma.taskStatus.findMany({ where: { projectId: null }, orderBy: { sortOrder: 'asc' } });
  const doneStatus = statuses.find((s) => s.isDone)!;
  const openStatuses = statuses.filter((s) => !s.isDone);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Departmanlar ve kişiler
  const depts = new Map<string, number>();
  for (const name of [...new Set(PEOPLE.map((p) => p[1]))]) {
    depts.set(name, (await prisma.department.create({ data: { name: `${name} (demo)` } })).id);
  }
  const users: { id: number; name: string; dept: string }[] = [];
  for (const [i, [fullName, dept, role]] of PEOPLE.entries()) {
    const email = fullName.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/\s+/g, '.') + DOMAIN;
    const u = await prisma.user.create({
      data: {
        email, fullName, passwordHash: hash, departmentId: depts.get(dept), title: TITLES_BY_NAME[fullName] ?? null, phone: `+90 532 000 00 ${String(10 + i)}`,
        erpRepCode: dept === 'Satış' ? ['P01', 'P02', 'P03'][i % 3] : null,
        roles: { create: [{ roleId: roles.get(role)! }] },
      },
    });
    users.push({ id: u.id, name: fullName, dept });
    if (role === 'Yönetici') await prisma.department.update({ where: { id: depts.get(dept)! }, data: { managerId: u.id } });
  }
  // Yönetici de ekipte görünsün diye görev atanabilir kişilere dahil
  const assignees = [...users, { id: admin.id, name: admin.fullName, dept: '' }];

  // Projeler
  const projects = await prisma.project.findMany({ where: { deletedAt: null } });
  for (const [name, color, pinned] of PROJECTS) {
    projects.push(await prisma.project.create({ data: { name, color, pinned, ownerId: users[0].id } }));
  }

  // Görevler: tamamlananlar son 90 güne yayılır (Analiz), açıklar geciken/bugün/ileri tarihli
  let n = 0;
  for (const p of projects) {
    const titles = TITLES[p.name] ?? TITLES['Depo düzeni'];
    const reps = p.name === 'İş emri' ? 3 : 2;
    for (let r = 0; r < reps; r++) {
      for (const title of titles) {
        const who = pick(assignees);
        const creator = pick(users);
        const done = rnd() < 0.55;
        const priority = pick(['low', 'normal', 'normal', 'normal', 'high', 'high', 'urgent']);
        let createdAt: Date, completedAt: Date | null = null, dueDate: Date | null, status = doneStatus;
        if (done) {
          const doneAgo = Math.floor(Math.pow(rnd(), 1.4) * 88);
          completedAt = at(-doneAgo, int(9, 18));
          createdAt = at(-doneAgo - int(1, 14), int(9, 17));
          dueDate = rnd() < 0.85 ? dayOffset(-doneAgo + (rnd() < 0.82 ? int(0, 5) : -int(1, 4))) : null;
        } else {
          status = pick(openStatuses);
          createdAt = at(-int(0, 50), int(9, 17));
          const d = rnd();
          dueDate = d < 0.14 ? dayOffset(-int(1, 6)) : d < 0.3 ? dayOffset(0) : d < 0.9 ? dayOffset(int(1, 30)) : null;
        }
        const isErp = p.name === 'İş emri';
        const task = await prisma.task.create({
          data: {
            title: r ? `${title} (${r + 1}. dönem)` : title,
            description: rnd() < 0.5 ? 'Ayrıntılar ekteki notlarda. Takvime göre ilerleyelim.' : null,
            priority, projectId: p.id, statusId: status.id, assigneeId: who.id, createdById: creator.id,
            dueDate, createdAt, completedAt, sortOrder: n++,
            taskType: isErp ? pick(['erp_order', 'erp_quote', 'general']) : 'general',
            customerRef: isErp ? pick(['TEST001', 'TEST002', 'TEST003']) : null,
            completedViaErp: isErp && done && rnd() < 0.5,
          },
        });
        if (rnd() < 0.45) {
          const k = int(2, 4);
          const doneK = done ? k : int(0, k - 1);
          for (let i = 0; i < k; i++) await prisma.taskSubtask.create({ data: { taskId: task.id, title: SUBTASKS[i], done: i < doneK, sortOrder: i } });
        }
        for (let i = 0, c = rnd() < 0.4 ? int(1, 3) : 0; i < c; i++) {
          await prisma.taskComment.create({ data: { taskId: task.id, userId: pick(assignees).id, body: pick(COMMENTS), createdAt: new Date(createdAt.getTime() + (i + 1) * 3600000) } });
        }
      }
    }
  }

  // Takvim
  const events: [string, number, number, number, string][] = [
    ['Haftalık satış toplantısı', 1, 10, 11, 'department'], ['Bayi açılışı hazırlık', 3, 14, 15, 'company'],
    ['Müşteri ziyareti: Deneme Ltd', 2, 11, 12, 'private'], ['Ay sonu kapanış', 6, 9, 17, 'company'], ['Filo bakım günü', 8, 9, 12, 'department'],
  ];
  for (const [title, d, h1, h2, visibility] of events) {
    await prisma.calendarEvent.create({
      data: {
        title, startsAt: at(d, h1), endsAt: at(d, h2), visibility, ownerId: users[0].id,
        attendees: { create: [{ userId: admin.id }, { userId: users[1].id }] },
      },
    });
  }

  // Araçlar ve süre takibi
  const v1 = await prisma.vehicle.create({ data: { plate: `${PLATE_PREFIX} 01`, brandModel: 'Ford Transit Custom', year: 2022, km: 48200, assignedUserId: users[7].id } });
  const v2 = await prisma.vehicle.create({ data: { plate: `${PLATE_PREFIX} 02`, brandModel: 'Renault Clio', year: 2021, km: 61500, assignedUserId: users[1].id } });
  await prisma.vehicleService.createMany({ data: [
    { vehicleId: v1.id, type: 'Periyodik bakım', date: dayOffset(-120), km: 40000, cost: 6800, nextDueDate: dayOffset(12), nextDueKm: 50000 },
    { vehicleId: v2.id, type: 'Lastik değişimi', date: dayOffset(-30), km: 60900, cost: 9200 },
  ] });
  const owner = users[6].id;
  const tracked: [string, string, number, number | null, number | null][] = [
    ['insurance', '34 DMO 01 kasko poliçesi', 9, 18500, v1.id], ['vehicle_inspection', '34 DMO 02 muayene', 24, null, v2.id],
    ['rent', 'Merkez depo kira sözleşmesi', 47, 65000, null], ['contract', 'Muhasebe yazılımı lisansı', 75, 42000, null],
    ['commitment', 'İnternet taahhüdü', -3, 1450, null], ['insurance', 'İşyeri yangın sigortası', 160, 22800, null],
  ];
  for (const [category, title, days, amount, vehicleId] of tracked) {
    await prisma.trackedItem.create({
      data: { category, title, endDate: dayOffset(days), startDate: dayOffset(days - 365), amount, vehicleId, ownerId: owner, renewalPeriod: 'yearly',
        counterparty: category === 'insurance' ? 'Örnek Sigorta A.Ş.' : null, status: days < 0 ? 'expired' : 'active' },
    });
  }

  // Ödemeler: hepsi "planlı" eklenir; API açılışından ~20 sn sonra zamanlayıcı ön süresi gelenlerin görevini birim yöneticisine açar.
  // Muhasebe biriminin yöneticisi yok: görevleri ödeme yetkililerine (Muhasebe rolü) bildirilir.
  const payer = users[6].id;
  const payments: [string, string, string | null, string | null, number, number, string, string, number | null][] = [
    ['cheque', 'Verilen çek – Yıldız Ambalaj', 'Ziraat Bankası', '0012457', 48500, 4, 'Operasyon', 'none', null],
    ['credit_card', 'Şirket kartı ekstresi', 'Garanti BBVA', '4421', 23870.4, 6, 'Muhasebe', 'monthly', null],
    ['sgk', 'SGK primi', 'SGK', null, 61240, 9, 'Muhasebe', 'monthly', null],
    ['rent', 'Satış ofisi kirası', 'Mülk sahibi', null, 32000, 3, 'Satış', 'monthly', null],
    ['loan', 'İşletme kredisi taksiti', 'İş Bankası', 'KRD-2291', 41750, 14, 'Muhasebe', 'monthly', 15],
    ['tax', 'KDV ödemesi', 'Vergi dairesi', null, 87300, 27, 'Muhasebe', 'monthly', null],
    ['cheque', 'Verilen çek – Akdeniz Lojistik', 'Halkbank', '0098811', 19900, 45, 'Operasyon', 'none', null],
    ['credit_card', 'Satış ekibi kartı ekstresi', 'Yapı Kredi', '7310', 8640.25, 38, 'Satış', 'monthly', null],
  ];
  for (const [type, title, counterparty, docNo, amount, days, dept, recurrence, leadDays] of payments) {
    await prisma.payment.create({
      data: { type, title, counterparty, docNo, amount, dueDate: dayOffset(days), departmentId: depts.get(dept)!, recurrence, leadDays, createdById: payer },
    });
  }
  await prisma.payment.create({
    data: { type: 'invoice', title: 'Elektrik faturası', counterparty: 'Enerji A.Ş.', amount: 12480, dueDate: dayOffset(-12), departmentId: depts.get('Muhasebe')!,
      status: 'paid', paidAt: dayOffset(-13), paidById: payer, createdById: payer },
  });

  // Sohbet
  const conv = await prisma.conversation.create({
    data: { type: 'group', title: 'Satış ekibi', createdById: users[0].id, lastMessageAt: new Date(),
      members: { create: [users[0], users[1], users[2], { id: admin.id }].map((u) => ({ userId: u.id })) } },
  });
  const lines: [number, string][] = [[0, 'Günaydın, bu hafta bayi açılışı için teklifleri toparlayalım.'], [1, 'Deneme Ltd siparişi Netsis\'e girildi.'],
    [2, 'Örnek Ticaret revize teklif istedi, bugün gönderiyorum.'], [0, 'Süper, teşekkürler!']];
  for (const [i, [who, body]] of lines.entries()) {
    await prisma.message.create({ data: { conversationId: conv.id, senderId: users[who].id, body, createdAt: new Date(Date.now() - (lines.length - i) * 1800000) } });
  }

  const total = await prisma.task.count({ where: { createdById: { in: users.map((u) => u.id) } } });
  console.log(`Demo verisi eklendi: ${users.length} kullanıcı, ${PROJECTS.length} proje, ${total} görev. Demo kullanıcı şifresi: apps/api/prisma/demo.ts içindeki DEMO_PASSWORD.`);
}

async function main() {
  await remove();
  if (!process.argv.includes('--sil')) await create();
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
