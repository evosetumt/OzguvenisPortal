import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, getToken } from './api';
import { json } from './data';
import { useAuth } from './auth';
import { useSocketEvent } from './realtime';
import { getLocalMedia, MeshSession } from './rtc';
import { callTitle, type CallKind, type CallView, type JoinResult } from './types-call';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

interface ActiveCall { call: CallView; session: MeshSession; warning: string }

interface CallsState {
  incoming: CallView | null;
  active: ActiveCall | null;
  /** Arama bitince kısa süre gösterilen bilgi ("Arama reddedildi" vb.). */
  notice: string;
  startCall(conversationId: number, kind: CallKind): Promise<void>;
  joinMeeting(meetingId: number): Promise<void>;
  accept(kind?: CallKind): Promise<void>;
  decline(): Promise<void>;
  hangup(): Promise<void>;
}

const Ctx = createContext<CallsState>(null!);
export const useCalls = () => useContext(Ctx);

const END_TEXT: Record<string, string> = {
  declined: 'Arama reddedildi',
  missed: 'Cevap verilmedi',
  cancelled: 'Arama iptal edildi',
  ended: 'Arama sona erdi',
};

/** Zil sesi (dosya gerektirmez): gelen aramada çift ton, giden aramada bekleme sesi. */
function useTone(kind: 'incoming' | 'outgoing' | null) {
  useEffect(() => {
    if (!kind) return;
    let ctx: AudioContext | null = null;
    try { ctx = new AudioContext(); } catch { return; }
    const beep = (freq: number, at: number, len: number) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx!.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.15, ctx!.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx!.currentTime + at + len);
      o.connect(g).connect(ctx!.destination);
      o.start(ctx!.currentTime + at);
      o.stop(ctx!.currentTime + at + len + 0.05);
    };
    const ring = () => {
      if (kind === 'incoming') { beep(880, 0, 0.35); beep(660, 0.45, 0.35); } else beep(440, 0, 1);
    };
    ring();
    const t = setInterval(ring, kind === 'incoming' ? 2000 : 3000);
    return () => { clearInterval(t); void ctx?.close(); };
  }, [kind]);
}

/**
 * Arama yöneticisi (oturum boyunca Shell içinde): gelen arama zili, aktif arama (tek seferde bir),
 * sohbetten arama başlatma ve toplantıya katılma. Ekranları CallLayer çizer.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const meId = me!.id;
  const [incoming, setIncoming] = useState<CallView | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [notice, setNotice] = useState('');
  const activeRef = useRef<ActiveCall | null>(null);
  activeRef.current = active;

  const flash = (text: string) => { setNotice(text); setTimeout(() => setNotice(''), 4000); };

  const end = useCallback((text?: string) => {
    activeRef.current?.session.close();
    setActive(null);
    if (text) flash(text);
  }, []);

  const begin = (r: JoinResult, stream: MediaStream, warning: string) => {
    const session = new MeshSession(r.call.id, meId, r.iceServers, stream);
    session.connectTo(r.peers);
    setActive({ call: r.call, session, warning });
  };

  /** Medyayı önce al, sonra katıl: içeridekilere giden teklif ses/görüntüyü baştan içersin. */
  const withMedia = async (video: boolean, join: () => Promise<JoinResult>) => {
    if (activeRef.current) throw new Error('Zaten bir aramadasınız');
    const { stream, warning } = await getLocalMedia(video);
    try {
      begin(await join(), stream, warning);
    } catch (e) {
      for (const t of stream.getTracks()) t.stop();
      throw e;
    }
  };

  const startCall = (conversationId: number, kind: CallKind) =>
    withMedia(kind === 'video', () => api<JoinResult>('/calls', json('POST', { conversationId, kind })));

  const joinMeeting = (meetingId: number) =>
    withMedia(true, () => api<JoinResult>(`/meetings/${meetingId}/join`, json('POST')));

  const accept = async (kind?: CallKind) => {
    const c = incoming;
    if (!c) return;
    setIncoming(null);
    if (activeRef.current) await hangup();
    await withMedia((kind ?? c.kind) === 'video', () => api<JoinResult>(`/calls/${c.id}/join`, json('POST')));
  };

  const decline = async () => {
    const c = incoming;
    setIncoming(null);
    if (c) await api(`/calls/${c.id}/decline`, json('POST')).catch(() => undefined);
  };

  const hangup = async () => {
    const a = activeRef.current;
    if (!a) return;
    end();
    await api(`/calls/${a.call.id}/leave`, json('POST')).catch(() => undefined);
  };

  // Sayfa kapanırken aramadan çık (keepalive: sayfa gitse de istek tamamlanır).
  useEffect(() => {
    const onUnload = () => {
      const a = activeRef.current;
      if (!a) return;
      void fetch(`${BASE}/api/calls/${a.call.id}/leave`, { method: 'POST', keepalive: true, headers: { Authorization: `Bearer ${getToken()}` } });
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  // Açılışta: çalmakta olan arama varsa zil ekranı geri gelsin; yenilemeden önce bağlı kalınan arama kapatılır.
  useEffect(() => {
    api<CallView[]>('/calls/mine').then((rows) => {
      for (const c of rows) {
        const mine = c.participants.find((p) => p.id === meId);
        if (mine?.state === 'ringing') setIncoming(c);
        else if (mine?.state === 'joined') void api(`/calls/${c.id}/leave`, json('POST')).catch(() => undefined);
      }
    }).catch(() => undefined);
  }, [meId]);

  useSocketEvent<CallView>('call:incoming', (c) => {
    setIncoming(c);
    // Sekme arka plandaysa masaüstü bildirimi (izin verilmişse).
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(`${c.startedBy.fullName} ${c.kind === 'video' ? 'görüntülü' : 'sesli'} arıyor`, { body: callTitle(c, meId), tag: `call-${c.id}` }); } catch { /* yoksay */ }
    }
  });
  useSocketEvent<CallView>('call:updated', (c) => {
    // Başka cihazdan cevaplandı/reddedildi: bu cihazda zil susar.
    if (incoming?.id === c.id && c.participants.find((p) => p.id === meId)?.state !== 'ringing') setIncoming(null);
    if (activeRef.current?.call.id === c.id) setActive((a) => (a ? { ...a, call: c } : a));
  });
  useSocketEvent<{ callId: number; status: string }>('call:ended', (e) => {
    if (incoming?.id === e.callId) setIncoming(null);
    if (activeRef.current?.call.id === e.callId) end(END_TEXT[e.status] ?? END_TEXT.ended);
  });

  const ringingOut = !!active && active.call.status === 'ringing' && active.call.startedById === meId;
  useTone(incoming ? 'incoming' : ringingOut ? 'outgoing' : null);

  return (
    <Ctx.Provider value={{ incoming, active, notice, startCall, joinMeeting, accept, decline, hangup }}>
      {children}
    </Ctx.Provider>
  );
}
