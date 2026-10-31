import type { PrismaClient } from '@prisma/client';

/**
 * WhatsApp ayarları: Meta'da onaylanmış şablonların listesi (WHATSAPP_WABA_ID verilmezse buradan okunur)
 * ve iç bildirimlerde kullanılacak genel şablon. Şablonlar Meta Business Manager'da onaylandıktan sonra
 * Ayarlar → WhatsApp ekranından girilir; burada boş başlar.
 */
export async function seedWhatsapp(prisma: PrismaClient) {
  for (const [key, value] of [['whatsapp.templates', '[]'], ['whatsapp.notificationTemplate', 'null']] as const) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
}
