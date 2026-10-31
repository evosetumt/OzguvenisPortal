# Geliştirme Ortamı (SQL Server'lı Windows bilgisayar)

## Gerekenler
- Node.js 20 LTS veya üstü (`node -v`)
- SQL Server 2019+ (Express yeterli), SQL Server Management Studio (isteğe bağlı)
- SQL Server'da **TCP/IP etkin** (SQL Server Configuration Manager → Protocols for ... → TCP/IP → Enabled, port 1433) ve **SQL Server kimlik doğrulaması** açık (karma mod)

## 1. Veritabanlarını oluştur

SSMS'te (yönetici girişiyle) çalıştırın. Şifreyi değiştirin:

```sql
CREATE DATABASE OzguvenisPortal COLLATE Turkish_CI_AS;
CREATE DATABASE OzguvenisPortal_shadow COLLATE Latin1_General_CI_AS;  -- yalnızca geliştirmede migration için (Türkçe collation OLMAMALI, aşağıya bakın)
CREATE LOGIN portal_app WITH PASSWORD = 'GucluBirSifre!1', CHECK_POLICY = ON;
GO
USE OzguvenisPortal;        CREATE USER portal_app FOR LOGIN portal_app; ALTER ROLE db_owner ADD MEMBER portal_app;
GO
USE OzguvenisPortal_shadow; CREATE USER portal_app FOR LOGIN portal_app; ALTER ROLE db_owner ADD MEMBER portal_app;
```

Prisma `migrate dev`, gölge veritabanını oluşturup silebilmek için `CREATE DATABASE` yetkisi de isteyebilir. Hata alırsanız geliştirmede girişe `dbcreator` rolü verin:
`ALTER SERVER ROLE dbcreator ADD MEMBER portal_app;` (üretimde vermeyin).

**Gölge veritabanı collation'ı:** Prisma gölge veritabanını sıfırlarken sistem şema adlarını karşılaştırır; `Turkish_CI_AS` altında `I/ı` farkı yüzünden `Cannot drop the schema 'dbo'` hatası alınır. Gölge DB'yi `Latin1_General_CI_AS` ile oluşturun (mevcutsa: `ALTER DATABASE OzguvenisPortal_shadow COLLATE Latin1_General_CI_AS`). Asıl `OzguvenisPortal` veritabanı `Turkish_CI_AS` kalır.

## 2. Ayar dosyası

```
copy apps\api\.env.example apps\api\.env
```
`apps/api/.env` içinde `DATABASE_URL`, `SHADOW_DATABASE_URL`, `JWT_SECRET` (en az 32 karakter) ve seed yöneticisinin e-posta/şifresini düzenleyin.
SQL Server adlandırılmış örnekteyse (ör. `SQLEXPRESS`): `sqlserver://localhost\SQLEXPRESS;database=...` biçimini kullanın veya sabit port verin.

## 3. Kurulum ve ilk çalıştırma

Repo kökünde:

```
npm install
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
```

`apps/api/prisma/migrations/` repoda hazırdır (`init` = Faz 0 + Faz 1 şeması); `db:migrate` yalnızca şema değişince yeni migration üretir. Klasörü repoda tutun (sunucuda `prisma migrate deploy` ile uygulanır).

npm 11+ kurulum betiklerini varsayılan olarak çalıştırmaz; Prisma motoru ve esbuild için izinler kök `package.json` içindeki `allowScripts` alanında tanımlıdır. Başka bir işletim sisteminden kopyalanan `node_modules` klasörünü silip `npm install` ile yeniden kurun (Prisma motoru işletim sistemine özeldir).

## 4. Çalıştır

İki ayrı terminalde:

```
npm run dev:api     # http://localhost:3000/api/health
npm run dev:web     # http://localhost:5173
```

`/api/health` `{"status":"ok","db":"ok"}` dönmeli. Girişte seed'deki yönetici e-posta ve şifresini kullanın.
Web geliştirme sunucusu `/api` isteklerini otomatik olarak 3000 portuna yönlendirir.

### Örnek (demo) veri
Arayüzü dolu görmek için: `npm run db:demo` (8 kişi, 3 proje, ~100 görev, etkinlik, araç, süre takibi, sohbet ekler; önce eski demo verisini siler). Silmek için: `npm run db:demo -- --sil`. Demo kullanıcıları `@demo.ozguvenis.local` uzantılıdır, şifresi `apps/api/prisma/demo.ts` içindedir. **Üretimde çalıştırmayın.**

## 5. Üretim derlemesi

```
npm run build
```
- API: `apps/api/dist/` (çalıştırma: `node apps/api/dist/main.js`, ortam değişkenleri `.env`'den)
- Web: `apps/web/dist/` (statik dosyalar, IIS'e kopyalanır)

Sunucuya kurulum: [SUNUCU-KURULUM.md](SUNUCU-KURULUM.md)

## Sık sorunlar
| Belirti | Çözüm |
|---|---|
| `Can't reach database server` | TCP/IP etkin mi, port 1433 açık mı, SQL Browser/port doğru mu |
| `Login failed for user` | Karma kimlik doğrulama modu açık mı, şifre `.env`'dekiyle aynı mı |
| `Cannot drop the schema 'dbo'` | Gölge DB collation'ı Türkçe; `Latin1_General_CI_AS` yapın (Bölüm 1) |
| `migrate dev` takılıyor | Önceki yarım kalmış `prisma`/`schema-engine` süreci kilidi tutuyor olabilir; Görev Yöneticisi'nden kapatın |
| `migrate dev` shadow DB hatası | `SHADOW_DATABASE_URL` doğru mu, kullanıcıya `dbcreator` verildi mi |
| Sertifika hatası | Geliştirmede `trustServerCertificate=true` kalsın; üretimde geçerli sertifika kullanın |

## Netsis'e okuma bağlantısı (Faz 2)
Netsis veritabanında yalnızca `SELECT` yetkili ayrı bir SQL kullanıcısı (`netsis_ro`, `db_datareader`) oluşturun ve `apps/api/.env` içindeki `NETSIS_*` değişkenlerini doldurun. `NETSIS_DB_SERVER` boşsa entegrasyon kapalıdır. Geliştirmede gerçek şirket veritabanı yerine yalnızca yapısı kopyalanmış bir test veritabanı kullanın. Ayrıntı ve sorguların uyarlanması: [moduller/netsis.md](moduller/netsis.md).

## Modül notları
- Bildirim kanalları ve mobil: [moduller/bildirim-mobil.md](moduller/bildirim-mobil.md)
- Masraf ve BPMN: [moduller/is-akisi-masraf.md](moduller/is-akisi-masraf.md)
- Süre takibi ve WhatsApp: [moduller/sure-takibi-whatsapp.md](moduller/sure-takibi-whatsapp.md)
- Mesajlaşma ve toplantı: [moduller/mesajlasma-toplanti.md](moduller/mesajlasma-toplanti.md)

Mobil (Capacitor 8) derlemesi Node 22+ ister; sunucu tarafı Node 20 LTS ile çalışır.
