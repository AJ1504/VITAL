// Rally Club — browser game session. Renders the shared MatchSim in the Mediterranean resort world with
// the member characters, and runs the presentation (club map → intro → Ready/Play → point cut-aways →
// celebration → results) and the Wii-style feel (one-button timing, hit-stop, squash & stretch, pop-ups).
// Simulation and AI run on a fixed 120 Hz tick, so gameplay is identical at any frame rate.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AI_PROFILES, AiController } from '../../shared/src/ai.ts';
import { type AtmosphereCue, AtmosphereDirector } from '../../shared/src/atmosphere.ts';
import { CommentaryEngine } from '../../shared/src/commentary.ts';
import { type Side, otherSide, sideSign } from '../../shared/src/court.ts';
import { type ControlInput, type GameMode, MatchSim, NO_INPUT, SIM_DT, SWING_IDEAL, type SimEvent, type StrokeShot } from '../../shared/src/match.ts';
import type { FaultReason } from '../../shared/src/rules/pickleball.ts';
import { AudioEngine } from './audio/audio.ts';
import { InputManager } from './input/input.ts';
import { Crowd } from './scene/crowd.ts';
import { MEMBERS, memberById } from './scene/members.ts';
import { Pal, type PalLook } from './scene/pal.ts';
import { PALETTE } from './scene/palette.ts';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { type ResortExtras, buildArena, disposeArena } from './scene/arena.ts';
import { radialTexture } from './scene/textures.ts';
import { ARENA_IDS, COURTS, type CourtId } from './scene/themes.ts';
import type { Venue } from './scene/venue.ts';
import type { Settings } from './settings.ts';

export interface MatchConfig {
  mode: GameMode;
  autoplay?: boolean;
  seed?: number;
  skipIntro?: boolean;
}

export interface MatchStats {
  longestRally: number;
  perfect: [number, number];
  aces: [number, number];
  points: number;
  durationS: number;
}

export type BannerKind = 'ready' | 'play' | 'point' | 'game' | 'info';

export interface GameUi {
  score(sim: MatchSim, names: [string, string]): void;
  rally(n: number): void;
  toast(text: string, tone?: 'good' | 'bad' | 'neutral'): void;
  subtitle(text: string): void;
  energy(v: number): void;
  practice(streak: number, best: number, good: number, feeds: number): void;
  results(winner: Side, names: [string, string], score: [number, number], stats: MatchStats): void;
  banner(text: string, kind: BannerKind, sub?: string): void;
  titleCard(card: { title: string; sub: string; names: [string, string] } | null): void;
  scoreCard(card: { names: [string, string]; score: [number, number]; server: number; call: string; winner: number } | null): void;
  popup(text: string, x: number, y: number, tone: 'nice' | 'perfect' | 'ace' | 'miss'): void;
  /** First-match coaching ("Press SPACE just before the ball reaches you"). */
  coach(step: 'serve' | 'swing' | 'aim' | null): void;
  /** Club-map court labels: screen positions for each court (menu only). */
  courtLabels(list: { id: string; x: number; y: number; visible: boolean }[]): void;
}

const FAULT_TOAST: Record<FaultReason, string> = {
  serve_into_net: 'NET',
  serve_in_kitchen: 'SHORT!',
  serve_wrong_court: 'WRONG BOX',
  serve_out: 'OUT!',
  net: 'NET',
  out: 'OUT!',
  double_bounce: '',
  two_bounce_rule: 'LET IT BOUNCE!',
  kitchen_volley: 'KITCHEN!',
  double_hit: 'DOUBLE HIT',
};

const BALL_VISUAL_SCALE = 1.7;
const PASTEL_OUTFITS = [0x9db592, 0xc4b2e2, 0xf3df8e, 0x8ea5cf, 0xf6efe0, 0xffffff, 0xeab8a6, 0xb9dcb0, 0xf2c9d6, 0xd8cdee, 0xece0c8, 0xa8c8e0];

type Phase = 'menu' | 'intro' | 'play' | 'celebrate';
type CamMode = 'map' | 'intro' | 'follow' | 'winner' | 'celebrate';

