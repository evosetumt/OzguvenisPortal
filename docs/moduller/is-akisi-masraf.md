# İş akışı (BPMN) ve masraf onayı — Faz 3

## Bileşenler
| Yer | Ne yapar |
|---|---|
| `apps/api/src/workflow/` | BPMN motoru (`ProcessEngine`), XML ayrıştırma/doğrulama (`bpmn-model.ts`), güvenli koşul değerlendirici (`expression.ts`), tanım/örnek/görev API'si |
| `apps/api/src/expenses/` | Masraf kaydı, fişler, kapsam bazlı listeleme, süreç işleyicileri, Jev kategori önerisi |
| `apps/api/src/ai/jev.service.ts` | TypeSafe Jev HTTP istemcisi (Choice) |
| `apps/web/src/pages/ExpensesPage.tsx` · `ApprovalsPage.tsx` · `WorkflowsPage.tsx` | Masraflar, Onaylarım, Akış Tasarımcısı (bpmn-js) |
| `apps/web/src/components/settings/ExpenseSettings.tsx` | Eşik, hatırlatma süresi, kategoriler, yapay zekâ anahtarı |

## Motor
Hafif bir yorumlayıcıdır. Durum veritabanında tutulur (`ProcessInstance`, `ProcessTask`, `ProcessEvent`); sunucu yeniden başlasa da bekleyen onaylar kaybolmaz.

- Desteklenen öğeler: başlangıç, bitiş, kullanıcı görevi, servis görevi, karar kapısı (exclusive gateway), akış. Paralel kapı, alt süreç ve ara olaylar yayında hata verir.
- Özel öznitelikler `portal` ad alanındadır (`xmlns:portal="http://ozguvenis.local/portal"`):
  - Kullanıcı görevi: `portal:assignee` = `manager` (başlatanın departman yöneticisi; yoksa üst departmanınki, o da yoksa `Admin` rolü) · `initiator` · `role:<RolAdı>` · `user:<id>`; `portal:dueHours`; `portal:decisions` (`approved,rejected` / `approved` / `paid`).
  - Servis görevi: `portal:handler` + `portal:args`. Kayıtlı işleyiciler: `notify`, `setVariable`, `expense.autoApprove`, `expense.recordDecision`, `expense.setStatus`. Diğer modüller `ProcessEngine.registerHandler()` ile yenisini ekler.
- Koşullar: `${amountTry <= settings.expense.autoApproveLimit}`, `${decision == 'approved'}`. Kullanılabilenler: değişkenler, `settings.<anahtar>`, sayı/metin/true/false/null, `+ - * /`, `== != < <= > >=`, `&& || !` ve parantez. `eval` kullanılmaz.
- Görev tamamlanınca karar `decision`, açıklama `comment`, karar veren `actorId` değişkenine yazılır.
- Sürümleme: etkin bir tanım düzenlenip kaydedilince yeni **taslak** sürüm açılır. Yayınlanınca önceki etkin sürüm arşive gider. Çalışan örnekler başladıkları sürümle devam eder.
- Yayın öncesi doğrulanan kurallar:
  - tek başlangıç olayı ve en az bir bitiş olayı;
  - her öğe başlangıçtan ulaşılabilir ve bir bitişe varabilir;
  - karar kapısının çıkışlarında koşul veya varsayılan akış;
  - işleyici ve sorumlu tanımlı.
- Gecikme hatırlatması: Saatte bir, süresi dolan açık görevler için sorumlulara bir kez `process.task_overdue` gönderilir. Süre `portal:dueHours` ile, o yoksa `workflow.approvalReminderHours` ayarıyla (varsayılan 48 saat) belirlenir.

## Masraf onayı (`expense_approval`, seed ile v1 etkin)
```
Gönder → Eşik altında mı? ─evet→ Otomatik onay ─┐
              │hayır                          ▼
        Yönetici onayı → kararı işle → onay? ─evet→ Muhasebe onayı → kararı işle → onay? ─evet→ Ödeme → Ödendi
                                         └red→ Reddedildi                      └red→ Reddedildi
```
- Masraf durumları:
  - `draft`: taslak;
  - `submitted`: yönetici onayında;
  - `manager_approved`: muhasebede (otomatik onaylananlar da buraya düşer);
  - `accounting_approved`: ödeme bekliyor;
  - `rejected`: reddedildi;
  - `paid`: ödendi.
