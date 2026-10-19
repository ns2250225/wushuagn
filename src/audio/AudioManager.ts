// 程序化音频：所有音效与音乐均由 Web Audio API 实时合成，无需外部资源

export type SfxName =
  | 'swing'
  | 'swingHeavy'
  | 'thrust'
  | 'hit'
  | 'hitHeavy'
  | 'block'
  | 'kill'
  | 'quake'
  | 'explosion'
  | 'charge'
  | 'musou'
  | 'musouFinish'
  | 'dodge'
  | 'arrow'
  | 'hurt'
  | 'pickup'
  | 'ui'
  | 'uiConfirm'
  | 'horn'
  | 'drum'
  | 'thunder'
  | 'fire'
  | 'wind'
  | 'break'
  | 'levelup'
  | 'roar'
  | 'warning';

export type MusicName = 'menu' | 'battle' | 'boss' | 'victory' | 'defeat' | 'none';

const PENTA = [0, 2, 4, 7, 9]; // 宫商角徵羽
const PENTA_MINOR = [0, 3, 5, 7, 10];

interface Track {
  bpm: number;
  root: number; // MIDI
  scale: number[];
  melody: number[]; // 音阶度数，-99 为休止
  bass: number[];
  drums: string; // x 大鼓, o 小鼓, - 空
  lead: OscillatorType;
  loop: boolean;
  gain: number;
}

const TRACKS: Record<Exclude<MusicName, 'none'>, Track> = {
  menu: {
    bpm: 76, root: 62, scale: PENTA, lead: 'triangle', loop: true, gain: 0.5,
    melody: [4, -99, 3, 2, 1, -99, 2, -99, 0, -99, 1, 2, 4, -99, -99, -99, 5, -99, 4, 3, 2, -99, 3, -99, 1, -99, 0, 1, 0, -99, -99, -99],
    bass: [0, 0, 0, 0, -2, -2, -2, -2, -3, -3, -3, -3, -1, -1, 0, 0],
    drums: 'x-------x---o---x-------x-o-o---',
  },
  battle: {
    bpm: 132, root: 57, scale: PENTA_MINOR, lead: 'sawtooth', loop: true, gain: 0.42,
    melody: [0, 2, 3, 4, 3, 2, 0, -99, 4, 5, 4, 3, 2, -99, 3, -99, 0, 2, 3, 4, 7, 6, 5, 4, 3, 2, 3, 4, 0, -99, -99, -99],
    bass: [0, 0, 0, 0, 3, 3, 2, 2, 0, 0, 0, 0, 4, 4, 3, 2],
    drums: 'x-x-o-x-x-x-o-xox-x-o-x-xxx-o-oo',
  },
  boss: {
    bpm: 148, root: 52, scale: PENTA_MINOR, lead: 'square', loop: true, gain: 0.4,
    melody: [0, 0, 3, 0, 4, 0, 3, 2, 0, 0, 5, 4, 3, 2, 1, -99, 0, 0, 3, 0, 4, 0, 6, 5, 7, 6, 5, 4, 3, 2, 1, 0],
    bass: [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 2, 2, 1, 1],
    drums: 'x-xox-xox-xoxxoxx-xox-xox-xoxooo',
  },
  victory: {
    bpm: 112, root: 62, scale: PENTA, lead: 'triangle', loop: false, gain: 0.55,
    melody: [0, 2, 4, 5, 7, -99, 5, 7, 9, -99, -99, -99, 7, 9, 10, -99, -99, -99, -99, -99],
    bass: [0, 0, 3, 3, 4, 4, 0, 0, 0, 0],
    drums: 'x---x---x-x-x-xxx-------',
  },
  defeat: {
    bpm: 66, root: 57, scale: PENTA_MINOR, lead: 'triangle', loop: false, gain: 0.5,
    melody: [4, -99, 3, -99, 2, -99, 1, -99, 0, -99, -99, -99, -99, -99, -99, -99],
    bass: [0, 0, -1, -1, -2, -2, -5, -5],
    drums: 'x-------x-------',
  },
};

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

