# Özgüveniş Şirket Portalı — Plan ve Veri Modeli

Durum: v0.8 (2026-10-29). Faz 0–6 kodlandı; SQL Server'a karşı çalıştırıldı, modül duman testleri geçti. Canlıya alma için dış hesaplar (Netsis kullanıcısı, Firebase, SMTP, WhatsApp, LiveKit) ve sunucu kurulumu bekleniyor
UI referansı: https://demo.codeandchill.store/pane/#/tasks (Pane)

## 1. Kapsam

Web (masaüstü), Android ve iPhone'da çalışan kurumsal portal. Tüm erişim yetkiye bağlı.

| # | Modül | Özet |
|---|---|---|
| M1 | Kimlik ve yetki | Giriş, roller, izinler, ekip/departman, denetim kaydı |
| M2 | Sipariş - Teklif - Teslimat | Kayıtlar, durum akışı, sevkiyat bilgisi |
| M3 | Cari hesaplar ve raporlar | Cari kartlar, hareketler, yetkiye bağlı raporlar |
| M4 | Bildirim merkezi | Uygulama içi, push, e-posta, WhatsApp; olay kurallarıyla tetiklenir |
| M5 | Mesajlaşma ve görüntülü toplantı | Birebir/grup sohbet, toplantı odası |
| M6 | Görev takibi | Kanban kartları, alt görev, yorum, analiz raporları |
| M7 | Abonelik ve süre takibi | Kasko/sigorta, araç vize/bakım, taahhütname, sözleşme, kira; süre bitiminde otomatik uyarı |
| M8 | Ortak takvim | Yetki bazlı, tüm modüllerden olay toplar |
| M9 | Masraf takibi | Kayıt, yetkili onayı, muhasebe onayı (BPMN akışı) |
| M10 | WhatsApp Business | İç ve dış kullanıcılara şablonlu mesaj |
| M11 | İş akışı (BPMN) | bpmn.io ile akış tanımı, çalıştırma, izleme |

Devreye alma sırasında çıkan ek istekler projeye dahildir. Mimari modül eklemeye açık tutulur.

## 2. Teknoloji

| Katman | Seçim |
|---|---|
| İstemci | React + TypeScript (Vite), Capacitor ile Android/iOS paketleme |
| UI | Pane tarzı koyu/açık tema, cam efekti, CSS değişkenleri ile tema |
| Sunucu | NestJS (TypeScript), REST + WebSocket |
| Veritabanı | **Microsoft SQL Server** (portalın kendi veritabanı, Netsis'ten ayrı), ORM: Prisma (SQL Server sağlayıcısı) |
| İş akışı | bpmn-js (modelleme) + sunucuda BPMN motoru (bpmn-engine veya Camunda 8) |
| Zamanlama / kuyruk | Windows'ta Redis zahmetli olduğu için **MSSQL tabanlı iş kuyruğu + node-cron** (ihtiyaç büyürse Memurai/Redis'e geçilir) |
| Push | FCM (Android/iOS), Web Push |
| WhatsApp | WhatsApp Business Cloud API (şablon mesajlar, webhook) |
| Görüntülü toplantı | ~~LiveKit~~ → **WebRTC eşler arası (P2P)**, ek sunucu yok (karar: 2026-10-30). Aşağıdaki LiveKit notları geçersiz |
| Dosya | Sunucu diski / ağ paylaşımı (yedeklemeye dahil), arayüzü depolama katmanı soyutlar |
| ERP bağlantısı | Netsis entegrasyon katmanı, MSSQL (`mssql`/tedious ile salt okunur), Bölüm 3A |
| Barındırma | Şirket içi Windows Server, **IIS** (HTTPS sonlandırma, reverse proxy) |

BPMN motoru: ilk sürümde Node içinde çalışan hafif motor (bpmn-engine). Camunda ayrı Java servisi gerektirir, IIS ortamında gereksiz yük olur.

## 3. Mimari

