import { connectRealtime } from './realtime';

/**
 * Eşler arası (mesh) WebRTC oturumu: her katılımcı diğer herkese ayrı RTCPeerConnection açar, medya sunucudan geçmez.
 * Sinyal (teklif/yanıt/ICE) socket.io 'rtc:signal' ile yalnızca aynı aramadaki kişiler arasında iletilir.
 * Çakışmalar "perfect negotiation" kalıbıyla çözülür (küçük kimlikli taraf "kibar"dır, karşı teklifi kabul eder).
 * Yeni katılan herkese teklif gönderir; içerdekiler bağlantıyı gelen teklifle kurar.
 */

export interface MediaFlags { mic: boolean; cam: boolean; screen: boolean }
export interface PeerView { userId: number; stream: MediaStream; media: MediaFlags; connection: RTCPeerConnectionState }

type SignalData = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null };

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audioTx: RTCRtpTransceiver | null;
  videoTx: RTCRtpTransceiver | null;
  stream: MediaStream;
  media: MediaFlags;
}

/** Kamera/mikrofon hatalarını kullanıcıya anlaşılır Türkçe metne çevirir. */
export function describeMediaError(e: unknown) {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError') return 'Kamera/mikrofon izni verilmedi. Tarayıcı adres çubuğundan izin verip tekrar deneyin.';
  if (name === 'NotFoundError') return 'Kamera veya mikrofon bulunamadı.';
  if (name === 'NotReadableError') return 'Kamera/mikrofon başka bir uygulama tarafından kullanılıyor.';
  return e instanceof Error ? e.message : 'Beklenmeyen hata';
}

export const mediaAvailable = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Yerel medya: görüntülüde kamera+mikrofon, olmazsa yalnızca mikrofon, o da olmazsa yalnızca dinleyici.
 * warning: kullanıcıya gösterilecek açıklama (ör. güvensiz bağlantı, izin yok).
 */
export async function getLocalMedia(video: boolean): Promise<{ stream: MediaStream; warning: string }> {
  if (!mediaAvailable()) {
    return {
      stream: new MediaStream(),
      warning: 'Kamera ve mikrofon bu adreste kullanılamıyor: tarayıcılar bunlara yalnızca güvenli bağlantıda (https://) izin verir. Görüşmeyi izleyip dinleyebilirsiniz.',
    };
  }
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio, video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false }), warning: '' };
  } catch (e) {
    if (!video) return { stream: new MediaStream(), warning: describeMediaError(e) };
    try {
      return { stream: await navigator.mediaDevices.getUserMedia({ audio }), warning: `Kamera açılamadı, yalnızca sesle katıldınız. ${describeMediaError(e)}` };
    } catch (e2) {
      return { stream: new MediaStream(), warning: describeMediaError(e2) };
    }
  }
}

export class MeshSession {
  private readonly peers = new Map<number, Peer>();
  private readonly listeners = new Set<() => void>();
  private readonly offs: (() => void)[] = [];
  private camTrack: MediaStreamTrack | null;
  private screenTrack: MediaStreamTrack | null = null;
  private closed = false;
  readonly local: MediaStream;

  constructor(
    readonly callId: number,
    private readonly selfId: number,
    private readonly iceServers: RTCIceServer[],
    local: MediaStream,
  ) {
    this.local = local;
    this.camTrack = local.getVideoTracks()[0] ?? null;
    const s = connectRealtime();
    const on = <T,>(ev: string, fn: (d: T) => void) => { s.on(ev, fn); this.offs.push(() => s.off(ev, fn)); };
    on<{ callId: number; from: number; data: SignalData }>('rtc:signal', (m) => { if (m.callId === this.callId) void this.onSignal(m.from, m.data); });
    on<{ callId: number; userId: number }>('call:joined', (m) => { if (m.callId === this.callId) this.sendMedia(); });
    on<{ callId: number; userId: number }>('call:left', (m) => { if (m.callId === this.callId) this.dropPeer(m.userId); });
    on<{ callId: number; userId: number } & MediaFlags>('call:media', (m) => {
      const p = this.peers.get(m.userId);
      if (m.callId !== this.callId || !p) return;
      p.media = { mic: m.mic, cam: m.cam, screen: m.screen };
      this.emit();
    });
    // Soket koptuysa yeniden bağlanınca medya durumunu tekrar duyur.
    on('connect', () => this.sendMedia());
  }

