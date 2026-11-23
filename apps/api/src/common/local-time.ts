/**
 * Gerçek zaman damgaları (completedAt, createdAt, startsAt) için yerel gün/hafta sınırları.
 * Sunucu Europe/Istanbul (UTC+3, yaz saati yok) saatinde çalışır; yerel gece yarısı = UTC 21:00 (önceki gün).
 * Yalnız-gün kolonları (dueDate gibi, UTC gece yarısı saklanır) için bunlar DEĞİL scope.ts → startOfTodayUtc kullanılır.
 */

/** Yerel gece yarısı (bugün veya verilen anın günü). */
export function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Yerel takvimde gün ekler (saat dilimi kaymasına dayanıklı olsun diye ms yerine setDate). */
export function addLocalDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Bu haftanın pazartesi yerel gece yarısı. */
export function startOfLocalWeek(d = new Date()) {
  const s = startOfLocalDay(d);
  return addLocalDays(s, -((s.getDay() + 6) % 7));
}

/** Anın yerel tarihi "YYYY-MM-DD" (toISOString UTC tarihini verir; gece 00-03 arası bir önceki güne düşerdi). */
export function localDateKey(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
