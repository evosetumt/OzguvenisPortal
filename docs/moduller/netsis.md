# Netsis entegrasyonu (Faz 2)

Portal Netsis'e **yalnızca okuma** amaçlı bağlanır. Netsis'teki cari, cari hareket, sipariş, teklif ve sevk belgeleri düzenli aralıklarla portal veritabanındaki `Erp*` önbellek tablolarına aktarılır. Raporlar, bildirimler ve iş emri otomatik kapanışı bu tablolar üzerinden çalışır. Netsis'e hiçbir koşulda yazılmaz.

## Kurulum

1. Netsis şirket veritabanında yalnızca okuma yetkili bir SQL kullanıcısı oluşturun:
   ```sql
   CREATE LOGIN netsis_ro WITH PASSWORD = 'GucluBirSifre!1', CHECK_POLICY = ON;
   USE <NETSIS_SIRKET_DB>;
   CREATE USER netsis_ro FOR LOGIN netsis_ro;
   ALTER ROLE db_datareader ADD MEMBER netsis_ro;
   -- db_datareader yerine yalnızca aşağıdaki tablolara GRANT SELECT de verilebilir.
   ```
   Kullanılan tablolar: `TBLCASABIT`, `TBLCAHAR`, `TBLSIPAMAS`, `TBLSIPATRA`, `TBLTEKLIFMAS`, `TBLTEKLIFTRA`, `TBLSTHAR`, `TBLFATUIRS`, `TBLSTSABIT`.
2. `apps/api/.env` dosyasına bağlantı bilgilerini girin:

   | Değişken | Açıklama | Varsayılan |
   |---|---|---|
   | `NETSIS_DB_SERVER` | Sunucu adı. Adlandırılmış örnek için `SUNUCU\ORNEK` yazın | boşsa entegrasyon kapalı |
   | `NETSIS_DB_PORT` | TCP portu. Adlandırılmış örnekte kullanılmaz | `1433` |
   | `NETSIS_DB_NAME` | Netsis şirket veritabanı adı | — |
   | `NETSIS_DB_USER` / `NETSIS_DB_PASSWORD` | Salt okunur SQL kullanıcısı | — |
   | `NETSIS_DB_ENCRYPT` | TLS ile bağlan | `true` |
   | `NETSIS_DB_TRUST_CERT` | Sunucu sertifikasına koşulsuz güven (iç ağ, kendinden imzalı) | `true` |
   | `NETSIS_TURKISH_FIX` | Türkçe karakter düzeltmesi (aşağıya bakın) | `true` |
   | `ERP_SYNC_MINUTES` | Otomatik senkron aralığı (dakika). `0` otomatik senkronu kapatır | `10` |
   | `ERP_SYNC_WINDOW_DAYS` | Sipariş, teklif, sevk ve cari hareket penceresi (gün) | `365` |

3. API'yi yeniden başlatın. **Ayarlar → Netsis entegrasyonu** bölümünde (`erp.manage` izni gerekir) önce "Bağlantıyı test et", sonra "Şimdi senkronla" düğmesine basın.
4. Kullanıcılara **Ayarlar → Kullanıcılar** ekranından Netsis plasiyer kodunu girin. Kapsam bu koda göre hesaplanır.

Netsis yapılandırılmamışsa modül pasif kalır: zamanlayıcı çalışmaz ve arayüz "Netsis bağlantısı yapılandırılmamış" der. Daha önce aktarılmış önbellek okunmaya devam eder.

## Senkron nasıl çalışır

- **Cariler:** Her çalışmada tamamı okunur. Borç ve alacak `TBLCAHAR` üzerinden tüm zamanlar için toplanır; bakiye = borç − alacak. Netsis'ten silinen cari önbellekten de silinir.
- **Cari hareketler (ekstre):** Pencere içindeki hareketler tek veritabanı işleminde yeniden yazılır. Ekstredeki devir şöyle hesaplanır: güncel bakiye − penceredeki hareketlerin net etkisi.
- **Sipariş, teklif, sevk:** Pencere içindeki kayıtlar önbellekle karşılaştırılır; yeni kayıt eklenir, değişen güncellenir, Netsis'te artık olmayan silinir.
- **Sipariş durumu:**
  - **Sevk edildi:** Sevk edilen miktar sipariş miktarına ulaştı. Netsis siparişi kapatmış olsa bile bu durum gösterilir.
  - **Kapandı:** `KAPATILMIS = 'K'` (açık sipariş `'S'`) veya `TIPI = 1`.
  - **Kısmi sevk:** Bir kısmı sevk edildi.
  - **Açık:** Hiç sevk yok.
  - Sevk miktarı, `TBLSTHAR.STHAR_SIPNUM = sipariş no` olan stok hareketlerinden okunur. İrsaliye faturaya dönüştürülünce aynı miktar iki belge tipinde görünebilir. Çift sayılmaması için her (sipariş, stok) çiftinde irsaliye ve fatura toplamlarının büyüğü alınır.
