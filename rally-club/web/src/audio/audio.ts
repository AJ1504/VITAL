// Web Audio engine for the temporary harness. Everything is synthesised at runtime — no samples —
// so there is nothing to license (docs/ASSET_LICENSING.md). The Unreal build replaces this with
// MetaSounds + Quartz and licensed/original produced tracks.
//
//  - DJ: an original sunset nu-disco / deep-house loop at 122 BPM (kick, clap, hats, bass, chord stabs)
//    scheduled with a look-ahead clock; exposes beat phase so visuals can groove.
//  - Music is emitted from the DJ booth through a PannerNode (3D attenuation relative to the camera).
//  - Ducking under commentary, low-pass "filter_down" for game point, risers ("build"), "drop", "sting".
//  - Crowd bed + cheer / gasp / applause swells; paddle, bounce and net SFX.

import type { CrowdState, DjAction } from '../../../shared/src/atmosphere.ts';

export interface Volumes {
  master: number;
  music: number;
  crowd: number;
  sfx: number;
}

const BPM = 120;
const SPB = 60 / BPM; // seconds per beat
// Fmaj7 – Em7 – Dm7 – Cmaj7 (warm, descending sunset progression). MIDI notes.
const CHORDS = [
  [53, 57, 60, 64],
  [52, 55, 59, 62],
  [50, 53, 57, 60],
  [48, 52, 55, 59],
];
const BASS = [41, 40, 38, 36];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AudioContext;
  private master: GainNode;
  private musicBus: GainNode;
  private musicDuck: GainNode;
  private musicFilter: BiquadFilterNode;
  private panner: PannerNode;
  private crowdBus: GainNode;
  private sfxBus: GainNode;
  private crowdBed: GainNode;
  private reverb: ConvolverNode;
  private noiseBuf: AudioBuffer;
  private nextBeatTime = 0;
  private beatIndex = 0;
  private timer: number | null = null;
  private startTime = 0;
  private building = false;
  musicEnabled = true;

  constructor() {
    this.ctx = new AudioContext();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);

    // Music: synth voices -> musicFilter -> musicDuck -> panner (3D at DJ booth) -> musicBus -> master
    this.musicFilter = c.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicFilter.Q.value = 0.7;
    this.musicDuck = c.createGain();
    this.panner = c.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 6;
    this.panner.rolloffFactor = 0.8;
    this.musicBus = c.createGain();
    this.musicFilter.connect(this.musicDuck).connect(this.panner).connect(this.musicBus).connect(this.master);

    // Stadium reverb (generated impulse response, ~2.4 s): sends from music, crowd and SFX.
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.8);
    const wet = c.createGain();
    wet.gain.value = 0.32;
    this.reverb.connect(wet).connect(this.master);
    const musicSend = c.createGain();
    musicSend.gain.value = 0.18;
    this.musicBus.connect(musicSend).connect(this.reverb);

    this.crowdBus = c.createGain();
    this.crowdBus.connect(this.master);
    const crowdSend = c.createGain();
    crowdSend.gain.value = 0.55;
    this.crowdBus.connect(crowdSend).connect(this.reverb);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.master);

    // Shared pink-ish noise buffer.
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965;
      d[i] = (b0 + b1 + w * 0.1848) * 0.3;
    }

    // Crowd murmur bed: looping band-passed noise with slow movement.
    this.crowdBed = c.createGain();
    this.crowdBed.gain.value = 0.12;
    const bed = c.createBufferSource();
    bed.buffer = this.noiseBuf;
    bed.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(bp.frequency);
    bed.connect(bp).connect(this.crowdBed).connect(this.crowdBus);
    bed.start();
    lfo.start();

    this.setVolumes({ master: 0.8, music: 0.7, crowd: 0.6, sfx: 0.8 });
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections then a smooth exponential tail; a touch darker over time.
        const early = i < c.sampleRate * 0.08 && Math.random() < 0.02 ? 0.6 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early) * (1 - t * 0.3);
      }
    }
    return buf;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  setVolumes(v: Volumes): void {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(v.music * 0.9, t, 0.05);
    this.crowdBus.gain.setTargetAtTime(v.crowd, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.05);
  }

  /** Position the DJ speakers and the listener (camera) in world space. */
  setSpatial(dj: { x: number; y: number; z: number }, listener: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }): void {
    const t = this.ctx.currentTime;
    const p = this.panner;
    p.positionX.setTargetAtTime(dj.x, t, 0.05);
    p.positionY.setTargetAtTime(dj.y, t, 0.05);
    p.positionZ.setTargetAtTime(dj.z, t, 0.05);
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.setTargetAtTime(listener.x, t, 0.05);
      l.positionY.setTargetAtTime(listener.y, t, 0.05);
      l.positionZ.setTargetAtTime(listener.z, t, 0.05);
      l.forwardX.setTargetAtTime(forward.x, t, 0.05);
      l.forwardY.setTargetAtTime(forward.y, t, 0.05);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.05);
    }
  }

  // ---------------------------------------------------------------- DJ

  startMusic(): void {
    if (this.timer !== null) return;
    this.startTime = this.ctx.currentTime + 0.1;
    this.nextBeatTime = this.startTime;
    this.beatIndex = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** 0..1 phase within the current beat (for visuals). */
  beatPhase(): number {
    if (this.timer === null) return 0;
    const t = this.ctx.currentTime - this.startTime;
    return t < 0 ? 0 : (t / SPB) % 1;
  }

  /** Time of the next bar line — DJ cues are quantised to it (Quartz-style). */
  private nextBar(): number {
    const t = this.ctx.currentTime - this.startTime;
    const bars = Math.ceil(t / (SPB * 4) + 0.001);
    return this.startTime + bars * SPB * 4;
  }

  dj(action: DjAction): void {
    const c = this.ctx;
    const t = c.currentTime;
    const f = this.musicFilter.frequency;
    const g = this.musicDuck.gain;
    switch (action) {
      case 'duck':
        g.cancelScheduledValues(t);
        g.setTargetAtTime(0.45, t, 0.08);
        break;
      case 'unduck':
        g.cancelScheduledValues(t);
        g.setTargetAtTime(1, t, 0.4);
        break;
      case 'filter_down':
        f.cancelScheduledValues(t);
        f.setTargetAtTime(900, t, 0.5);
        break;
      case 'filter_up':
        f.cancelScheduledValues(t);
        f.setTargetAtTime(18000, t, 0.4);
        break;
      case 'build': {
        this.building = true;
        // Noise riser over two bars.
        const dur = SPB * 8;
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const hp = c.createBiquadFilter();
        hp.type = 'bandpass';
        hp.Q.value = 3;
        hp.frequency.setValueAtTime(400, t);
        hp.frequency.exponentialRampToValueAtTime(6000, t + dur);
        const gg = c.createGain();
        gg.gain.setValueAtTime(0.0001, t);
        gg.gain.exponentialRampToValueAtTime(0.35, t + dur);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
        src.connect(hp).connect(gg).connect(this.musicFilter);
        src.start(t);
        src.stop(t + dur + 0.3);
        break;
      }
      case 'drop': {
        this.building = false;
        f.cancelScheduledValues(t);
        f.setTargetAtTime(18000, t, 0.05);
        this.crash(this.nextBar());
        break;
      }
      case 'sting': {
        // Bright major arpeggio on the next beat.
        const start = t + 0.05;
        [72, 76, 79, 84, 88].forEach((m, i) => this.pluck(mtof(m), start + i * 0.09, 0.6, 0.18));
        break;
      }
    }
  }

  private schedule(): void {
    while (this.nextBeatTime < this.ctx.currentTime + 0.12) {
      this.playBeat(this.beatIndex, this.nextBeatTime);
      this.nextBeatTime += SPB;
      this.beatIndex++;
    }
  }

  private playBeat(i: number, t: number): void {
    if (!this.musicEnabled) return;
    const bar = Math.floor(i / 4);
    const beat = i % 4;
    const chord = CHORDS[bar % 4];
    // Four-on-the-floor kick.
    this.kick(t);
    // Clap on 2 and 4.
    if (beat === 1 || beat === 3) this.clap(t);
    // Offbeat open hat, 16th closed hats.
    this.hat(t + SPB / 2, 0.09, 0.12);
    this.hat(t + SPB / 4, 0.025, 0.03);
    this.hat(t + (3 * SPB) / 4, 0.025, 0.03);
    if (this.building) this.clap(t + SPB / 2, 0.5);
    // Syncopated octave bass (nu-disco).
    const root = mtof(BASS[bar % 4]);
    this.bass(root, t, SPB * 0.45);
    this.bass(root * 2, t + SPB / 2, SPB * 0.4);
    // Chord stab on the "and" of 2 and on 4 (pumped).
    // Electric-piano comping (FM "tine" voice): warm lounge / deep-house chords.
    if (beat === 0) chord.forEach((m, k) => this.ep(mtof(m + 12), t + k * 0.012, SPB * 1.6, 0.05));
    if (beat === 1) chord.forEach((m, k) => this.ep(mtof(m + 12), t + SPB * 0.75 + k * 0.01, SPB * 0.6, 0.035));
    if (beat === 2 && bar % 2 === 1) chord.forEach((m) => this.stab(mtof(m), t + SPB / 2, SPB * 0.5));
    // A sparkle melody every other bar.
    if (bar % 2 === 0 && beat === 0) {
      const top = chord[3] + 12;
      [top, top + 3, top + 7, top + 5].forEach((m, k) => this.pluck(mtof(m), t + k * SPB * 0.75, 0.25, 0.05));
    }
  }

  private kick(t: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.musicFilter);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noiseHit(t: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q: number, dest: AudioNode): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private clap(t: number, k = 1): void {
    for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, 0.14, 0.5 * k, 'bandpass', 1500, 1.2, this.musicFilter);
  }

  private hat(t: number, dur: number, gain: number): void {
    this.noiseHit(t, dur, gain, 'highpass', 8000, 0.7, this.musicFilter);
  }

  private crash(t: number): void {
    this.noiseHit(t, 1.6, 0.25, 'highpass', 5000, 0.5, this.musicFilter);
  }

  private bass(freq: number, t: number, dur: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(220, t + dur);
    f.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicFilter);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Two-operator FM electric piano. */
  private ep(freq: number, t: number, dur: number, gain: number): void {
    const c = this.ctx;
    const car = c.createOscillator();
    car.frequency.value = freq;
    const mod = c.createOscillator();
    mod.frequency.value = freq * 14;
    const modGain = c.createGain();
    modGain.gain.setValueAtTime(freq * 1.6, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + 0.25);
    mod.connect(modGain).connect(car.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const tremolo = c.createOscillator();
    tremolo.frequency.value = 4.5;
    const tg = c.createGain();
    tg.gain.value = gain * 0.25;
    tremolo.connect(tg).connect(g.gain);
    car.connect(g).connect(this.musicFilter);
    for (const o of [car, mod, tremolo]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private stab(freq: number, t: number, dur: number): void {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(700, t + dur);
    f.connect(g).connect(this.musicFilter);
    for (const det of [-8, 8]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private pluck(freq: number, t: number, dur: number, gain: number, dest: AudioNode = this.musicFilter): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- crowd

  crowd(state: CrowdState, intensity: number): void {
    const c = this.ctx;
    const t = c.currentTime;
    const bedLevel: Record<CrowdState, number> = { idle: 0.1, murmur: 0.2, tension: 0.06, cheer: 0.18, gasp: 0.12, ovation: 0.25, applause: 0.15 };
    this.crowdBed.gain.setTargetAtTime(bedLevel[state] * (0.6 + intensity), t, 0.3);
    if (state === 'cheer' || state === 'ovation') this.cheer(t, intensity, state === 'ovation' ? 6 : 2.2);
    if (state === 'applause' || state === 'ovation' || state === 'cheer') this.applause(t, intensity, state === 'ovation' ? 6 : 2.5);
    if (state === 'gasp') this.gasp(t, intensity);
  }

  private cheer(t: number, k: number, dur: number): void {
    // Several band-passed noise "voices" with vowel-ish formants swelling together.
    for (const [freq, q] of [
      [550, 3],
      [900, 4],
      [1300, 5],
      [2400, 6],
    ]) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(freq * 0.9, t);
      f.frequency.linearRampToValueAtTime(freq * 1.1, t + 0.4);
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5 * k, t + 0.25);
      g.gain.setTargetAtTime(0.0001, t + dur * 0.5, dur * 0.25);
      src.connect(f).connect(g).connect(this.crowdBus);
      src.start(t, Math.random());
      src.stop(t + dur + 1);
    }
  }

  private applause(t: number, k: number, dur: number): void {
    const n = Math.floor(110 * dur * k);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * dur * (1 - (Math.random() * i) / n / 2);
      // Each clap: short band-passed noise burst at a random position across the stands.
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.random() * 2 - 1;
      pan.connect(this.crowdBus);
      this.noiseHit(tt, 0.025 + Math.random() * 0.02, 0.12 * k * (1 - (tt - t) / (dur * 1.2)), 'bandpass', 1100 + Math.random() * 2600, 1.2, pan);
    }
  }

  private gasp(t: number, k: number): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.7);
    f.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6 * k, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    src.connect(f).connect(g).connect(this.crowdBus);
    src.start(t);
    src.stop(t + 1);
  }

  // ---------------------------------------------------------------- SFX

  /** Paddle "pock". Perfect contact adds a bright chime. */
  paddle(speed: number, perfect: boolean, pan: number): void {
    const c = this.ctx;
    const t = c.currentTime;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1150 + speed * 15, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.05);
    const g = c.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + 0.1);
    this.noiseHit(t, 0.03, 0.5, 'highpass', 2500, 0.8, p);
    if (perfect) [88, 95].forEach((m, i) => this.pluck(mtof(m), t + 0.02 + i * 0.05, 0.4, 0.12, p));
  }

  bounce(speed: number, pan: number): void {
    const c = this.ctx;
    const t = c.currentTime;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
    const g = c.createGain();
    g.gain.setValueAtTime(Math.min(0.6, 0.1 + speed * 0.06), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + 0.1);
  }

  net(): void {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.noiseHit(t + i * 0.02, 0.08, 0.25, 'bandpass', 900, 2, this.sfxBus);
  }

  /** Short original jingles for the presentation layer (bright, bouncy, bell-like). */
  jingle(kind: 'intro' | 'point_win' | 'point_lose' | 'victory' | 'defeat' | 'ready'): void {
    const t = this.ctx.currentTime + 0.02;
    const bell = (m: number, at: number, dur = 0.5, g = 0.12) => {
      this.pluck(mtof(m), t + at, dur, g, this.sfxBus);
      this.pluck(mtof(m + 12), t + at, dur * 0.6, g * 0.35, this.sfxBus);
    };
    switch (kind) {
      case 'intro':
        [67, 72, 76, 79, 84].forEach((m, i) => bell(m, i * 0.11, 0.6, 0.11));
        [72, 76, 79].forEach((m) => bell(m, 0.62, 1.2, 0.08));
        break;
      case 'ready':
        bell(79, 0, 0.25, 0.1);
        break;
      case 'point_win':
        [72, 76, 79, 84].forEach((m, i) => bell(m, i * 0.07, 0.4, 0.09));
        break;
      case 'point_lose':
        [69, 65, 62].forEach((m, i) => bell(m, i * 0.12, 0.45, 0.07));
        break;
      case 'victory':
        [72, 72, 72, 76, 79, 84, 79, 84].forEach((m, i) => bell(m, [0, 0.12, 0.24, 0.36, 0.6, 0.84, 1.02, 1.2][i], 0.5, 0.11));
        [72, 76, 79, 84].forEach((m) => bell(m, 1.5, 1.6, 0.07));
        break;
      case 'defeat':
        [67, 64, 60, 59, 60].forEach((m, i) => bell(m, i * 0.22, 0.6, 0.07));
        break;
    }
  }

  uiClick(): void {
    this.pluck(mtof(84), this.ctx.currentTime, 0.12, 0.08, this.sfxBus);
  }
}