const INTRO_PATH = [new THREE.Vector3(-26, 26, -30), new THREE.Vector3(-18, 16, -4), new THREE.Vector3(-6, 9, 18), new THREE.Vector3(0, 5.2, 15.2)];

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly audio: AudioEngine;
  readonly input = new InputManager();
  venue: Venue;
  crowd: Crowd;
  sim: MatchSim | null = null;
  director: AtmosphereDirector | null = null;
  paused = false;
  timeScale = 1;
  settings: Settings;
  ui: GameUi | null = null;
  onFrame: (() => void) | null = null;
  assetsReady = true;
  onAssetsReady: (() => void) | null = null;
  phase: Phase = 'menu';

  private resort: ResortExtras;
  private court: MatchSim['court'];
  private envMap: THREE.Texture;
  private ais: (AiController | null)[] = [null, null];
  private pals: [Pal, Pal];
  private dj: Pal;
  private bartender: Pal;
  private waiter: Pal;
  private waiterT = 0;
  private shadowTex = radialTexture('rgba(60,50,30,0.5)');
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private trail: THREE.Mesh;
  private trailPts: THREE.Vector3[] = [];
  private trailPos = new Float32Array(14 * 2 * 3);
  private trailCol = new Float32Array(14 * 2 * 3);
  private trailSpeed = 0;
  private ring: THREE.Mesh;
  private ringT = 0;
  private cue: THREE.Mesh;
  private machine: THREE.Group;
  private confetti: THREE.InstancedMesh;
  private confettiState: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3 }[] = [];
  private confettiTime = 0;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();
  private camMode: CamMode = 'map';
  private camT = 0;
  private camFocus: Side = 0;
  private camPos = new THREE.Vector3(0, 60, 70);
  private camLook = new THREE.Vector3(0, 0, -10);
  private kick = 0;
  private mapAngle = 0;
  private names: [string, string] = ['You', 'Rival'];
  private stats: MatchStats = { longestRally: 0, perfect: [0, 0], aces: [0, 0], points: 0, durationS: 0 };
  private resultAt = -1;
  private winner: Side | null = null;
  private introT = 0;
  private hitStop = 0;
  private slowMo = 0;
  private squash = 0;
  private squashDir = new THREE.Vector3(0, 0, 1);
  private pointCutAt = -1;
  private lastScorer: Side | null = null;
  private menuSwingClock = 0;
  private fixedDt = 0;
  private simAcc = 0;
  private pendingHuman: ControlInput | null = null;
  private coachStep: 'serve' | 'swing' | 'aim' | null = null;
  private coachDone = false;
  private hits = 0;
  private voices: { umpire?: SpeechSynthesisVoice; commentary?: SpeechSynthesisVoice } | null = null;
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();

  constructor(container: HTMLElement, settings: Settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // soft pastel response (no ACES contrast/saturation)
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
    this.camera.position.copy(this.camPos);
    this.audio = new AudioEngine();

    const tmp = new MatchSim();
    this.court = tmp.court;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const arenaId = ARENA_IDS.includes(settings.arena) ? settings.arena : 'coral';
    const world = buildArena(this.scene, tmp.court, arenaId);
    this.venue = world;
    this.resort = world.extras;
    this.applyArenaLook();
    this.crowd = new Crowd(this.venue.seats, 1, { outfits: PASTEL_OUTFITS, hatChance: 0.35, memberOutfits: PASTEL_OUTFITS });
    this.scene.add(this.crowd.group);

    const me = memberById(settings.memberId ?? 'theo');
    const opp = this.opponentFor(me.id);
    this.pals = [new Pal(me.look, this.shadowTex), new Pal(opp.look, this.shadowTex)];
    for (const p of this.pals) this.scene.add(p.root);

    this.dj = new Pal({ skin: 0xc98e66, hair: 0x2b1d14, hairStyle: 'short', headwear: 'headphones', headwearColor: 0x2f2b28, top: 'tee', shirt: 0xf6efe0, trim: 0x8fab83, shorts: 0x8fab83, bottom: 'shorts', shoes: 0xfbf8f2, build: 0.55 }, this.shadowTex);
    this.dj.paddle.visible = false;
    this.dj.ready = 0;
    this.dj.root.position.copy(this.venue.djAnchor);
    this.scene.add(this.dj.root);

    this.bartender = new Pal({ skin: 0xf0c7a2, hair: 0x6b3a22, hairStyle: 'bun', top: 'polo', shirt: 0xfbf8f2, trim: 0x8fab83, shorts: 0x5f7d55, trousers: 0x5f7d55, bottom: 'trousers', shoes: 0x3b2a1e, lashes: true }, this.shadowTex);
    this.bartender.paddle.visible = false;
    this.bartender.ready = 0;
    this.bartender.root.position.copy(this.resort.bartender.pos);
    this.scene.add(this.bartender.root);

    this.waiter = new Pal({ skin: 0x8a5a3c, hair: 0x1b1716, hairStyle: 'short', top: 'polo', shirt: 0xfbf8f2, trim: 0xc4b2e2, shorts: 0x41395a, trousers: 0x41395a, bottom: 'trousers', shoes: 0x3b2a1e, build: 0.5 }, this.shadowTex);
    this.waiter.paddle.visible = false;
    this.waiter.ready = 0;
    const tray = new THREE.Group();
    tray.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0xd9c4a0, roughness: 0.5 })));
    [0xf6b58f, 0xf7d98a, 0xb9dcb0].forEach((c, i) => {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 8), new THREE.MeshStandardMaterial({ color: c, roughness: 0.2 }));
      g.position.set(Math.cos(i * 2.1) * 0.09, 0.07, Math.sin(i * 2.1) * 0.09);
      tray.add(g);
    });
    tray.position.set(0, -0.02, -0.08);
    this.waiter.handL.add(tray);
    this.scene.add(this.waiter.root);

    const r = tmp.physics.ballRadius * BALL_VISUAL_SCALE;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshStandardMaterial({ color: PALETTE.ball, emissive: 0x8f9f00, emissiveIntensity: 0.4, roughness: 0.45 }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(40,40,20,0.6)'), transparent: true, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3));
    const idx: number[] = [];
    for (let i = 0; i < 13; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.scene.add(this.ring);
    // Timing cue: a ring under your player that fills gold at the moment to swing.
    this.cue = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40), new THREE.MeshBasicMaterial({ color: 0xffd95a, transparent: true, opacity: 0, depthWrite: false }));
    this.cue.rotation.x = -Math.PI / 2;
    this.scene.add(this.cue);

    this.machine = new THREE.Group();
    const mBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: 0x9db592, roughness: 0.5 }));
    mBody.position.y = 0.35;
    mBody.castShadow = true;
    this.machine.add(mBody);
    this.machine.position.set(0, 0.12, -tmp.court.halfLength - 0.6);
    this.machine.visible = false;
    this.scene.add(this.machine);

    const confettiColors = [0xc4b2e2, 0x9db592, 0xf3df8e, 0xfbf8f2, 0xf2c9d6, 0xa8c8e0];
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.15), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 }), 400);
    const col = new THREE.Color();
    for (let i = 0; i < 400; i++) {
      this.confetti.setColorAt(i, col.setHex(confettiColors[i % confettiColors.length]));
      this.confettiState.push({ p: new THREE.Vector3(0, -10, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() });
    }
    this.confetti.visible = false;
    this.scene.add(this.confetti);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.applySettings(settings);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  get arenaId(): CourtId {
    return this.resort.theme.id;
  }

  /** Swap the whole stadium (only between matches). */
  setArena(id: CourtId): void {
    if (id === this.resort.theme.id || this.sim) return;
    disposeArena(this.venue.root);
    const world = buildArena(this.scene, this.court, id);
    this.venue = world;
    this.resort = world.extras;
    this.applyArenaLook();
    this.applySettings(this.settings);
    this.dj.root.position.copy(this.venue.djAnchor);
    this.bartender.root.position.copy(this.resort.bartender.pos);
    this.waiterT = 0;
  }

  private applyArenaLook(): void {
    for (const m of this.resort.reflective) {
      m.envMap = this.envMap;
      m.envMapIntensity = 0.9;
      m.needsUpdate = true;
    }
    this.renderer.toneMappingExposure = this.resort.exposure;
  }

  private opponentFor(id: string) {
    const others = MEMBERS.filter((m) => m.id !== id);
    const pick = { easy: 0, medium: 2, hard: 4 }[this.settings.difficulty] ?? 0;
    return others[pick % others.length];
  }

  /** Swap the player's (and opponent's) member. */
  setMember(id: string): void {
    const me = memberById(id);
    const opp = this.opponentFor(id);
    for (const [i, look] of [
      [0, me.look],
      [1, opp.look],
    ] as [number, PalLook][]) {
      const old = this.pals[i];
      this.scene.remove(old.root);
      const p = new Pal(look, this.shadowTex);
      p.root.position.copy(old.root.position);
      p.root.rotation.copy(old.root.rotation);
      this.pals[i] = p;
      this.scene.add(p.root);
    }
  }

  captureMode(): void {
    this.renderer.setAnimationLoop(null);
  }

  step(): void {
    this.frame();
  }

  setFixedStep(dt: number): void {
    this.fixedDt = dt;
  }

  applySettings(s: Settings): void {
    this.settings = s;
    // Performance: modest pixel ratios; post-processing only on High.
    const pr = s.graphics === 'low' ? 0.85 : s.graphics === 'medium' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.75);
    this.renderer.setPixelRatio(pr);
    this.venue.sun.shadow.mapSize.setScalar(s.graphics === 'low' ? 1024 : 2048);
    this.venue.sun.shadow.map?.dispose();
    (this.venue.sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    this.renderer.shadowMap.type = s.graphics === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    const fill = { chairs: 0.42, steps: 0.5, benches: 0.75 }[this.resort.theme.seating];
    const density = (s.graphics === 'low' ? 0.55 : s.graphics === 'medium' ? 0.85 : 1) * fill;
    this.scene.remove(this.crowd.group);
    this.crowd = new Crowd(this.venue.seats, density, { outfits: PASTEL_OUTFITS, hatChance: 0.35, memberOutfits: PASTEL_OUTFITS });
    this.scene.add(this.crowd.group);
    this.audio.setVolumes({ master: s.master, music: s.music, crowd: s.crowd, sfx: s.sfx });
    this.resize();
  }

  resize(): void {
    const w = this.renderer.domElement.parentElement?.clientWidth ?? innerWidth;
    const h = this.renderer.domElement.parentElement?.clientHeight ?? innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 60 : 42;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- session control

  async startMatch(cfg: MatchConfig): Promise<void> {
    void this.audio.resume().catch(() => {});
    this.audio.startMusic();
    const s = this.settings;
    const me = memberById(s.memberId ?? 'theo');
    const opp = this.opponentFor(me.id);
    this.names = cfg.mode === 'practice' ? [s.playerName === 'You' ? me.name : s.playerName, 'Ball machine'] : [s.playerName === 'You' ? me.name : s.playerName, opp.name];
    this.sim = new MatchSim({
      mode: cfg.mode,
      assist: [cfg.autoplay ? 'classic' : s.assist, 'classic'],
      pointsToWin: s.pointsToWin,
      seed: cfg.seed ?? Math.floor(Math.random() * 1e9),
      names: this.names,
    });
    this.ais = [cfg.autoplay ? new AiController(0, AI_PROFILES.medium, 17) : null, cfg.mode === 'match' ? new AiController(1, AI_PROFILES[s.difficulty], 23) : null];
    this.director = new AtmosphereDirector({ names: this.names, pointsToWin: s.pointsToWin }, new CommentaryEngine({ seed: cfg.seed ?? Date.now() }));
    this.director.on((c) => this.onCue(c));
    this.stats = { longestRally: 0, perfect: [0, 0], aces: [0, 0], points: 0, durationS: 0 };
    this.winner = null;
    this.resultAt = -1;
    this.paused = false;
    this.hitStop = this.slowMo = 0;
    this.simAcc = 0;
    this.hits = 0;
    this.input.enabled = !cfg.autoplay;
    this.machine.visible = cfg.mode === 'practice';
    this.pals[1].root.visible = cfg.mode === 'match';
    this.ui?.scoreCard(null);
    this.ui?.courtLabels([]);
    this.ui?.score(this.sim, this.names);
    this.ui?.rally(0);
    this.coachDone = !!cfg.autoplay || this.coachSeen();
    if (cfg.skipIntro || this.settings.reducedMotion) this.beginPlay();
    else {
      this.phase = 'intro';
      this.introT = 0;
      this.camMode = 'intro';
      this.camT = 0;
      this.ui?.titleCard({ title: COURTS[this.resort.theme.id].name, sub: cfg.mode === 'practice' ? 'Practice session' : `Singles · first to ${s.pointsToWin}`, names: this.names });
      this.audio.jingle('intro');
      this.crowd.setState('applause', 0.8);
      this.audio.crowd('applause', 0.8);
      for (const p of this.pals) p.play('wave');
    }
  }

  skipIntro(): void {
    if (this.phase === 'intro') this.beginPlay();
  }

  private beginPlay(): void {
    if (!this.sim || !this.director) return;
    this.phase = 'play';
    this.camMode = 'follow';
    this.camT = 0;
    this.ui?.titleCard(null);
    for (const e of this.sim.drainEvents()) this.director.handle(e);
    if (this.sim.mode === 'match') {
      this.ui?.banner('Ready?', 'ready');
      window.setTimeout(() => this.phase === 'play' && this.ui?.banner('Play!', 'play'), 900);
    }
    if (!this.coachDone) window.setTimeout(() => this.setCoach(this.sim?.rules.state.server === 0 ? 'serve' : 'swing'), 1600);
  }

  exitToMenu(): void {
    this.sim = null;
    this.director = null;
    this.paused = false;
    this.phase = 'menu';
    this.camMode = 'map';
    this.machine.visible = false;
    this.pals[1].root.visible = true;
    this.ui?.titleCard(null);
    this.ui?.scoreCard(null);
    this.setCoach(null);
    window.speechSynthesis?.cancel();
  }

  private coachSeen(): boolean {
    try {
      return localStorage.getItem('rally-club.coached') === '1';
    } catch {
      return false;
    }
  }

  private setCoach(step: 'serve' | 'swing' | 'aim' | null): void {
    if (step && this.coachDone) return;
    this.coachStep = step;
    this.ui?.coach(step);
  }

  private advanceCoach(): void {
    if (this.coachDone || !this.coachStep) return;
    if (this.coachStep === 'serve') this.setCoach('swing');
    else if (this.coachStep === 'swing') this.setCoach('aim');
    else {
      this.coachDone = true;
      this.setCoach(null);
      try {
        localStorage.setItem('rally-club.coached', '1');
      } catch {
        /* ignore */
      }
    }
  }

  // ---------------------------------------------------------------- frame

  private frame(): void {
    const real = this.fixedDt > 0 ? this.fixedDt : Math.min(this.clock.getDelta(), 0.1);
    const beat = this.audio.beatPhase();
    const sim = this.sim;

    let dt = real;
    if (this.hitStop > 0) {
      this.hitStop -= real;
      dt = 0;
    } else if (this.slowMo > 0) {
      this.slowMo -= real;
      dt = real * 0.4;
    }

    if (sim && !this.paused) {
      const raw = this.input.poll();
      const human: ControlInput = { moveX: raw.moveX, moveZ: raw.moveZ, swing: raw.swing ? this.autoShot(raw.swing.shot, raw.swing.aim) : null };
      if (human.swing) this.pendingHuman = human;
      if (this.phase === 'intro') {
        this.introT += real;
        if (this.introT > 4.2) this.beginPlay();
      } else if (dt > 0) {
        // Fixed-tick simulation: AI thinks every tick, so it never misses because of a slow frame.
        this.simAcc += dt * this.timeScale;
        let ticks = 0;
        while (this.simAcc >= SIM_DT && ticks < 60) {
          const hIn: ControlInput = this.pendingHuman ?? { moveX: human.moveX, moveZ: human.moveZ, swing: null };
          this.pendingHuman = null;
          const inputs: [ControlInput, ControlInput] = [this.ais[0] ? this.ais[0].think(sim, SIM_DT) : hIn, this.ais[1] ? this.ais[1].think(sim, SIM_DT) : NO_INPUT];
          sim.update(SIM_DT, inputs);
          this.stats.durationS += SIM_DT;
          for (const e of sim.drainEvents()) this.onSimEvent(e);
          this.director?.tick(SIM_DT);
          this.simAcc -= SIM_DT;
          ticks++;
        }
      }
      if (this.pointCutAt > 0 && performance.now() >= this.pointCutAt) {
        this.pointCutAt = -1;
        if (this.phase === 'play' && this.lastScorer !== null && !this.settings.reducedMotion) {
          this.camMode = 'winner';
          this.camFocus = this.lastScorer;
          this.camT = 0;
        }
      }
      if (this.resultAt > 0 && performance.now() >= this.resultAt) {
        this.resultAt = -1;
        if (this.winner !== null) this.ui?.results(this.winner, this.names, sim.rules.state.score, this.stats);
      }
    } else if (!sim) {
      this.input.poll();
    }

    this.syncScene(dt, real, beat);
    this.updateCamera(real);
    this.audio.setSpatial(this.venue.djAnchor, this.camera.position, this.camera.getWorldDirection(this.v1));
    if (this.settings.graphics === 'high') this.composer.render(real);
    else this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
  }

  /** One-button play: pick the shot from context (dink at the kitchen, drive elsewhere); aim from timing. */
  private autoShot(shot: StrokeShot | 'auto', aim: number): { shot: StrokeShot; aim: number; timingAim?: boolean } {
    const sim = this.sim;
    if (shot !== 'auto' || !sim) return { shot: shot === 'auto' ? 'drive' : shot, aim };
    const me = sim.players[0];
    const plan = sim.intercept(0);
    const nearKitchen = Math.abs(me.pos.z) < sim.court.nvzDepth + 1.4;
    const low = plan ? plan.contact.y < 0.85 : true;
    const opp = sim.players[1];
    const oppAtNet = Math.abs(opp.pos.z) < sim.court.nvzDepth + 1.2;
    let pick: StrokeShot = 'drive';
    if (nearKitchen && low) pick = 'dink';
    else if (oppAtNet && !nearKitchen && Math.random() < 0.25) pick = 'lob';
    return { shot: pick, aim: 0, timingAim: true };
  }

  private onSimEvent(e: SimEvent): void {
    const sim = this.sim!;
    this.director?.handle(e);
    const panOf = (x: number) => x / 6;
    switch (e.type) {
      case 'contact': {
        const pal = this.pals[e.side];
        pal.play(e.stroke === 'serve' ? 'serve' : e.stroke === 'backhand' ? 'swing_bh' : 'swing_fh');
        this.pals[otherSide(e.side)].splitStep();
        this.audio.paddle(e.speed, e.perfect, panOf(sim.ball.p.x));
        const motion = !this.settings.reducedMotion;
        this.hitStop = motion ? (e.perfect ? 0.1 : 0.05) : 0;
        if (e.perfect && motion) this.slowMo = 0.25;
        this.ringT = 0.35;
        this.ring.position.copy(this.ball.position);
        this.squash = 1;
        this.squashDir.set(sim.ball.v.x, sim.ball.v.y, sim.ball.v.z).normalize();
        if (this.settings.cameraShake && motion && e.side === 0) this.kick = e.perfect ? 0.2 : 0.08;
        if (e.side === 0) {
          this.hits++;
          if (e.stroke === 'serve' && this.coachStep === 'serve') this.advanceCoach();
          else if (e.stroke !== 'serve' && this.coachStep === 'swing') this.advanceCoach();
          else if (e.stroke !== 'serve' && this.coachStep === 'aim' && this.hits >= 3) this.advanceCoach();
        }
        if (e.perfect) {
          this.stats.perfect[e.side]++;
          pal.setExpression('determined', 0.8);
          this.popupAt(this.ball.position, 'PERFECT!', 'perfect');
        } else if (e.quality > 0.7 && e.stroke !== 'serve' && e.side === 0) this.popupAt(this.ball.position, 'NICE!', 'nice');
        break;
      }
      case 'whiff':
        this.pals[e.side].play('swing_fh');
        if (e.side === 0) {
          this.pals[0].setExpression('surprised', 1);
          this.popupAt(this.v1.copy(this.pals[0].root.position).setY(1.8), 'TOO EARLY!', 'miss');
        }
        break;
      case 'ball_bounce':
        this.audio.bounce(e.speed, panOf(e.p.x));
        this.squash = Math.min(1, e.speed / 8);
        this.squashDir.set(0, 1, 0);
        break;
      case 'net_touch':
      case 'net_cord':
        this.audio.net();
        break;
      case 'hit':
        this.ui?.rally(e.hitCount);
        if (e.hitCount === 8 || e.hitCount === 15) this.popupAt(this.ball.position, e.hitCount >= 15 ? 'EPIC RALLY!' : 'GREAT RALLY!', 'nice');
        break;
      case 'serve':
        this.ui?.rally(1);
        if (this.camMode !== 'follow') {
          this.camMode = 'follow';
          this.camT = 0;
        }
        break;
      case 'fault': {
        const t = FAULT_TOAST[e.reason];
        if (t) this.ui?.toast(t, e.side === 0 ? 'bad' : 'good');
        break;
      }
      case 'point': {
        this.umpireCall(e);
        this.stats.points++;
        this.stats.longestRally = Math.max(this.stats.longestRally, e.rallyLength);
        const w = e.rallyWinner;
        const l = otherSide(w);
        const big = e.ace || e.rallyLength >= 8 || e.savedGamePoint;
        this.pals[w].setExpression(big ? 'ecstatic' : 'happy', 2.4);
        this.pals[l].setExpression('sad', 2.2);
        window.setTimeout(() => {
          if (this.phase !== 'play') return;
          this.pals[w].play(big ? 'fistpump' : Math.random() < 0.5 ? 'laugh' : 'fistpump');
          this.pals[l].play('dejected');
        }, 350);
        if (e.ace) {
          this.stats.aces[e.server]++;
          this.ui?.toast('ACE!', e.server === 0 ? 'good' : 'bad');
        } else if (e.reason === 'double_bounce') this.ui?.toast(w === 0 ? 'POINT!' : 'MISSED', w === 0 ? 'good' : 'bad');
        this.audio.jingle(w === 0 ? 'point_win' : 'point_lose');
        this.lastScorer = w;
        if (sim.mode === 'match' && sim.rules.state.phase !== 'game_over') {
          this.pointCutAt = performance.now() + 450;
          window.setTimeout(() => {
            if (!this.sim || this.phase !== 'play' || this.sim.rules.state.phase === 'game_over') return;
            const st = this.sim.rules.state;
            this.ui?.scoreCard({ names: this.names, score: [st.score[0], st.score[1]], server: st.server, call: this.sim.rules.scoreCall(), winner: w });
            if (e.gamePoint) window.setTimeout(() => this.ui?.banner('Game Point', 'game', this.names[st.server]), 900);
          }, 700);
        }
        this.ui?.score(sim, this.names);
        break;
      }
      case 'point_reset':
        this.ui?.scoreCard(null);
        this.ui?.score(sim, this.names);
        this.ui?.rally(0);
        this.camMode = 'follow';
        this.camT = 0;
        if (this.coachStep === 'swing' && sim.rules.state.server === 0) this.ui?.coach('serve');
        else if (this.coachStep) this.ui?.coach(this.coachStep);
        break;
      case 'game_over': {
        this.winner = e.winner;
        this.phase = 'celebrate';
        this.camMode = 'celebrate';
        this.camT = 0;
        this.ui?.scoreCard(null);
        this.setCoach(null);
        this.ui?.banner('Game, Set & Match', 'game', this.names[e.winner]);
        this.pals[e.winner].setExpression('ecstatic', 99);
        this.pals[e.winner].play('celebrate');
        const loser = this.pals[otherSide(e.winner)];
        loser.setExpression('sad', 2.5);
        loser.play('dejected');
        window.setTimeout(() => {
          loser.setExpression('happy', 99);
          loser.play('clap');
        }, 2200);
        this.audio.jingle(e.winner === 0 ? 'victory' : 'defeat');
        this.resultAt = performance.now() + 5200;
        this.ui?.score(sim, this.names);
        break;
      }
      case 'practice_result':
        this.ui?.practice(e.streak, e.best, sim.practice.good, sim.practice.feeds);
        this.ui?.toast(e.good ? 'GOOD!' : 'MISS', e.good ? 'good' : 'bad');
        this.pals[0].setExpression(e.good ? (e.streak >= 5 ? 'ecstatic' : 'happy') : 'sad', 1.2);
        break;
      default:
        break;
    }
  }

  private popupAt(world: THREE.Vector3, text: string, tone: 'nice' | 'perfect' | 'ace' | 'miss'): void {
    const v = this.v2.copy(world).project(this.camera);
    if (v.z > 1) return;
    const el = this.renderer.domElement;
    this.ui?.popup(text, ((v.x + 1) / 2) * el.clientWidth, ((1 - v.y) / 2) * el.clientHeight, tone);
  }

  private umpireCall(e: Extract<SimEvent, { type: 'point' }>): void {
    if (!this.settings.voice || !('speechSynthesis' in window)) return;
    const calls: Partial<Record<FaultReason, string>> = { out: 'Out.', serve_out: 'Out.', serve_in_kitchen: 'Short.', serve_wrong_court: 'Fault.', kitchen_volley: 'Kitchen.', two_bounce_rule: 'Fault.', serve_into_net: 'Net.', double_hit: 'Fault.' };
    const call = calls[e.reason];
    const sim = this.sim!;
    const score = sim.rules.state.phase === 'game_over' ? 'Game.' : `${sim.rules.scoreCall().replace('-', ', ')}.`;
    this.speak(`${call ? call + ' ' : ''}${score}`, 'umpire');
  }

  private pickVoices(): void {
    const all = window.speechSynthesis?.getVoices() ?? [];
    if (!all.length) return;
    const en = all.filter((v) => /^en/i.test(v.lang));
    const pick = (re: RegExp) => en.find((v) => re.test(v.name));
    this.voices = { commentary: pick(/Daniel|Arthur|George|Ryan|Oliver|Male/i) ?? en[0], umpire: pick(/Serena|Kate|Martha|Libby|Sonia|Samantha|Female/i) ?? en[1] ?? en[0] };
  }

  private speak(text: string, who: 'umpire' | 'commentary', interrupt = false): void {
    if (!this.voices) this.pickVoices();
    const u = new SpeechSynthesisUtterance(text);
    const v = this.voices?.[who];
    if (v) u.voice = v;
    u.rate = who === 'umpire' ? 0.95 : 1.05;
    u.volume = Math.min(1, this.settings.master * 1.1);
    if (interrupt) speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  private onCue(c: AtmosphereCue): void {
    switch (c.kind) {
      case 'crowd':
        this.crowd.setState(c.state, c.intensity);
        this.audio.crowd(c.state, c.intensity);
        break;
      case 'dj':
        this.audio.dj(c.action);
        break;
      case 'commentary':
        if (this.settings.subtitles) this.ui?.subtitle(c.line.text);
        if (this.settings.voice && 'speechSynthesis' in window) this.speak(c.line.text, 'commentary', c.line.priority >= 9);
        break;
      case 'vfx':
        if (c.effect === 'confetti') this.burstConfetti();
        break;
      case 'haptic':
        if (c.side === 0 && this.settings.haptics && navigator.vibrate && navigator.userActivation?.hasBeenActive) {
          const pat: Record<string, number | number[]> = { impact: 12, perfect: [10, 30, 25], miss: 40, point: [20, 40, 20], win: [60, 60, 120] };
          navigator.vibrate(pat[c.pattern]);
        }
        break;
      case 'energy':
        this.ui?.energy(c.value);
        break;
      default:
        break;
    }
  }

  private burstConfetti(): void {
    if (this.settings.reducedMotion) return;
    this.confetti.visible = true;
    this.confettiTime = 7;
    for (const c of this.confettiState) {
      c.p.set((Math.random() - 0.5) * 8, 6 + Math.random() * 3, (Math.random() - 0.5) * 12);
      c.v.set((Math.random() - 0.5) * 5, 1 + Math.random() * 4, (Math.random() - 0.5) * 5);
      c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.w.set(Math.random() * 9, Math.random() * 9, Math.random() * 9);
    }
  }

  // ---------------------------------------------------------------- scene sync

  private syncScene(dt: number, real: number, beat: number): void {
    const sim = this.sim;
    const reduced = this.settings.reducedMotion;
    const ballWorld = sim ? this.v1.set(sim.ball.p.x, sim.ball.p.y, sim.ball.p.z) : null;
    const pdt = dt > 0 ? dt : 0.0001;
    let cueOpacity = 0;

    if (sim) {
      const st = sim.rules.state;
      for (const side of [0, 1] as Side[]) {
        const p = sim.players[side];
        const pal = this.pals[side];
        pal.serving = sim.mode === 'match' && st.phase === 'awaiting_serve' && st.server === side;
        const active = this.phase === 'play' && (st.phase === 'in_play' || st.phase === 'awaiting_serve');
        pal.ready += ((active ? 1 : 0.35) - pal.ready) * Math.min(1, real * 6);
        if (sim.ballIncomingFor(side)) {
          const plan = sim.intercept(side);
          if (plan) {
            const remaining = plan.timeToContact - (sim.time - plan.computedAt);
            const right = (plan.contact.x - p.pos.x) * sideSign(side);
            pal.anticipate(right >= -0.05 ? 'fh' : 'bh', THREE.MathUtils.clamp(1 - (remaining - 0.12) / 0.5, 0, 1));
            // Timing cue under your player: brightest at the ideal moment to press swing.
            if (side === 0 && !this.ais[0] && (this.settings.assist !== 'precision' || !this.coachDone)) {
              const err = Math.abs(remaining - SWING_IDEAL);
              cueOpacity = remaining < 0.9 ? THREE.MathUtils.clamp(1 - err / 0.5, 0.15, 1) : 0;
              const s = 1 + Math.max(0, remaining - SWING_IDEAL) * 2.2;
              this.cue.scale.setScalar(s);
              (this.cue.material as THREE.MeshBasicMaterial).color.setHex(err < 0.08 ? 0xffd95a : 0xffffff);
            }
          }
        } else pal.anticipate('fh', 0);
        pal.lookAt(this.phase === 'intro' ? this.camera.position : ballWorld);
        pal.update(pdt, { x: p.pos.x, z: p.pos.z, yaw: side === 0 ? 0 : Math.PI, speed: Math.hypot(p.vel.x, p.vel.z), vx: p.vel.x, vz: p.vel.z });
      }
      this.cue.position.set(sim.players[0].pos.x, 0.14, sim.players[0].pos.z);

      const bp = sim.ball.p;
      const hidden = bp.y < -1 || (sim.mode === 'practice' && sim.ballHeld);
      this.ball.visible = !hidden;
      const r = sim.physics.ballRadius * BALL_VISUAL_SCALE;
      this.ball.position.set(bp.x, Math.max(bp.y, r + 0.12), bp.z);
      const speed = Math.hypot(sim.ball.v.x, sim.ball.v.y, sim.ball.v.z);
      const stretch = Math.min(0.5, speed / 40);
      this.squash = Math.max(0, this.squash - real * 6);
      const s = 1 + stretch - this.squash * 0.35;
      const dir = this.squash > 0.05 ? this.squashDir : this.v2.set(sim.ball.v.x, sim.ball.v.y, sim.ball.v.z).normalize();
      if (dir.lengthSq() > 0.5) this.ball.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const inv = 1 / Math.sqrt(Math.max(0.5, s));
      this.ball.scale.set(inv, inv, s);
      this.ballShadow.visible = !hidden;
      this.ballShadow.position.set(bp.x, 0.145, bp.z);
      this.ballShadow.scale.setScalar(Math.max(0.35, 1 - bp.y * 0.22));
      this.updateTrail(!hidden && !sim.ballHeld && !reduced, speed);
    } else {
      // Club map: the two members warm up on the Garden Court.
      this.menuSwingClock += real;
      const t = performance.now() / 1000;
      for (const side of [0, 1] as Side[]) {
        const pal = this.pals[side];
        pal.serving = false;
        pal.ready = 1;
        if (this.menuSwingClock > 1.4 && pal.currentAction === 'none' && Math.floor(t / 1.4) % 2 === side) {
          pal.play(Math.random() < 0.5 ? 'swing_fh' : 'swing_bh');
          this.pals[otherSide(side)].splitStep();
          this.menuSwingClock = 0;
        }
        pal.lookAt(this.v2.set(0, 1.2, 0));
        const x = Math.sin(t * 0.7 + side * 2) * 1.4;
        pal.update(real, { x, z: sideSign(side) * 5.4, yaw: side === 0 ? 0 : Math.PI, speed: Math.abs(Math.cos(t * 0.7 + side * 2)) * 1.2, vx: Math.cos(t * 0.7 + side * 2), vz: 0 });
      }
      this.ball.visible = false;
      this.ballShadow.visible = false;
      this.trail.visible = false;
      this.updateCourtLabels();
    }
    (this.cue.material as THREE.MeshBasicMaterial).opacity += (cueOpacity * 0.85 - (this.cue.material as THREE.MeshBasicMaterial).opacity) * Math.min(1, real * 12);

    if (this.ringT > 0) {
      this.ringT -= real;
      const k = 1 - this.ringT / 0.35;
      this.ring.lookAt(this.camera.position);
      this.ring.scale.setScalar(1 + k * 4);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
    } else (this.ring.material as THREE.MeshBasicMaterial).opacity = 0;

    // DJ grooves on the beat (headphones on, one hand on the deck).
    const pulse = Math.pow(1 - beat, 3);
    this.dj.lookAt(ballWorld ?? this.camera.position);
    this.dj.update(real, { x: this.venue.djAnchor.x, z: this.venue.djAnchor.z, yaw: this.venue.djYaw ?? Math.PI, speed: 0 });
    this.dj.root.position.y = this.venue.djAnchor.y;
    this.resort.tick(performance.now() / 1000, beat);
    this.dj.hips.position.y += pulse * (reduced ? 0.01 : 0.05);
    this.dj.head.rotation.x += pulse * 0.25;
    this.dj.shR.rotation.set(1.3, 0, 0.3);
    this.dj.elR.rotation.x = 1.0 + Math.sin(performance.now() / 260) * 0.25;
    this.dj.shL.rotation.set(2.0 + pulse * 0.3, 0, -0.5);
    this.dj.elL.rotation.x = 1.6;
    this.venue.djLights.forEach((m, i) => {
      (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + (i % 2 === Math.floor(performance.now() / 500) % 2 ? pulse * 1.8 : 0.2);
    });

    // Bartender polishes a glass; the waiter walks the terrace with a tray of drinks.
    this.bartender.lookAt(ballWorld ?? this.camera.position);
    this.bartender.update(real, { x: this.resort.bartender.pos.x, z: this.resort.bartender.pos.z, yaw: this.resort.bartender.yaw, speed: 0 });
    const tt = performance.now() / 1000;
    this.bartender.shR.rotation.set(1.2, 0, -0.4 + Math.sin(tt * 6) * 0.2);
    this.bartender.elR.rotation.x = 1.3;
    this.bartender.shL.rotation.set(1.1, 0, 0.3);
    this.bartender.elL.rotation.x = 1.2;
    this.updateWaiter(real);

    this.crowd.update(real, beat, reduced);

    if (this.confettiTime > 0) {
      this.confettiTime -= real;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      this.confettiState.forEach((c, i) => {
        c.v.y -= 2.0 * real;
        c.v.multiplyScalar(1 - 0.9 * real);
        c.p.addScaledVector(c.v, real);
        if (c.p.y < 0.15) {
          c.p.y = 0.15;
          c.v.set(0, 0, 0);
        } else {
          c.r.x += c.w.x * real;
          c.r.y += c.w.y * real;
        }
        m.compose(c.p, q.setFromEuler(c.r), one);
        this.confetti.setMatrixAt(i, m);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
      if (this.confettiTime <= 0) this.confetti.visible = false;
    }
  }

  private updateWaiter(dt: number): void {
    const path = this.resort.walkPaths[0];
    let total = 0;
    const segs: number[] = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[i];
      const b = path[(i + 1) % path.length];
      const d = a.distanceTo(b);
      segs.push(d);
      total += d;
    }
    this.waiterT = (this.waiterT + dt * 1.1) % total;
    let d = this.waiterT;
    let i = 0;
    while (d > segs[i]) {
      d -= segs[i];
      i = (i + 1) % segs.length;
    }
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const k = d / segs[i];
    const x = a.x + (b.x - a.x) * k;
    const z = a.z + (b.z - a.z) * k;
    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    this.waiter.update(dt, { x, z, yaw, speed: 1.1, vx: (b.x - a.x) / segs[i], vz: (b.z - a.z) / segs[i] });
    // Tray arm held level.
    this.waiter.shL.rotation.set(1.35, 0, -0.25);
    this.waiter.elL.rotation.x = -0.1;
  }

  private updateCourtLabels(): void {
    if (!this.ui) return;
    const el = this.renderer.domElement;
    const list = this.resort.courts.map(({ theme, anchor }) => {
      const v = this.v2.set(anchor.x, 3, anchor.z).project(this.camera);
      return { id: theme.id, x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight, visible: v.z < 1 && this.camMode === 'map' };
    });
    this.ui.courtLabels(list);
  }

  private updateTrail(show: boolean, speed: number): void {
    this.trail.visible = show;
    if (!show) {
      this.trailPts.length = 0;
      return;
    }
    const head = this.trailPts.length >= 14 ? this.trailPts.pop()! : new THREE.Vector3();
    this.trailPts.unshift(head.copy(this.ball.position));
    this.trailSpeed += (speed - this.trailSpeed) * 0.3;
    const n = this.trailPts.length;
    const hot = new THREE.Color().lerpColors(new THREE.Color(0xfff7c2), new THREE.Color(0xffa36b), THREE.MathUtils.clamp((this.trailSpeed - 8) / 12, 0, 1));
    const tangent = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < 14; i++) {
      const p = this.trailPts[Math.min(i, n - 1)];
      const next = this.trailPts[Math.min(n - 1, i + 1)];
      const prev = this.trailPts[Math.min(n - 1, Math.max(0, i - 1))];
      tangent.subVectors(prev, next);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
      tangent.normalize();
      camDir.subVectors(this.camera.position, p).normalize();
      side.crossVectors(tangent, camDir).normalize();
      const w = i < n ? 0.055 * (1 - i / 14) : 0;
      const k = (1 - i / 14) * 0.8;
      for (let s2 = 0; s2 < 2; s2++) {
        const o = (i * 2 + s2) * 3;
        const sg = s2 === 0 ? 1 : -1;
        this.trailPos[o] = p.x + side.x * w * sg;
        this.trailPos[o + 1] = p.y + side.y * w * sg;
        this.trailPos[o + 2] = p.z + side.z * w * sg;
        this.trailCol[o] = hot.r * k;
        this.trailCol[o + 1] = hot.g * k;
        this.trailCol[o + 2] = hot.b * k;
      }
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
  }

  // ---------------------------------------------------------------- camera

  private updateCamera(dt: number): void {
    this.camT += dt;
    const sim = this.sim;
    const cam = this.camera;
    const portrait = cam.aspect < 1;
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    let stiffness = 4;
    switch (this.camMode) {
      case 'map': {
        // Arena fly-around: a slow aerial sweep in front of the DJ booth.
        this.mapAngle += dt * (this.settings.reducedMotion ? 0.02 : 0.07);
        const a = Math.sin(this.mapAngle) * 0.85;
        const R = this.resort.orbit.radius * (portrait ? 1.6 : 1);
        pos.set(Math.sin(a) * R, this.resort.orbit.height * (portrait ? 1.5 : 1), Math.cos(a) * R);
        look.set(0, 0, portrait ? 0 : 3.5);
        stiffness = 1.2;
        break;
      }
      case 'intro': {
        const t = THREE.MathUtils.clamp(this.camT / 4.0, 0, 1);
        const e = t * t * (3 - 2 * t);
        const u = 1 - e;
        const P = INTRO_PATH;
        pos.set(0, 0, 0).addScaledVector(P[0], u * u * u).addScaledVector(P[1], 3 * u * u * e).addScaledVector(P[2], 3 * u * e * e).addScaledVector(P[3], e * e * e);
        look.set(0, 0.6, -2.6 * e);
        this.camPos.copy(pos);
        this.camLook.copy(look);
        stiffness = 30;
        break;
      }
      case 'winner': {
        const w = sim ? sim.players[this.camFocus].pos : { x: 0, z: 0 };
        const front = w.z >= 0 ? -1 : 1;
        pos.set(w.x + 1.0, 1.75, w.z + front * 3.2);
        look.set(w.x, 1.25, w.z);
        stiffness = 5;
        if (this.camT <= dt + 1e-6) {
          // Broadcast-style hard cut to the close-up (never sweep through the player).
          this.camPos.copy(pos);
          this.camLook.copy(look);
        }
        if (this.camT > 1.5) {
          this.camMode = 'follow';
          this.camT = 0;
        }
        break;
      }
      case 'celebrate': {
        const w = sim ? sim.players[this.winner ?? 0].pos : { x: 0, z: 0 };
        const front = w.z >= 0 ? -1 : 1;
        const a = this.camT * (this.settings.reducedMotion ? 0.05 : 0.32);
        pos.set(w.x + Math.sin(a) * 4.2, 2.0, w.z + Math.cos(a) * 4.2 * front);
        look.set(w.x, 1.2, w.z);
        stiffness = 2.5;
        if (this.camT <= dt + 1e-6) {
          this.camPos.copy(pos);
          this.camLook.copy(look);
        }
        break;
      }
      default: {
        const me = sim ? sim.players[0].pos : { x: 0, z: 6.5 };
        const cutBack = this.camMode === 'follow' && this.camT <= dt + 1e-6;
        const bx = sim ? sim.ball.p.x : 0;
        const h = portrait ? 8.5 : 5.2;
        const back = portrait ? 10.5 : 7.8;
        pos.set(me.x * 0.55 + bx * 0.12, h, Math.max(me.z, 3.5) + back);
        look.set(me.x * 0.3 + bx * 0.25, 0.7, portrait ? -1.5 : -2.6);
        stiffness = 3.5;
        if (cutBack) {
          this.camPos.copy(pos);
          this.camLook.copy(look);
        }
      }
    }
    const k = 1 - Math.exp(-stiffness * dt);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    cam.position.copy(this.camPos);
    if (this.kick > 0) {
      this.kick -= dt;
      const m = this.kick * 0.35;
      cam.position.x += (Math.random() - 0.5) * m;
      cam.position.y += (Math.random() - 0.5) * m;
      cam.position.z -= m * 0.6;
    }
    cam.lookAt(this.camLook);
  }
}
