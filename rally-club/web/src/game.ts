// Browser harness game session: renders the shared MatchSim in Three.js, routes input/AI,
// and turns AtmosphereDirector cues into crowd, DJ, commentary, camera, VFX and haptics.
// THIS IS THE TEMPORARY BROWSER HARNESS — the production client is the Unreal Engine 5 build in /unreal.

import * as THREE from 'three';
import { AI_PROFILES, AiController } from '../../shared/src/ai.ts';
import { type AtmosphereCue, AtmosphereDirector } from '../../shared/src/atmosphere.ts';
import { CommentaryEngine } from '../../shared/src/commentary.ts';
import { type Side, sideSign } from '../../shared/src/court.ts';
import { type ControlInput, type GameMode, MatchSim, NO_INPUT, type SimEvent } from '../../shared/src/match.ts';
import type { FaultReason } from '../../shared/src/rules/pickleball.ts';
import { AudioEngine } from './audio/audio.ts';
import { InputManager } from './input/input.ts';
import { type Look, type Rig, animateCharacter, createCharacter } from './scene/character.ts';
import { Crowd } from './scene/crowd.ts';
import { PALETTE } from './scene/palette.ts';
import { radialTexture } from './scene/textures.ts';
import { type Venue, buildVenue } from './scene/venue.ts';
import type { Settings } from './settings.ts';

export interface MatchConfig {
  mode: GameMode;
  autoplay?: boolean;
  seed?: number;
}

export interface MatchStats {
  longestRally: number;
  perfect: [number, number];
  aces: [number, number];
  points: number;
  durationS: number;
}

export interface GameUi {
  score(sim: MatchSim, names: [string, string]): void;
  rally(n: number): void;
  toast(text: string, tone?: 'good' | 'bad' | 'neutral'): void;
  subtitle(text: string): void;
  energy(v: number): void;
  practice(streak: number, best: number, good: number, feeds: number): void;
  results(winner: Side, names: [string, string], score: [number, number], stats: MatchStats): void;
}

const FAULT_TOAST: Record<FaultReason, string> = {
  serve_into_net: 'NET',
  serve_in_kitchen: 'SHORT — KITCHEN',
  serve_wrong_court: 'WRONG BOX',
  serve_out: 'SERVE OUT',
  net: 'NET',
  out: 'OUT',
  double_bounce: '',
  two_bounce_rule: 'TWO-BOUNCE RULE',
  kitchen_volley: 'KITCHEN!',
  double_hit: 'DOUBLE HIT',
};

