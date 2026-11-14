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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { type Look, type Rig, animateCharacter, createCharacter, poseCrouch, poseSeated } from './scene/character.ts';
import { Crowd, type CrowdOptions } from './scene/crowd.ts';
import { type LawnExtras, type Official, buildMembersLawn } from './scene/membersLawn.ts';
import { PALETTE, ROYAL, SUMMER_OUTFITS } from './scene/palette.ts';
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
  /** Wall-clock time (ms) at which to show the results screen; -1 = none. */
  private resultAt = -1;
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
    const regal = settings.venue !== 'rooftop';
    if (regal) {
      const v = buildMembersLawn(this.scene, tmpSim.court);
      this.venue = v;
      this.lawn = v.extras;
      this.crowdOpts = { outfits: SUMMER_OUTFITS, hatChance: 0.32, memberOutfits: [ROYAL.navy, ROYAL.navy, 0x2b3a2f, ROYAL.claret, 0xf5efe1, 0xffffff] };
    } else {
      this.venue = buildVenue(this.scene, tmpSim.court);
    }
    // Image-based lighting: soft reflections on paddles, rails, brass and skin.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = regal ? 0.35 : 0.25;
    this.crowd = new Crowd(this.venue.seats, 1, this.crowdOpts);
    this.scene.add(this.crowd.group);

    const shadowTex = radialTexture('rgba(40,20,10,0.5)');
    // Championship whites on the lawn (claret / navy trims tell the players apart); club colours on the rooftop.
    const looks: [Look, Look] = regal
      ? [
          { skin: 0xe8b38f, hair: 0x5a3a22, shirt: 0xffffff, shorts: 0xffffff, shoes: 0xffffff, paddle: ROYAL.claret, hairStyle: 'visor', trim: ROYAL.claret },
          { skin: 0x7a4f33, hair: 0x1b1b1b, shirt: 0xffffff, shorts: 0xffffff, shoes: 0xffffff, paddle: ROYAL.navy, hairStyle: 'ponytail', trim: ROYAL.navy },
        ]
      : [
          { skin: 0xe8b38f, hair: 0x2b1d14, shirt: PALETTE.coral, shorts: PALETTE.cream, shoes: 0xffffff, paddle: PALETTE.cobalt, hairStyle: 'cap' },
          { skin: 0x7a4f33, hair: 0x1b1b1b, shirt: PALETTE.cobalt, shorts: PALETTE.cream, shoes: 0xffffff, paddle: PALETTE.gold, hairStyle: 'ponytail' },
        ];
    this.rigs = [createCharacter(looks[0], shadowTex), createCharacter(looks[1], shadowTex)];
    for (const r of this.rigs) this.scene.add(r.root);

    // DJ character in the booth.
    const dj = createCharacter(
      regal
        ? { skin: 0xc98e66, hair: 0x2b1d14, shirt: 0xf5efe1, shorts: ROYAL.navy, shoes: 0x3b2a1e, paddle: PALETTE.ink, hairStyle: 'short', trousers: ROYAL.navy, trim: ROYAL.gold }
        : { skin: 0xc98e66, hair: 0xd9b26a, shirt: PALETTE.lavender, shorts: PALETTE.ink, shoes: PALETTE.cream, paddle: PALETTE.ink, hairStyle: 'bun' },
      shadowTex,
    );
    dj.paddle.visible = false;
    dj.root.position.copy(this.venue.djAnchor);
    dj.root.rotation.y = this.venue.djYaw ?? Math.PI; // facing the court

    // Officials and ball crew (Members' Lawn).
    for (const o of this.lawn?.officials ?? []) {
      const look: Look =
        o.kind === 'ballkid'
          ? { skin: [0xf6d3b3, 0xa4704b, 0xe8b38f, 0x5a3825][this.officials.length % 4], hair: 0x2b1d14, shirt: ROYAL.bottle, shorts: ROYAL.bottle, shoes: 0xffffff, paddle: 0, hairStyle: 'short', trim: ROYAL.gold }
          : { skin: [0xe8b38f, 0xc98e66, 0x7a4f33, 0xf6d3b3, 0xa4704b][this.officials.length % 5], hair: 0x9a9a9a, shirt: ROYAL.navy, shorts: 0xe9e2cf, shoes: 0x3b2a1e, paddle: 0, hairStyle: 'panama', trim: ROYAL.claret, trousers: 0xe9e2cf };
      const rig = createCharacter(look, shadowTex);
      rig.paddle.visible = false;
      rig.root.position.copy(o.pos);
      rig.root.rotation.y = o.yaw;
      this.scene.add(rig.root);
      this.officials.push({ o, rig });
    }
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
    const confettiColors = regal ? [ROYAL.gold, ROYAL.ivory, ROYAL.claret, 0xffffff, ROYAL.bottle] : [PALETTE.coral, PALETTE.gold, PALETTE.cream, PALETTE.lavender, PALETTE.cobalt];
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

    // Post-processing: ground-truth ambient occlusion, gentle bloom on highlights, SMAA, tone-mapped output.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 12 });
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass(1, 1);
    this.composer.addPass(this.smaa);

    this.applySettings(settings);
    // Real CC0 assets (HDRI sky, PBR materials, garden models) on Medium/High.
    if (this.lawn && settings.graphics !== 'low') {
      void this.lawn.enhance(this.renderer, this.scene).then(() => {
        this.assetsReady = true;
        this.onAssetsReady?.();
      });
    } else this.assetsReady = true;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private djRig: Rig;
  private lawn: LawnExtras | null = null;
  private officials: { o: Official; rig: Rig }[] = [];
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private smaa: SMAAPass | null = null;
  private crowdOpts: CrowdOptions = {};
  /** True once optional CC0 assets have finished loading (or were skipped). */
  assetsReady = false;
  onAssetsReady: (() => void) | null = null;

  applySettings(s: Settings): void {
    this.settings = s;
    const pr = s.graphics === 'low' ? 1 : s.graphics === 'medium' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = true; // shadows on every preset; Low just uses a smaller map
    this.renderer.shadowMap.needsUpdate = true;
    this.venue.sun.shadow.mapSize.setScalar(s.graphics === 'high' ? 4096 : s.graphics === 'medium' ? 2048 : 1024);
    if (this.gtao) this.gtao.enabled = s.graphics === 'high';
    if (this.bloom) this.bloom.enabled = s.graphics !== 'low';
    this.venue.sun.shadow.map?.dispose();
    (this.venue.sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    const density = s.graphics === 'low' ? 0.4 : s.graphics === 'medium' ? 0.7 : 1;
    this.scene.remove(this.crowd.group);
    this.crowd = new Crowd(this.venue.seats, density, this.crowdOpts);
    this.scene.add(this.crowd.group);
    this.audio.setVolumes({ master: s.master, music: s.music, crowd: s.crowd, sfx: s.sfx });
    this.resize();
  }

  resize(): void {
    const w = this.renderer.domElement.parentElement?.clientWidth ?? innerWidth;
    const h = this.renderer.domElement.parentElement?.clientHeight ?? innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
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
    this.resultAt = -1;
    this.paused = false;
    this.input.enabled = !cfg.autoplay;
    this.machine.visible = cfg.mode === 'practice';
    this.rigs[1].root.visible = cfg.mode === 'match';
    this.cameraMode = 'broadcast';
    this.cameraModeTime = 0;
    for (const e of this.sim.drainEvents()) this.director.handle(e);
    this.updateBoard();
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
      // Wall-clock delay so slow devices (clamped frame dt) don't wait longer than 4.5 s for the results.
      if (this.resultAt > 0 && performance.now() >= this.resultAt) {
        this.resultAt = -1;
        if (this.winner !== null) this.ui?.results(this.winner, this.names, sim.rules.state.score, this.stats);
      }
    } else if (!sim) {
      // Menu: let the demo AIs idle in their stances.
      this.input.poll();
    }

    this.syncScene(dt, beat);
    this.updateCamera(dt);
    this.audio.setSpatial(this.venue.djAnchor, this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
    // Low preset renders directly (no post) for weak GPUs and automated tests.
    if (this.composer && this.settings.graphics !== 'low') this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
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
        this.umpireCall(e);
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
        this.updateBoard();
        this.ui?.score(sim, this.names);
        this.ui?.rally(0);
        break;
      case 'game_over':
        this.updateBoard();
        this.winner = e.winner;
        this.resultAt = performance.now() + 4500;
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

  private updateBoard(): void {
    const sim = this.sim;
    if (!sim || !this.lawn) return;
    const st = sim.rules.state;
    const call = st.phase === 'game_over' ? `Game · ${this.names[st.winner ?? 0]}` : sim.mode === 'practice' ? 'Practice session' : `Score ${sim.rules.scoreCall()}`;
    this.lawn.setScoreboard(this.names, [st.score[0], st.score[1]], sim.mode === 'match' ? st.server : -1, call);
  }

  /** Chair umpire: line calls and the score, in a crisp, restrained voice (temporary TTS). */
  private umpireCall(e: Extract<SimEvent, { type: 'point' }>): void {
    if (!this.settings.voice || !('speechSynthesis' in window) || !this.lawn) return;
    const calls: Partial<Record<FaultReason, string>> = { out: 'Out.', serve_out: 'Out.', serve_in_kitchen: 'Short.', serve_wrong_court: 'Fault.', kitchen_volley: 'Kitchen.', two_bounce_rule: 'Fault.', net: '', serve_into_net: 'Net.', double_hit: 'Fault.' };
    const call = calls[e.reason];
    const sim = this.sim!;
    const score = sim.rules.state.phase === 'game_over' ? 'Game.' : `${sim.rules.scoreCall().replace('-', ', ')}.`;
    this.speak(`${call ? call + ' ' : ''}${score}`, 'umpire');
  }

  private voices: { umpire?: SpeechSynthesisVoice; commentary?: SpeechSynthesisVoice } | null = null;

  /** Prefer refined British voices for the umpire and commentary booth when the browser offers them. */
  private pickVoices(): void {
    const all = window.speechSynthesis?.getVoices() ?? [];
    if (!all.length) return;
    const gb = all.filter((v) => /en[-_]GB/i.test(v.lang));
    const en = all.filter((v) => /^en/i.test(v.lang));
    const pick = (re: RegExp, pool: SpeechSynthesisVoice[]) => pool.find((v) => re.test(v.name));
    this.voices = {
      commentary: pick(/Daniel|Arthur|George|UK English Male|Ryan|Oliver/i, gb) ?? gb[0] ?? en[0],
      umpire: pick(/Serena|Kate|Martha|Libby|Sonia|UK English Female/i, gb) ?? gb[1] ?? gb[0] ?? en[0],
    };
  }

  private speak(text: string, who: 'umpire' | 'commentary', interrupt = false): void {
    if (!this.voices) this.pickVoices();
    const u = new SpeechSynthesisUtterance(text);
    const v = this.voices?.[who];
    if (v) u.voice = v;
    u.rate = who === 'umpire' ? 0.92 : 1.0;
    u.pitch = who === 'umpire' ? 1.05 : 0.95;
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
        if (this.settings.voice && 'speechSynthesis' in window) {
          // Temporary voice: the browser's built-in TTS. Replaced by recorded VO in Unreal.
          this.speak(c.line.text, 'commentary', c.line.priority >= 9);
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

    // Officials: seated umpire/line judges follow the ball with their heads; ball kids crouch, ready.
    const t = performance.now() / 1000;
    const ballPos = sim ? sim.ball.p : { x: 0, y: 1, z: 0 };
    for (const { o, rig } of this.officials) {
      if (o.kind === 'ballkid') poseCrouch(rig, t + o.pos.x);
      else {
        poseSeated(rig, o.seatHeight);
        rig.armR.rotation.x = rig.armL.rotation.x = 0.9;
      }
      // Head yaw toward the ball (relative to body facing).
      const dx = ballPos.x - o.pos.x;
      const dz = ballPos.z - o.pos.z;
      const world = Math.atan2(-dx, -dz);
      let rel = world - o.yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      rig.head.rotation.y += (Math.max(-1.2, Math.min(1.2, rel)) - rig.head.rotation.y) * Math.min(1, dt * 6);
    }
    this.lawn?.tick(new Date());

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
