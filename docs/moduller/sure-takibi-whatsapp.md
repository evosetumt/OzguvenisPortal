# Süre Takibi (M7) ve WhatsApp Business (M10)

## Süre takibi

Kasko/sigorta, araç muayene/vize, araç bakımı, taahhütname, sözleşme, kira ve diğer süreli kayıtlar.

| Konu | Davranış |
|---|---|
| Kayıt | Tür, başlık, karşı taraf, isteğe bağlı araç, başlangıç/bitiş, tutar + para birimi, yenileme periyodu, sorumlu, hatırlatma günleri (`60,30,7,1`), ek bildirilecek kişiler, notlar, dosyalar |
| Yetki | `tracking.read` kapsamı: **own** = sorumlusu ben veya araç bana zimmetli; **department** = sorumlusu departmanımda; **all** = hepsi. `tracking.write` aynı kapsamla düzenler; sorumlu ataması da kapsamla sınırlıdır |
| Varsayılan roller | Yönetici: okuma + yazma (departman). Muhasebe: okuma + yazma (tümü). Admin: tümü |
| Yenile | Yeni dönemi ayrı kayıt olarak açar (başlangıç = eski bitiş, bitiş = periyoda göre ya da elle), eski kayıt "Yenilendi" olur. Geçmiş dönemler silinmez |
| İptal | Kayıt "İptal" olur, hatırlatma gitmez; yeniden etkinleştirilebilir |
| Dosyalar | `/api/attachments` ile yüklenip kayda bağlanır; kaydı görebilen herkes açabilir |
| Takvim | Bitiş tarihleri ve araç "sonraki bakım" tarihleri takvime yansır (kapsama göre) |

### Araçlar
Plaka (tekil, büyük harfe çevrilir), marka/model, yıl, zimmetli kişi, km. Servis geçmişi: işlem, tarih, km, tutar, sonraki bakım tarihi/km. Servis km'si aracın km'sinden büyükse araç km'si güncellenir. Kasko/muayene kayıtları araca bağlanır ve araç detayında görünür.

