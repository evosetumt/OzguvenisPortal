import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaymentsService } from './payments.service';

const HOUR = 3600000;

/** Vadesi ön süreye giren ödemelerin görevini açar. Açılışta ve saatte bir çalışır; koşullu durum geçişi sayesinde tekrar açmaz. */
@Injectable()
export class PaymentSchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly payments: PaymentsService) {}

  onModuleInit() {
    if (process.env.PAYMENT_SCHEDULER === 'off') return;
    this.first = setTimeout(() => void this.run(), 20000);
    this.timer = setInterval(() => void this.run(), HOUR);
  }

  onModuleDestroy() {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  async run() {
    if (this.running) return { opened: 0 };
    this.running = true;
    try {
      return { opened: await this.payments.openDue() };
    } catch (e) {
      console.error('Ödeme zamanlayıcı hatası', e);
      return { opened: 0 };
    } finally {
      this.running = false;
    }
  }
}