- Her varlık için `ErpSyncRun` tablosuna kayıt düşülür. Aynı anda ikinci bir senkron başlatılmaz. Bir varlık hata verirse diğerleri yine çalışır.
- Netsis tabloları `WITH (NOLOCK)` ile okunur; bu, Netsis'teki canlı işlemleri kilitlememek içindir. Okuma anındaki olası bir tutarsızlık sonraki senkronda düzelir.
- Netsis tarihleri saat dilimi bilgisi taşımaz. Bu yüzden API sunucusunun saat dilimi Netsis sunucusuyla aynı olmalıdır (`useUTC: false`).

### Türkçe karakterler

Netsis, metni `SQL_Latin1_General_CP1_CI_AS` collation'lı varchar sütunlarda Windows-1254 baytlarıyla saklar. Bu baytlar CP1252 olarak okunduğunda `İ ı Ş ş Ğ ğ` harfleri `Ý ý Þ þ Ð ð` olarak görünür. İstemci okunan tüm metinlerde bu altı harfi düzeltir. Kurulumdaki veritabanı Türkçe collation kullanıyorsa `NETSIS_TURKISH_FIX=false` yapın.

## Olaylar ve bildirimler

İlk tam aktarımda olay üretilmez; amaç, kurulumda bildirim yağmasını önlemektir. Sonraki senkronlarda şu olaylar üretilir:

| Olay | Ne zaman | Alıcı |
|---|---|---|
| `order.created` | Yeni sipariş (müşteri veya satıcı) | Belgenin plasiyer koduna sahip kullanıcılar |
| `order.status_changed` | Sipariş durumu değişti | Aynı |
| `quote.created` | Yeni teklif | Aynı |
| `shipment.dispatched` | Yeni satış irsaliyesi veya faturası | Aynı |
| `task.completed_via_erp` | İş emri Netsis belgesiyle kapandı | Görevi oluşturan ve atanan |

Kanallar ve açma/kapama ayarı bildirim kuralları ekranından (`notification_rules`) yönetilir.

## İş emri otomatik kapanışı

Görev türü "Sipariş girişi" (`erp_order`) veya "Teklif verme" (`erp_quote`) olan açık görevler, Netsis'te yeni bir **satış siparişi** veya **teklif** oluştuğunda otomatik tamamlanır. Bir belgenin bir görevi kapatması için:

- Görev türü belge türüyle aynı olmalı.
- Görevdeki `customerRef` belgenin cari koduna eşit olmalı. Büyük/küçük harf ve baştaki/sondaki boşluk dikkate alınmaz.
- Görevde belge no boş olmalı ya da belge no'ya eşit olmalı.
- Belge görevden **sonra** Netsis'e girilmiş olmalı. Bu, `KAYITTARIHI` ile kontrol edilir; alan boşsa belge tarihinin gün sonu esas alınır.

Her belge en fazla bir görevi kapatır; birden fazla görev eşleşirse en eski görev kapanır. Kapanan görev:

- global "Tamamlandı" kolonuna taşınır,
- `completedViaErp = true` olarak işaretlenir,
- `relatedType`/`relatedId` alanlarına belge bilgisi yazılır,
- belge no alanı boşsa doldurulur.

İşlem denetim kaydına `task.erp_complete` olarak yazılır (kullanıcı: sistem). Görev çekmecesinde "Netsis'te tamamlandı" etiketi ve belgeye bağlantı görünür. Belge numarası önceden bilinmiyorsa görev formundaki cari kodu alanı Netsis önbelleğinden öneri sunar.

## Yetki ve kapsam

| İzin | Uç noktalar |
|---|---|
| `account.read` | `GET /api/erp/customers`, `GET /api/erp/customers/:code` (ekstre dahil) |
| `order.read` | `GET /api/erp/orders?kind=sales|purchase&status=open|partial|shipped|closed|active&q&from&to&customer`, `GET /api/erp/orders/:id` |
| `quote.read` | `GET /api/erp/quotes`, `GET /api/erp/quotes/:id` |
| `shipment.read` | `GET /api/erp/shipments?kind=waybill|invoice` |
| `report.read` | `GET /api/erp/reports/summary` |
| `erp.manage` | `GET /api/erp/status`, `POST /api/erp/sync`, `POST /api/erp/test` |
| bu izinlerden herhangi biri veya `task.write` | `GET /api/erp/customers/lookup?q` (yalnızca kod, ad ve il döner) |

Kapsam, kayıttaki plasiyer kodu (`PLASIYER_KODU` / `PLA_KODU`) ile kullanıcının `erpRepCode` alanı eşlenerek hesaplanır. Kapsam dışındaki kayıt API'den hiç dönmez; detay isteği 404 verir.

| Kapsam | Görülen kayıtlar |
|---|---|
| `all` | Tüm kayıtlar |
| `department` | Departmanımdaki kullanıcıların plasiyer kodlarına ait kayıtlar |
| `own` | Yalnızca kendi plasiyer koduma ait kayıtlar. Plasiyer kodu tanımlı değilse hiçbir kayıt görünmez |

Takvimde, açık satış siparişlerinin vade tarihi (`ODEMETARIHI`) ve sevk belgeleri tam gün öğesi olarak görünür.

