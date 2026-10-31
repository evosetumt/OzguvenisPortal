# Mesajlaşma ve görüntülü toplantı (Faz 5)

## Özet
- **Anlık bağlantı:** Tek socket.io kapısı, yol `/api/socket.io` (IIS yalnızca `/api` önekini yönlendirir). İstemci el sıkışmada `auth: { token: <JWT> }` gönderir; geçersiz jetonda `auth_error` olayı gelir ve bağlantı kapanır. Her kullanıcı `user:<id>` odasına girer.
- **Mesajlaşma:** Birebir (kullanıcı çifti başına tek sohbet) ve grup sohbetleri, dosya eki, düzenleme/silme (yalnızca kendi mesajı, silme yumuşak), okundu imleci, "yazıyor…" göstergesi. Sohbete yalnızca üyeleri erişir; üye olmayana 404 döner.
- **Bildirimler anında:** Uygulama içi her bildirim `notification:new` olayıyla zile anında düşer. 30 sn yoklama, bağlantı koparsa yedek olarak kalır; yeniden bağlanınca liste tazelenir.
- **Arama ve toplantı:** WebRTC, eşler arası (P2P, mesh). Sohbetten sesli/görüntülü arama; planlanan toplantıya "Katıl" ile aynı altyapıda canlı oturum. Görüntü ve ses sunucudan geçmez; sunucu yalnızca sinyali iletir ve arama geçmişini kaydeder. Toplantılar takvimde `meeting` türünde görünür (yalnızca düzenleyen ve katılımcılara).

