import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * Modüller arası olay yolu. Modüller birbirini doğrudan çağırmaz, olay yayınlar
 * (task.assigned, task.commented ...). Bildirim kuralları ve ileride BPMN akışları bu olaylara abone olur.
 */
export interface PortalEvent<T = Record<string, unknown>> {
  code: string;
  actorId: number | null;
  payload: T;
  at: Date;
}

type Handler = (e: PortalEvent<any>) => void | Promise<void>;

@Injectable()
export class EventsService {
  private readonly bus = new EventEmitter();

  emit<T extends Record<string, unknown>>(code: string, actorId: number | null, payload: T) {
    const e: PortalEvent<T> = { code, actorId, payload, at: new Date() };
    for (const h of this.bus.listeners(code) as Handler[]) {
      // Abonelerin hatası olayı yayınlayan işlemi bozmasın.
      Promise.resolve().then(() => h(e)).catch((err) => console.error(`Olay işleyici hatası (${code})`, err));
    }
  }

  on(code: string, handler: Handler) {
    this.bus.on(code, handler);
  }
}
