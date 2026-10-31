import { Injectable, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.guard';

/** İzinli kökenler çalışma anında okunur (.env, dekoratör değerlendirildikten sonra yüklenir). */
const allowedOrigin = (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
  const list = (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  // Kökensiz istek (mobil uygulama, aynı köken) veya listede olan köken kabul edilir.
  cb(null, !origin || list.includes(origin));
};

export const userRoom = (id: number) => `user:${id}`;
/** Oturumu doğrulanmış tüm bağlantılar (veri değişikliği duyurusu). */
const AUTHED = 'authed';

/** Arama modülünün soket olayları (WebRTC sinyali, medya durumu); döngüsel bağımlılık olmasın diye kayıtla bağlanır. */
export type ClientEventHandler = (user: AuthUser, body: unknown) => void | Promise<void>;

/**
 * Tek WebSocket kapısı (socket.io, yol /api/socket.io; IIS tek /api önekini yönlendirir).
 * İstemci el sıkışmada `auth: { token }` ile JWT gönderir; her kullanıcı `user:<id>` odasına girer.
 * Sohbet, bildirim ve diğer anlık olaylar bu odalara gönderilir.
 */
@WebSocketGateway({ path: '/api/socket.io', cors: { origin: allowedOrigin, credentials: true } })
@Injectable()
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Server;
  /** Kullanıcı başına açık bağlantı sayısı (çevrimiçi durumu, push atlama kararı için). */
  private readonly online = new Map<number, number>();
  private readonly handlers = new Map<string, ClientEventHandler>();
  /** Kullanıcının ekranda görünür (ön planda) olan bağlantıları; mesaj bildiriminin telefona gidip gitmeyeceğine bakılır. */
  private readonly visible = new Map<number, Set<string>>();

  constructor(private readonly jwt: JwtService, private readonly events: EventsService, private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Uygulama içi bildirim oluşunca zil anında güncellensin (30 sn yoklama yedek olarak kalır).
    this.events.on('notification.created', (e) => {
      const { userId, notification } = e.payload as { userId: number; notification: unknown };
      this.toUser(userId, 'notification:new', notification);
    });
    // Rol/yetki değişti: istemci jetonunu yenileyip menüsünü günceller.
    this.events.on('auth.changed', (e) => this.toUsers((e.payload as { userIds: number[] }).userIds, 'auth:changed', {}));
    // Veritabanında bir şey değişince açık ekranlar ilgili veriyi kendi yetkileriyle yeniden çeker (veri gönderilmez, yalnızca konu).
    this.prisma.onWrite((topics) => this.server?.to(AUTHED).emit('data:changed', { topics }));
  }

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth as { token?: string } | undefined)?.token;
    try {
      if (!token) throw new Error('jeton yok');
      const user = (await this.jwt.verifyAsync(token)) as AuthUser;
      client.data.user = user;
      await client.join([userRoom(user.id), AUTHED]);
      this.online.set(user.id, (this.online.get(user.id) ?? 0) + 1);
    } catch {
      client.emit('auth_error', { message: 'Oturum geçersiz' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as AuthUser | undefined;
    if (!user) return;
    this.setVisible(user.id, client.id, false);
    const n = (this.online.get(user.id) ?? 1) - 1;
    if (n <= 0) {
      this.online.delete(user.id);
      // Son bağlantısı kopan kullanıcı (ör. sekme kapandı): açık aramadan düşürülmesi için.
      this.events.emit('realtime.offline', user.id, { userId: user.id });
    } else this.online.set(user.id, n);
  }

  onClientEvent(event: 'rtc:signal' | 'call:media', handler: ClientEventHandler) {
    this.handlers.set(event, handler);
  }

  private dispatch(event: string, client: Socket, body: unknown) {
    const user = client.data.user as AuthUser | undefined;
    const h = this.handlers.get(event);
    if (user && h) return h(user, body);
  }

  /** WebRTC teklif/yanıt/ICE adayı: yalnızca aynı aramaya katılmış iki kişi arasında iletilir, kaydedilmez. */
  @SubscribeMessage('rtc:signal')
  signal(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.dispatch('rtc:signal', client, body);
  }

  /** Mikrofon/kamera/ekran paylaşımı açık-kapalı bilgisi aramadaki diğer katılımcılara. */
  @SubscribeMessage('call:media')
  media(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return this.dispatch('call:media', client, body);
  }

  /** İstemci sekme/uygulama ön plana geçince ve arka plana düşünce bildirir. */
  @SubscribeMessage('presence:visible')
  presenceVisible(@ConnectedSocket() client: Socket, @MessageBody() body: { visible?: boolean }) {
    const user = client.data.user as AuthUser | undefined;
    if (user) this.setVisible(user.id, client.id, !!body?.visible);
  }

  private setVisible(userId: number, socketId: string, on: boolean) {
    const set = this.visible.get(userId) ?? new Set<string>();
    if (on) set.add(socketId); else set.delete(socketId);
    if (set.size) this.visible.set(userId, set); else this.visible.delete(userId);
  }

  /** Kullanıcı şu an portala bakıyor mu (herhangi bir cihazda ön planda açık ekran)? */
  isActive(userId: number) {
    return this.visible.has(userId);
  }

  isOnline(userId: number) {
    return this.online.has(userId);
  }

  toUser(userId: number, event: string, data: unknown) {
    this.server?.to(userRoom(userId)).emit(event, data);
  }

  toUsers(userIds: number[], event: string, data: unknown) {
    if (!userIds.length || !this.server) return;
    this.server.to(userIds.map(userRoom)).emit(event, data);
  }

  /** "Yazıyor..." göstergesi: yalnızca sohbet üyeleri arasında, kaydedilmez. */
  @SubscribeMessage('typing')
  async typing(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId?: number }) {
    const user = client.data.user as AuthUser | undefined;
    const conversationId = Number(body?.conversationId);
    if (!user || !Number.isInteger(conversationId)) return;
    const members = await this.prisma.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
    if (!members.some((m) => m.userId === user.id)) return;
    this.toUsers(members.map((m) => m.userId).filter((id) => id !== user.id), 'typing', { conversationId, userId: user.id });
  }
}
