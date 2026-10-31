import { useEffect, useReducer, useRef, useState } from 'react';
import { Mic, MicOff, MonitorUp, NotebookPen, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useCalls } from '../../lib/calls';
import { initials } from '../../lib/format';
import { describeMediaError, mediaAvailable, type MediaFlags, type MeshSession } from '../../lib/rtc';
import { callTitle, type CallView } from '../../lib/types-call';
import type { UserRef } from '../../lib/types';
import { MeetingSidePanel } from './MeetingSidePanel';
import '../../styles/chat.css';

/** Gelen arama kartı, aktif arama odası ve kısa bilgi mesajı. Shell içinde bir kez çizilir. */
export function CallLayer() {
  const { incoming, active, notice } = useCalls();
  return (
    <>
      {incoming && <IncomingCall call={incoming} />}
      {active && <CallRoom key={active.call.id} />}
      {notice && <div className="call-notice" role="status">{notice}</div>}
    </>
  );
}

function IncomingCall({ call }: { call: CallView }) {
  const { me } = useAuth();
  const { accept, decline } = useCalls();
  const [error, setError] = useState('');
  const video = call.kind === 'video';
  const run = (fn: () => Promise<void>) => fn().catch((e) => setError(e instanceof Error ? e.message : 'Bağlanılamadı'));
  return (
    <div className="glass incoming-call" role="alertdialog" aria-label="Gelen arama">
      <span className="avatar lg ringing">{initials(call.startedBy.fullName)}</span>
      <div className="incoming-info">
        <b>{call.startedBy.fullName}</b>
        <small>{video ? 'Görüntülü' : 'Sesli'} arama{call.conversation?.type === 'group' && ` · ${callTitle(call, me!.id)}`}</small>
        {error && <small className="error">{error}</small>}
      </div>
      <div className="incoming-actions">
        <button className="round leave" title="Reddet" onClick={() => void decline()}><PhoneOff size={20} /></button>
        {video && <button className="round accept" title="Sesli cevapla" onClick={() => run(() => accept('audio'))}><Phone size={20} /></button>}
        <button className="round accept" title={video ? 'Görüntülü cevapla' : 'Cevapla'} onClick={() => run(() => accept())}>
          {video ? <Video size={20} /> : <Phone size={20} />}
        </button>
      </div>
    </div>
  );
}

function useSession(session: MeshSession) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => session.subscribe(tick), [session]);
}

function elapsed(from: string | null, now: number) {
  if (!from) return '';
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function CallRoom() {
  const { me } = useAuth();
  const { active, hangup } = useCalls();
  const { call, session, warning } = active!;
  useSession(session);
  const [warn, setWarn] = useState(warning);
  const [side, setSide] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const media = session.media;
  const peers = session.peerViews;
  const people = new Map<number, UserRef>(call.participants.map((p) => [p.id, p]));
  const ringing = call.participants.filter((p) => p.state === 'ringing' && p.id !== me!.id);
  const canAssignTasks = ['all', 'department'].includes(me!.permissions['task.write'] ?? '');
  const hasMic = session.local.getAudioTracks().length > 0;

  const toggle = async (fn: () => unknown) => {
    try { await fn(); setWarn(''); } catch (e) { setWarn(describeMediaError(e)); }
  };

  const status = call.status === 'ringing'
    ? (call.startedById === me!.id ? 'Çalıyor…' : 'Bağlanıyor…')
    : `${peers.length + 1} katılımcı · ${elapsed(call.answeredAt ?? call.createdAt, now)}`;
  const tiles = peers.length + 1;

  return (
    <div className="meeting-room" role="dialog" aria-label={callTitle(call, me!.id)}>
      <header className="meeting-room-head">
        <b>{callTitle(call, me!.id)}</b>
        <small>{status}</small>
        {ringing.length > 0 && call.status !== 'ringing' && <small>· Çalıyor: {ringing.map((p) => p.fullName.split(' ')[0]).join(', ')}</small>}
      </header>
      {warn && <p className="meeting-warn">{warn}</p>}
      <div className="meeting-body">
        <div className={'meeting-grid n' + Math.min(tiles, 9)}>
          <LocalTile session={session} name={me!.fullName} media={media} />
          {peers.map((p) => (
            <PeerTile key={p.userId} stream={p.stream} media={p.media} name={people.get(p.userId)?.fullName ?? `#${p.userId}`}
              connecting={p.connection !== 'connected'} />
          ))}
        </div>
        {side && call.meetingId && (
          <aside className="meeting-room-side"><MeetingSidePanel meetingId={call.meetingId} canAssignTasks={canAssignTasks} dark /></aside>
        )}
      </div>
      <footer className="meeting-controls">
        <button className={'round' + (media.mic ? '' : ' off')} title={media.mic ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
          disabled={!hasMic} onClick={() => session.toggleMic()}>
          {media.mic ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button className={'round' + (media.cam ? '' : ' off')} title={media.cam ? 'Kamerayı kapat' : 'Kamerayı aç'}
          disabled={!mediaAvailable()} onClick={() => toggle(() => session.toggleCam())}>
          {media.cam ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
        <button className={'round' + (media.screen ? ' on' : '')} title={media.screen ? 'Paylaşımı durdur' : 'Ekran paylaş'}
          disabled={!navigator.mediaDevices?.getDisplayMedia} onClick={() => toggle(() => session.toggleScreen())}>
          <MonitorUp size={20} />
        </button>
        {call.meetingId && (
          <button className={'round' + (side ? ' on' : '')} title={canAssignTasks ? 'Notlarım ve görevler' : 'Notlarım'} aria-pressed={side}
            onClick={() => setSide((v) => !v)}>
            <NotebookPen size={20} />
          </button>
        )}
        <button className="round leave" title="Aramayı bitir" onClick={() => void hangup()}><PhoneOff size={20} /></button>
      </footer>
    </div>
  );
}

function LocalTile({ session, name, media }: { session: MeshSession; name: string; media: MediaFlags }) {
  const video = useRef<HTMLVideoElement>(null);
  const track = session.localVideoTrack;
  useEffect(() => {
    if (!video.current) return;
    video.current.srcObject = track ? new MediaStream([track]) : null;
  }, [track]);
  return (
    <div className={'tile' + (media.screen ? ' screen' : '')}>
      {track ? <video ref={video} autoPlay playsInline muted className={media.screen ? '' : 'mirror'} /> : <div className="tile-avatar">{initials(name)}</div>}
      <span className="tile-name">{name} (siz){media.screen && ' · ekran'}{!media.mic && <MicOff size={12} />}</span>
    </div>
  );
}

function PeerTile({ stream, media, name, connecting }: { stream: MediaStream; media: MediaFlags; name: string; connecting: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const vt = stream.getVideoTracks()[0];
  const showVideo = !!vt && !vt.muted && (media.cam || media.screen);
  useEffect(() => { if (video.current) video.current.srcObject = stream; }, [stream, showVideo]);
  // Ses ayrı öğeden çalınır: görüntü kapalıyken de duyulsun.
  useEffect(() => { if (audio.current) audio.current.srcObject = stream; }, [stream]);
  return (
    <div className={'tile' + (media.screen ? ' screen' : '')}>
      {showVideo ? <video ref={video} autoPlay playsInline muted /> : <div className="tile-avatar">{initials(name)}</div>}
      <audio ref={audio} autoPlay />
      <span className="tile-name">
        {name}{media.screen && ' · ekran'}{connecting && ' · bağlanıyor…'}
        {!media.mic && <MicOff size={12} />}
      </span>
    </div>
  );
}
