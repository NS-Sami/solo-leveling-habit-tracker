/**
 * Sound effects + the "System Anthem", synthesized live with the Web Audio API.
 * No audio files → zero download size, works offline, and no copyright issues.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.5;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, out: master! };
  } catch {
    return null;
  }
}

export function configureSfx(on: boolean, vol: number) {
  enabled = on;
  volume = vol;
  if (master) master.gain.value = vol;
}

interface ToneOpts {
  freq: number;
  at?: number; // seconds from now
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
}

function tone({ freq, at = 0, dur = 0.12, type = 'sine', gain = 0.25, slideTo }: ToneOpts, force = false) {
  if (!enabled && !force) return;
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + at;
  const osc = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  /** Crisp two-step "confirm" chirp. */
  check() {
    tone({ freq: 880, dur: 0.07, type: 'square', gain: 0.08 });
    tone({ freq: 1320, at: 0.06, dur: 0.12, type: 'sine', gain: 0.18 });
  },
  uncheck() {
    tone({ freq: 520, dur: 0.12, type: 'triangle', gain: 0.12, slideTo: 260 });
  },
  click() {
    tone({ freq: 1600, dur: 0.03, type: 'square', gain: 0.04 });
  },
  /** Rising arpeggio fanfare. */
  levelUp() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => tone({ freq: f, at: i * 0.09, dur: 0.35, type: 'sawtooth', gain: 0.07 }));
    notes.forEach((f, i) => tone({ freq: f * 2, at: i * 0.09 + 0.02, dur: 0.3, type: 'sine', gain: 0.08 }));
    tone({ freq: 1046.5, at: 0.5, dur: 1.1, type: 'triangle', gain: 0.18 });
  },
  /** Warm chord for a 100% day. */
  dayComplete() {
    [392, 493.88, 587.33, 783.99].forEach((f, i) => tone({ freq: f, at: i * 0.05, dur: 0.9, type: 'triangle', gain: 0.1 }));
  },
  alert() {
    [0, 0.25].forEach((at) => tone({ freq: 440, at, dur: 0.18, type: 'square', gain: 0.08, slideTo: 330 }));
  },
};

/* ------------------------------------------------------------------ */
/* System Anthem — a generative dark-synth loop (A minor, ~84 BPM).     */
/* ------------------------------------------------------------------ */

const PROGRESSION = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 246.94, 293.66], // G
  [164.81, 207.65, 246.94], // E (harmonic minor)
];
const ARP = [0, 1, 2, 1, 2, 3, 2, 1];

class Anthem {
  private timer: number | null = null;
  private step = 0;
  private bus: GainNode | null = null;
  playing = false;

  start() {
    const a = audio();
    if (!a || this.playing) return;
    this.bus = a.ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(a.out);
    this.playing = true;
    this.step = 0;
    const beat = 60 / 84 / 2; // eighth notes
    const tick = () => {
      if (!this.playing || !this.bus) return;
      const chord = PROGRESSION[Math.floor(this.step / 8) % PROGRESSION.length];
      const t = a.ctx.currentTime;
      if (this.step % 8 === 0) {
        chord.forEach((f) => this.voice(a.ctx, f / 2, t, beat * 8, 'sawtooth', 0.035));
        this.voice(a.ctx, chord[0] / 4, t, beat * 8, 'sine', 0.12);
      }
      const n = ARP[this.step % ARP.length];
      const f = n === 3 ? chord[0] * 2 : chord[n] * 2;
      this.voice(a.ctx, f, t, beat * 0.9, 'triangle', 0.06);
      if (this.step % 4 === 0) this.voice(a.ctx, 55, t, 0.25, 'sine', 0.25, 38); // kick-ish pulse
      this.step++;
    };
    tick();
    this.timer = window.setInterval(tick, beat * 1000);
  }

  private voice(c: AudioContext, freq: number, t0: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
    if (!this.bus) return;
    const o = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.08, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(lp).connect(g).connect(this.bus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  stop() {
    this.playing = false;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    if (this.bus && ctx) {
      const b = this.bus;
      b.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      setTimeout(() => b.disconnect(), 500);
    }
    this.bus = null;
  }
}

export const anthem = new Anthem();
