/**
 * Media URL helpers for the Motivation Hub.
 *
 * Facebook note: `facebook.com/share/r/<code>` links are short redirect links.
 * Facebook's embed plugin needs the canonical reel/video URL
 * (`facebook.com/reel/<id>` or `/<page>/videos/<id>`). We try the plugin with
 * whatever URL we have and ALWAYS show an "Open on Facebook" fallback, because
 * Facebook blocks some reels from embedding.
 */
import type { MediaType } from '../domain/types';

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{6,})/);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export function youtubeEmbedUrl(url: string, autoplay = false): string | null {
  const id = youtubeId(url);
  if (!id) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1${autoplay ? '&autoplay=1' : ''}`;
}

export function isFacebookUrl(url: string): boolean {
  try {
    const h = new URL(url.trim()).hostname;
    return /(^|\.)facebook\.com$|(^|\.)fb\.watch$/.test(h);
  } catch {
    return false;
  }
}

export function isFacebookShareLink(url: string): boolean {
  return /facebook\.com\/share\/(r|v)\//.test(url);
}

export function facebookEmbedUrl(url: string): string {
  const href = encodeURIComponent(url.trim());
  return `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=320&height=568&t=0`;
}

export function detectMediaType(url: string): MediaType {
  if (youtubeId(url)) return 'youtube';
  if (isFacebookUrl(url)) return 'facebook';
  return 'link';
}
