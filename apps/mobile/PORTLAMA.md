# Web → Flutter aktarım kuralları

Kaynak: `apps/web/src` (React). Hedef: `apps/mobile/lib` (Flutter). API: `apps/api` (değişmez, aynı uçlar).

Hazır altyapı (DEĞİŞTİRME, gerekirse yalnızca kullan):
- `core/theme.dart`   `context.tk` → Tokens (web CSS değişkenlerinin birebir karşılığı: text, text2, fill, accent, accentInk, danger, green, prioUrgent...)
- `core/api.dart`     `Api.i.get/post/patch/put/delete/upload`, `Api.i.url(path)`, `Api.i.authHeaders`
- `core/live.dart`    `ApiView<T>(path:, decode:, builder:)` ve `ApiData<T>` = web `useApi` (socket `data:changed` ile otomatik tazeler)
- `core/realtime.dart` `Realtime.socket`, `SocketEvents` mixin = web `useSocketEvent`
- `core/auth.dart`    `context.read<AuthController>()` → `me`, `can('x.y')`, `canAny([...])`
- `widgets/glass.dart` Glass, PageHead, PillButton, Chip2, showGlassSheet, showToast; `widgets/avatar.dart`; `widgets/brand_logo.dart`
- `modules.dart` menü; `router.dart` rotalar; `shell.dart` çerçeve (üst bar + alt sekme)

Kurallar:
1. Görünüm web ile birebir aynı olsun: aynı Türkçe metinler, aynı alan/etiket adları, aynı renk belirteçleri (`context.tk`), cam kartlar (`Glass`), hap düğmeler (`PillButton`). Telefon düzenini (web `@media (max-width:860px)`) esas al: tek sütun, tablolar kart listesine, çekmeceler `showGlassSheet`.
2. İkonlar `lucide_icons_flutter` (web `lucide-react` ile aynı adlar; `LucideIcons.xxx`).
3. Tarih/para biçimi web `lib/format.ts` ile aynı (intl, `tr_TR`).
4. Yetki denetimi webdeki `can(...)` çağrılarıyla aynı yerlerde.
5. Modele özel veri sınıfları `lib/models/<modül>.dart` altına (web `lib/types-*.ts` karşılığı), JSON alan adları aynen korunur; null güvenli `fromJson`.
6. SADECE sana verilen dosyalara yaz. `lib/core`, `lib/widgets`, `shell.dart`, `router.dart`, `modules.dart`, `main.dart` dosyalarını değiştirme; eksik bir ortak parça gerekiyorsa kendi klasöründe yardımcı dosya aç (`lib/pages/<modül>/...`). Router'a yeni rota gerekiyorsa ya da ortak dosyada değişiklik şart ise yapma, nihai raporunda ayrıntıyla yaz.
7. Sayfa giriş sınıfları mevcut yer tutucu dosyaların adını korusun (`lib/pages/tasks_page.dart` → `TasksPage`). Alt ekranları `lib/pages/<modül>/` altına böl; tek dosya 600 satırı geçmesin.
8. Bitirmeden `cd apps/mobile && flutter analyze` çalıştır; kendi dosyalarında hata ve uyarı bırakma. Diğer ajanlar paralel çalışıyor; başkasının dosyalarındaki hataları düzeltmeye çalışma.
9. Çalıştırılabilir bir backend yok (SQL Server gerekir), bu yüzden doğrulama = analiz + web kaynağıyla satır satır karşılaştırma. Hiçbir şeyi uydurma: alan adı/uç emin değilse `apps/api/src/<modül>/*.controller.ts` ve ilgili dto/service dosyalarını oku.
10. Raporun kısa olsun: hangi dosyalar, eksik/ertelenen ne var, ortak dosyalarda istediğin değişiklik.
