# Haber akışı (/feed)

CRM tarzı akış: paylaşım kutusu, kart başına kişi · firma (Netsis cari) · ilgili kayıt · zaman, **Beğen · Yorum yaz · Aktivite ekle**; sağda **Beni bekleyenler** ve **Şimdi aktif**.

## Görünürlük (`feed.read`)
| Kapsam | Kim | Ne görür |
|---|---|---|
| own (varsayılan, izni olmayan dahil) | Personel, Muhasebe | Yalnız kendi akışı: yazdığı kartlar ve kendisiyle ilgili olay kartları |
| department | (Ayarlar'dan verilirse) | Kendi birimindeki kişilerin akışları |
| all | Yönetici, Admin | Herkesin akışı + kişi süzgeci |

Kartın kimin akışında olduğu `FeedAudience` tablosunda tutulur. Yorum/beğeni/aktivite yalnız görülebilen karta yapılabilir. Kartı yazarı ya da `all` kapsamlı kullanıcı siler (yumuşak silme).

## Otomatik kartlar (`feed-events.service.ts`)
- `task.created` (kullanıcının açtığı; sistem görevleri hariç) ve `task.completed` → görevin atananı ve açanının akışına
- Karttan açılan aktivite (`relatedType = 'feed_post'`) ayrı kart üretmez; ait olduğu kart güncellenir (`FeedService.touch`), açık akışlar aktivitenin durumunu canlı görür
- `order.created`, `order.status_changed`, `quote.created`, `shipment.dispatched` → plasiyer koduyla eşlenen kullanıcıların akışına (eşlenen kullanıcı yoksa kart üretilmez; ilk Netsis eşitlemesi olay yaymaz)

## Aktivite ekle
Karttan görev açar: `Task.relatedType = 'feed_post'`, `relatedId = kart id`, cari kodu karttan gelir. Görev yazma yetkisi ve atama kuralları `TasksService` içinde denetlenir.

## Veri
`FeedPost`, `FeedAudience`, `FeedLike`, `FeedComment` — migration `20261120070756_feed` (izin ve rol yetkilerini de ekler). Canlı yenileme konusu: `feed`.