## REST uç noktaları (hepsi giriş ister, özel izin gerekmez)

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/chat/conversations` | Sohbetlerim: üyeler, son mesaj, okunmamış sayısı |
| GET | `/api/chat/unread` | Toplam okunmamış (menü rozeti) |
| POST | `/api/chat/direct` `{userId}` | Birebir sohbeti bul veya oluştur |
| POST | `/api/chat/groups` `{title, memberIds}` | Grup oluştur |
| GET/PATCH | `/api/chat/conversations/:id` | Sohbet özeti / grup adı (yalnızca oluşturan) |
| POST | `/api/chat/conversations/:id/members` `{userIds}` | Üye ekle (yalnızca oluşturan) |
| DELETE | `/api/chat/conversations/:id/members/:userId` | Üye çıkar (oluşturan) veya gruptan ayrıl (kendisi) |
| GET | `/api/chat/conversations/:id/messages?before=&take=` | Mesajlar, yeniden eskiye; `before` imleciyle daha eskiler |
| POST | `/api/chat/conversations/:id/messages` `{body?, attachmentId?}` | Gönder (en fazla 4000 karakter; ek varsa metin boş olabilir) |
| POST | `/api/chat/conversations/:id/read` `{messageId?}` | Okundu imlecini ilerlet |
| PATCH/DELETE | `/api/chat/messages/:id` | Kendi mesajını düzenle / sil |
| GET | `/api/meetings?when=upcoming\|past` | Toplantılarım |
| POST | `/api/meetings` `{title, startsAt, endsAt, participantIds?, conversationId?}` | Planla (en fazla 24 saat) |
| GET/DELETE | `/api/meetings/:id` | Ayrıntı / iptal (yalnızca düzenleyen, katılımcılara bildirim) |
| POST | `/api/meetings/:id/join` | Toplantının canlı oturumuna katıl (başlangıçtan 15 dk önce → bitiş) `{call, peers, iceServers}` |
| GET | `/api/meetings/:id/attendance` | Katılım geçmişi: oturumlar, kim ne zaman girdi/çıktı |
| POST | `/api/calls` `{conversationId, kind: audio\|video}` | Sohbetten arama başlat (sohbette süren arama varsa ona katılır) |
| GET | `/api/calls/mine` | Çalan/süren aramalarım (sayfa yenilenince zil geri gelir) |
| GET | `/api/calls/:id` | Arama özeti ve katılımcı durumları |
| POST | `/api/calls/:id/join` \| `decline` \| `leave` | Cevapla / reddet / ayrıl |

Dosya ekleri ortak `/api/attachments` ile yüklenir; mesaja bağlanan dosyayı sohbetin üyeleri indirebilir.

## Soket olayları

| Yön | Olay | Veri |
|---|---|---|
| sunucu → istemci | `message:new` | Mesaj (gönderen dahil tüm üyelere; diğer sekmeler için) |
| sunucu → istemci | `message:updated` | Düzenlenen/silinen mesaj (silinende metin ve ek boş) |
| sunucu → istemci | `read` | `{conversationId, userId, messageId}` |
| sunucu → istemci | `conversation:updated` | `{conversationId, removedUserId?}` (grup oluşturma, ad, üye değişikliği) |
| sunucu → istemci | `typing` | `{conversationId, userId}` |
| sunucu → istemci | `notification:new` | Uygulama içi bildirim kaydı |
| sunucu → istemci | `auth_error` | Jeton geçersiz |
| istemci → sunucu | `typing` | `{conversationId}` (yalnızca üyeysen iletilir) |

Diğer modüller anlık olay göndermek için `ChatModule`'ü import edip `RealtimeGateway.toUser(id, olay, veri)` / `toUsers(...)` kullanabilir.

## Bildirim kuralları
- `message.received` (Yeni mesaj): varsayılan kanal **yalnızca push**, ve yalnızca o an çevrimiçi olmayan (açık soket bağlantısı olmayan) alıcılara. Uygulama açıkken mesaj zaten anında göründüğü için bildirim merkezi mesajlarla doldurulmaz. Ayarlar → Bildirim kurallarından değiştirilebilir.
- `meeting.invited` (uygulama içi + push), `meeting.cancelled` (uygulama içi).

## WebRTC aramaları

- **Mesh:** her katılımcı diğer herkese ayrı bağlantı açar (`apps/web/src/lib/rtc.ts`). Yeni katılan içeridekilere teklif gönderir; çakışmalar "perfect negotiation" ile çözülür. Arama/toplantı başına en fazla **8** kişi (`MAX_JOINED`); pratikte görüntülüde 4-6 kişi rahattır.
- **Sinyal:** socket.io `rtc:signal` (teklif/yanıt/ICE) ve `call:media` (mikrofon/kamera/ekran durumu). Sunucu yalnızca aynı aramaya **bağlı** iki kişi arasında iletir, kaydetmez.
- **Sohbet araması:** arayan bağlanır, diğer üyelerde zil çalar (`call:incoming`; uygulaması kapalı olana FCM push). 45 sn cevap gelmezse cevapsız. Birebirde biri kapatınca, grupta tek kişi kalınca biter. Bitince sohbete özet mesajı düşer (`📞 Sesli arama · 3 dk`, `📵 Cevapsız ...`, `📵 Reddedilen ...`) ve cevapsız kalanlara `call.missed` bildirimi gider.
- **Toplantı:** toplantı başına tek canlı oturum; ilk giren açar, son çıkan kapatır.
- **Kayıt:** `Call` (tür, durum, başlangıç/cevap/bitiş) ve `CallParticipant` (çalıyor/katıldı/ayrıldı/reddetti/cevapsız, giriş-çıkış saatleri). Görüntü/ses kaydedilmez.
- **Bağlantı kopması:** sekmesi kapanan kullanıcı aramadan çıkarılır (sayfa kapanırken `leave`, soket 20 sn dönmezse sunucu düşürür). Sunucu yeniden başlarsa açık aramalar kapatılır.
- **Güvenli bağlantı şart:** tarayıcılar kamera/mikrofonu yalnızca `https://` (veya `localhost`) adreste açar. `http://<ip>` ile girilirse arama yalnızca dinleyici olarak açılır ve uyarı gösterilir.
- **Soket olayları:** `call:incoming`, `call:updated`, `call:joined`, `call:left`, `call:ended {callId, status}`, `rtc:signal {callId, from, data}`, `call:media {callId, userId, mic, cam, screen}`.

