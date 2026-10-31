import { Injectable } from '@nestjs/common';

export interface ChoiceAnswer { choice: string; confidence: number; probabilities: Record<string, number> }

/**
 * TypeSafe Jev (System One) istemcisi: doğal dil durumundan tipli karar döner (HTTP API, POST /v1/systemone).
 * Anahtar yalnızca sunucuda tutulur (TYPESAFE_API_KEY). Hata/zaman aşımında null döner; çağıran özellik sessizce devre dışı kalır.
 * Not: gönderilen durum (state) şirket dışındaki servise gider; çağıranlar ayrıca ayarla açılmış olmalıdır.
 */
@Injectable()
export class JevService {
  private readonly url = (process.env.TYPESAFE_API_URL ?? 'https://api.typesafe.ai') + '/v1/systemone';
  private readonly model = process.env.TYPESAFE_MODEL ?? 'jev-latest';

  isConfigured() {
    return !!process.env.TYPESAFE_API_KEY;
  }

  async choice(state: unknown, instructions: string, criteria: Record<string, string>, timeoutMs = 3000): Promise<ChoiceAnswer | null> {
    if (!this.isConfigured()) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` },
        body: JSON.stringify({ model: this.model, state, questions: { q: { type: 'choice', instructions, criteria } } }),
      });
      if (!res.ok) {
        console.warn(`Jev isteği başarısız: HTTP ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { answers?: { q?: ChoiceAnswer } };
      const a = body.answers?.q;
      return a && typeof a.choice === 'string' ? a : null;
    } catch (e) {
      console.warn('Jev isteği başarısız:', (e as Error).name === 'AbortError' ? 'zaman aşımı' : (e as Error).message);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
