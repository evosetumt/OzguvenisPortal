import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from '../chat/chat.service';
import { RealtimeGateway } from '../chat/realtime.gateway';
import type { AuthUser } from '../auth/auth.guard';

const RING_MS = 45_000; // cevap gelmezse "cevapsız"
const OFFLINE_GRACE_MS = 20_000; // bağlantısı kopan katılımcı bu süre içinde dönmezse aramadan düşer
const JOIN_EARLY_MS = 15 * 60_000; // toplantıya başlangıçtan 15 dk önce girilebilir
/** Eşler arası (mesh) yapıda her katılımcı herkese ayrı akış gönderir; bundan fazlası çoğu cihazı zorlar. */
export const MAX_JOINED = 8;

const userSel = { select: { id: true, fullName: true, avatarUrl: true } } as const;
const callInclude = {
  participants: { include: { user: userSel }, orderBy: { userId: 'asc' } },
  conversation: { select: { id: true, type: true, title: true } },
  meeting: { select: { id: true, title: true } },
  startedBy: userSel,
} satisfies Prisma.CallInclude;
type CallRow = Prisma.CallGetPayload<{ include: typeof callInclude }>;

const OPEN = ['ringing', 'active'];
const kindLabel = (k: string) => (k === 'video' ? 'görüntülü' : 'sesli');
function duration(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} dk${s % 60 ? ` ${s % 60} sn` : ''}` : `${s} sn`;
}

/** STUN/TURN listesi (ICE_SERVERS, JSON). İç ağda boş liste de çalışır; dış ağ/mobil veri için TURN gerekir. */
function iceServers(): RTCIceServerLike[] {
  const raw = process.env.ICE_SERVERS?.trim();
  if (raw) {
    try { return JSON.parse(raw) as RTCIceServerLike[]; } catch { console.error('ICE_SERVERS geçerli JSON değil; varsayılan kullanılıyor'); }
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}
interface RTCIceServerLike { urls: string | string[]; username?: string; credential?: string }

/**
 * WebRTC aramaları (eşler arası, mesh). Medya sunucudan geçmez; sunucu yalnızca kim aramada onu tutar,
 * teklif/yanıt/ICE sinyalini katılımcılar arasında socket.io ile iletir ve arama geçmişini veritabanına yazar.
 * Sohbet araması: zil çalar (çevrimdışına FCM push), cevapsız kalırsa 45 sn sonra kapanır, bitince sohbete özet mesajı düşer.
 * Toplantı: toplantı başına tek canlı arama; ilk giren başlatır, son çıkan kapatır. Katılım/ayrılış saatleri kaydedilir.
 */
@Injectable()
export class CallsService implements OnModuleInit {
  /** Aramaya şu an bağlı olanlar (sinyal yetkisi buradan denetlenir; her ICE adayında veritabanına gidilmez). */
  private readonly live = new Map<number, Set<number>>();
  private readonly ringTimers = new Map<number, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly chat: ChatService,
    private readonly rt: RealtimeGateway,
  ) {}

  async onModuleInit() {
    this.notifications.registerRule('call.incoming', {
      label: 'Gelen arama',
      defaultChannels: ['push'],
      // Telefon cebinde, bilgisayarda portal açık olabilir: zil her cihaza gider. Ekranda açık portal zili kendisi çalar;
      // tarayıcının service worker'ı o durumda ayrıca bildirim göstermez. Cevaplanınca/reddedilince cancelRing ile kapanır.
      rule: ({ payload: p }) => ({
        userIds: p.userIds as number[],
        n: { type: 'call.incoming', title: p.title, body: p.body, link: p.link, delivery: { tag: `call-${p.callId}`, urgent: true, sticky: true, openLabel: 'Cevapla' } },
      }),
    });
    this.notifications.registerRule('call.missed', {
      label: 'Cevapsız arama',
      defaultChannels: ['inapp', 'push'],
      rule: ({ payload: p }) => ({
        userIds: p.userIds,
        n: { type: 'call.missed', title: p.title, body: p.body, link: p.link, delivery: { tag: `call-${p.callId}` } },
      }),
    });

    this.rt.onClientEvent('rtc:signal', (u, b) => this.relaySignal(u, b));
    this.rt.onClientEvent('call:media', (u, b) => this.relayMedia(u, b));
    this.events.on('realtime.offline', ({ payload }) => {
      const userId = (payload as { userId: number }).userId;
      setTimeout(() => { if (!this.rt.isOnline(userId)) void this.dropUser(userId); }, OFFLINE_GRACE_MS);
    });

    // Sunucu yeniden başladıysa bağlantılar koptu: açık kalmış aramaları kapat.
    const stale = await this.prisma.call.findMany({ where: { status: { in: OPEN } }, select: { id: true, status: true } });
    for (const c of stale) await this.finish(c.id, c.status === 'ringing' ? 'missed' : 'ended', { quiet: true });
  }

  private async load(id: number) {
    const c = await this.prisma.call.findUnique({ where: { id }, include: callInclude });
    if (!c) throw new NotFoundException('Arama bulunamadı');
    return c;
  }

  private present(c: CallRow) {
    const { participants, ...rest } = c;
    return {
      ...rest,
      participants: participants.map((p) => ({ ...p.user, state: p.state, joinedAt: p.joinedAt, leftAt: p.leftAt })),
    };
  }

  /** Bir cihazda cevaplanan/reddedilen aramanın diğer cihazlardaki (tarayıcı) zil bildirimini kapatır. */
  private cancelRing(userId: number, callId: number) {
    void this.notifications.deliver(userId, { type: 'call.cancel', title: 'Arama', delivery: { tag: `call-${callId}`, close: true } }, ['push']).catch(() => undefined);
  }

  private notifyUpdated(c: CallRow) {
    this.rt.toUsers(c.participants.map((p) => p.userId), 'call:updated', this.present(c));
  }

  private async meetingVisible(u: AuthUser, meetingId: number) {
    return this.prisma.meeting.findFirst({
      where: { id: meetingId, deletedAt: null, OR: [{ organizerId: u.id }, { participants: { some: { userId: u.id } } }] },
    });
  }

  /** Aramaya girebilir mi: çağrılmış, sohbet üyesi (grup aramasına sonradan katılma) veya toplantı katılımcısı. */
  private async assertAccess(u: AuthUser, c: CallRow) {
    if (c.participants.some((p) => p.userId === u.id)) return;
    if (c.conversationId) {
      const m = await this.prisma.conversationMember.count({ where: { conversationId: c.conversationId, userId: u.id } });
      if (m) return;
    }
    if (c.meetingId && (await this.meetingVisible(u, c.meetingId))) return;
    throw new NotFoundException('Arama bulunamadı');
  }

  get(u: AuthUser, id: number) {
    return this.load(id).then(async (c) => { await this.assertAccess(u, c); return this.present(c); });
  }

  /** Kullanıcının çalan veya devam eden aramaları (sayfa yenilenince gelen arama ekranı geri gelsin). */
  async mine(u: AuthUser) {
    const rows = await this.prisma.call.findMany({
      where: { status: { in: OPEN }, participants: { some: { userId: u.id, state: { in: ['ringing', 'joined'] } } } },
      include: callInclude,
    });
    return rows.map((c) => this.present(c));
  }

  /** Sohbetten sesli/görüntülü arama başlatır; sohbette süren arama varsa ona katılır. */
  async startInConversation(u: AuthUser, conversationId: number, kind: 'audio' | 'video') {
    const { conv, ids } = await this.chat.memberIds(u, conversationId);
    const open = await this.prisma.call.findFirst({ where: { conversationId, status: { in: OPEN } } });
    if (open) return this.join(u, open.id);
    const others = ids.filter((id) => id !== u.id);
    if (!others.length) throw new BadRequestException('Sohbette aranacak kimse yok');

    const now = new Date();
    const call = await this.prisma.call.create({
      data: {
        kind, conversationId, startedById: u.id,
        participants: { create: [{ userId: u.id, state: 'joined', joinedAt: now }, ...others.map((userId) => ({ userId }))] },
      },
      include: callInclude,
    });
    this.live.set(call.id, new Set([u.id]));
    this.ringTimers.set(call.id, setTimeout(() => void this.ringTimeout(call.id), RING_MS));
    await this.audit.log(u.id, 'call.start', 'call', call.id, { conversationId, kind });

    const view = this.present(call);
    this.rt.toUsers(others, 'call:incoming', view);
    const caller = call.startedBy.fullName;
    this.events.emit('call.incoming', u.id, {
      callId: call.id,
      userIds: others,
      title: `${caller} ${kindLabel(kind)} arıyor`,
      body: conv.type === 'group' ? conv.title ?? 'Grup araması' : 'Gelen arama',
      link: `/messages?c=${conversationId}&call=${call.id}`,
    });
    return { call: view, peers: [] as number[], iceServers: iceServers() };
  }

  /** Toplantıya katıl: toplantının canlı araması yoksa açılır. */
  async joinMeeting(u: AuthUser, meetingId: number) {
    const m = await this.meetingVisible(u, meetingId);
    if (!m) throw new NotFoundException('Toplantı bulunamadı');
    const now = Date.now();
    if (now < m.startsAt.getTime() - JOIN_EARLY_MS) throw new BadRequestException('Toplantıya başlangıçtan en fazla 15 dakika önce katılabilirsiniz');
    if (now > m.endsAt.getTime()) throw new BadRequestException('Toplantı sona erdi');
    let call = await this.prisma.call.findFirst({ where: { meetingId, status: { in: OPEN } } });
    if (!call) {
      call = await this.prisma.call.create({ data: { kind: 'video', meetingId, startedById: u.id, status: 'active', answeredAt: new Date() } });
      this.live.set(call.id, new Set());
    }
    return this.join(u, call.id);
  }

  async join(u: AuthUser, id: number) {
    const c = await this.load(id);
    await this.assertAccess(u, c);
    if (!OPEN.includes(c.status)) throw new BadRequestException('Arama sona erdi');
    const joined = this.live.get(id) ?? new Set<number>();
    if (!joined.has(u.id) && joined.size >= MAX_JOINED) throw new ConflictException(`Arama dolu (en fazla ${MAX_JOINED} kişi)`);

    const now = new Date();
    await this.prisma.callParticipant.upsert({
      where: { callId_userId: { callId: id, userId: u.id } },
      create: { callId: id, userId: u.id, state: 'joined', joinedAt: now },
      update: { state: 'joined', joinedAt: now, leftAt: null },
    });
    if (c.participants.some((p) => p.userId === u.id && p.state === 'ringing')) this.cancelRing(u.id, id);
    if (c.status === 'ringing') {
      await this.prisma.call.update({ where: { id }, data: { status: 'active', answeredAt: now } });
      if (c.conversation?.type === 'direct') this.clearRing(id);
    }
    const peers = [...joined].filter((x) => x !== u.id);
    joined.add(u.id);
    this.live.set(id, joined);
    if (c.meetingId) await this.audit.log(u.id, 'meeting.join', 'meeting', c.meetingId, { callId: id });

    // Mevcut katılımcılar yeni geleni bekler; bağlantı teklifini yeni gelen başlatır.
    this.rt.toUsers(peers, 'call:joined', { callId: id, userId: u.id });
    const fresh = await this.load(id);
    this.notifyUpdated(fresh);
    return { call: this.present(fresh), peers, iceServers: iceServers() };
  }

  /** Gelen aramayı reddet. Birebir aramada arayan tarafa "reddedildi" gider ve arama kapanır. */
  async decline(u: AuthUser, id: number) {
    const c = await this.load(id);
    const me = c.participants.find((p) => p.userId === u.id);
    if (!me || me.state !== 'ringing') return this.present(c);
    await this.prisma.callParticipant.update({ where: { callId_userId: { callId: id, userId: u.id } }, data: { state: 'declined' } });
    this.cancelRing(u.id, id);
    const stillRinging = c.participants.some((p) => p.userId !== u.id && p.state === 'ringing');
    if (c.status === 'ringing' && !stillRinging) return this.finish(id, 'declined');
    const fresh = await this.load(id);
    this.notifyUpdated(fresh);
    return this.present(fresh);
  }

  async leave(u: AuthUser, id: number) {
    const c = await this.load(id);
    if (!OPEN.includes(c.status)) return this.present(c);
    const joined = this.live.get(id) ?? new Set<number>();
    joined.delete(u.id);
    await this.prisma.callParticipant.updateMany({ where: { callId: id, userId: u.id, state: 'joined' }, data: { state: 'left', leftAt: new Date() } });
    this.rt.toUsers([...joined], 'call:left', { callId: id, userId: u.id });

    // Kimse açmadan arayan vazgeçti → cevapsız; sohbet aramasında tek kişi kaldıysa veya toplantıda kimse kalmadıysa biter.
    if (c.status === 'ringing') return this.finish(id, 'cancelled');
    if (joined.size === 0 || (c.conversationId && joined.size < 2)) return this.finish(id, 'ended');
    const fresh = await this.load(id);
    this.notifyUpdated(fresh);
    return this.present(fresh);
  }

  /** Bağlantısı tamamen kopan kullanıcıyı açık aramalarından çıkarır. */
  private async dropUser(userId: number) {
    for (const [callId, set] of this.live) {
      if (set.has(userId)) await this.leave({ id: userId } as AuthUser, callId).catch(() => undefined);
    }
  }

  private clearRing(id: number) {
    const t = this.ringTimers.get(id);
    if (t) clearTimeout(t);
    this.ringTimers.delete(id);
  }

  private async ringTimeout(id: number) {
    this.ringTimers.delete(id);
    const c = await this.prisma.call.findUnique({ where: { id }, include: callInclude });
    if (!c) return;
    if (c.status === 'ringing') { await this.finish(id, 'missed'); return; }
    // Grup araması açıldı ama bazıları hiç cevap vermedi: onların zili susar.
    const missed = c.participants.filter((p) => p.state === 'ringing').map((p) => p.userId);
    if (!missed.length) return;
    await this.prisma.callParticipant.updateMany({ where: { callId: id, state: 'ringing' }, data: { state: 'missed' } });
    this.notifyMissed(c, missed);
    this.notifyUpdated(await this.load(id));
  }

  private notifyMissed(c: CallRow, userIds: number[]) {
    if (!userIds.length || !c.conversationId) return;
    this.events.emit('call.missed', c.startedById, {
      callId: c.id,
      userIds,
      title: `Cevapsız ${kindLabel(c.kind)} arama`,
      body: c.startedBy.fullName,
      link: `/messages?c=${c.conversationId}`,
    });
  }

  /** Aramayı kapatır: katılım kayıtlarını tamamlar, herkese haber verir, sohbete özet mesajı yazar. */
  private async finish(id: number, status: 'ended' | 'missed' | 'declined' | 'cancelled', opts: { quiet?: boolean } = {}) {
    this.clearRing(id);
    this.live.delete(id);
    const now = new Date();
    const ringing = await this.prisma.callParticipant.findMany({ where: { callId: id, state: 'ringing' }, select: { userId: true } });
    await this.prisma.$transaction([
      this.prisma.call.update({ where: { id }, data: { status, endedAt: now } }),
      this.prisma.callParticipant.updateMany({ where: { callId: id, state: 'joined' }, data: { state: 'left', leftAt: now } }),
      this.prisma.callParticipant.updateMany({ where: { callId: id, state: 'ringing' }, data: { state: 'missed' } }),
    ]);
    const c = await this.load(id);
    this.rt.toUsers(c.participants.map((p) => p.userId), 'call:ended', { callId: id, status });
    if (opts.quiet) return this.present(c);

    if (status !== 'declined') this.notifyMissed(c, ringing.map((p) => p.userId));
    if (c.conversationId) {
      const label = c.kind === 'video' ? 'Görüntülü arama' : 'Sesli arama';
      const body = c.answeredAt
        ? `${c.kind === 'video' ? '📹' : '📞'} ${label} · ${duration(now.getTime() - c.answeredAt.getTime())}`
        : status === 'declined' ? `📵 Reddedilen ${label.toLocaleLowerCase('tr-TR')}` : `📵 Cevapsız ${label.toLocaleLowerCase('tr-TR')}`;
      await this.chat.postCallMessage(c.conversationId, c.startedById, body, id);
    }
    return this.present(c);
  }

  /** WebRTC sinyali yalnızca aynı aramaya bağlı iki kişi arasında iletilir. */
  private relaySignal(u: AuthUser, body: unknown) {
    const b = body as { callId?: number; to?: number; data?: unknown };
    const set = this.live.get(Number(b?.callId));
    const to = Number(b?.to);
    if (!set?.has(u.id) || !set.has(to) || to === u.id || b.data === undefined) return;
    this.rt.toUser(to, 'rtc:signal', { callId: Number(b.callId), from: u.id, data: b.data });
  }

  private relayMedia(u: AuthUser, body: unknown) {
    const b = body as { callId?: number; mic?: boolean; cam?: boolean; screen?: boolean };
    const set = this.live.get(Number(b?.callId));
    if (!set?.has(u.id)) return;
    this.rt.toUsers([...set].filter((x) => x !== u.id), 'call:media', {
      callId: Number(b.callId), userId: u.id, mic: !!b.mic, cam: !!b.cam, screen: !!b.screen,
    });
  }

  /** Toplantı katılım geçmişi: kim ne zaman girdi/çıktı (toplantı kartında gösterilir). */
  async meetingAttendance(u: AuthUser, meetingId: number) {
    if (!(await this.meetingVisible(u, meetingId))) throw new ForbiddenException();
    const calls = await this.prisma.call.findMany({
      where: { meetingId },
      include: { participants: { where: { joinedAt: { not: null } }, include: { user: userSel }, orderBy: { joinedAt: 'asc' } } },
      orderBy: { id: 'asc' },
    });
    return calls.map((c) => ({
      id: c.id, startedAt: c.answeredAt ?? c.createdAt, endedAt: c.endedAt, status: c.status,
      participants: c.participants.map((p) => ({ ...p.user, joinedAt: p.joinedAt, leftAt: p.leftAt })),
    }));
  }
}