  /** İçeride olanlara bağlan (yeni katılan taraf teklif gönderir). */
  connectTo(peerIds: number[]) {
    for (const id of peerIds) this.peer(id, true);
    this.sendMedia();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() { for (const fn of this.listeners) fn(); }

  get media(): MediaFlags {
    const mic = this.local.getAudioTracks()[0];
    return { mic: !!mic?.enabled, cam: !!this.camTrack?.enabled && !this.screenTrack, screen: !!this.screenTrack };
  }

  /** Ekranda gösterilecek yerel görüntü: ekran paylaşılıyorsa o, değilse kamera. */
  get localVideoTrack() { return this.screenTrack ?? (this.camTrack?.enabled ? this.camTrack : null); }

  get peerViews(): PeerView[] {
    return [...this.peers.entries()].map(([userId, p]) => ({ userId, stream: p.stream, media: p.media, connection: p.pc.connectionState }));
  }

  private send(to: number, data: SignalData) {
    connectRealtime().emit('rtc:signal', { callId: this.callId, to, data });
  }

  private sendMedia() {
    if (!this.closed) connectRealtime().emit('call:media', { callId: this.callId, ...this.media });
  }

  private peer(userId: number, initiator: boolean): Peer {
    const existing = this.peers.get(userId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const p: Peer = {
      pc, polite: this.selfId < userId, makingOffer: false, ignoreOffer: false,
      audioTx: null, videoTx: null, stream: new MediaStream(), media: { mic: true, cam: true, screen: false },
    };
    this.peers.set(userId, p);

    if (initiator) {
      // Teklif eden taraf ses ve görüntü kanallarını her zaman açar; sonradan kamera açmak yeni bağlantı gerektirmesin.
      const mic = this.local.getAudioTracks()[0];
      const vid = this.localVideoTrack;
      p.audioTx = pc.addTransceiver(mic ?? 'audio', { direction: mic ? 'sendrecv' : 'recvonly', streams: [this.local] });
      p.videoTx = pc.addTransceiver(vid ?? 'video', { direction: vid ? 'sendrecv' : 'recvonly', streams: [this.local] });
    }

    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.send(userId, { description: pc.localDescription!.toJSON() });
      } catch (e) {
        console.warn('WebRTC teklif hatası', e);
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => this.send(userId, { candidate: candidate?.toJSON() ?? null });
    pc.ontrack = ({ track }) => {
      // Yeni nesne: video/audio öğeleri srcObject'i yeniden bağlasın.
      p.stream = new MediaStream([...p.stream.getTracks().filter((t) => t.kind !== track.kind), track]);
      track.onunmute = () => this.emit();
      track.onmute = () => this.emit();
      this.emit();
    };
    pc.onconnectionstatechange = () => {
      // Ağ değişince (Wi-Fi ↔ kablo) bağlantıyı yeniden kurmayı dene.
      if (pc.connectionState === 'failed') pc.restartIce();
      this.emit();
    };
    this.emit();
    return p;
  }

  private async onSignal(from: number, data: SignalData) {
    if (this.closed) return;
    const p = this.peer(from, false);
    const pc = p.pc;
    try {
      if (data.description) {
        const d = data.description;
        const collision = d.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription(d);
        if (d.type === 'offer') {
          if (!p.audioTx || !p.videoTx) this.attachToOffered(p);
          await pc.setLocalDescription();
          this.send(from, { description: pc.localDescription!.toJSON() });
        }
      } else if (data.candidate !== undefined) {
        try {
          await pc.addIceCandidate(data.candidate ?? undefined);
        } catch (e) {
          if (!p.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.warn('WebRTC sinyal hatası', e);
    }
  }

  /** Yanıtlayan taraf: teklifteki ses/görüntü kanallarına kendi akışını bağlar (yeni kanal açıp tekrar müzakereye gerek kalmaz). */
  private attachToOffered(p: Peer) {
    for (const t of p.pc.getTransceivers()) {
      const kind = t.receiver.track.kind;
      const track = kind === 'audio' ? this.local.getAudioTracks()[0] : this.localVideoTrack;
      if (kind === 'audio' && !p.audioTx) p.audioTx = t;
      else if (kind === 'video' && !p.videoTx) p.videoTx = t;
      else continue;
      if (track) { void t.sender.replaceTrack(track); t.sender.setStreams?.(this.local); }
      t.direction = track ? 'sendrecv' : 'recvonly';
    }
  }

  /** Tüm bağlantılarda görüntü kanalına verilen izi koyar (kamera, ekran veya hiçbiri). */
  private async setOutgoingVideo(track: MediaStreamTrack | null) {
    await Promise.all([...this.peers.values()].map(async (p) => {
      if (!p.videoTx) return;
      await p.videoTx.sender.replaceTrack(track);
      // Yön değişirse tarayıcı yeniden müzakere eder (onnegotiationneeded).
      if (track && p.videoTx.direction !== 'sendrecv') p.videoTx.direction = 'sendrecv';
    }));
  }

  toggleMic() {
    const t = this.local.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    this.sendMedia();
    this.emit();
  }

  async toggleCam() {
    if (this.camTrack) {
      this.camTrack.enabled = !this.camTrack.enabled;
      if (!this.screenTrack) await this.setOutgoingVideo(this.camTrack.enabled ? this.camTrack : null);
    } else {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      this.camTrack = s.getVideoTracks()[0];
      this.local.addTrack(this.camTrack);
      if (!this.screenTrack) await this.setOutgoingVideo(this.camTrack);
    }
    this.sendMedia();
    this.emit();
  }

  async toggleScreen() {
    if (this.screenTrack) { this.stopScreen(); return; }
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
    this.screenTrack = s.getVideoTracks()[0];
    this.screenTrack.onended = () => this.stopScreen(); // tarayıcının "Paylaşımı durdur" düğmesi
    await this.setOutgoingVideo(this.screenTrack);
    this.sendMedia();
    this.emit();
  }

  private stopScreen() {
    if (!this.screenTrack) return;
    this.screenTrack.onended = null;
    this.screenTrack.stop();
    this.screenTrack = null;
    void this.setOutgoingVideo(this.camTrack?.enabled ? this.camTrack : null);
    this.sendMedia();
    this.emit();
  }

  private dropPeer(userId: number) {
    const p = this.peers.get(userId);
    if (!p) return;
    p.pc.close();
    this.peers.delete(userId);
    this.emit();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const off of this.offs) off();
    for (const p of this.peers.values()) p.pc.close();
    this.peers.clear();
    for (const t of this.local.getTracks()) t.stop();
    this.camTrack?.stop();
    this.screenTrack?.stop();
    this.listeners.clear();
  }
}
