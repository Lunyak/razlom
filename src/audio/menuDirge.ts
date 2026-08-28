/**
 * Menu gramophone — cracked music-box, ghost quartet, crypt air.
 * No swelling roar: drones stay flat; bass stays dry.
 */

import { loadAudioPrefs, saveAudioPrefs } from "./audioPrefs";
import { DEFAULT_TRACK_ID, MENU_TRACKS, trackById, type MenuTrack, type ScoreNote } from "./tracks";

const MASTER_PEAK = 0.48;

function midiHz(n: number): number {
  return 440 * 2 ** ((n - 69) / 12);
}

function reverbIr(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      data[i] = (Math.random() * 2 - 1) * (1 - t) ** 2.55 * (ch === 0 ? 1 : 0.88);
    }
  }
  return buf;
}

function AudioCtx(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

export interface DirgeState {
  track: MenuTrack;
  paused: boolean;
  progress: number;
  running: boolean;
  needsGesture: boolean;
  tracks: MenuTrack[];
}

class MenuDirge {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private boxBus: GainNode | null = null;
  private gen = 0;
  private scoreGen = 0;
  private running = false;
  private paused = false;
  private loopTimer = 0;
  private liveNotes: OscillatorNode[] = [];
  private wanted = false;
  private starting = false;
  private track: MenuTrack = trackById(DEFAULT_TRACK_ID);
  private loopOrigin = 0;
  private lastProgress = 0;
  private volume: number;
  private muted: boolean;
  onChange: (() => void) | null = null;

  constructor() {
    const prefs = loadAudioPrefs();
    this.volume = prefs.volume;
    this.muted = prefs.muted;
  }

  getVolume(): number {
    return this.volume;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : this.volume));
    saveAudioPrefs({ volume: this.volume, muted: this.muted });
    this.applyUserPeakNow();
  }

  setMuted(muted: boolean): void {
    this.muted = Boolean(muted);
    saveAudioPrefs({ volume: this.volume, muted: this.muted });
    this.applyUserPeakNow();
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  /** Effective master gain target. Near-zero when muted so exponential ramps stay valid. */
  userMasterPeak(): number {
    return this.muted ? 0.0001 : Math.max(0.0001, MASTER_PEAK * this.volume);
  }

  private applyUserPeakNow(): void {
    const master = this.master;
    const ctx = this.ctx;
    if (!master || !ctx || !this.running || this.paused) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(this.userMasterPeak(), t);
  }

  getState(): DirgeState {
    return {
      track: this.track,
      paused: this.paused,
      progress: this.progress(),
      running: this.running,
      needsGesture: this.needsGesture(),
      tracks: MENU_TRACKS,
    };
  }

  needsGesture(): boolean {
    if (this.paused) return false;
    return !this.running || !this.ctx || this.ctx.state === "suspended";
  }

  async start(): Promise<void> {
    this.wanted = true;
    if (this.paused && this.running) {
      this.resume();
      return;
    }
    if (this.running && this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.onChange?.();
      return;
    }
    if (this.starting) return;
    this.starting = true;

    try {
      const ctx = this.ctx ?? AudioCtx();
      this.ctx = ctx;
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          return;
        }
      }
      if (!this.wanted || ctx.state !== "running") return;

      this.teardownGraph();
      this.gen += 1;
      this.running = true;
      this.paused = false;

      const master = ctx.createGain();
      master.gain.value = 0.0001;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 14;
      compressor.ratio.value = 2.8;
      compressor.attack.value = 0.02;
      compressor.release.value = 0.28;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      this.master = master;

      const dry = ctx.createGain();
      dry.gain.value = 0.72;
      dry.connect(master);
      this.dry = dry;

      const convolver = ctx.createConvolver();
      convolver.buffer = reverbIr(ctx, 3.1);
      const wet = ctx.createGain();
      wet.gain.value = 0.2;
      convolver.connect(wet);
      wet.connect(master);
      this.wet = wet;

      const boxBus = ctx.createGain();
      boxBus.gain.value = 1;
      boxBus.connect(dry);
      boxBus.connect(convolver);
      this.boxBus = boxBus;

      const now = ctx.currentTime;
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(this.userMasterPeak(), now + 1.1);

      this.restartScore(now + 1.2);
      this.onChange?.();
    } finally {
      this.starting = false;
    }
  }

  async toggle(): Promise<void> {
    if (this.paused) {
      this.resume();
      return;
    }
    if (this.running) {
      this.pause();
      return;
    }
    await this.start();
  }

  pause(): void {
    if (!this.running || this.paused) return;
    this.lastProgress = this.progress();
    this.paused = true;
    this.scoreGen += 1;
    window.clearTimeout(this.loopTimer);
    this.cutLiveNotes();
    const ctx = this.ctx;
    if (this.master && ctx) {
      const t = ctx.currentTime;
      const g = this.master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(0.0001, t + 0.03);
    }
    void ctx?.suspend().catch(() => undefined);
    this.onChange?.();
  }

  resume(): void {
    if (!this.running || !this.paused || !this.ctx) return;
    this.paused = false;
    this.wanted = true;
    const ctx = this.ctx;
    void ctx.resume().then(() => {
      if (!this.wanted || this.paused || this.ctx !== ctx) return;
      const t = ctx.currentTime;
      if (this.master) {
        const g = this.master.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(this.userMasterPeak(), t + 0.18);
      }
      this.restartScore(t + 0.08);
      this.onChange?.();
    });
    this.onChange?.();
  }

  setTrack(id: string): void {
    const next = trackById(id);
    const changed = next.id !== this.track.id;
    this.track = next;
    if (this.running && this.ctx && !this.paused) this.restartScore(this.ctx.currentTime + 0.08);
    if (changed) this.onChange?.();
  }

  nextTrack(): void {
    const i = MENU_TRACKS.findIndex((t) => t.id === this.track.id);
    this.setTrack(MENU_TRACKS[(i + 1) % MENU_TRACKS.length].id);
  }

  prevTrack(): void {
    const i = MENU_TRACKS.findIndex((t) => t.id === this.track.id);
    this.setTrack(MENU_TRACKS[(i - 1 + MENU_TRACKS.length) % MENU_TRACKS.length].id);
  }

  fadeOut(seconds = 1.7): void {
    this.wanted = false;
    if (!this.running || !this.ctx || !this.master) {
      this.stopImmediate();
      return;
    }
    const gen = this.gen;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.exponentialRampToValueAtTime(0.0001, t + seconds);
    this.running = false;
    window.setTimeout(() => {
      if (this.gen !== gen) return;
      this.stopImmediate();
    }, seconds * 1000 + 80);
  }

  stopImmediate(): void {
    this.wanted = false;
    this.gen += 1;
    this.scoreGen += 1;
    this.running = false;
    this.paused = false;
    try {
      this.teardownGraph();
    } catch {
      /* nodes may already be dead */
    }
    this.ctx = null;
    try {
      this.onChange?.();
    } catch {
      /* UI may already be gone */
    }
  }

  private progress(): number {
    if (!this.ctx || !this.running) return 0;
    if (this.paused) return this.lastProgress;
    const dur = this.loopSeconds();
    if (dur <= 0) return 0;
    const t = (this.ctx.currentTime - this.loopOrigin) % dur;
    this.lastProgress = t / dur;
    return this.lastProgress;
  }

  private loopSeconds(): number {
    return this.track.loopBeats * (60 / this.track.bpm);
  }

  private beatLen(): number {
    return 60 / this.track.bpm;
  }

  private restartScore(when: number): void {
    this.scoreGen += 1;
    window.clearTimeout(this.loopTimer);
    this.cutLiveNotes();
    this.loopOrigin = when;
    this.scheduleLoop(when, this.scoreGen);
  }

  private cutLiveNotes(): void {
    for (const osc of this.liveNotes) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      try {
        osc.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.liveNotes = [];
  }

  private teardownGraph(): void {
    window.clearTimeout(this.loopTimer);
    this.cutLiveNotes();
    try {
      this.master?.disconnect();
      this.dry?.disconnect();
      this.wet?.disconnect();
      this.boxBus?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.master = null;
    this.dry = null;
    this.wet = null;
    this.boxBus = null;
  }

  private trackNote(osc: OscillatorNode): void {
    this.liveNotes.push(osc);
    osc.addEventListener("ended", () => {
      const i = this.liveNotes.indexOf(osc);
      if (i >= 0) this.liveNotes.splice(i, 1);
      try {
        osc.disconnect();
      } catch {
        /* already disconnected */
      }
    });
  }

  private scheduleLoop(origin: number, scoreGen: number): void {
    if (this.paused || this.scoreGen !== scoreGen || !this.ctx || !this.boxBus || !this.wet || !this.dry) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const start = Math.max(origin, now + 0.05);
    this.loopOrigin = start;
    const beat = this.beatLen();

    for (const note of this.track.notes) {
      this.playNote(start + note.beat * beat, note, beat);
    }

    const waitMs = Math.max(80, (start + this.loopSeconds() - now) * 1000 - 200);
    this.loopTimer = window.setTimeout(() => this.scheduleLoop(start + this.loopSeconds(), scoreGen), waitMs);
  }

  private playNote(time: number, note: ScoreNote, beat: number): void {
    const ctx = this.ctx;
    const bus = this.boxBus;
    const wet = this.wet;
    const dry = this.dry;
    if (this.paused || !ctx || !bus || !wet || !dry) return;
    if (note.kind === "answer") return;

    const freq = midiHz(note.midi);
    const dur = Math.max(0.4, note.beats * beat);
    const pan = ctx.createStereoPanner();
    pan.pan.value = note.kind === "box" ? ((note.midi % 5) - 2) * 0.12 : note.kind === "bell" ? 0 : -0.16;

    const g = ctx.createGain();
    const attack = note.kind === "choir" ? 0.14 : note.kind === "bell" ? 0.08 : 0.018;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, note.vel), time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    pan.connect(g);
    g.connect(bus);
    if (note.kind !== "box") g.connect(wet);

    if (note.kind === "box") {
      this.spawnOsc(ctx, pan, freq, time, dur, "sine", 1);
      this.spawnOsc(ctx, pan, freq * 2.014, time, dur, "sine", 0.22);
      return;
    }

    if (note.kind === "choir") {
      const ratios = [1, 2 ** (7 / 12)];
      const gains = [0.7, 0.12];
      for (let i = 0; i < ratios.length; i++) {
        this.spawnOsc(ctx, pan, freq * ratios[i], time, dur, "sine", gains[i]);
      }
      return;
    }

    if (note.kind === "bell") {
      const partials = [1, 2.003, 3.01];
      const gains = [1, 0.16, 0.07];
      for (let i = 0; i < partials.length; i++) {
        this.spawnOsc(ctx, pan, freq * partials[i], time, dur, "sine", gains[i]);
      }
      return;
    }

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    this.spawnOsc(ctx, lp, freq, time, dur, "triangle", 1);
    lp.connect(pan);
  }

  private spawnOsc(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.05);
    this.trackNote(osc);
  }
}

export const menuDirge = new MenuDirge();

const hot = (import.meta as ImportMeta & { hot?: { dispose: (cb: () => void) => void } }).hot;
hot?.dispose(() => {
  try {
    menuDirge.stopImmediate();
  } catch {
    /* HMR teardown */
  }
});