### Hatırlatma işi
Sunucu açılışından 15 sn sonra ve saatte bir çalışır (`TRACKING_REMINDERS=off` ile kapatılır; Ayarlar'da tüm kayıtlara yazma yetkisi olan `POST /api/tracking/reminders/run` ile elle tetikleyebilir).

- **Bitiş yaklaşıyor** (`tracked_item.expiring`): kalan gün, eşiklerden birinin altına indiğinde **yalnızca en küçük uygun eşik** için gider. Örn. 5 gün kalan ve eşikleri `60,30,7,1` olan kayıt eklendiğinde yalnız "7 gün" bildirimi gider, 1 gün kala bir kez daha gider. Aynı kayıt + bitiş tarihi + eşik için ikinci kez gönderilmez (`TrackedItemReminder` tekil kısıtı; birden fazla sunucu örneğinde de güvenli). Bitiş tarihi değişirse eşikler yeni tarih için yeniden işler.
- **Süresi doldu** (`tracked_item.expired`): bitişi geçmiş aktif kayıt "Süresi doldu" olur ve bir kez bildirilir. Bitiş ileri alınırsa kayıt yeniden aktifleşir.
- **Araç bakımı** (`vehicle.service_due`): aracın en son servis kaydındaki sonraki bakım tarihine `tracking.vehicleServiceReminderDays` (varsayılan 7) gün kala bir kez.
- Alıcılar: sorumlu + ek bildirilecekler + aracın zimmetli kişisi (bakımda zimmetli yoksa aracın kayıtlarının sorumluları).
- Varsayılan kanallar: uygulama içi, push, e-posta. Ayarlar → Bildirim kurallarından değiştirilebilir (WhatsApp da eklenebilir).

### API
```
GET    /api/tracking/summary
GET    /api/tracking/items?category&status&q&vehicleId&within
GET    /api/tracking/items/:id
POST   /api/tracking/items            PATCH/DELETE /api/tracking/items/:id
POST   /api/tracking/items/:id/renew  {endDate?, amount?, notes?}
POST   /api/tracking/items/:id/files  {attachmentId}   DELETE /api/tracking/items/:id/files/:attachmentId
GET    /api/tracking/vehicles         GET /api/tracking/vehicles/:id
POST   /api/tracking/vehicles         PATCH/DELETE /api/tracking/vehicles/:id
POST   /api/tracking/vehicles/:id/services            DELETE /api/tracking/services/:id
POST   /api/tracking/reminders/run    (tracking.write kapsamı "all")
```

## WhatsApp Business (Cloud API)

Ortam değişkenleri boşsa modül pasiftir: ekran "yapılandırılmamış" gösterir, bildirim kanalı atlanır (`skipped`).

```
WHATSAPP_PHONE_NUMBER_ID=   # Meta → WhatsApp → API Setup → Phone number ID
WHATSAPP_ACCESS_TOKEN=      # Kalıcı sistem kullanıcısı anahtarı (whatsapp_business_messaging izni)
WHATSAPP_APP_SECRET=        # Meta uygulaması → Settings → Basic → App secret (webhook imzası)
WHATSAPP_VERIFY_TOKEN=      # Webhook doğrulaması için sizin belirlediğiniz rastgele metin
WHATSAPP_WABA_ID=           # İsteğe bağlı: verilirse onaylı şablonlar Meta'dan çekilir
WHATSAPP_API_VERSION=v21.0  # İsteğe bağlı
# WHATSAPP_GRAPH_URL        # Yalnızca test: sahte Graph sunucusu (varsayılan https://graph.facebook.com)
```

### Kurulum adımları
1. **Meta Business Manager**'da işletme doğrulaması ve WhatsApp Business hesabı (WABA) hazır olmalı; numara Cloud API'ye eklenmiş olmalı.
2. **Erişim anahtarı:** Business Settings → System users → bir sistem kullanıcısı oluşturun, uygulamayı ve WABA'yı atayın, `whatsapp_business_messaging` (şablonları çekmek için ayrıca `whatsapp_business_management`) izinli **süresiz** anahtar üretin. Geçici 24 saatlik anahtarı üretimde kullanmayın.
3. **Webhook:** Meta uygulaması → WhatsApp → Configuration:
   - Callback URL: `https://<portal-alan-adı>/api/whatsapp/webhook` (internetten HTTPS ile erişilebilir olmalı; bkz. SUNUCU-KURULUM)
   - Verify token: `WHATSAPP_VERIFY_TOKEN` ile aynı
   - Abone olunacak alan: `messages`
   Portal, POST isteklerini `X-Hub-Signature-256` başlığıyla (App secret ile HMAC-SHA256, ham gövde üzerinden) doğrular; imzasız/yanlış imzalı istekler 403 alır.
4. **Şablonlar:** Meta'da şablonu oluşturup onaya gönderin (kategori: Utility). Onaylandıktan sonra portalda **WhatsApp → Şablonlar** ekranına ad, dil (`tr`) ve gövdedeki `{{1}}, {{2}}…` sayısıyla girin (WABA kimliği verildiyse otomatik gelir). Listede olmayan şablonla gönderim sunucu tarafında reddedilir.
5. **İç bildirim şablonu:** İki parametreli bir şablon (örn. `portal_bildirim`: "{{1}} — {{2}}") onaylatıp aynı ekranda "İç bildirimlerde kullanılacak şablon" olarak seçin. Personelin WhatsApp kişisini portal kullanıcısına bağlayıp izin kaydedin; ardından Ayarlar → Bildirim kurallarında istenen olaylara WhatsApp kanalını ekleyin.

### İzin (opt-in) kuralı
- Mesaj **yalnızca izin kaydı olan ve ayrılmamış** kişiye gider; bu kural sunucuda zorunludur.
- İzin, kişiden açık onay alındıktan sonra kullanıcı tarafından "İzin alındı" teyidiyle kaydedilir; kim ve ne zaman kaydettiği denetim kaydına (`audit_logs`) işlenir.
- Kişi `STOP`, `DUR` veya `İPTAL` yazarsa izni otomatik kaldırılır (`optOutAt`). Tekrar izin yalnızca elle, yeniden onayla verilir.
- Bilinmeyen numaradan gelen mesaj izinsiz yeni kişi oluşturur.
- Teslim durumları (gönderildi → iletildi → okundu / başarısız) webhook'la güncellenir; geç gelen eski durum ileri durumu geri almaz.

### API (`whatsapp.send` izni; şablon ayarları ayrıca `user.manage`)
```
GET  /api/whatsapp/status
GET  /api/whatsapp/templates            PUT /api/whatsapp/templates {templates:[{name,language,params,description}]}
PUT  /api/whatsapp/notification-template {name|null, language}
GET  /api/whatsapp/contacts?q           POST /api/whatsapp/contacts {phone,name,customerCode?,userId?,optIn?,consentConfirmed?}
PATCH/DELETE /api/whatsapp/contacts/:id  (optIn:true için consentConfirmed:true zorunlu)
GET  /api/whatsapp/messages?contactId   POST /api/whatsapp/messages {contactId,templateName,language?,params[]}
GET/POST /api/whatsapp/webhook          (oturumsuz; POST imzalı)
```