class AudioManagerImpl {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxGain!: GainNode;
  musicGain!: GainNode;
  noiseBuf!: AudioBuffer;
  private musicVol = 0.6;
  private sfxVol = 0.8;
  private muted = false;
  private current: MusicName = 'none';
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private ambient: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private lastPlay: Record<string, number> = {};
  private voices = 0;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxGain = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.current !== 'none') {
      const m = this.current;
      this.current = 'none';
      this.playMusic(m);
    }
  }

  setVolumes(music: number, sfx: number, muted: boolean): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.musicVol * 0.35, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.sfxVol * 0.7, t, 0.05);
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => {});
  }
  resume(): void {
    this.ctx?.resume().catch(() => {});
  }

  private noise(dur: number, filterType: BiquadFilterType, freq: number, q: number, vol: number, when = 0, freqEnd?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t, Math.random() * 1.5, dur + 0.05);
    this.track(src);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, when = 0, out?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out ?? this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
    this.track(o);
  }

  private track(n: AudioScheduledSourceNode): void {
    this.voices++;
    n.onended = () => {
      this.voices--;
    };
  }

  play(name: SfxName, vol = 1): void {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    // 同名音效节流，防止大量命中时爆音
    const minGap = name === 'hit' || name === 'kill' ? 35 : 20;
    if (now - (this.lastPlay[name] ?? 0) < minGap) return;
    if (this.voices > 48 && name !== 'musou' && name !== 'musouFinish') return;
    this.lastPlay[name] = now;
    const v = vol;
    switch (name) {
      case 'swing':
        this.noise(0.16, 'bandpass', 900, 1.2, 0.35 * v, 0, 3200);
        break;
      case 'swingHeavy':
        this.noise(0.3, 'bandpass', 400, 1, 0.5 * v, 0, 1800);
        this.tone('sine', 140, 60, 0.25, 0.2 * v);
        break;
      case 'thrust':
        this.noise(0.12, 'highpass', 1800, 1, 0.3 * v, 0, 5000);
        this.tone('triangle', 900, 300, 0.08, 0.08 * v);
        break;
      case 'hit':
        this.noise(0.09, 'lowpass', 2200, 1, 0.45 * v);
        this.tone('square', 220, 80, 0.08, 0.12 * v);
        break;
      case 'hitHeavy':
        this.noise(0.18, 'lowpass', 1400, 1, 0.6 * v);
        this.tone('sine', 120, 40, 0.22, 0.45 * v);
        break;
      case 'block':
        this.tone('square', 1800, 1200, 0.07, 0.12 * v);
        this.tone('triangle', 2600, 2000, 0.12, 0.1 * v);
        break;
      case 'kill':
        this.noise(0.14, 'bandpass', 600, 2, 0.25 * v, 0, 200);
        this.tone('sawtooth', 300, 120, 0.12, 0.05 * v);
        break;
      case 'quake':
        this.tone('sine', 80, 30, 0.6, 0.7 * v);
        this.noise(0.5, 'lowpass', 500, 1, 0.6 * v, 0, 80);
        break;
      case 'explosion':
        this.tone('sine', 110, 25, 0.9, 0.8 * v);
        this.noise(0.9, 'lowpass', 2400, 0.8, 0.8 * v, 0, 100);
        break;
      case 'charge':
        this.tone('sawtooth', 120, 600, 0.6, 0.12 * v);
        this.tone('sine', 240, 1200, 0.6, 0.12 * v);
        break;
      case 'musou':
        this.tone('sawtooth', 110, 880, 0.9, 0.18 * v);
        this.tone('square', 55, 220, 0.9, 0.1 * v);
        this.noise(1.0, 'bandpass', 300, 2, 0.4 * v, 0, 4000);
        this.tone('sine', 880, 1760, 0.4, 0.1 * v, 0.5);
        break;
      case 'musouFinish':
        this.tone('sine', 90, 20, 1.4, 0.9 * v);
        this.noise(1.4, 'lowpass', 4000, 0.7, 0.9 * v, 0, 60);
        this.tone('sawtooth', 440, 55, 1.0, 0.15 * v);
        break;
      case 'dodge':
        this.noise(0.2, 'bandpass', 600, 0.8, 0.25 * v, 0, 1500);
        break;
      case 'arrow':
        this.noise(0.15, 'highpass', 3000, 2, 0.12 * v, 0, 6000);
        break;
      case 'hurt':
        this.tone('square', 300, 120, 0.15, 0.15 * v);
        this.noise(0.12, 'lowpass', 1200, 1, 0.3 * v);
        break;
      case 'pickup':
        this.tone('triangle', 880, 880, 0.08, 0.15 * v);
        this.tone('triangle', 1320, 1320, 0.12, 0.15 * v, 0.07);
        break;
      case 'ui':
        this.tone('triangle', 660, 660, 0.05, 0.12 * v);
        break;
      case 'uiConfirm':
        this.tone('triangle', 660, 660, 0.06, 0.14 * v);
        this.tone('triangle', 990, 990, 0.1, 0.14 * v, 0.06);
        break;
      case 'horn': {
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(110, t);
        o.frequency.linearRampToValueAtTime(146.8, t + 0.4);
        o.frequency.setValueAtTime(146.8, t + 1.6);
        o.frequency.linearRampToValueAtTime(130, t + 2.0);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.35 * v, t + 0.3);
        g.gain.setValueAtTime(0.35 * v, t + 1.6);
        g.gain.linearRampToValueAtTime(0.0001, t + 2.1);
        o.connect(f).connect(g).connect(this.sfxGain);
        o.start(t);
        o.stop(t + 2.2);
        this.track(o);
        break;
      }
      case 'drum':
        this.tone('sine', 90, 45, 0.35, 0.6 * v);
        this.noise(0.08, 'lowpass', 800, 1, 0.3 * v);
        break;
      case 'thunder':
        this.noise(0.5, 'lowpass', 5000, 0.5, 0.6 * v, 0, 200);
        this.tone('square', 60, 30, 0.4, 0.2 * v);
        break;
      case 'fire':
        this.noise(0.6, 'bandpass', 700, 0.6, 0.35 * v, 0, 300);
        break;
      case 'wind':
        this.noise(0.8, 'bandpass', 500, 3, 0.35 * v, 0, 1600);
        break;
      case 'break':
        this.noise(0.4, 'lowpass', 1800, 1, 0.7 * v, 0, 150);
        this.tone('square', 160, 50, 0.3, 0.2 * v);
        this.noise(0.25, 'bandpass', 2500, 3, 0.3 * v, 0.08);
        break;
      case 'levelup':
        [0, 4, 7, 12].forEach((s, i) => this.tone('triangle', mtof(72 + s), mtof(72 + s), 0.18, 0.15 * v, i * 0.08));
        break;
      case 'roar':
        this.tone('sawtooth', 160, 70, 0.8, 0.25 * v);
        this.noise(0.8, 'bandpass', 400, 1.5, 0.4 * v, 0, 200);
        break;
      case 'warning':
        this.tone('square', 520, 520, 0.12, 0.1 * v);
        this.tone('square', 390, 390, 0.12, 0.1 * v, 0.14);
        break;
    }
  }

  // ---------- 音乐 ----------
  playMusic(name: MusicName): void {
    if (this.current === name) return;
    this.current = name;
    this.step = 0;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.ctx || name === 'none') return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || this.current === 'none') return;
    const tr = TRACKS[this.current];
    const stepDur = 60 / tr.bpm / 2; // 八分音符
    while (this.nextTime < ctx.currentTime + 0.2) {
      const total = tr.melody.length;
      if (!tr.loop && this.step >= total) {
        this.playMusic('none');
        return;
      }
      const i = this.step % total;
      const deg = tr.melody[i];
      if (deg !== -99) this.musicNote(tr, deg, this.nextTime, stepDur * 1.6, tr.lead, 0.22 * tr.gain, 12);
      if (i % 2 === 0) {
        const b = tr.bass[(i / 2) % tr.bass.length];
        this.musicNote(tr, b, this.nextTime, stepDur * 1.9, 'triangle', 0.32 * tr.gain, -12);
      }
      const dc = tr.drums[i % tr.drums.length];
      if (dc === 'x') this.drumHit(this.nextTime, 70, 0.55 * tr.gain);
      else if (dc === 'o') this.drumHit(this.nextTime, 160, 0.3 * tr.gain, true);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private musicNote(tr: Track, deg: number, t: number, dur: number, type: OscillatorType, vol: number, octave: number): void {
    const ctx = this.ctx!;
    const n = tr.scale.length;
    const oct = Math.floor(deg / n);
    const idx = ((deg % n) + n) % n;
    const midi = tr.root + octave + oct * 12 + tr.scale[idx];
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(mtof(midi), t);
    // 揉弦颤音，模拟二胡质感
    if (octave > 0) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = mtof(midi) * 0.012;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = octave > 0 ? 2200 : 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private drumHit(t: number, freq: number, vol: number, snare = false): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (snare ? 0.12 : 0.3));
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.35);
    if (snare) {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1500;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(vol * 0.6, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      s.connect(f).connect(g2).connect(this.musicGain);
      s.start(t, Math.random(), 0.12);
    }
  }

  // 战场环境音：风声与远处喊杀声
  startAmbient(): void {
    if (!this.ctx || this.ambient) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 380;
    f.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.15;
    lg.gain.value = 160;
    lfo.connect(lg).connect(f.frequency);
    lfo.start();
    const g = ctx.createGain();
    g.gain.value = 0.12;
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start();
    this.ambient = { src, gain: g };
  }

  stopAmbient(): void {
    if (!this.ambient) return;
    try {
      this.ambient.src.stop();
    } catch {
      /* ignore */
    }
    this.ambient = null;
  }
}

export const Audio = new AudioManagerImpl();