```
Web / Android / iOS (React + Capacitor)
        │ HTTPS (internetten erişim için güvenli yayın gerekir)
   IIS (ARR reverse proxy, SSL)
        │
   NestJS API + WebSocket (Windows servisi: sohbet, bildirim, zamanlayıcılar) ──── MSSQL (portal DB)
        │  ├─ İş kuyruğu + cron ── hatırlatmalar, bildirim kuyruğu, Netsis senkronu
        │  ├─ BPMN motoru ─── süreç örnekleri, görevler
        │  ├─ Bildirim servisi ─ FCM · Web Push · E-posta · WhatsApp
        │  ├─ Netsis bağlayıcı ─ Netsis (SQL Server / Netsis API)
        │  └─ Toplantı odaları (Bölüm 6)
        └─ Dosya depolama
```

IIS tarafında WebSocket özelliği ve ARR açık olmalı (sohbet için). Sunucu uygulaması NSSM veya `node-windows` ile Windows hizmeti olarak kurulur, açılışta otomatik başlar, çökerse yeniden başlar.

Mobil uygulama ve WhatsApp webhook'u şirket dışından erişim ister. IIS sunucusuna dışarıdan HTTPS (alan adı, sertifika, güvenlik duvarı/NAT veya ters proxy) açılması gerekir. Bu BT tarafında netleşmeli.

Önemli ilke: modüller doğrudan birbirini çağırmaz, **olay** yayınlar (`order.created`, `quote.sent`, `shipment.dispatched`, `subscription.expiring`, `expense.submitted`...). Bildirim kuralları ve BPMN akışları bu olaylara abone olur. Böylece "istenilen her durumda bilgilendirme" yeni kod yazmadan kural eklenerek karşılanır.

## 3A. Netsis entegrasyonu

Netsis'te zaten tutulan cari, stok, sipariş ve teklif verisini portala **ikinci kez girdirmeyiz**; Netsis ana kaynaktır.

- **Okuma (ilk sürüm):** Cari kartlar, cari hareket/bakiye, stok kartları, sipariş ve teklif durumları, sevk bilgisi Netsis'ten düzenli senkronla portal tarafındaki `erp_*` önbellek tablolarına alınır. Raporlar ve bildirimler bu tablolardan çalışır.
- **Yazma (sonraki faz, ayrı onayla):** Portaldan Netsis'e sipariş/teklif kaydı atılacaksa bu Netsis'in resmi API'si (ör. NetOpenX / Netsis REST) üzerinden yapılır. Netsis veritabanına doğrudan yazma önerilmez.
- **Bağlantı yolu (karar):** Netsis veritabanı **MSSQL**. Portal sunucusu yalnızca-okuma (db_datareader / seçili view) yetkili bir SQL kullanıcısıyla bağlanır. Netsis'e yazma yoktur. Netsis sürümü ve tablo/alan adları kuruluma bakılarak çıkarılacak.
- **İş emri takibi Netsis'ten okunur (karar):** Görev kartındaki müşteri/belge bilgisine karşılık Netsis'te sipariş veya teklif belgesi oluştuğunda görev otomatik tamamlanır. Personel elle kapatmaz.
- **Değişiklik algılama:** Senkron sırasında durum değişikliği (sipariş onaylandı, sevk edildi, vade yaklaştı) olay üretir: `order.status_changed`, `shipment.dispatched` vb. Bildirimler bu olaylarla tetiklenir.
- Netsis kayıtları portalda `netsis_ref` (cari kodu, belge no) alanıyla eşlenir.

## 3B. Sunucu ortamı