const BALL_VISUAL_SCALE = 1.6; // render-only: improves readability at broadcast distance

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
  private ais: (AiController | null)[] = [null, null];
  private rigs: [Rig, Rig];
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private trail: THREE.Mesh[] = [];
  private trailPos: THREE.Vector3[] = [];
  private machine: THREE.Group;
  private confetti: THREE.InstancedMesh;
  private confettiState: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3 }[] = [];
  private confettiTime = 0;
  private sparkles: THREE.Mesh;
  private sparkleTime = 0;
  private clock = new THREE.Clock();
  private cameraMode: 'menu' | 'broadcast' | 'celebrate' | 'sweep' | 'tension' = 'menu';
  private cameraModeTime = 0;
  private shake = 0;
  private menuAngle = 0;
  private camTarget = new THREE.Vector3();
  private camLook = new THREE.Vector3(0, 0, -1);
  private names: [string, string] = ['You', 'Rival'];
  private stats: MatchStats = { longestRally: 0, perfect: [0, 0], aces: [0, 0], points: 0, durationS: 0 };
  private resultTimer = -1;
  private winner: Side | null = null;
  paused = false;
  /** QA-only: simulation steps per rendered frame (set via ?speed=N). */
  timeScale = 1;
  settings: Settings;
  ui: GameUi | null = null;
  onFrame: (() => void) | null = null;

  constructor(container: HTMLElement, settings: Settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    this.camera.position.set(0, 12, 24);

    this.audio = new AudioEngine();
    const tmpSim = new MatchSim();
    this.venue = buildVenue(this.scene, tmpSim.court);
    this.crowd = new Crowd(this.venue.seats, 1);
    this.scene.add(this.crowd.group);

    const shadowTex = radialTexture('rgba(40,20,10,0.5)');
    const looks: [Look, Look] = [
      { skin: 0xe8b38f, hair: 0x2b1d14, shirt: PALETTE.coral, shorts: PALETTE.cream, shoes: 0xffffff, paddle: PALETTE.cobalt, hairStyle: 'cap' },
      { skin: 0x7a4f33, hair: 0x1b1b1b, shirt: PALETTE.cobalt, shorts: PALETTE.cream, shoes: 0xffffff, paddle: PALETTE.gold, hairStyle: 'ponytail' },
    ];
    this.rigs = [createCharacter(looks[0], shadowTex), createCharacter(looks[1], shadowTex)];
    for (const r of this.rigs) this.scene.add(r.root);

    // DJ character in the booth.
    const dj = createCharacter({ skin: 0xc98e66, hair: 0xd9b26a, shirt: PALETTE.lavender, shorts: PALETTE.ink, shoes: PALETTE.cream, paddle: PALETTE.ink, hairStyle: 'bun' }, shadowTex);
    dj.paddle.visible = false;
    dj.root.position.copy(this.venue.djAnchor);
    dj.root.rotation.y = Math.PI; // facing the court
    this.scene.add(dj.root);
    this.djRig = dj;

    // Ball + contact shadow + motion ghosts (cf. the reference's readable ball trail).
    const r = tmpSim.physics.ballRadius * BALL_VISUAL_SCALE;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({ color: PALETTE.ball, emissive: 0x6b7a00, emissiveIntensity: 0.35, roughness: 0.5 }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(20,10,5,0.6)'), transparent: true, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(r * (0.9 - i * 0.05), 10, 8), new THREE.MeshBasicMaterial({ color: PALETTE.ball, transparent: true, opacity: 0.35 - i * 0.03, depthWrite: false }));
      this.trail.push(g);
      this.scene.add(g);
    }

    // Practice ball machine.
    this.machine = new THREE.Group();
    const mBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: PALETTE.cobalt, roughness: 0.5 }));
    mBody.position.y = 0.35;
    mBody.castShadow = true;
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.4, 16, 1, true), new THREE.MeshStandardMaterial({ color: PALETTE.cream, side: THREE.DoubleSide }));
    hopper.position.y = 0.9;
    this.machine.add(mBody, hopper);
    this.machine.position.set(0, 0, -tmpSim.court.halfLength - 0.6);
    this.machine.visible = false;
    this.scene.add(this.machine);

    // Confetti + sparkle VFX.
    const confettiColors = [PALETTE.coral, PALETTE.gold, PALETTE.cream, PALETTE.lavender, PALETTE.cobalt];
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.14), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 }), 500);
    const col = new THREE.Color();
    for (let i = 0; i < 500; i++) {
      this.confetti.setColorAt(i, col.setHex(confettiColors[i % confettiColors.length]));
      this.confettiState.push({ p: new THREE.Vector3(0, -10, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() });
    }
    this.confetti.visible = false;
    this.scene.add(this.confetti);
    this.sparkles = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.22, 24), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.scene.add(this.sparkles);

    this.applySettings(settings);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private djRig: Rig;

  applySettings(s: Settings): void {
    this.settings = s;
    const pr = s.graphics === 'low' ? 1 : s.graphics === 'medium' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = s.graphics !== 'low';
    this.venue.sun.shadow.mapSize.setScalar(s.graphics === 'high' ? 2048 : 1024);
    this.venue.sun.shadow.map?.dispose();
    (this.venue.sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    const density = s.graphics === 'low' ? 0.4 : s.graphics === 'medium' ? 0.7 : 1;
    this.scene.remove(this.crowd.group);
    this.crowd = new Crowd(this.venue.seats, density);
    this.scene.add(this.crowd.group);
    this.audio.setVolumes({ master: s.master, music: s.music, crowd: s.crowd, sfx: s.sfx });
    this.resize();
  }

  resize(): void {
    const w = this.renderer.domElement.parentElement?.clientWidth ?? innerWidth;
    const h = this.renderer.domElement.parentElement?.clientHeight ?? innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep the whole court in view on tall/portrait screens.
    this.camera.fov = w / h < 1 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- session control

  async startMatch(cfg: MatchConfig): Promise<void> {
    // Never block gameplay on audio: resume() only resolves after a user gesture in some browsers.
    void this.audio.resume().catch(() => {});
    this.audio.startMusic();
    const s = this.settings;
    const opponent = { easy: 'Coco', medium: 'Rafa', hard: 'Ines' }[s.difficulty];
    this.names = cfg.mode === 'practice' ? [s.playerName, 'Ball machine'] : [s.playerName, opponent];
    const humanAssist = s.assist;
    this.sim = new MatchSim({
      mode: cfg.mode,
      assist: [cfg.autoplay ? 'classic' : humanAssist, 'classic'],
      pointsToWin: s.pointsToWin,
      seed: cfg.seed ?? Math.floor(Math.random() * 1e9),
      names: this.names,
    });
    this.ais = [cfg.autoplay ? new AiController(0, AI_PROFILES.medium, 17) : null, cfg.mode === 'match' ? new AiController(1, AI_PROFILES[s.difficulty], 23) : null];
    this.director = new AtmosphereDirector({ names: this.names, pointsToWin: s.pointsToWin }, new CommentaryEngine({ seed: cfg.seed ?? Date.now() }));
    this.director.on((c) => this.onCue(c));
    this.stats = { longestRally: 0, perfect: [0, 0], aces: [0, 0], points: 0, durationS: 0 };
    this.winner = null;
    this.resultTimer = -1;
    this.paused = false;
    this.input.enabled = !cfg.autoplay;
    this.machine.visible = cfg.mode === 'practice';
    this.rigs[1].root.visible = cfg.mode === 'match';
    this.cameraMode = 'broadcast';
    this.cameraModeTime = 0;
    for (const e of this.sim.drainEvents()) this.director.handle(e);
    this.ui?.score(this.sim, this.names);
    this.ui?.rally(0);
  }

  exitToMenu(): void {
    this.sim = null;
    this.director = null;
    this.paused = false;
    this.cameraMode = 'menu';
    this.machine.visible = false;
    this.rigs[1].root.visible = true;
    window.speechSynthesis?.cancel();
  }

  // ---------------------------------------------------------------- frame

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const beat = this.audio.beatPhase();
    const sim = this.sim;

    if (sim && !this.paused) {
      const human: ControlInput = this.input.poll();
      const inputs: [ControlInput, ControlInput] = [
        this.ais[0] ? this.ais[0].think(sim, dt) : human,
        this.ais[1] ? this.ais[1].think(sim, dt) : NO_INPUT,
      ];
      for (let i = 0; i < this.timeScale; i++) {
        const step: [ControlInput, ControlInput] = i === 0 ? inputs : [this.ais[0] ? this.ais[0].think(sim, dt) : { ...human, swing: null }, this.ais[1] ? this.ais[1].think(sim, dt) : NO_INPUT];
        sim.update(dt, step);
        this.stats.durationS += dt;
        for (const e of sim.drainEvents()) this.onSimEvent(e);
        this.director?.tick(dt);
      }
      if (this.resultTimer > 0) {
        this.resultTimer -= dt;
        if (this.resultTimer <= 0 && this.winner !== null) this.ui?.results(this.winner, this.names, sim.rules.state.score, this.stats);
      }
    } else if (!sim) {
      // Menu: let the demo AIs idle in their stances.
      this.input.poll();
    }

    this.syncScene(dt, beat);
    this.updateCamera(dt);
    this.audio.setSpatial(this.venue.djAnchor, this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
  }

  private onSimEvent(e: SimEvent): void {
    const sim = this.sim!;
    this.director?.handle(e);
    const panOf = (x: number) => x / 6;
    switch (e.type) {
      case 'contact':
        this.audio.paddle(e.speed, e.perfect, panOf(sim.ball.p.x));
        if (e.perfect) {
          this.stats.perfect[e.side]++;
          if (this.settings.cameraShake && !this.settings.reducedMotion) this.shake = 0.12;
        }
        break;
      case 'ball_bounce':
        this.audio.bounce(e.speed, panOf(e.p.x));
        break;
      case 'net_touch':
      case 'net_cord':
        this.audio.net();
        break;
      case 'hit':
        this.ui?.rally(e.hitCount);
        break;
      case 'serve':
        this.ui?.rally(1);
        break;
      case 'fault': {
        const t = FAULT_TOAST[e.reason];
        if (t) this.ui?.toast(t, e.side === 0 ? 'bad' : 'good');
        break;
      }
      case 'point':
        this.stats.points++;
        this.stats.longestRally = Math.max(this.stats.longestRally, e.rallyLength);
        if (e.ace) {
          this.stats.aces[e.server]++;
          this.ui?.toast('ACE', e.server === 0 ? 'good' : 'bad');
        } else if (e.reason === 'double_bounce') {
          this.ui?.toast(e.rallyWinner === 0 ? 'POINT' : 'MISSED', e.rallyWinner === 0 ? 'good' : 'bad');
        }
        this.ui?.score(sim, this.names);
        break;
      case 'point_reset':
        this.ui?.score(sim, this.names);
        this.ui?.rally(0);
        break;
      case 'game_over':
        this.winner = e.winner;
        this.resultTimer = 4.5;
        this.ui?.score(sim, this.names);
        break;
      case 'practice_result':
        this.ui?.practice(e.streak, e.best, sim.practice.good, sim.practice.feeds);
        this.ui?.toast(e.good ? 'GOOD' : 'MISS', e.good ? 'good' : 'bad');
        break;
      default:
        break;
    }
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
        if (this.settings.voice && 'speechSynthesis' in window) {
          // Temporary voice: the browser's built-in TTS. Replaced by recorded VO in Unreal.
          const u = new SpeechSynthesisUtterance(c.line.text);
          u.rate = 1.05;
          u.pitch = 1;
          u.volume = Math.min(1, this.settings.master * 1.1);
          if (c.line.priority >= 7) speechSynthesis.cancel();
          speechSynthesis.speak(u);
        }
        break;
      case 'camera':
        if (c.action === 'celebrate') this.setCamera('celebrate');
        else if (c.action === 'point_sweep') this.setCamera('sweep');
        else if (c.action === 'tension_push') this.setCamera('tension');
        else this.setCamera('broadcast');
        break;
      case 'vfx':
        if (c.effect === 'confetti') this.burstConfetti();
        if (c.effect === 'sparkle') this.sparkleTime = 0.35;
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
    }
  }

  private setCamera(mode: Game['cameraMode']): void {
    if (this.settings.reducedMotion && mode !== 'broadcast' && mode !== 'menu') mode = 'broadcast';
    if (this.cameraMode === 'celebrate' && mode !== 'menu') return;
    this.cameraMode = mode;
    this.cameraModeTime = 0;
  }

  private burstConfetti(): void {
    if (this.settings.reducedMotion) return;
    this.confetti.visible = true;
    this.confettiTime = 7;
    for (const c of this.confettiState) {
      c.p.set((Math.random() - 0.5) * 6, 5 + Math.random() * 2, (Math.random() - 0.5) * 8);
      c.v.set((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6);
      c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.w.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    }
  }

  private syncScene(dt: number, beat: number): void {
    const sim = this.sim;
    const reduced = this.settings.reducedMotion;
    if (sim) {
      for (const side of [0, 1] as Side[]) {
        animateCharacter(this.rigs[side], sim.players[side], side === 0 ? 0 : Math.PI, dt, beat, reduced);
      }
      const bp = sim.ball.p;
      const hidden = bp.y < -1 || (sim.mode === 'practice' && sim.ballHeld);
      this.ball.visible = !hidden;
      this.ball.position.set(bp.x, Math.max(bp.y, sim.physics.ballRadius * BALL_VISUAL_SCALE), bp.z);
      this.ballShadow.visible = !hidden;
      this.ballShadow.position.set(bp.x, 0.02, bp.z);
      const sh = Math.max(0.3, 1 - bp.y * 0.25);
      this.ballShadow.scale.setScalar(sh);
      // Ghost trail.
      if (!sim.ballHeld) this.trailPos.unshift(this.ball.position.clone());
      else this.trailPos.length = 0;
      if (this.trailPos.length > this.trail.length * 2) this.trailPos.length = this.trail.length * 2;
      this.trail.forEach((g, i) => {
        const p = this.trailPos[(i + 1) * 2];
        g.visible = !!p && !reduced && !hidden;
        if (p) g.position.copy(p);
      });
    } else {
      // Menu diorama: two players rallying in place (no ball).
      const t = performance.now() / 1000;
      const fake = (side: Side) => ({
        side,
        pos: { x: Math.sin(t * 0.6 + side) * 1.2, y: 0, z: sideSign(side) * 5.2 },
        vel: { x: Math.cos(t * 0.6 + side) * 0.7, y: 0, z: 0 },
        swingAnim: ((t * 0.5 + side * 0.5) % 1) < 0.35 ? ((t * 0.5 + side * 0.5) % 1) / 0.35 : 0,
        stroke: 'forehand' as const,
        anim: 'ready' as const,
      });
      for (const side of [0, 1] as Side[]) animateCharacter(this.rigs[side], fake(side) as never, side === 0 ? 0 : Math.PI, dt, beat, reduced);
      this.ball.visible = false;
      this.ballShadow.visible = false;
      this.trail.forEach((g) => (g.visible = false));
    }

    // DJ grooves on the beat; booth lights pulse.
    const dj = this.djRig;
    const pulse = Math.pow(1 - beat, 3);
    dj.body.position.y = pulse * (reduced ? 0.02 : 0.08);
    dj.head.rotation.x = pulse * 0.2;
    dj.armR.rotation.x = 1.1 + Math.sin(performance.now() / 300) * 0.2;
    dj.armL.rotation.x = 1.0 + pulse * 0.4;
    this.venue.djLights.forEach((m, i) => {
      (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + (i % 2 === Math.floor(performance.now() / 492) % 2 ? pulse * 2.5 : 0.2);
    });
    this.venue.djBooth.children.forEach((c) => {
      if (c.name === 'platter') c.rotation.y += dt * 3.5;
      if (c.name === 'cone') c.scale.setScalar(1 + pulse * 0.08);
    });
    (this.venue.stringLights.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.3 + pulse * 0.4;

    this.crowd.update(dt, beat, reduced);

    // Confetti.
    if (this.confettiTime > 0) {
      this.confettiTime -= dt;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      this.confettiState.forEach((c, i) => {
        c.v.y -= 2.2 * dt;
        c.v.multiplyScalar(1 - 0.9 * dt);
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < 0.02) {
          c.p.y = 0.02;
          c.v.set(0, 0, 0);
        } else {
          c.r.x += c.w.x * dt;
          c.r.y += c.w.y * dt;
        }
        m.compose(c.p, q.setFromEuler(c.r), one);
        this.confetti.setMatrixAt(i, m);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
      if (this.confettiTime <= 0) this.confetti.visible = false;
    }
    if (this.sparkleTime > 0 && sim) {
      this.sparkleTime -= dt;
      const k = 1 - this.sparkleTime / 0.35;
      this.sparkles.position.copy(this.ball.position);
      this.sparkles.lookAt(this.camera.position);
      this.sparkles.scale.setScalar(1 + k * 3);
      (this.sparkles.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    } else (this.sparkles.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  private updateCamera(dt: number): void {
    this.cameraModeTime += dt;
    const sim = this.sim;
    const cam = this.camera;
    const pos = this.camTarget;
    const look = new THREE.Vector3();
    const portrait = cam.aspect < 1;
    switch (this.cameraMode) {
      case 'menu': {
        this.menuAngle += dt * (this.settings.reducedMotion ? 0.02 : 0.06);
        const a = this.menuAngle;
        pos.set(Math.sin(a) * 19, 8.5, Math.cos(a) * 19);
        look.set(0, 1.2, 0);
        break;
      }
      case 'celebrate': {
        const w = sim ? sim.players[this.winner ?? 0].pos : { x: 0, z: 0 };
        // Start in front of the winner (net side) and orbit slowly — never fly through them.
        const a = this.cameraModeTime * (this.settings.reducedMotion ? 0.05 : 0.3);
        const front = w.z >= 0 ? -1 : 1;
        pos.set(w.x + Math.sin(a) * 6, 2.8, w.z + Math.cos(a) * 6 * front);
        look.set(w.x, 1.1, w.z);
        break;
      }
      default: {
        // Elevated broadcast view from behind the near baseline (cf. the reference composition).
        const bx = sim ? sim.ball.p.x : 0;
        const push = this.cameraMode === 'tension' ? 0.9 : 1;
        const sweep = this.cameraMode === 'sweep' && this.cameraModeTime < 2 ? Math.sin((this.cameraModeTime / 2) * Math.PI) * 1.2 : 0;
        if (this.cameraMode === 'sweep' && this.cameraModeTime >= 2) this.cameraMode = 'broadcast';
        const height = portrait ? 15 : 10.5;
        const dist = portrait ? 15.5 : 14.5;
        pos.set(bx * 0.18 + sweep, height * push, dist * push);
        look.set(bx * 0.12, 0, portrait ? -0.3 : -0.9);
      }
    }
    const k = 1 - Math.exp(-(this.cameraMode === 'menu' ? 2 : 4) * dt);
    cam.position.lerp(pos, k);
    this.camLook.lerp(look, k);
    if (this.shake > 0) {
      this.shake -= dt;
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    cam.lookAt(this.camLook);
  }
}
