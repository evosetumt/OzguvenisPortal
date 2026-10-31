# Özgüveniş Şirket Portalı

Web, Android ve iPhone'da çalışan kurumsal portal: görev takibi, takvim, bildirimler, Netsis'ten sipariş/teklif/cari raporları, masraf onayı, süre takibi, mesajlaşma, BPMN iş akışları.

| Konu | Karar |
|---|---|
| İstemci | React + TypeScript (Vite), mobil için Capacitor |
| Sunucu | NestJS (Windows hizmeti), IIS ters proxy arkasında |
| Portal veritabanı | SQL Server (Netsis'ten **ayrı** veritabanı) |
| Netsis | MSSQL, **yalnızca okuma** |
| Arama / toplantı | WebRTC eşler arası (P2P), sinyal socket.io; ek medya sunucusu yok |

## Klasörler

```
apps/api      NestJS + Prisma (SQL Server), socket.io, Netsis bağlayıcısı, BPMN motoru
apps/web      React arayüzü (Pane tarzı cam efektli tema), PWA, Capacitor (apps/web/android)
deploy/       Yedekleme betiği (yedekle.ps1), ikon üretici
docs/PLAN.md            Kapsam, mimari, veri modeli, fazlar, açık sorular
docs/GELISTIRME.md      SQL Server'lı bilgisayarda derleme ve çalıştırma
docs/SUNUCU-KURULUM.md  Windows Server 2022 / IIS / Windows hizmeti / yedekleme / mobil
docs/moduller/          Modül kurulum notları (Netsis, masraf ve BPMN, süre takibi ve WhatsApp,
                        mesajlaşma ve toplantı, bildirim ve mobil)
NETSIS VERITABANI.xls   Netsis veri sözlüğü (tablo/alan açıklamaları)
```

## Hızlı başlangıç

SQL Server'ı olan bir bilgisayarda: [docs/GELISTIRME.md](docs/GELISTIRME.md)

## Durum

**Faz 0–6 kodlandı** ve SQL Server 2022'ye karşı API duman testleriyle doğrulandı (görev/takvim 25, bildirim/push 30, Netsis 40, masraf/BPMN 49, süre takibi/WhatsApp 56, mesajlaşma/toplantı 66 kontrol).

| Faz | Modül | Ayrıntı |
|---|---|---|
| 1 | Görevler (kanban/liste), takvim, bildirim merkezi, kullanıcı/rol yönetimi, push + e-posta kanalları, bildirim kuralları ve kişisel tercihler, görev analizi | [bildirim-mobil.md](docs/moduller/bildirim-mobil.md) |
| 2 | Netsis salt okunur senkron (cari, ekstre, sipariş, teklif, sevk), plasiyer bazlı yetki, iş emri görevlerinin otomatik kapanması | [netsis.md](docs/moduller/netsis.md) |
| 3 | BPMN tasarımcısı (bpmn-js) + motor, masraf onay akışı (eşik → yönetici → muhasebe → ödendi), Onaylarım kutusu, TypeSafe Jev ile kategori önerisi (varsayılan kapalı) | [is-akisi-masraf.md](docs/moduller/is-akisi-masraf.md) |
| 4 | Süre takibi (kasko, muayene, bakım, sözleşme, kira, araçlar) + otomatik hatırlatma, WhatsApp Business (şablon, opt-in, webhook) | [sure-takibi-whatsapp.md](docs/moduller/sure-takibi-whatsapp.md) |
| 4+ | Ödeme takibi (çek, kurumsal kredi kartı, kredi taksiti, vergi/SGK, kira): vadeden N gün önce birim yöneticisine otomatik görev, yönetici görevlendirir, görev bitince ödendi + tekrarlı vade | [odemeler.md](docs/moduller/odemeler.md) |
| 5 | Anlık mesajlaşma (socket.io), sohbette sesli/görüntülü arama ve toplantı (WebRTC P2P), Firebase bildirim | [mesajlasma-toplanti.md](docs/moduller/mesajlasma-toplanti.md) |
| 6 | PWA, Capacitor Android projesi, IIS `web.config`, yedekleme | [SUNUCU-KURULUM.md](docs/SUNUCU-KURULUM.md) |

Dış hesap gerektiren kanallar `.env` doldurulana kadar kapalı kalır, uygulamanın geri kalanı çalışır: Netsis (`netsis_ro` kullanıcısı), Firebase Cloud Messaging, SMTP, WhatsApp Cloud API, TypeSafe. Tüm değişkenler `apps/api/.env.example` içinde.

Rol veya izin değişikliği kullanıcının bir sonraki girişinde geçerli olur (izinler oturum jetonunda taşınır).