- **İşletim sistemi:** Windows Server 2022, IIS. Portal adresi bir **alt alan adı** (ör. `portal.sirketadi.com.tr`), IIS'te sertifikalı (Let's Encrypt/win-acme veya kurumsal sertifika).
- **Ölçek:** 30 kullanıcı. Tek sunucu yeterli; yüksek erişilebilirlik/küme kurulmaz. Yedekleme (SQL Server `BACKUP DATABASE` + dosyalar) günlük zamanlanır.
- **Docker ile LiveKit:** Windows Server 2022 doğrudan Windows container çalıştırır, LiveKit ise Linux container ister. Bu yüzden Docker'ı **Windows üzerinde değil, sunucudaki Hyper-V'de küçük bir Linux VM'de** (Ubuntu Server, 2 vCPU / 4 GB yeterli) kurmayı öneriyorum. Gerekçe: toplantı medya trafiği UDP kullanır; WSL2/Docker Desktop'ın NAT ağı UDP portlarını güvenilir yayınlamakta sorun çıkarır, köprülü (bridged) ağlı VM'de sorun olmaz. Windows Server'da Docker Desktop lisans ve destek açısından da uygun değildir.
- **Port ihtiyacı (güvenlik duvarı/NAT):** 443/TCP (IIS, portal + API + WebSocket), LiveKit için 7881/TCP ve 50000-60000/UDP aralığı (veya daraltılmış bir aralık), toplantı için ayrı alt alan adı (ör. `meet.sirketadi.com.tr`) ve sertifikası.
- Docker aynı VM'de gerekirse başka Linux tabanlı servisler için de kullanılabilir. Ana uygulama ve SQL Server Windows tarafında kalır; VM'e bağımlılık yalnızca toplantı odalarıdır.

## 4. Yetki modeli

- Kullanıcı → bir veya daha fazla **rol**; rol → **izin** listesi (`modül.eylem`, örn. `order.read`, `expense.approve`, `report.cari.read`).
- Kapsam kısıtı: izin; tümü / kendi departmanı / sadece kendi kayıtları düzeyinde verilebilir (`scope`).
- Takvim ve raporlar aynı izin sistemiyle filtrelenir. Yetkisiz kayıt API'den hiç dönmez (yalnızca arayüzde gizlenmez).
- Tüm yazma işlemleri `audit_logs` tablosuna yazılır.

## 5. MSSQL veri modeli (ilk taslak)

**Veritabanı ayrımı:** Portal kendi veritabanını kullanır (ör. `OzguvenisPortal`), Netsis veritabanına hiçbir şey yazılmaz. İkisi aynı SQL Server örneğinde olabilir, ama portal Netsis'e yalnızca okuma yetkili ayrı bir SQL kullanıcısıyla bağlanır. Lisans ve yük açısından örnek paylaşımı BT ile teyit edilmeli.

