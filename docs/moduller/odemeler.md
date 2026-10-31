# Ödeme takibi

Vadesi yaklaşan çek, kurumsal kredi kartı ekstresi, kredi taksiti, vergi, SGK, kira ve fatura ödemelerini takip eder.
Vadeden belirli gün önce sorumlu birimin yöneticisine görev açar; yönetici görevi ödemeyi yapacak kişiye verir.

## Akış

1. **Kayıt**: muhasebe (veya birimi için yönetici) ödemeyi girer: tür, tutar, vade, sorumlu birim, isteğe bağlı ön süre ve tekrar.
2. **Görev açılışı**: zamanlayıcı (API açılışından 20 sn sonra ve saatte bir) vadesine `ön süre` gün kalan ödemeler için görev açar.
   Ön süre kayıtta boşsa `payment.defaultLeadDays` ayarı geçerlidir (varsayılan 7, Ayarlar → Ödeme).
   Görev birim yöneticisine atanır, öncelik "yüksek", bitiş tarihi = vade. Durum: **Görevlendirme bekliyor**.
   Birimin yöneticisi yoksa görev atanmamış açılır ve `payment.manage: all` yetkilileri bildirim alır.
   Vadesi zaten ön süre içinde olan kayıt girildiğinde görev hemen açılır.
3. **Görevlendirme**: yönetici Ödemeler sayfasından (veya görev ekranından kişiyi değiştirerek) görevi istediği kişiye verir. Durum: **Görevlendirildi**.
   Yönetici, ön süre gelmeden de "Şimdi görevlendir" ile görevi erken açabilir.
4. **Ödeme**: görevli görevi tamamladığında ödeme **Ödendi** olur. Ödemeler sayfasındaki "Ödendi" düğmesi de görevi kapatır.
5. **Tekrar**: her ay / 3 ayda bir / her yıl tekrarlanan ödemede, ödendiğinde sonraki vade otomatik "Planlandı" olarak eklenir.

İptal edilen veya silinen ödemenin açık görevi kaldırılır. Ödemeler takvimde vade gününde görünür.

## Yetki

| İzin | Kapsam | Anlamı |
|---|---|---|
| `payment.read` | all / department / own | all: tüm ödemeler; department: kendi ve yöneticisi olduğu birimler; own: kendisine görevlendirilen veya kendi girdiği |
| `payment.manage` | all / department | kayıt aç, düzenle, iptal et, sil (department: kendi ve yönettiği birimler); `all` ayrıca ön süre ayarını değiştirir ve her ödemeyi görevlendirebilir |

Birim yöneticisi (departments.managerId) kapsamdan bağımsız olarak yönettiği birimin ödemelerini görür ve görevlendirir.
Varsayılan roller: Muhasebe `read: all`, `manage: all`; Yönetici `read/manage: department`; Personel `read: own`.

## Bildirimler

- `payment.awaiting_assignment` (uygulama içi, push, e-posta): görev yöneticiye düştüğünde.
- `task.assigned`: görevlendirilen kişiye (mevcut görev kuralı).
- `payment.paid` (uygulama içi): ödendiğinde birim yöneticisine ve kaydı girene.

Kurallar ve kanallar Ayarlar → Bildirim kuralları'ndan değiştirilebilir.

## API

`GET /api/payments?status=open|awaiting|assigned|planned|paid|cancelled|all&type=&departmentId=&q=`, `GET /api/payments/summary`,
`GET /api/payments/:id`, `POST /api/payments`, `PATCH /api/payments/:id`, `POST /api/payments/:id/assign {assigneeId}`,
`POST /api/payments/:id/pay`, `POST /api/payments/:id/cancel`, `DELETE /api/payments/:id`,
`GET|PUT /api/payments/settings {defaultLeadDays}`, `POST /api/payments/run` (zamanlayıcıyı elle çalıştırır).

Zamanlayıcı `PAYMENT_SCHEDULER=off` ile kapatılabilir (birden fazla API örneği çalışıyorsa koşullu durum geçişi çift görevi zaten engeller).