- Onaya göndermek için en az bir fiş gerekir. Reddedilen masraf düzenlenip yeniden gönderilebilir; bu yeni bir süreç başlatır.
- Döviz masraflarında TL karşılığı elle girilir. Eşik `amountTry` ile karşılaştırılır.
- Kim neyi görür:
  - personel yalnızca kendi masraflarını görür;
  - `expense.approve` departman kapsamında, kendi ve yönettiği departmanların masrafları görünür; `all` kapsamında tümü;
  - `expense.accounting` (`all`) kapsamında tümü görünür;
  - süreçte görevi olan kişi ilgili masrafı ve fişini görür.
- Fiş dosyalarına erişim de aynı kurala bağlıdır (`AttachmentsService.registerAccessCheck`).

## Olaylar ve bildirimler
| Olay | Kime |
|---|---|
| `process.task_assigned` | Atanan kişi veya rolün tüm üyeleri |
| `process.task_overdue` | Aynı alıcılar |
| `expense.approved` | Masraf sahibi |
| `expense.rejected` | Masraf sahibi |
| `expense.paid` | Masraf sahibi |

`expense.submitted` ve `process.task_completed` yalnızca olay olarak yayınlanır.

## API
| Uç nokta | İzin |
|---|---|
| `GET/POST /process-definitions`, `GET/PUT /process-definitions/:id`, `POST /process-definitions/validate`, `POST /process-definitions/:id/publish`, `POST /process-definitions/:id/archive`, `GET /process-meta` | `workflow.design` |
| `GET /process-instances`, `GET /process-instances/:id` | Tasarımcı hepsini, diğer kullanıcılar başlattıklarını ve görevli olduklarını görür |
| `GET /process-tasks/mine?status=done`, `POST /process-tasks/:id/complete {decision, comment}` | Kendi ve rolüne açık görevler |
| `GET/POST /expenses?view=mine\|team\|all&status=`, `GET/PATCH/DELETE /expenses/:id`, `POST /expenses/:id/submit` | `expense.*` |
| `GET/POST/PATCH /expense-categories`, `GET/PUT /expense-settings` | Değişiklik: `expense.accounting` veya `user.manage` |
| `POST /expenses/suggest-category {description}` | `expense.create` |

## Yapay zekâ ile kategori önerisi (TypeSafe Jev)
- **Varsayılan kapalı.** Açıkken masraf açıklaması şirket dışındaki TypeSafe servisine gider; fiş görseli gönderilmez. Açmak için Ayarlar → Masraf onayı → "Masraf açıklamasından kategori öner". Ayrıca sunucuda `TYPESAFE_API_KEY` tanımlı olmalı.
- Choice sorusu, etkin kategorilerin ve "Belirsiz" seçeneğinin üzerinden sorulur. Güven `ai.expenseCategoryMinConfidence` ayarının (varsayılan 0,6) altındaysa veya cevap "Belirsiz" ise öneri yapılmaz. İstek 3 saniyede zaman aşımına uğrar; hata olursa öneri gösterilmez.
- Ortam değişkenleri: `TYPESAFE_API_KEY` (zorunlu), `TYPESAFE_MODEL` (varsayılan `jev-latest`), `TYPESAFE_API_URL` (isteğe bağlı).

## Ayarlar (`settings` tablosu)
| Anahtar | Varsayılan |
|---|---|
| `expense.autoApproveLimit` | 50 TL |
| `workflow.approvalReminderHours` | 48 |
| `ai.expenseCategorySuggest` | false |
| `ai.expenseCategoryMinConfidence` | 0,6 |


## Onay adımları Görevler listesine düşer (2026-10-29)

- Her kullanıcı görevi (userTask) açıldığında Görevler listesine de bir görev yansıtılır (`relatedType = process_task`).
  Tek sorumlu varsa ona atanır; birim veya rol adayıysa atanmadan açılır ve adayların hepsi izleyici olur, böylece hepsinin listesinde görünür.
- Karar Onaylarım'dan (veya görevdeki **Karar ver** düğmesiyle) verilir; karar verilince yansıyan görev kendiliğinden tamamlanır, süreç iptalinde kaldırılır.
  Karar verilmeden görev elle "tamamlandı" yapılamaz.
- Yeni sorumlu türü: `portal:assignee="department:<Birim>"`. O birimdeki herkes görevi görür ve karar verebilir
  (ad tam eşleşir ya da `<Birim> (…)` biçimindedir; birim yoksa veya boşsa aynı adlı rol, o da yoksa Admin).
  Tasarımcıda "Sorumlu" listesinde **Birim** grubu olarak seçilir.
- Masraf onayı v8: Muhasebe onayı ve Ödeme adımları `department:Muhasebe`. Çalışan süreçler yeni sürüme taşındı (öğe kimlikleri aynı).
- Fiş ve ekler uygulama içindeki görüntüleyicide açılır (yakınlaştır, döndür, indir; PDF de içeride gösterilir).