**SQL Server karşılıkları (aşağıdaki tablolarda):**
- `ENUM` → `NVARCHAR(30)` + `CHECK` kısıtı (Prisma'da enum yerine string alan ve uygulama tarafı doğrulama).
- `JSON` → `NVARCHAR(MAX)` + `CHECK (ISJSON(col)=1)`; sorgu gerekirse `JSON_VALUE`.
- `LONGTEXT` → `NVARCHAR(MAX)`. `SET(...)` → `channels` için virgüllü `NVARCHAR` yerine ayrı bağlantı tablosu (`notification_rule_channels`).
- `id` → `INT IDENTITY` (Prisma'da BigInt JSON'a serileştirilemediği ve 30 kullanıcılık ölçekte yeterli olduğu için; plandaki "BIGINT" ifadeleri INT okunmalı). Büyük tablolarda (audit_logs, messages) gerekirse sonra BIGINT'e geçilir. Zamanlar `DATETIME2` (UTC saklanır, arayüzde yerel saat).
- Türkçe metin için `NVARCHAR` ve `Turkish_CI_AS` collation (Netsis'in collation'ıyla çakışma kontrol edilmeli, karşılaştırma gerekirse `COLLATE` ile).

Ortak: her tabloda `id` (BIGINT), `created_at`, `updated_at`; gerekirse `created_by`. Silme yerine `deleted_at`.

### M1 Kimlik ve yetki
- `users` (id, email, phone, full_name, avatar_url, password_hash, status, department_id, last_login_at)
- `departments` (id, name, parent_id, manager_id)
- `roles` (id, name) · `permissions` (id, code) · `role_permissions` (role_id, permission_id, scope ENUM all/department/own)
- `user_roles` (user_id, role_id)
- `audit_logs` (id, user_id, action, entity, entity_id, diff JSON, ip, created_at)

### M2 Sipariş - Teklif - Teslimat
Netsis ana kaynak olduğu için bu tablolar **Netsis'ten senkronlanan önbellek**tir (salt okunur, MSSQL kaynaklı); portal kendi içinde de iş emri (M6) ile bunları takip eder. Alan adları Netsis şemasına bakılarak netleştirilecek.
- `customers` (id, code, name, tax_no, tax_office, phone, email, address, is_supplier) — cari kartın ana kaydı
- `quotes` (id, no, customer_id, status, total, currency, valid_until, owner_id)
- `quote_items` (id, quote_id, product_id, description, qty, unit_price, vat_rate)
- `orders` (id, no, customer_id, quote_id NULL, status, total, currency, order_date, owner_id)
- `order_items` (id, order_id, product_id, description, qty, unit_price, vat_rate)
- `products` (id, code, name, unit)
- `shipments` (id, order_id, status, carrier, tracking_no, dispatched_at, delivered_at, address)
- `shipment_items` (id, shipment_id, order_item_id, qty)
- `status_history` (id, entity, entity_id, from_status, to_status, user_id, at)

### M3 Cari hesaplar
- `account_transactions` (id, customer_id, type ENUM invoice/payment/adjustment, ref_type, ref_id, debit, credit, currency, tx_date, note)
- Bakiye ve ekstre sorguyla hesaplanır (`SUM(debit)-SUM(credit)`); gerekirse özet tablo.
- `report_definitions` (id, code, name, required_permission, query_spec JSON) — raporlar tanımlı ve izne bağlı
- Bu tablolar da Netsis'ten senkronlanır (salt okunur). Portalda ayrıca cari düzeltme kaydı tutulmaz.
- `erp_sync_runs` (id, entity, started_at, finished_at, status, rows, error) · `erp_sync_state` (entity, last_cursor)

### M4 Bildirim
- `notifications` (id, user_id, title, body, link, type, read_at, created_at)
- `notification_rules` (id, event_code, conditions JSON, recipients_spec JSON, channels SET(inapp,push,email,whatsapp), template_id, is_active)
- `notification_templates` (id, code, channel, subject, body, whatsapp_template_name)
- `notification_deliveries` (id, notification_id, channel, status, provider_msg_id, error, sent_at)
- `device_tokens` (id, user_id, platform, token, last_seen_at)
- `user_notification_prefs` (user_id, event_code, channels)

### M5 Mesajlaşma ve toplantı
- `conversations` (id, type ENUM direct/group, title)
- `conversation_members` (conversation_id, user_id, last_read_message_id)
- `messages` (id, conversation_id, sender_id, body, attachment_id NULL, created_at, edited_at)
- `meetings` (id, title, room_name, starts_at, ends_at, organizer_id, calendar_event_id)
- `meeting_participants` (meeting_id, user_id)

### M6 Görev takibi
- `projects` (id, name, color, owner_id, status, pinned)
- `project_members` (project_id, user_id)
- `task_statuses` (id, project_id NULL, name, sort_order, is_done) — kolonlar yapılandırılabilir
- `tasks` (id, project_id, status_id, title, description, priority ENUM low/normal/high/urgent, assignee_id, due_date, sort_order, related_type, related_id)
  - Ek alanlar: `task_type`, `customer_ref`, `erp_doc_no`, `completed_via_erp` (bool)
  - `related_*`: göreve sipariş/teklif/sözleşme bağlamak için
- `task_subtasks` (id, task_id, title, done)
- `task_comments` (id, task_id, user_id, body)
- `task_watchers` (task_id, user_id)
- **İş emri (görev türü):** Yöneticinin personele verdiği iş, ör. "X müşterisine şu siparişi gir", "Y müşterisine teklif ver". Görev kartında `task_type = erp_order | erp_quote | general`, `customer_ref` (Netsis cari kodu) ve isteğe bağlı belge no tutulur. Netsis'te ilgili sipariş/teklif belgesi oluştuğunda portal bunu yakalayıp görevi otomatik "Tamamlandı"ya çekebilir ve atayana bildirim gönderir.
- Analiz: açık/geciken/haftalık tamamlanan, kişi ve proje bazlı süre ve yük raporları sorgudan üretilir.

### M7 Abonelik ve süre takibi
- `tracked_items` (id, category ENUM insurance/vehicle_inspection/vehicle_maintenance/commitment/contract/rent/other, title, counterparty, vehicle_id NULL, start_date, end_date, amount, currency, renewal_period, owner_id, status, notes)
- `tracked_item_reminders` (id, tracked_item_id, days_before, recipients_spec JSON, last_sent_at) — örn. 60/30/7/1 gün kala
- `vehicles` (id, plate, brand_model, assigned_user_id, km)
- `vehicle_services` (id, vehicle_id, type, date, km, cost, next_due_date)
- `attachments` ilişkisi ile poliçe/sözleşme dosyaları.
- Zamanlayıcı her gün çalışır, süresi yaklaşanlar için olay üretir (`tracked_item.expiring`).

### M8 Takvim
- `calendar_events` (id, title, starts_at, ends_at, all_day, visibility ENUM private/department/company, source_type, source_id, owner_id)
- Görev bitiş tarihleri, abonelik bitişleri, toplantılar, teslimatlar buraya otomatik yansır (`source_*`).
- `calendar_event_attendees` (event_id, user_id)

### M9 Masraf
- `expenses` (id, user_id, category_id, amount, currency, expense_date, description, status ENUM draft/submitted/manager_approved/accounting_approved/rejected/paid, process_instance_id NULL)
- `expense_categories` (id, name, approver_role_id)
- `expense_receipts` (id, expense_id, attachment_id)
- `expense_approvals` (id, expense_id, step ENUM auto/manager/accounting, approver_id NULL, decision, comment, at)

### M10 WhatsApp
- `whatsapp_contacts` (id, phone, customer_id NULL, user_id NULL, opt_in_at)
- `whatsapp_messages` (id, direction, contact_id, template_name, body, status, provider_msg_id, created_at)
- Dış kişilere mesaj yalnızca onaylı şablonla ve opt-in kaydıyla gider.

### M11 İş akışı (BPMN)
- `process_definitions` (id, key, name, version, bpmn_xml LONGTEXT, status ENUM draft/active/archived, created_by)
- `process_instances` (id, definition_id, business_key, entity_type, entity_id, status, started_by, started_at, ended_at, variables JSON)
- `process_tasks` (id, instance_id, element_id, name, assignee_id/candidate_role_id, status, due_at, completed_by, completed_at, form_data JSON)
- `process_events` (id, instance_id, element_id, type, at, payload JSON) — izleme/denetim
- Service task'lar: bildirim gönder, durum değiştir, WhatsApp mesajı, kayıt oluştur. Bunlar sunucudaki kayıtlı "işleyici"lerdir. Tasarımcıda BPMN elemanına işleyici adı atanır.

### Ortak
- `attachments` (id, storage_key, file_name, mime, size, uploaded_by)
- `settings` (key, value JSON)

## 6. Kararlar ve açık sorular

Netleşenler:
- ERP: **Netsis** (ana kaynak). WhatsApp Business hesabı hazır. Barındırma: **şirket içi sunucu, IIS**. İlk BPMN süreci: **masraf onayı**. İş emri ("şu müşteriye şu siparişi gir / şuna teklif ver") görev modülünde, Netsis ile bağlantılı.

- Netsis: **MSSQL**, yalnızca okuma. İş emri kapanışı Netsis'ten okunarak otomatik. Sohbet ve arka plan işleri için **Windows hizmeti**. Masraf akışı kuralı aşağıda. BPMN diyagramı sonra gözden geçirilecek.

### Masraf onay kuralı (ilk taslak, diyagram sonra revize edilecek)

```
Personel masrafı girer (fiş fotoğrafı + tutar + kategori)
        │
   Tutar ≤ 50 TL ? ──evet──► Otomatik onay ──┐
        │hayır                              │
   Yönetici onayı ──red──► Reddedildi (personele bildirim)
        │onay                               │
        └──────────────► Muhasebe kuyruğuna düşer ◄─┘
                              │
                    Muhasebe onay / red / ödendi
```

- Eşik (50 TL) koda gömülmez; `settings` tablosunda ve BPMN karar kapısında parametre olarak tutulur. Para birimi TL'dir. Döviz masrafı gelirse TL karşılığıyla değerlendirilir.
- Varsayım: otomatik onaylanan masraflar da muhasebe kuyruğuna düşer (muhasebe kaydı için). Yanlışsa söyleyin.
- "Yönetici" = masrafı giren kullanıcının departman yöneticisi (`departments.manager_id` alanı eklenecek).
- Yönetici belirli süre içinde cevap vermezse hatırlatma gider; zaman aşımı süresi sonra belirlenecek.

Hâlâ açık:
1. Muhasebe onayından sonra Netsis'e fiş atılacak mı? (Şimdilik hayır varsayıyoruz.)
2. Dil yalnızca Türkçe mi? (Şimdilik evet varsayıyoruz, metinler yine de çeviri dosyasından okunacak.)
3. Sunucunun yazılım kurulumunu (Node, portal SQL Server veritabanı, IIS ARR, Hyper-V VM) kim yapacak? Kurulum rehberi hazırlayabilirim. (Node, SQL Server erişimi, IIS ARR, Hyper-V VM)

## 7. Aşamalar

| Faz | İçerik |
|---|---|
| 0 | **Tamam:** Repo iskeleti, tema/tasarım sistemi (Pane tarzı), giriş, yetki altyapısı (rol/izin/kapsam şeması + seed) |
| 1 | **Tamam:** Görev takibi (kanban/liste), takvim, bildirim merkezi, push (Web Push/FCM) + e-posta, `notification_rules` + kişisel tercihler, görev analizi |
| 2 | **Tamam (test DB ile):** Netsis okuma entegrasyonu (cari, ekstre, sipariş, teklif, sevk), plasiyer bazlı yetkili raporlar, iş emri otomatik kapanışı. Gerçek Netsis'e `netsis_ro` ile bağlanıp doğrulanmalı |
| 3 | **Tamam:** BPMN tasarımcısı + motor, masraf onay akışı, TypeSafe Jev kategori önerisi (isteğe bağlı) |
| 4 | **Tamam:** Abonelik/süre takibi + otomatik hatırlatma, WhatsApp Business (hesap bilgileri bekleniyor) |
| 5 | **Tamam:** Mesajlaşma (socket.io), sohbette sesli/görüntülü arama ve toplantı (WebRTC P2P), Firebase bildirimleri |
| 6 | **Kısmen:** PWA, Capacitor Android projesi, IIS/yedekleme rehberi hazır. Kalan: mağaza yayını (iOS için macOS/Xcode), sunucuya kurulum, devreye alma ve ek istekler |

Not: Bildirim ve olay altyapısı Faz 1'de kurulur, çünkü sonraki tüm modüller ona dayanır.

## 8. Arayüz notları (Pane'den alınanlar)

- Kenar menü: Home, Tasks (sayaç rozeti), Calendar, Projects, Insights, Team, Settings, "Pinned" projeler, altta kullanıcı kartı.
- Üst bar: genel arama (⌘K), hızlı ekle, tema anahtarı, bildirimler.
- Görev sayfası: 4 özet kartı, Board/List anahtarı, filtre çubuğu, kanban kolonları, kartta proje etiketi + öncelik + alt görev ilerlemesi + tarih + yorum + avatar.
- Cam efektli yüzen paneller, koyu/açık tema, sıralı giriş animasyonu.
- Mobilde kenar menü alt sekme çubuğuna dönüşür; kanban yatay kaydırmalı olur.
- Bu portalda ek ekranlar: Cari/Sipariş listeleri, Masraflar, Süre Takibi, Mesajlar, Toplantılar, Akış Tasarımcısı (BPMN).