## Ortam değişkenleri (`apps/api/.env`)

```
# İç ağda boş bırakılabilir (varsayılan: Google STUN). Mobil veri / farklı ağdan katılım için TURN ekleyin:
ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.sirket.com.tr:3478","username":"u","credential":"p"}]'
```

Aynı iç ağdaki cihazlar birbirine doğrudan bağlanır. Cihazlardan biri mobil veride veya başka bir ağdaysa (katı NAT) doğrudan bağlantı kurulamayabilir; bu durumda bir TURN sunucusu (ör. coturn) gerekir.

## IIS notları (socket.io)
- IIS'te **WebSocket Protocol** özelliği (Sunucu Rolleri → Web Sunucusu → Uygulama Geliştirme) kurulu ve ARR'da proxy etkin olmalı.
- `/api/*` ters proxy kuralı `/api/socket.io/` yolunu da kapsar; ayrı kural gerekmez. URL Rewrite, `Upgrade: websocket` başlığını ARR ile otomatik taşır.
- Uzun yoklama yedeği için ARR **yanıt arabelleğe almasını** (Response buffer threshold) 0 yapın veya `web.config`'te `responseBufferLimit="0"` verin; aksi halde polling gecikebilir.
- ARR zaman aşımı (Server Farm → Proxy → Timeout) en az 120 sn olmalı; socket.io 25 sn'de bir ping atar.
- Tek API süreci çalıştığı için yapışkan oturum (sticky session) gerekmez. Birden fazla süreç çalıştırılırsa socket.io Redis adaptörü gerekir.

## Geliştirme
- Vite geliştirme sunucusunda WebSocket'in de 3000'e gitmesi için `vite.config.ts` proxy'sinde `/api` için `ws: true` gerekir. Yoksa socket.io otomatik olarak uzun yoklamaya düşer, yine çalışır.
- Kamera/mikrofon tarayıcıda yalnızca HTTPS veya `localhost` üzerinde açılır.

## Sohbet arşivi (yönetici)
- İzin: `chat.audit` (Admin rolünde varsayılan; başka role Ayarlar → Kullanıcılar'dan verilebilir). Arayüz: Ayarlar → **Sohbet arşivi**.
- Mesajlar hiçbir zaman fiziksel silinmez: kullanıcı silince `deletedAt` dolar, içerik yalnızca üyelerden gizlenir. Arşivde içerik ve ek görünür, **Geri getir** ile sohbette yeniden görünür (`chat.message_restore` denetim kaydı).
- Düzenlenen mesajın önceki metni `MessageRevision` tablosunda saklanır.
- Gruptan çıkarılan kişinin eski sohbetleri, kişi filtresinde mesaj yazdığı sohbetler olarak bulunur.
- Uç noktalar: `GET /api/chat/admin/conversations?q=&userId=`, `GET /api/chat/admin/conversations/:id/messages?before=&take=`, `POST /api/chat/admin/messages/:id/restore`.

## Toplantı notları ve toplantıdan görev
- Her katılımcının toplantı başına kendine özel notu vardır (`MeetingNote`); yalnızca sahibi görür. Toplantı odasındaki not simgesinden veya toplantı kartından (geçmiş toplantılar dahil) açılır, yazarken otomatik kaydedilir.
- Görev yazma kapsamı `all` veya `department` olanlar (yöneticiler) toplantı sırasında istediği kişiye görev açar. Görev `relatedType = 'meeting'` ile toplantıya bağlanır; tüm katılımcılar toplantının görev listesini görür. Departman kapsamlı yönetici yalnızca kendi departmanına atayabilir.
- Uç noktalar: `GET/PUT /api/meetings/:id/note`, `GET/POST /api/meetings/:id/tasks`.

## Dosyalar
Mesaj, masraf ve süre takibi ekleri veritabanına değil `STORAGE_DIR` klasörüne yazılır (veritabanında yalnızca ad/tür/boyut/yol). Klasörü `apps/api/.env` içinde belirleyin; boşsa `apps/api/uploads` kullanılır.
