/**
 * Motivation Hub: quote + embedded media player (YouTube / Shorts, Facebook Reels,
 * uploaded MP4/WebM) + theater mode + "System Anthem" toggle.
 *
 * Players are click-to-load: no third-party iframe (and its trackers) loads until
 * the hunter actually presses play. Faster first paint, better privacy.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Maximize2, Music2, Pause, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSystem } from '../../state/SystemProvider';
import { useUI } from '../../state/ui';
import { db } from '../../data/db';
import { updateSettings } from '../../data/actions';
import { facebookEmbedUrl, isFacebookShareLink, youtubeEmbedUrl, youtubeId } from '../../lib/media';
import { anthem } from '../../lib/sfx';
import type { MediaItem } from '../../domain/types';
import { Panel } from '../ui/primitives';

function useBlobUrl(key?: string | null) {
  const rec = useLiveQuery(() => (key ? db.blobs.get(key) : undefined), [key]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!rec) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(rec.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [rec]);
  return url;
}

export function MediaPlayer({ item, large = false, autoLoad = false }: { item: MediaItem; large?: boolean; autoLoad?: boolean }) {
  const [loaded, setLoaded] = useState(autoLoad);
  const fileUrl = useBlobUrl(item.type === 'file' ? item.blobKey : null);
  useEffect(() => setLoaded(autoLoad), [item.id, autoLoad]);

  const vertical = item.type === 'facebook' || (item.url ?? '').includes('/shorts/');
  const frame = vertical
    ? large
      ? 'mx-auto aspect-[9/16] h-[78dvh] max-w-full'
      : 'mx-auto aspect-[9/16] w-full max-w-[260px]'
    : 'aspect-video w-full';

  const ytThumb = item.type === 'youtube' && item.url ? `https://i.ytimg.com/vi/${youtubeId(item.url)}/hqdefault.jpg` : null;

  if (!loaded && item.type !== 'file') {
    return (
      <button
        onClick={() => setLoaded(true)}
        className={`${frame} group relative flex items-center justify-center overflow-hidden rounded-lg border border-cyan-400/25 bg-gradient-to-br from-void-700 via-void-900 to-black`}
        aria-label={`Play ${item.title}`}
      >
        {ytThumb && <img src={ytThumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 transition group-hover:opacity-70" />}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(92,180,255,0.18),transparent_60%)]" />
        <div className="relative flex flex-col items-center gap-2">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-cyan-300 bg-black/50 shadow-glow-lg transition group-hover:scale-110">
            <Play className="ml-1 text-cyan-200" size={28} />
          </span>
          <span className="max-w-[90%] font-display text-xs font-bold uppercase tracking-widest text-cyan-100">{item.title}</span>
          <span className="font-mono text-[10px] uppercase text-slate-400">{item.type === 'facebook' ? 'Facebook Reel' : item.type === 'youtube' ? 'YouTube' : 'Link'}</span>
        </div>
      </button>
    );
  }

  if (item.type === 'youtube' && item.url) {
    const src = youtubeEmbedUrl(item.url, true);
    return src ? (
      <iframe
        className={`${frame} rounded-lg border border-cyan-400/25 bg-black`}
        src={src}
        title={item.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    ) : (
      <Fallback item={item} />
    );
  }

  if (item.type === 'facebook' && item.url) {
    return (
      <div className="space-y-2">
        <iframe
          className={`${frame} rounded-lg border border-cyan-400/25 bg-black`}
          src={facebookEmbedUrl(item.url)}
          title={item.title}
          scrolling="no"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
        />
        <Fallback item={item} hint={isFacebookShareLink(item.url) ? 'If the reel shows blank, Facebook blocked embedding for this share link.' : undefined} />
      </div>
    );
  }

  if (item.type === 'file') {
    return fileUrl ? (
      <video className={`${frame} rounded-lg border border-cyan-400/25 bg-black`} src={fileUrl} controls playsInline preload="metadata" />
    ) : (
      <div className={`${frame} flex items-center justify-center rounded-lg border border-dashed border-cyan-400/25 font-mono text-xs text-slate-400`}>
        Video file not found on this device.
      </div>
    );
  }

  return <Fallback item={item} />;
}

function Fallback({ item, hint }: { item: MediaItem; hint?: string }) {
  if (!item.url) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-center">
      <a className="btn-ghost text-cyan-200" href={item.url} target="_blank" rel="noreferrer noopener">
        <ExternalLink size={14} /> Open {item.type === 'facebook' ? 'on Facebook' : 'original'}
      </a>
      {hint && <span className="w-full font-mono text-[10px] text-slate-500">{hint}</span>}
    </div>
  );
}

export function AnthemToggle() {
  const { settings } = useSystem();
  const [playing, setPlaying] = useState(false);
  const customUrl = useBlobUrl(settings.anthemBlobKey);
  const [audioEl] = useState(() => (typeof Audio !== 'undefined' ? new Audio() : null));

  useEffect(() => () => {
    anthem.stop();
    audioEl?.pause();
  }, [audioEl]);

  const toggle = () => {
    if (playing) {
      anthem.stop();
      audioEl?.pause();
      setPlaying(false);
      return;
    }
    if (customUrl && audioEl) {
      audioEl.src = customUrl;
      audioEl.loop = true;
      audioEl.volume = settings.volume;
      void audioEl.play();
    } else {
      anthem.start();
    }
    setPlaying(true);
  };

  return (
    <button className={`btn ${playing ? 'border-violet-400/60 bg-violet-500/20 text-violet-100' : ''}`} onClick={toggle} aria-pressed={playing}>
      {playing ? <Pause size={14} /> : <Music2 size={14} />}
      {playing ? 'Stop Anthem' : 'Play Anthem'}
      {playing && (
        <span className="flex h-3 items-end gap-[2px]" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <motion.span key={i} className="w-[3px] rounded-sm bg-violet-300" animate={{ height: ['30%', '100%', '45%', '80%', '30%'] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12 }} />
          ))}
        </span>
      )}
    </button>
  );
}

export function MotivationHub() {
  const { settings } = useSystem();
  const setTheater = useUI((s) => s.setTheater);
  const items = settings.media;
  const active = items.find((m) => m.id === settings.activeMediaId) ?? items[0];

  return (
    <Panel title="Motivation Hub" icon={<Play size={14} />} action={active && <button className="btn-ghost text-[11px]" onClick={() => setTheater(true)}><Maximize2 size={14} /> Theater</button>}>
      <blockquote className="mb-4 border-l-2 border-cyan-300/60 pl-3">
        <p className="font-mono text-sm leading-relaxed text-cyan-100 text-glow">“{settings.quote}”</p>
      </blockquote>

      {active ? <MediaPlayer item={active} /> : <p className="font-mono text-xs text-slate-400">Add a YouTube, Facebook or video file in Settings → Motivation Media.</p>}

      {items.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {items.map((m) => (
            <button
              key={m.id}
              onClick={() => updateSettings({ activeMediaId: m.id })}
              className={`chip max-w-[160px] truncate ${m.id === active?.id ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-slate-400 hover:text-slate-200'}`}
            >
              {m.title}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <AnthemToggle />
      </div>
    </Panel>
  );
}

export function TheaterModal() {
  const { settings } = useSystem();
  const open = useUI((s) => s.theater);
  const setTheater = useUI((s) => s.setTheater);
  const active = settings.media.find((m) => m.id === settings.activeMediaId) ?? settings.media[0];
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setTheater(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, setTheater]);
  return (
    <AnimatePresence>
      {open && active && (
        <motion.div className="fixed inset-0 z-[65] flex flex-col items-center justify-center bg-black/95 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button className="btn-ghost absolute right-3 top-3 text-slate-200" onClick={() => setTheater(false)} aria-label="Close theater mode">
            <X size={20} />
          </button>
          <div className="w-full max-w-5xl">
            <MediaPlayer item={active} large autoLoad />
          </div>
          <p className="mt-4 max-w-2xl text-center font-mono text-sm text-cyan-100 text-glow">“{settings.quote}”</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