## Sorguları kuruluma uyarlama

Netsis'ten okunan tüm SQL `apps/api/src/erp/netsis.queries.ts` dosyasındadır. Sürüm veya ayar farkı varsa yalnızca bu dosyayı değiştirin; sütun takma adları (`AS code`, `AS docNo` …) aynı kalmalıdır. Belge tipi kodları dosyanın başında açıklanmıştır:

- `TBLSIPAMAS.FTIRSIP`: `6` müşteri siparişi, `7` satıcı siparişi.
- `TBLFATUIRS`/`TBLSTHAR`: `1` satış faturası, `2` alış faturası, `3` satış irsaliyesi, `4` alış irsaliyesi.
- `TBLTEKLIFMAS.FTIRSIP`: `G` satış talebi, `H` satış teklifi, `C` satın alma talebi, `D` satın alma teklifi. Portal yalnızca `H` (satış teklifi) okur.
- `TBLSIPAMAS.KAPATILMIS`: `S` açık, `K` kapatılmış.

Bu kodlar proje kökündeki Netsis veri sözlüğünden (`NETSIS VERITABANI.xls`, FATURA ve TALEP-TEKLİF sayfaları) doğrulanmıştır. Başka tablo/alan gerekirse önce bu dosyaya bakın.

Diğer notlar:

- Tutarlar Netsis'in TL alanlarından (`GENELTOPLAM`, `BRUTTUTAR`, `KDV`) okunur. Döviz tipi (`DOVIZTIP`) şu an kullanılmıyor.
- Sevk belgesi listesi `STRING_AGG` kullanır; bu, SQL Server 2017 veya üstünü gerektirir.
- Teklifte geçerlilik tarihi alanı Netsis'te standart olmadığı için doldurulmuyor.
- Vadesi geçmiş alacak raporu yaklaşık bir değerdir: vadesi geçmiş borç hareketlerinin toplamı alınır ve carinin güncel bakiyesiyle sınırlanır. Ödemeler belge bazında eşlenmez.

## Geliştirmede test

Gerçek şirket veritabanlarına dokunmadan test etmek için ayrı bir `NetsisTest` veritabanı kullanılır:

1. Tablolar yalnızca **yapı** olarak kopyalanır: `SELECT TOP 0 * INTO NetsisTest.dbo.X FROM <NetsisDB>.dbo.X`.
2. Test kolaylığı için NOT NULL sütunlar NULL kabul eder hale getirilir.
3. Sahte cariler (`TEST001` …), siparişler ve sevkler eklenir.
4. `netsis_ro` girişine yalnızca bu veritabanında `db_datareader` yetkisi verilir.

Duman testi şunları doğrular (40 adım):

- bağlantı ve senkron,
- bakiye ve ekstre devri,
- kısmi sevk,
- plasiyer kapsamı,
- iş emri otomatik kapanışı,
- durum değişimi ve sevk bildirimleri,
- Türkçe karakter düzeltmesi.

## e-Belge önizlemesi (cari ekstresi)
Ekstrede e-Fatura / e-Arşiv XML'i bulunan faturaların ("FATURAMIZ", "FATURANIZ", iade) belge numarası tıklanabilir; fatura, **içine gömülü GİB görüntüleme şablonuyla (XSLT)** resmi görünümde açılır, yazdırılır, XML indirilebilir.

| Kaynak | Netsis tablosu | Not |
|---|---|---|
| e-Fatura (satış `FTIRSIP=1`, alış `FTIRSIP=2`) | `TBLEFATURA` → `ZARFID` → `TBLEFATZARF.XMLBYTES` | ZIP içinde GİB zarfı (StandardBusinessDocument); bir zarfta birden fazla fatura olabilir, faturanın `UUID`'si ile seçilir. `TBLEFATURA.XMLVERI` çoğunlukla boştur, doluysa doğrudan kullanılır. |
| e-Arşiv (satış) | `TBLEARSIV.XMLBYTES` | ZIP içinde tek UBL fatura |

- Eşleşme: cari hareketin `BELGE_NO` = `FATIRS_NO`. E-belge tablolarındaki `CARI_KODU` cari hareketten farklı tutulabildiği için belge no + yön (Faturamız/Faturanız) ile aranır; birden fazla aday varsa cari kodu, vergi no (`SENDERVNO`) ve tarih yakınlığıyla seçilir.
- Kağıt fatura veya Netsis e-fatura modülüne alınmamış gelen faturaların XML'i yoktur; bunlarda bağlantı çıkmaz.
- Uç nokta: `GET /api/erp/customers/:code/edocs/:docNo` (`account.read`; belge bu carinin ekstresinde olmalı). Her görüntüleme denetim kaydına yazılır (`erp.edocument_view`).
- Güvenlik: şablon çıktısı betik çalıştıramayan (sandbox) çerçevede gösterilir; tedarikçiden gelen belgeler de güvenle açılır. Tarayıcı XSLT desteklemiyorsa veya faturada şablon yoksa faturanın özet görünümü (taraflar, kalemler, toplamlar) gösterilir.
