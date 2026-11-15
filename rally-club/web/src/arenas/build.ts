// Vital arena builder: composes one arena from its ArenaConfig using shared components. All arenas use
// the same court (collision, dimensions, rules) at the origin; only the environment changes.
//
//   environment  sky · sun/floodlight key · island (scene/island.ts) · plaza paving
//   court        surfaces (acrylic / clay / microcement) · regulation lines · net with branded padding
//   bowl         seating module per tier (bleachers / terraces / cushion steps / grandstand) · parapet
//   architecture courtyard walls · pergola · sculptures · canopy ring · ocean terrace · fire lounge
//   dj stage     illuminated shell · striped canopy · pavilion · archway · circular stage · disco
//   decor        sails · banner sails · umbrellas · cabanas · trees · hedges · flowers · bar
//   branding     configurable logo placements (branding.ts) · in-world scoreboard
//
// Static geometry is merged per material (kit.ts Batches); repeated props are instanced.

import * as THREE from 'three';
import { type Court, netHeightAt } from '../../../shared/src/court.ts';
import { ISLAND_R, buildIsland } from '../scene/island.ts';
import { Batches, M4, css, drawCrest, liveTex, merge, roundedRectSamples, roundedRectShape, std } from '../scene/kit.ts';
import { grainTex, microTex, pavingTex, plasterTex, sandTex, woodTex, worldBox } from '../scene/surfaces.ts';
import type { Venue } from '../scene/venue.ts';
import { Scoreboard, bannerTexture, courtCenterLogo, flagTexture, logoPanel, netPaddingTexture, placement, surroundDecal } from './branding.ts';
import type { ArenaConfig, TimeOfDay } from './config.ts';
import { LIGHTING } from './lighting.ts';

export interface Seat {
  pos: THREE.Vector3;
  yaw: number;
  standing: boolean;
  members?: boolean;
}

export interface ArenaExtras {
  config: ArenaConfig;
  time: TimeOfDay;
  walkPaths: THREE.Vector3[][];
  bartender: { pos: THREE.Vector3; yaw: number };
  /** Menu fly-around radius / height and the arena's outer half extents (for cameras). */
  orbit: { radius: number; height: number };
  bounds: { a: number; b: number; standTop: number };
  reflective: THREE.MeshStandardMaterial[];
  exposure: number;
  scoreboard: Scoreboard | null;
  tick(t: number, beat: number): void;
}

const PALM = 0x6f9a52;
const PALM_TRUNK = 0xb59a78;
const OLIVE = 0x9aa877;
const TRUNK = 0x8a7458;
const LEMON = 0xf2d55c;

// Surround (court apron) half extents and corner radius; regulation court sits inside.
const SA = 6.4;
const SB = 10.6;
const SR = 2.6;

export function buildArena(scene: THREE.Scene, court: Court, cfg: ArenaConfig, time: TimeOfDay = cfg.lighting.default): Venue & { extras: ArenaExtras } {
  const P = cfg.palette;
  const L = LIGHTING[time];
  const root = new THREE.Group();
  root.name = `arena-${cfg.id}`;
  scene.add(root);
  const B = new Batches();
  const reflective: THREE.MeshStandardMaterial[] = [];
  let seed = 11 + cfg.id.length * 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const G = L.glow;

  const mat = {
    stone: std(P.stone, { roughness: 0.92, map: plasterTex(2.5) }),
    stoneShade: std(new THREE.Color(P.stone).multiplyScalar(0.94).getHex(), { roughness: 0.95, map: plasterTex(2.5) }),
    travertine: std(P.stone, { roughness: 0.85, map: pavingTex(1.2) }),
    paving: std(P.paving, { roughness: 0.92, map: cfg.surfaces.paving === 'wood' ? woodTex(1.4) : pavingTex(cfg.surfaces.paving === 'terrazzo' ? 1.0 : 1.8) }),
    wood: std(0xc8a37a, { roughness: 0.7, map: woodTex(1.2) }),
    dark: std(0x2b2a2e, { roughness: 0.45 }),
    white: std(0xfbf8f3, { roughness: 0.55 }),
    accent: std(P.accent, { roughness: 0.6 }),
    fabric: std(0xfbf7f0, { roughness: 0.9, side: THREE.DoubleSide }),
    metal: std(0xeae6de, { roughness: 0.35, metalness: 0.5 }),
    glow: new THREE.MeshStandardMaterial({ color: P.glow, emissive: P.glow, emissiveIntensity: G * (cfg.bowl.illuminated ? 1.3 : 0.8), roughness: 0.4 }),
    leaf: std(0x6f9452, { roughness: 1 }),
    pot: std(0xf3ece2, { roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xe6f2f6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
  };
  reflective.push(mat.glass);

  // ================================================================ environment
  const skyTex = liveTex(16, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    for (const [s, c] of L.stops) grd.addColorStop(s, c);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(860, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10;
  root.add(sky);
  const sunDir = new THREE.Vector3(...L.sunPos).normalize();
  const glowTex = liveTex(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, L.night ? 'rgba(240,240,255,1)' : 'rgba(255,252,235,1)');
    grd.addColorStop(0.14, L.night ? 'rgba(220,225,255,0.9)' : 'rgba(255,246,215,0.95)');
    grd.addColorStop(0.35, L.night ? 'rgba(160,170,255,0.15)' : 'rgba(255,230,180,0.25)');
    grd.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  // Moon sits low over the sea at night; the sun follows the key light by day.
  const orbDir = L.night ? new THREE.Vector3(-0.6, 0.35, -0.7).normalize() : sunDir;
  orb.position.copy(orbDir).multiplyScalar(780);
  orb.position.y = Math.max(orb.position.y, 60);
  orb.scale.setScalar(L.night ? 110 : L.dusk ? 260 : 190);
  orb.renderOrder = -9;
  root.add(orb);
  if (L.night) {
    const starPos: number[] = [];
    for (let i = 0; i < 900; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.15 + rnd() * 1.3;
      starPos.push(Math.cos(a) * Math.cos(e) * 800, Math.sin(e) * 800, Math.sin(a) * Math.cos(e) * 800);
    }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    stars.renderOrder = -9;
    root.add(stars);
  }
  scene.background = new THREE.Color(L.stops[1][1]);
  scene.fog = new THREE.Fog(L.fog, 140, 760);
  const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiI);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  sun.position.set(...L.sunPos);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);

  const coastal = cfg.extras.includes('ocean-terrace');
  const island = buildIsland(
    root,
    { skyTop: L.stops[0][1], horizon: L.stops[2][1], sunDir: L.night ? orbDir : sunDir, sunColor: L.night ? 0xc8d0ff : L.sun, grass: cfg.planting.trees === 'palm' ? 0x9cd17c : 0xa5cf86, dusk: L.dusk, night: L.night, centerZ: coastal ? 46 : 0 },
    new THREE.Color(L.fog),
    rnd,
  );
  const plaza = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(SA + 13, SB + 14, SR + 10), 12), mat.paving);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = -0.01;
  plaza.receiveShadow = true;
  root.add(plaza);

  // ================================================================ court
  const finish = (f: string) => (f === 'clay' ? { roughness: 1, map: sandTex(1.2) } : f === 'microcement' ? { roughness: 0.6, map: microTex(4) } : { roughness: 0.85, map: grainTex(1.5) });
  const surroundMat = std(P.surround, finish(cfg.surfaces.surround));
  const courtMat = std(P.court, finish(cfg.surfaces.court));
  const kitchenMat = std(P.kitchen, finish(cfg.surfaces.court));
  const lineMat = std(P.line, { roughness: 0.6 });
  B.add(mat.white, new THREE.ExtrudeGeometry(roundedRectShape(SA + 0.25, SB + 0.25, SR + 0.25), { depth: 0.1, bevelEnabled: false, curveSegments: 10 }), M4(0, 0.1, 0, 0, 1, Math.PI / 2), false);
  const sur = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(SA, SB, SR), 12), surroundMat);
  sur.rotation.x = -Math.PI / 2;
  sur.position.y = 0.105;
  sur.receiveShadow = true;
  root.add(sur);
  const cw = court.width;
  const cl = court.length;
  if (P.alley) B.add(std(P.alley, finish(cfg.surfaces.court)), worldBox(cw + 3.2, 0.02, cl + 0.4), M4(0, 0.112, 0), false);
  B.add(courtMat, worldBox(cw, 0.02, cl), M4(0, 0.12, 0), false);
  for (const s of [1, -1]) B.add(kitchenMat, worldBox(cw, 0.022, court.nvzDepth), M4(0, 0.123, (s * court.nvzDepth) / 2), false);
  const lw = 0.05;
  const line = (w: number, d: number, x: number, z: number) => B.add(lineMat, new THREE.BoxGeometry(w, 0.006, d), M4(x, 0.136, z), false);
  line(cw, lw, 0, cl / 2 - lw / 2);
  line(cw, lw, 0, -cl / 2 + lw / 2);
  line(lw, cl, cw / 2 - lw / 2, 0);
  line(lw, cl, -cw / 2 + lw / 2, 0);
  line(cw, lw, 0, court.nvzDepth - lw / 2);
  line(cw, lw, 0, -court.nvzDepth + lw / 2);
  const c2 = cl / 2 - court.nvzDepth;
  line(lw, c2, 0, court.nvzDepth + c2 / 2);
  line(lw, c2, 0, -court.nvzDepth - c2 / 2);
  const decal = surroundDecal(cfg, SA * 2, SB * 2, court, cfg.surfaces.surround === 'microcement');
  if (decal) root.add(decal);
  const centre = courtCenterLogo(cfg);
  if (centre) root.add(centre);

  // Net: posts with padded covers, mesh, and a branded padded band along the top.
  const span = cw / 2 + 0.3;
  const postMat = std(P.accent === 0xffffff || P.accent === 0xfbf6ec || P.accent === 0xfbf3e6 ? 0xfbf8f3 : P.accent, { roughness: 0.5 });
  for (const s of [1, -1]) {
    B.add(postMat, new THREE.CylinderGeometry(0.06, 0.07, court.netHeightPost + 0.12, 16), M4(s * span, 0.12 + (court.netHeightPost + 0.12) / 2, 0));
    B.add(postMat, new THREE.SphereGeometry(0.075, 12, 8), M4(s * span, 0.12 + court.netHeightPost + 0.14, 0));
    B.add(postMat, new THREE.CylinderGeometry(0.16, 0.18, 0.05, 18), M4(s * span, 0.145, 0));
  }
  const netTex = liveTex(64, 64, (g) => {
    g.strokeStyle = 'rgba(38,40,48,0.95)';
    g.lineWidth = 3;
    for (let i = 0; i <= 64; i += 8) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.moveTo(0, i);
      g.lineTo(64, i);
      g.stroke();
    }
  }, [span * 14, 6]);
  const netGeo = new THREE.PlaneGeometry(span * 2, 1, 24, 1);
  const np = netGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < np.count; i++) np.setY(i, np.getY(i) > 0 ? 0.08 + netHeightAt(court, np.getX(i)) : 0.16);
  np.needsUpdate = true;
  netGeo.computeVertexNormals();
  const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 }));
  net.castShadow = true;
  root.add(net);
  const padBg = css(P.accent === 0x2f5b3d ? 0xfbf8f3 : cfg.id === 'pistachio' ? 0xfbf6ec : 0x2b2a34);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(span * 2, 0.11, 0.05), new THREE.MeshStandardMaterial({ map: netPaddingTexture(cfg, padBg), roughness: 0.6 }));
  pad.position.set(0, 0.12 + court.netHeightCenter + 0.02, 0);
  pad.castShadow = true;
  root.add(pad);

  // ================================================================ seating bowl
  const seats: Seat[] = [];
  const chairs: { m: THREE.Matrix4; c: number }[] = [];
  const cushions: { m: THREE.Matrix4; c: number }[] = [];
  const planks: { m: THREE.Matrix4; c: number }[] = [];
  const glowStrips: THREE.Matrix4[] = [];
  const bougainvillea: THREE.Matrix4[] = [];
  const bougCols: number[] = [];
  const shrubs: THREE.Matrix4[] = [];
  const hydrangea: THREE.Matrix4[] = [];
  const palms: THREE.Matrix4[] = [];
  const olives: THREE.Matrix4[] = [];
  const lemons: THREE.Matrix4[] = [];
  const cypress: THREE.Matrix4[] = [];
  const pottedPalms: THREE.Matrix4[] = [];
  const topiary: THREE.Matrix4[] = [];
  const flower = (m: THREE.Matrix4) => {
    bougainvillea.push(m);
    bougCols.push(cfg.planting.flowers[Math.floor(rnd() * cfg.planting.flowers.length)]);
  };

  const circle = cfg.bowl.shape === 'circle';
  const gapFar = 3.6;
  const gapNear = 3.8;
  const d0 = 1.15;
  const rowD = cfg.bowl.seating === 'grandstand' || cfg.bowl.seating === 'bleachers' ? 0.9 : 1.0;
  const rise = cfg.bowl.seating === 'terraces' ? 0.45 : 0.4;
  const rows = cfg.bowl.rows;
  const yawOf = (nx: number, nz: number) => Math.atan2(nx, nz);
  // Bowl outline at offset d: circle → fully rounded ends (stadium oval), else the court's rounded rect.
  const outline = (d: number) => {
    const a = SA + d;
    const b = SB + d + (circle ? 1.2 : 0);
    return { a, b, r: circle ? Math.min(a, b) * 0.98 : SR + d };
  };
  const nearEnd = (z: number, b: number) => z > b - (circle ? 4.5 : 1.0);
  const farGap = (x: number, z: number, b: number) => z < -b + (circle ? 3.2 : 0.6) && Math.abs(x) < gapFar;
  const nearGap = (x: number, z: number, b: number, k: number) => nearEnd(z, b) && (k >= cfg.bowl.nearRows || Math.abs(x) < gapNear);
  const skip = (x: number, z: number, b: number, k: number) => farGap(x, z, b) || nearGap(x, z, b, k);
  const tierMat = cfg.bowl.seating === 'terraces' ? mat.travertine : null;
  const seatCol = (i: number, k: number) => {
    const S = P.seats;
    if (cfg.bowl.cushionPattern === 'solid') return S[0];
    if (cfg.bowl.cushionPattern === 'alternate') return S[(i + k) % S.length];
    return S[Math.floor(rnd() * S.length)];
  };

  for (let k = 0; k < rows; k++) {
    const d = d0 + k * rowD;
    const h = 0.3 + k * rise;
    const O = outline(d + rowD / 2);
    for (const p of roundedRectSamples(O.a, O.b, O.r, 0.5)) {
      if (skip(p.x, p.z, O.b, k)) continue;
      const yaw = yawOf(p.nx, p.nz);
      B.add(tierMat ?? (k % 2 ? mat.stone : mat.stoneShade), worldBox(0.53, h, rowD), M4(p.x, h / 2, p.z, yaw), k === rows - 1);
      if (cfg.bowl.illuminated || L.night) glowStrips.push(M4(p.x - p.nx * (rowD / 2 - 0.02), h - 0.02, p.z - p.nz * (rowD / 2 - 0.02), yaw, [0.53, 0.025, 0.03]));
    }
    const pitch = cfg.bowl.seating === 'grandstand' ? 0.62 : 0.66;
    const band = Math.floor(rnd() * 100);
    roundedRectSamples(O.a, O.b, O.r, pitch).forEach((p, i) => {
      if (skip(p.x, p.z, O.b, k)) return;
      if (Math.abs(p.z) < 0.45 && Math.abs(p.x) > SA) return; // aisles
      const yaw = yawOf(p.nx, p.nz);
      const cx = p.x + p.nx * 0.08;
      const cz = p.z + p.nz * 0.08;
      switch (cfg.bowl.seating) {
        case 'grandstand':
          chairs.push({ m: M4(cx, h, cz, yaw), c: seatCol(i, k) });
          seats.push({ pos: new THREE.Vector3(cx, h + 0.5, cz), yaw, standing: false });
          break;
        case 'bleachers': {
          // Continuous coloured bench planks; colour bands change every few seats.
          const col = P.seats[(Math.floor((i + band) / 7) + k) % P.seats.length];
          planks.push({ m: M4(cx, h + 0.36, cz, yaw, [0.68, 0.07, 0.42]), c: col });
          planks.push({ m: M4(cx, h + 0.17, cz - p.nz * 0.0, yaw, [0.62, 0.34, 0.06]), c: 0xfbf8f3 });
          seats.push({ pos: new THREE.Vector3(cx, h + 0.5, cz), yaw, standing: false });
          break;
        }
        case 'cushion-steps':
          cushions.push({ m: M4(cx, h + 0.045, cz, yaw), c: seatCol(i, k) });
          seats.push({ pos: new THREE.Vector3(cx, h + 0.15, cz), yaw, standing: false });
          break;
        default:
          seats.push({ pos: new THREE.Vector3(cx, h + 0.1, cz), yaw, standing: false });
      }
    });
  }
  const outerD = d0 + rows * rowD;
  const hTop = 0.3 + (rows - 1) * rise;
  // Parapet with planters and a glowing rim.
  const PO = outline(outerD + 0.3);
  for (const p of roundedRectSamples(PO.a, PO.b, PO.r, 0.6)) {
    if (farGap(p.x, p.z, PO.b)) continue;
    const isNear = nearEnd(p.z, PO.b);
    if (isNear && Math.abs(p.x) < gapNear) continue;
    const hh = isNear && cfg.bowl.nearRows === 0 ? 0.9 : hTop + 0.9;
    const yaw = yawOf(p.nx, p.nz);
    B.add(mat.stone, worldBox(0.64, hh, 0.6), M4(p.x, hh / 2, p.z, yaw));
    if (cfg.bowl.illuminated || L.night) glowStrips.push(M4(p.x - p.nx * 0.31, hh - 0.15, p.z - p.nz * 0.31, yaw, [0.64, 0.03, 0.03]));
    if (rnd() < 0.55) {
      for (let q = 0; q < 2; q++) flower(M4(p.x + (rnd() - 0.5) * 0.4, hh + 0.12 + rnd() * 0.35, p.z + (rnd() - 0.5) * 0.3, rnd() * 6, 0.8 + rnd() * 0.6));
      shrubs.push(M4(p.x, hh + 0.05, p.z, rnd() * 6, 0.9 + rnd() * 0.3));
    }
  }
  const OA = PO.a + 0.6;
  const OB = PO.b + 0.6;

  // ================================================================ architecture extras
  if (cfg.extras.includes('courtyard-walls')) {
    // Tall arcaded walls around the bowl (open at the near entrance).
    const WO = outline(outerD + 1.6);
    for (const p of roundedRectSamples(WO.a, WO.b, WO.r, 1.2)) {
      if (nearEnd(p.z, WO.b) && Math.abs(p.x) < gapNear + 0.5) continue;
      if (farGap(p.x, p.z, WO.b)) continue;
      const yaw = yawOf(p.nx, p.nz);
      B.add(mat.stone, worldBox(1.25, hTop + 4.6, 0.7), M4(p.x, (hTop + 4.6) / 2, p.z, yaw));
      B.add(mat.stoneShade, worldBox(1.3, 0.25, 0.85), M4(p.x, hTop + 4.7, p.z, yaw));
    }
    // Arched niches (darker recesses) on the inner face.
    const NO = outline(outerD + 1.2);
    const nicheMat = std(new THREE.Color(P.stone).multiplyScalar(0.82).getHex(), { roughness: 1 });
    roundedRectSamples(NO.a, NO.b, NO.r, 2.4).forEach((p) => {
      if (nearEnd(p.z, NO.b) && Math.abs(p.x) < gapNear + 0.5) return;
      if (farGap(p.x, p.z, NO.b)) return;
      const arch = new THREE.Shape();
      arch.moveTo(-0.55, 0);
      arch.lineTo(0.55, 0);
      arch.lineTo(0.55, 1.6);
      arch.absarc(0, 1.6, 0.55, 0, Math.PI, false);
      arch.lineTo(-0.55, 0);
      B.add(nicheMat, new THREE.ShapeGeometry(arch, 10), M4(p.x, hTop + 1.6, p.z, yawOf(p.nx, p.nz) + Math.PI), false);
    });
  }
  if (cfg.extras.includes('pergola')) {
    const PG = outline(outerD + 2.4);
    const beamMat = std(0xf3ead9, { roughness: 0.8, map: woodTex(1.4) });
    for (const p of roundedRectSamples(PG.a, PG.b, PG.r, 2.2)) {
      if (nearEnd(p.z, PG.b) && Math.abs(p.x) < gapNear + 1) continue;
      B.add(mat.stone, new THREE.CylinderGeometry(0.16, 0.19, 3.2, 12), M4(p.x, 1.6, p.z));
      B.add(beamMat, worldBox(0.18, 0.18, 2.4), M4(p.x, 3.25, p.z, yawOf(p.nx, p.nz)));
      for (let q = 0; q < 3; q++) shrubs.push(M4(p.x + (rnd() - 0.5) * 1.6, 3.4, p.z + (rnd() - 0.5) * 1.6, rnd() * 6, 0.7));
      if (rnd() < 0.5) flower(M4(p.x, 3.3, p.z, rnd() * 6, 1));
    }
  }
  if (cfg.extras.includes('canopy-ring')) {
    // Futuristic: a white roof ring floating over the stands, lit underneath.
    const CR = outline(outerD - 0.6);
    for (const p of roundedRectSamples(CR.a, CR.b, CR.r, 0.9)) {
      if (farGap(p.x, p.z, CR.b) || (nearEnd(p.z, CR.b) && Math.abs(p.x) < gapNear + 1)) continue;
      const yaw = yawOf(p.nx, p.nz);
      B.add(mat.white, worldBox(0.95, 0.16, 3.6), M4(p.x, hTop + 4.4, p.z, yaw, 1, 0.14));
      glowStrips.push(M4(p.x - p.nx * 1.75, hTop + 4.08, p.z - p.nz * 1.75, yaw, [0.95, 0.04, 0.05]));
    }
    for (const p of roundedRectSamples(CR.a + 1.6, CR.b + 1.6, CR.r + 1.6, 6)) {
      if (farGap(p.x, p.z, CR.b) || (nearEnd(p.z, CR.b) && Math.abs(p.x) < gapNear + 1)) continue;
      B.add(mat.white, new THREE.CylinderGeometry(0.12, 0.16, hTop + 4.4, 10), M4(p.x, (hTop + 4.4) / 2, p.z));
    }
  }
  if (cfg.extras.includes('sculptures')) {
    // Sculptural garden: white rings and clipped spheres / cones on the plaza.
    const ringMat = std(0xfbf8f3, { roughness: 0.35 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * (OA + 4);
      const z = Math.sin(a) * (OB + 4);
      if (z > OB && Math.abs(x) < 5) continue;
      B.add(ringMat, new THREE.TorusGeometry(1.1, 0.12, 12, 32), M4(x, 1.25, z, a));
      topiary.push(M4(x + 1.6, 0.6, z, 0, 0.6));
      topiary.push(M4(x - 1.4, 0.45, z + 0.8, 0, 0.45));
    }
  }
  if (cfg.extras.includes('fire-lounge')) {
    const sofaMat = std(0xfbf8f3, { roughness: 0.95 });
    for (const s of [-1, 1]) {
      B.add(sofaMat, new THREE.TorusGeometry(1.3, 0.32, 10, 24, Math.PI * 0.9), M4(s * 2.0, 0.35, OB + 4.6, s > 0 ? Math.PI * 0.55 : Math.PI * 0.45, 1, Math.PI / 2));
      for (let k = 0; k < 3; k++) B.add(std(P.seats[k % P.seats.length], { roughness: 1 }), new THREE.BoxGeometry(0.4, 0.4, 0.14), M4(s * 2.0 + s * Math.cos(k * 0.9 - 0.9) * 1.1, 0.75, OB + 4.6 + Math.sin(k * 0.9 - 0.9) * 1.1, k * 0.6));
    }
    B.add(std(0xd9d4cc, { roughness: 0.4, metalness: 0.3 }), new THREE.CylinderGeometry(0.55, 0.4, 0.5, 20), M4(0, 0.25, OB + 4.6));
    const fire = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa860, emissiveIntensity: 1 + G }));
    fire.position.set(0, 0.55, OB + 4.6);
    fire.scale.set(1, 0.6, 1);
    root.add(fire);
  }
  if (coastal) {
    // Glass balustrade along the open near end, looking out to the sea behind the court.
    for (let i = -6; i <= 6; i++) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), mat.glass);
      g.position.set(i * 1.55, 0.6, OB + 1.2);
      root.add(g);
      B.add(mat.metal, new THREE.BoxGeometry(0.05, 1.05, 0.05), M4(i * 1.55 - 0.77, 0.52, OB + 1.2));
    }
    B.add(mat.metal, new THREE.BoxGeometry(20.5, 0.05, 0.08), M4(0, 1.08, OB + 1.2));
  }

  // ================================================================ DJ stage (far end)
  const zb = -(outline(d0).b + 0.8);
  const lights: THREE.Mesh[] = [];
  const spinners: THREE.Object3D[] = [];
  const beams: THREE.Mesh[] = [];
  const flags: THREE.Mesh[] = [];
  const djStyle = cfg.dj.style;
  const stageY = djStyle === 'pavilion' ? 1.0 : 0.32;
  // Platform + glow ring.
  B.add(mat.white, new THREE.CylinderGeometry(2.6, 2.7, stageY, 40), M4(0, stageY / 2, zb));
  if (djStyle === 'pavilion') for (let k = 0; k < 4; k++) B.add(mat.white, worldBox(1.4, 0.2, 0.45), M4(0, 0.1 + k * 0.22, zb + 2.75 + (3 - k) * 0.3));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.025, 6, 64), mat.glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, stageY - 0.02, zb);
  root.add(ring);
  const deskY = stageY + 0.5;
  B.add(std(0xfbf8f3, { roughness: 0.4 }), new THREE.CylinderGeometry(1.35, 1.35, 1.0, 32, 1, false, -Math.PI / 2, Math.PI), M4(0, deskY, zb + 0.25));
  B.add(std(0xe9e4dc, { roughness: 0.3 }), new THREE.CylinderGeometry(1.42, 1.42, 0.06, 32, 1, false, -Math.PI / 2, Math.PI), M4(0, deskY + 0.52, zb + 0.25));
  // Turntables + mixer.
  B.add(mat.dark, new THREE.BoxGeometry(1.8, 0.07, 0.55), M4(0, deskY + 0.58, zb + 0.15));
  for (const s of [-1, 1]) {
    B.add(std(0x18181b, { roughness: 0.3 }), new THREE.CylinderGeometry(0.2, 0.2, 0.025, 28), M4(s * 0.52, deskY + 0.63, zb + 0.15));
    B.add(mat.metal, new THREE.BoxGeometry(0.03, 0.02, 0.22), M4(s * 0.52 + 0.15, deskY + 0.65, zb + 0.05, 0.4));
    const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 24), std(0x333338, { roughness: 0.2 }));
    vinyl.position.set(s * 0.52, deskY + 0.65, zb + 0.15);
    root.add(vinyl);
    spinners.push(vinyl);
  }
  B.add(std(0x2f3036, { roughness: 0.4 }), new THREE.BoxGeometry(0.34, 0.05, 0.4), M4(0, deskY + 0.64, zb + 0.15));
  const deskGlow = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.02, 6, 40, Math.PI), mat.glow);
  deskGlow.rotation.x = Math.PI / 2;
  deskGlow.position.set(0, stageY + 0.04, zb + 0.25);
  root.add(deskGlow);
  const facade = placement(cfg, 'dj-facade');
  if (facade) {
    const f = logoPanel(facade, 1.4, 0.55, null, G);
    f.position.set(0, deskY + 0.05, zb + 1.62);
    root.add(f);
  }
  // Speakers with crest plaques, potted palms either side.
  const crestTex = liveTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2b2a2e';
    g.fillRect(0, 0, w, h);
    drawCrest(g, w / 2, h / 2, w * 0.7, '#e6cf98');
  });
  for (const s of [-1, 1]) {
    B.add(mat.dark, new THREE.BoxGeometry(0.75, 1.6, 0.65), M4(s * 2.3, stageY + 0.8, zb + 0.4));
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: crestTex, roughness: 0.6 }));
    plaque.position.set(s * 2.3, stageY + 1.05, zb + 0.73);
    root.add(plaque);
    for (const y of [0.45, 0.72]) B.add(std(0x18181b, { roughness: 0.3 }), new THREE.CylinderGeometry(0.13, 0.13, 0.02, 18), M4(s * 2.3, stageY + y, zb + 0.73, 0, 1, Math.PI / 2));
    pottedPalms.push(M4(s * 3.4, 0.32, zb + 0.7, rnd() * 6, 0.75));
  }
  const dj = djStage(cfg, B, mat, root, zb, stageY, G, flower, shrubs, lights, beams, spinners, reflective, rnd, stripeTexFor);
  void dj;
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff1cc, emissive: 0xffd99a, emissiveIntensity: 0.6 + G * 0.5 }));
    m.position.set(-1.2 + k * 1.2, stageY + 2.4, zb + 0.9);
    root.add(m);
    lights.push(m);
  }

  // Arena wall signage flanking the DJ.
  const wallP = placement(cfg, 'arena-wall');
  if (wallP) {
    for (const s of [-1, 1]) {
      const wx = s * 6.6;
      const wz = -outline(outerD).b + (circle ? 3.6 : 0.4);
      B.add(mat.stone, worldBox(5.8, 2.8, 0.5), M4(wx, hTop + 1.7, wz - 0.3));
      const sign = logoPanel(wallP, 4.4 * (wallP.scale ?? 1) * 0.85, 1.8 * (wallP.scale ?? 1) * 0.85, null, G);
      sign.position.set(wx, hTop + 1.9, wz);
      root.add(sign);
    }
  }

  // ================================================================ shades, banners, flags, entrance
  function stripeTexFor(a: number, b: number) {
    return liveTex(256, 32, (g) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = css(i % 2 ? a : b);
        g.fillRect(i * 16, 0, 16, 32);
      }
    });
  }
  const umbrella = (x: number, z: number, a: number, b: number, size = 1.5) => {
    const top = new THREE.Mesh(new THREE.ConeGeometry(size, 0.55, 16, 1, true), new THREE.MeshStandardMaterial({ map: stripeTexFor(a, b), side: THREE.DoubleSide, roughness: 0.9 }));
    top.position.set(x, 2.55, z);
    top.castShadow = true;
    root.add(top);
    B.add(mat.white, new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8), M4(x, 1.25, z));
    B.add(mat.white, new THREE.CylinderGeometry(0.45, 0.45, 0.05, 18), M4(x, 0.74, z));
    B.add(mat.white, new THREE.CylinderGeometry(0.06, 0.14, 0.72, 10), M4(x, 0.36, z));
    for (const d of [-1, 1]) {
      B.add(mat.white, new THREE.BoxGeometry(0.62, 0.42, 0.62), M4(x + d * 0.85, 0.21, z));
      B.add(std(P.seats[(d + 1) % P.seats.length], { roughness: 1 }), new THREE.BoxGeometry(0.58, 0.1, 0.58), M4(x + d * 0.85, 0.47, z), false);
      seats.push({ pos: new THREE.Vector3(x + d * 0.85, 0.62, z), yaw: d > 0 ? Math.PI / 2 : -Math.PI / 2, standing: false, members: true });
    }
    B.add(std(0xf7d98a, { roughness: 0.2 }), new THREE.CylinderGeometry(0.045, 0.04, 0.16, 10), M4(x + 0.12, 0.85, z + 0.1), false);
    B.add(std(0xf2a9b8, { roughness: 0.2 }), new THREE.CylinderGeometry(0.045, 0.04, 0.16, 10), M4(x - 0.12, 0.85, z - 0.08), false);
  };
  const uiAccent = new THREE.Color(cfg.palette.ui.accent).getHex();
  if (cfg.shades.includes('umbrellas')) {
    for (const [x, z] of [
      [OA + 2.4, -3],
      [-(OA + 2.4), -3],
      [OA + 2.4, 4],
      [-(OA + 2.4), 4],
    ])
      umbrella(x, z, uiAccent, 0xfbf7f0);
  }
  if (cfg.shades.includes('sails')) {
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const cx = sx * (OA - 0.6);
      const cz = sz * (OB - 0.6);
      const p0 = new THREE.Vector3(cx + sx * 1.2, hTop + 4.2, cz + sz * 1.2);
      const p1 = new THREE.Vector3(cx - sx * 4.6, hTop + 2.8, cz + sz * 0.4);
      const p2 = new THREE.Vector3(cx + sx * 0.4, hTop + 2.6, cz - sz * 4.8);
      const g = new THREE.BufferGeometry().setFromPoints([p0, p1, p2]);
      g.computeVertexNormals();
      B.add(mat.fabric, g, undefined, true);
      for (const p of [p0, p1, p2]) B.add(mat.white, new THREE.CylinderGeometry(0.07, 0.09, p.y, 10), M4(p.x, p.y / 2, p.z));
    }
  }
  if (cfg.shades.includes('banner-sails')) {
    const bp = placement(cfg, 'banners') ?? { surface: 'banners' as const, color: '#2f5b3d' };
    for (const s of [-1, 1]) {
      const b = logoPanel({ ...bp, color: '#2f5b3d', glow: false }, 5.2, 2.6, '#fbf7f0', G);
      const pp = b.geometry.attributes.position as THREE.BufferAttribute;
      b.geometry = new THREE.PlaneGeometry(5.2, 2.6, 8, 1);
      const p2 = b.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p2.count; i++) p2.setZ(i, -Math.pow(p2.getX(i) / 2.6, 2) * 0.5);
      void pp;
      b.geometry.computeVertexNormals();
      b.position.set(s * (OA - 1.2), hTop + 3.6, -OB + 2.4);
      b.rotation.set(-0.35, s * 0.8, s * -0.15);
      b.castShadow = true;
      root.add(b);
      B.add(mat.white, new THREE.CylinderGeometry(0.08, 0.1, hTop + 5, 10), M4(s * (OA + 0.6), (hTop + 5) / 2, -OB + 0.6));
    }
  }
  if (cfg.shades.includes('cabanas')) {
    const cabTex = stripeTexFor(uiAccent, 0xfbf6f4);
    for (const sx of [1, -1]) {
      for (const z of [-4.5, 4.5]) {
        const x = sx * (OA + 2.4);
        for (const [dx, dz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          B.add(mat.white, new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), M4(x + dx * 1.1, 1.4, z + dz * 1.3));
        const roofM = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 2.9), new THREE.MeshStandardMaterial({ map: cabTex, roughness: 0.9 }));
        roofM.position.set(x, 2.85, z);
        roofM.castShadow = true;
        root.add(roofM);
        B.add(std(0xf6efe8, { roughness: 1 }), new THREE.BoxGeometry(1.8, 0.35, 0.8), M4(x + sx * 0.3, 0.3, z));
        seats.push({ pos: new THREE.Vector3(x + sx * 0.3, 0.6, z - 0.2), yaw: sx > 0 ? Math.PI / 2 : -Math.PI / 2, standing: false, members: true });
      }
    }
  }
  const bannerP = placement(cfg, 'banners');
  if (bannerP) {
    for (const s of [-1, 1]) {
      B.add(mat.white, new THREE.CylinderGeometry(0.07, 0.09, 6.4, 10), M4(s * (OA - 0.4), 3.2, OB + 0.8));
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 3.2), new THREE.MeshStandardMaterial({ map: bannerTexture(bannerP, css(cfg.palette.surround)), side: THREE.DoubleSide, roughness: 0.9 }));
      ban.position.set(s * (OA - 0.4) - s * 0.64, 4.25, OB + 0.82);
      root.add(ban);
    }
  }
  const flagP = placement(cfg, 'flags');
  if (flagP) {
    const ft = flagTexture(flagP, '#fbf8f3');
    const FO = outline(outerD + 0.3);
    roundedRectSamples(FO.a, FO.b, FO.r, 7).forEach((p) => {
      if (farGap(p.x, p.z, FO.b) || (nearEnd(p.z, FO.b) && Math.abs(p.x) < gapNear)) return;
      const top = hTop + 5.4;
      B.add(mat.white, new THREE.CylinderGeometry(0.04, 0.05, top - hTop - 0.9, 8), M4(p.x, hTop + 0.9 + (top - hTop - 0.9) / 2, p.z));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.88, 10, 1), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.9 }));
      flag.geometry.translate(0.7, 0, 0);
      flag.position.set(p.x, top - 0.5, p.z);
      flag.rotation.y = Math.atan2(p.nx, p.nz) + Math.PI / 2;
      flag.userData.phase = rnd() * 6;
      root.add(flag);
      flags.push(flag);
    });
  }
  const entP = placement(cfg, 'entrance');
  if (entP) {
    // Entrance arch at the near end, beyond the bowl opening.
    const ez = OB + (cfg.extras.includes('fire-lounge') ? 8.2 : 3.6);
    const archShape = new THREE.Shape();
    archShape.moveTo(-2.6, 0);
    archShape.lineTo(2.6, 0);
    archShape.lineTo(2.6, 4.2);
    archShape.lineTo(-2.6, 4.2);
    archShape.lineTo(-2.6, 0);
    const hole = new THREE.Path();
    hole.moveTo(-1.7, 0.001);
    hole.lineTo(1.7, 0.001);
    hole.lineTo(1.7, 2.4);
    hole.absarc(0, 2.4, 1.7, 0, Math.PI, false);
    hole.lineTo(-1.7, 0.001);
    archShape.holes.push(hole);
    B.add(mat.stone, new THREE.ExtrudeGeometry(archShape, { depth: 0.7, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, curveSegments: 18 }), M4(0, 0, ez - 0.35));
    const sign = logoPanel(entP, 2.6, 0.9, null, G);
    sign.position.set(0, 3.55, ez + 0.42);
    sign.rotation.y = Math.PI;
    root.add(sign);
    const sign2 = logoPanel(entP, 2.6, 0.9, null, G);
    sign2.position.set(0, 3.55, ez - 0.42);
    root.add(sign2);
    for (const s of [-1, 1]) pottedPalms.push(M4(s * 3.4, 0.32, ez, rnd() * 6, 0.8));
  }

  // ================================================================ scoreboard
  let scoreboard: Scoreboard | null = null;
  const sbP = placement(cfg, 'scoreboard');
  if (sbP) {
    scoreboard = new Scoreboard(sbP, cfg.palette.ui.accentDeep, G);
    const x = 5.6;
    const z = -outline(outerD).b + (circle ? 4.2 : 1.6);
    scoreboard.mesh.position.set(x, hTop + 3.1, z);
    scoreboard.mesh.rotation.y = Math.atan2(-x, -z);
    root.add(scoreboard.mesh);
  }

  // Night: floodlight masts at the four corners.
  if (L.night) {
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const x = sx * (OA + 1.4);
      const z = sz * (OB - 2);
      B.add(mat.white, new THREE.CylinderGeometry(0.14, 0.2, 13, 10), M4(x, 6.5, z));
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf6f4ff, emissiveIntensity: 2.4 }));
      head.position.set(x - sx * 0.3, 13.1, z);
      head.lookAt(0, 0, 0);
      root.add(head);
    }
  }

  // ================================================================ bar
  const bx = OA + 2.8;
  const bzz = OB - 1.5;
  B.box(mat.wood, 3.4, 1.05, 0.9, bx, 0.53, bzz);
  B.box(mat.white, 3.6, 0.07, 1.05, bx, 1.08, bzz);
  B.box(mat.white, 3.4, 2.7, 0.15, bx, 1.35, bzz + 1.35);
  const barAwning = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.08, 2.1), new THREE.MeshStandardMaterial({ map: stripeTexFor(uiAccent, 0xfbf7f0), roughness: 0.9 }));
  barAwning.position.set(bx, 2.95, bzz + 0.45);
  barAwning.rotation.x = -0.12;
  barAwning.castShadow = true;
  root.add(barAwning);
  for (const s of [-1, 1]) B.box(mat.white, 0.1, 2.9, 0.1, bx + s * 1.8, 1.45, bzz - 0.5);
  for (let k = 0; k < 8; k++) B.add(std([0xf7d98a, 0xf2a9b8, 0xb9dcb0, 0xc8b8e3][k % 4], { roughness: 0.15 }), new THREE.CylinderGeometry(0.05, 0.05, 0.26, 10), M4(bx - 1.4 + k * 0.4, 1.3, bzz + 1.2), false);
  for (let k = 0; k < 5; k++) B.add(std(LEMON, { roughness: 0.6 }), new THREE.SphereGeometry(0.07, 8, 6), M4(bx - 0.5 + k * 0.15, 1.18, bzz - 0.2), false);
  B.add(std(0xe8b06a, { roughness: 0.8 }), new THREE.BoxGeometry(0.5, 0.06, 0.3), M4(bx + 0.9, 1.15, bzz - 0.15), false);
  for (const s of [-1, 1]) B.add(mat.wood, new THREE.CylinderGeometry(0.2, 0.2, 0.75, 12), M4(bx + s * 1.0, 0.38, bzz - 1.05));

  // ================================================================ planting
  const treeList = cfg.planting.trees === 'palm' ? palms : olives;
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) treeList.push(M4(s * (5.6 + k * 2.2), 0, zb - 3.0 - k * 0.8, rnd() * 6, 0.9 + rnd() * 0.3));
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rnd() * 0.1;
    const x = Math.cos(a) * Math.min(OA + 6 + rnd() * 14, ISLAND_R - 6);
    const z = Math.sin(a) * Math.min(OB + 6 + rnd() * 14, ISLAND_R - 6) + (coastal && Math.sin(a) > 0 ? 0 : 0);
    if (coastal && z < -(OB + 4) && Math.abs(x) < 20) continue; // keep the sea view clear
    const list = cfg.planting.trees === 'palm' ? (i % 4 === 0 ? olives : palms) : cfg.planting.trees === 'lemon' ? (i % 3 === 0 ? cypress : olives) : i % 3 === 0 ? cypress : olives;
    const m = M4(x, 0, z, rnd() * 6, 0.9 + rnd() * 0.5);
    list.push(m);
    if (cfg.planting.trees === 'lemon' && list === olives) for (let q = 0; q < 8; q++) lemons.push(M4(x + (rnd() - 0.5) * 2.6, 2.2 + rnd() * 1.4, z + (rnd() - 0.5) * 2.6, 0, 1));
  }
  if (cfg.extras.includes('lemon-trees')) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      const x = Math.cos(a) * (OA + 3.6);
      const z = Math.sin(a) * (OB + 3.6);
      if (z > OB && Math.abs(x) < 5) continue;
      B.add(mat.pot, new THREE.CylinderGeometry(0.55, 0.42, 0.8, 16), M4(x, 0.4, z));
      olives.push(M4(x, 0.5, z, rnd() * 6, 0.55));
      for (let q = 0; q < 9; q++) lemons.push(M4(x + (rnd() - 0.5) * 1.5, 1.9 + rnd() * 0.8, z + (rnd() - 0.5) * 1.5, 0, 1));
    }
  }
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * (OA + 3.5 + rnd() * 3);
    const z = Math.sin(a) * (OB + 3.5 + rnd() * 3);
    if (z > OB && Math.abs(x) < 5) continue;
    if (cfg.planting.hedges === 'sculptural' && i % 3 === 0) topiary.push(M4(x, 0.55, z, 0, 0.55 + rnd() * 0.3));
    else shrubs.push(M4(x, 0.3, z, rnd() * 6, 1.1 + rnd() * 0.8));
    if (rnd() < 0.6) flower(M4(x, 0.7 + rnd() * 0.5, z, rnd() * 6, 1 + rnd()));
  }
  if (cfg.planting.hedges === 'clipped') {
    const HO = outline(outerD + 1.1);
    for (const p of roundedRectSamples(HO.a, HO.b, HO.r, 1.1)) {
      if (farGap(p.x, p.z, HO.b) || (nearEnd(p.z, HO.b) && Math.abs(p.x) < gapNear + 0.4)) continue;
      B.add(mat.leaf, worldBox(1.15, 0.9, 0.7), M4(p.x, 0.45, p.z, yawOf(p.nx, p.nz)));
    }
  }

  // ================================================================ instancing
  const inst = (geo: THREE.BufferGeometry, m: THREE.Material, list: THREE.Matrix4[], cast = true, colors?: number[]) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, m, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    if (colors) {
      const c = new THREE.Color();
      colors.forEach((h, i) => im.setColorAt(i, c.setHex(h)));
    }
    im.castShadow = cast;
    im.receiveShadow = true;
    root.add(im);
    return im;
  };
  const chairGeo = merge([
    new THREE.BoxGeometry(0.48, 0.09, 0.44).translate(0, 0.44, 0),
    new THREE.BoxGeometry(0.48, 0.42, 0.07).translate(0, 0.7, 0.22),
    new THREE.CylinderGeometry(0.22, 0.22, 0.07, 14).scale(1.1, 1, 0.3).translate(0, 0.92, 0.24),
    new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(-0.19, 0.2, -0.16),
    new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(0.19, 0.2, -0.16),
    new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(-0.19, 0.2, 0.16),
    new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(0.19, 0.2, 0.16),
  ]);
  inst(chairGeo, new THREE.MeshStandardMaterial({ roughness: 0.55 }), chairs.map((c) => c.m), true, chairs.map((c) => c.c));
  inst(new THREE.BoxGeometry(0.5, 0.09, 0.46), new THREE.MeshStandardMaterial({ roughness: 1 }), cushions.map((c) => c.m), false, cushions.map((c) => c.c));
  inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), planks.map((c) => c.m), true, planks.map((c) => c.c));
  inst(new THREE.BoxGeometry(1, 1, 1), mat.glow, glowStrips, false);
  const trunkParts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const t = k / 7;
    trunkParts.push(new THREE.CylinderGeometry(0.17 - t * 0.06, 0.2 - t * 0.06, 0.9, 8).translate(Math.pow(t, 1.6) * 0.9, 0.45 + k * 0.85, 0));
  }
  const frondParts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const leaf = new THREE.PlaneGeometry(0.55, 2.6, 1, 8);
    const lp = leaf.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < lp.count; i++) {
      const y = lp.getY(i) + 1.3;
      lp.setX(i, lp.getX(i) * Math.sin((y / 2.6) * Math.PI));
      lp.setZ(i, -y);
      lp.setY(i, Math.sin((y / 2.6) * 1.9) * 0.9 - (y / 2.6) * (y / 2.6) * 1.6);
    }
    leaf.computeVertexNormals();
    leaf.rotateY((k / 9) * Math.PI * 2);
    leaf.translate(0.9, 6.2, 0);
    frondParts.push(leaf);
  }
  const palmFronds = merge(frondParts);
  const frondMat = std(PALM, { roughness: 0.9, side: THREE.DoubleSide });
  inst(merge(trunkParts), std(PALM_TRUNK, { roughness: 1 }), palms);
  inst(palmFronds, frondMat, palms);
  inst(new THREE.CylinderGeometry(0.42, 0.34, 0.65, 16), mat.pot, pottedPalms);
  inst(palmFronds.clone().translate(-0.9, -4.6, 0).scale(0.5, 0.5, 0.5), frondMat, pottedPalms);
  const oliveTrunk = new THREE.CylinderGeometry(0.12, 0.22, 2.2, 7).translate(0, 1.1, 0);
  const oliveCanopy = merge([0, 1, 2, 3, 4].map((k) => new THREE.IcosahedronGeometry(1.0 + (k % 2) * 0.3, 1).translate(Math.cos(k * 1.3) * 0.9, 2.6 + (k % 3) * 0.35, Math.sin(k * 1.3) * 0.9)));
  inst(oliveTrunk, std(TRUNK, { roughness: 1 }), olives);
  inst(oliveCanopy, std(cfg.planting.trees === 'lemon' ? 0x6f9a4e : OLIVE, { roughness: 1 }), olives);
  inst(new THREE.SphereGeometry(0.9, 12, 10).scale(1, 4, 1).translate(0, 3.6, 0), std(0x56704a, { roughness: 1 }), cypress);
  inst(new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1.2, 1), std(LEMON, { roughness: 0.5 }), lemons, false);
  inst(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), bougainvillea, false, bougCols);
  inst(new THREE.IcosahedronGeometry(0.42, 1), mat.leaf, shrubs, true);
  inst(new THREE.IcosahedronGeometry(0.15, 1), std(0xfbf8f1, { roughness: 1 }), hydrangea, false);
  inst(new THREE.SphereGeometry(1, 20, 14), std(0x7fa86a, { roughness: 0.9 }), topiary, true);

  B.build(root);

  const tick = (t: number, beat: number) => {
    island.tick(t);
    for (const s of spinners) s.rotation.y = t * (s.userData.slow ? 0.6 : 3.5);
    const pulse = Math.pow(1 - beat, 3);
    beams.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.8 + i * 0.9) * 0.45;
      (b.material as THREE.MeshBasicMaterial).opacity = 0.08 + pulse * 0.1 * (L.night ? 1.6 : 1);
    });
    (mat.glow as THREE.MeshStandardMaterial).emissiveIntensity = G * (cfg.bowl.illuminated ? 1.3 : 0.8) * (0.85 + pulse * 0.3);
    for (const f of flags) {
      const pp = f.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i);
        pp.setZ(i, Math.sin(x * 3 - t * 4 + f.userData.phase) * 0.1 * x);
      }
      pp.needsUpdate = true;
    }
  };

  const extras: ArenaExtras = {
    config: cfg,
    time,
    walkPaths: [[new THREE.Vector3(bx - 1.2, 0, bzz - 1.6), new THREE.Vector3(SA + 0.6, 0, 8), new THREE.Vector3(SA + 0.6, 0, -8), new THREE.Vector3(SA + 0.6, 0, 8)]],
    bartender: { pos: new THREE.Vector3(bx, 0, bzz + 0.7), yaw: Math.PI },
    orbit: { radius: Math.max(OA, OB) + 15, height: 25 },
    bounds: { a: OA, b: OB, standTop: hTop },
    reflective,
    exposure: L.exposure,
    scoreboard,
    tick,
  };
  return {
    root,
    sun,
    seats,
    djAnchor: new THREE.Vector3(0, stageY, zb - 0.45),
    djYaw: Math.PI,
    djBooth: root,
    djLights: lights,
    stringLights: new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 4, 3), mat.glow, 0),
    bunting: new THREE.Group(),
    extras,
  };
}

/** DJ canopy / stage architecture per style. */
function djStage(
  cfg: ArenaConfig,
  B: Batches,
  mat: Record<string, THREE.Material>,
  root: THREE.Object3D,
  zb: number,
  stageY: number,
  G: number,
  flower: (m: THREE.Matrix4) => void,
  shrubs: THREE.Matrix4[],
  lights: THREE.Mesh[],
  beams: THREE.Mesh[],
  spinners: THREE.Object3D[],
  reflective: THREE.MeshStandardMaterial[],
  rnd: () => number,
  stripeTexFor: (a: number, b: number) => THREE.Texture,
): void {
  const style = cfg.dj.style;
  const accent = cfg.palette.ui.accent;
  const glowCol = new THREE.Color(cfg.palette.glow);
  const backdrop = (color: number) => {
    for (let k = 0; k <= 22; k++) {
      const a = Math.PI + (k / 22) * Math.PI;
      B.add(std(color, { roughness: 0.7 }), new THREE.BoxGeometry(0.22, 4.2, 0.08), M4(Math.cos(a) * 2.9, stageY + 2.1, zb + Math.sin(a) * 1.6 - 0.2, -a - Math.PI / 2));
    }
  };
  const disco = (y: number) => {
    const discoMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f6, metalness: 1, roughness: 0.12, flatShading: true });
    reflective.push(discoMat);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 3), discoMat);
    ball.position.set(0, y, zb + 0.2);
    ball.castShadow = true;
    ball.userData.slow = true;
    root.add(ball);
    spinners.push(ball);
    B.add(mat.dark, new THREE.CylinderGeometry(0.006, 0.006, 0.9, 4), M4(0, y + 0.9, zb + 0.2), false);
  };
  const spots = (n: number, y: number, color: number) => {
    const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    for (let k = 0; k < n; k++) {
      const x = -2 + (k * 4) / Math.max(1, n - 1);
      B.add(mat.dark, new THREE.CylinderGeometry(0.09, 0.12, 0.22, 12), M4(x, y, zb + 0.4));
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.8, 18, 1, true).translate(0, -1.9, 0), beamMat);
      beam.position.set(x, y - 0.05, zb + 0.4);
      beam.rotation.x = 0.25;
      root.add(beam);
      beams.push(beam);
    }
  };
  const glowMesh = (geo: THREE.BufferGeometry) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: glowCol, emissive: glowCol, emissiveIntensity: 0.8 + G * 0.7 }));
    root.add(m);
    return m;
  };
  void accent;
  switch (style) {
    case 'illuminated': {
      backdrop(0xfbf8f3);
      B.add(mat.white, new THREE.SphereGeometry(3.6, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), M4(0, stageY + 2.9, zb - 0.3, 0, [1.25, 0.55, 0.8]));
      const rim = glowMesh(new THREE.TorusGeometry(2.05, 0.03, 6, 64));
      rim.scale.set(2.2, 1.4, 1);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, stageY + 4.25, zb - 0.3);
      spots(6, stageY + 4.0, 0xc8a8ff);
      // A lavender light wall behind the decks.
      const wall = glowMesh(new THREE.PlaneGeometry(4.6, 3.4));
      wall.position.set(0, stageY + 2.0, zb - 1.55);
      (wall.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + G * 0.35;
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        flower(M4(Math.cos(a) * 4.2 + (rnd() - 0.5), stageY + 4.3 + rnd() * 0.5, zb - 0.3 + Math.sin(a) * 2.6, rnd() * 6, 1 + rnd()));
      }
      break;
    }
    case 'striped-canopy': {
      backdrop(0xf3ead9);
      // Striped half-dome tent on white poles.
      const tent = new THREE.Mesh(new THREE.SphereGeometry(3.4, 32, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), new THREE.MeshStandardMaterial({ map: stripeTexFor(0x2f5b3d, 0xfbf7f0), side: THREE.DoubleSide, roughness: 0.9 }));
      (tent.material as THREE.MeshStandardMaterial).map!.repeat.set(2, 1);
      tent.scale.set(1.1, 0.5, 0.9);
      tent.position.set(0, stageY + 3.6, zb);
      tent.castShadow = true;
      root.add(tent);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        B.add(mat.white, new THREE.CylinderGeometry(0.07, 0.08, 3.6, 10), M4(Math.cos(a) * 3.3, stageY + 1.8, zb + Math.sin(a) * 2.7));
      }
      // Scalloped valance.
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        B.add(k % 2 ? mat.white : std(0x2f5b3d, { roughness: 0.9 }), new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M4(Math.cos(a) * 3.65, stageY + 3.62, zb + Math.sin(a) * 3.0));
      }
      B.add(std(0xc9a46a, { roughness: 0.3, metalness: 0.6 }), new THREE.SphereGeometry(0.18, 12, 8), M4(0, stageY + 5.35, zb));
      break;
    }
    case 'pavilion': {
      // Elevated white pavilion: four columns and a thin floating roof.
      for (const [x, z] of [
        [-2.5, -1.4],
        [2.5, -1.4],
        [-2.5, 1.6],
        [2.5, 1.6],
      ])
        B.add(mat.white, new THREE.CylinderGeometry(0.16, 0.18, 3.6, 16), M4(x, stageY + 1.8, zb + z));
      B.add(mat.white, worldBox(6.4, 0.22, 4.2), M4(0, stageY + 3.7, zb + 0.1));
      const under = glowMesh(new THREE.PlaneGeometry(5.8, 3.6));
      under.rotation.x = Math.PI / 2;
      under.position.set(0, stageY + 3.58, zb + 0.1);
      (under.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + G * 0.4;
      backdrop(0xfbf8f3);
      break;
    }
    case 'archway': {
      // Big stone arch facing the court (the sunset).
      const arch = new THREE.Shape();
      arch.moveTo(-4.4, 0);
      arch.lineTo(4.4, 0);
      arch.lineTo(4.4, 6);
      arch.lineTo(-4.4, 6);
      arch.lineTo(-4.4, 0);
      const hole = new THREE.Path();
      hole.moveTo(-3.0, 0.001);
      hole.lineTo(3.0, 0.001);
      hole.lineTo(3.0, 3.2);
      hole.absarc(0, 3.2, 3.0, 0, Math.PI, false);
      hole.lineTo(-3.0, 0.001);
      arch.holes.push(hole);
      B.add(mat.stone, new THREE.ExtrudeGeometry(arch, { depth: 1.2, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, curveSegments: 20 }), M4(0, 0, zb - 1.6));
      B.add(std(new THREE.Color(cfg.palette.stone).multiplyScalar(0.86).getHex(), { roughness: 1 }), new THREE.BoxGeometry(6.2, 6, 0.1), M4(0, 3, zb - 1.65));
      const glowArc = glowMesh(new THREE.TorusGeometry(3.05, 0.04, 6, 64, Math.PI));
      glowArc.position.set(0, 3.2, zb - 0.38);
      for (let k = 0; k < 40; k++) {
        const a = (k / 39) * Math.PI;
        flower(M4(Math.cos(a) * 3.8 + (rnd() - 0.5) * 0.6, 3.2 + Math.sin(a) * 3.3 + (rnd() - 0.5) * 0.5, zb - 0.5, rnd() * 6, 1 + rnd()));
        if (k % 3 === 0) shrubs.push(M4(Math.cos(a) * 3.9, 3.2 + Math.sin(a) * 3.3, zb - 0.7, rnd() * 6, 0.8));
      }
      for (const sx of [-2.4, 2.4]) {
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 0.8 + G }));
        lamp.position.set(sx, 3.6, zb - 0.32);
        root.add(lamp);
        lights.push(lamp);
      }
      break;
    }
    case 'circular': {
      // Round stage with a floating ring truss and pendant lights.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.14, 12, 64), mat.white);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, stageY + 4.0, zb);
      ring.castShadow = true;
      root.add(ring);
      const inner = glowMesh(new THREE.TorusGeometry(2.86, 0.03, 6, 64));
      inner.rotation.x = Math.PI / 2;
      inner.position.set(0, stageY + 3.9, zb);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
        B.add(mat.white, new THREE.CylinderGeometry(0.08, 0.1, 4, 10), M4(Math.cos(a) * 3.0, stageY + 2, zb + Math.sin(a) * 3.0));
      }
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1cc, emissive: 0xffd99a, emissiveIntensity: 0.6 + G * 0.6 }));
        m.position.set(Math.cos(a) * 2.6, stageY + 3.3, zb + Math.sin(a) * 2.6);
        root.add(m);
        lights.push(m);
      }
      for (let k = 0; k < 16; k++) shrubs.push(M4(Math.cos((k / 16) * Math.PI * 2) * 3.2, stageY + 0.3, zb + Math.sin((k / 16) * Math.PI * 2) * 3.2, rnd() * 6, 0.6));
      break;
    }
    case 'disco': {
      backdrop(0xfbf3ea);
      const archMat = std(0xfbf3ea, { roughness: 0.5 });
      B.add(archMat, new THREE.TorusGeometry(3.05, 0.32, 14, 48, Math.PI), M4(0, stageY, zb - 0.2, 0, [1, 1.3, 1]));
      B.add(archMat, new THREE.CylinderGeometry(3.4, 3.4, 0.35, 48, 1, false, Math.PI / 2, Math.PI).scale(1, 1, 0.55), M4(0, stageY + 4.0, zb - 0.2));
      const glowArc = glowMesh(new THREE.TorusGeometry(3.05, 0.035, 6, 64, Math.PI));
      glowArc.scale.set(1, 1.3, 1);
      glowArc.position.set(0, stageY, zb + 0.15);
      spots(4, stageY + 3.6, 0xffb8e0);
      for (let k = 0; k < 46; k++) {
        const a = (k / 45) * Math.PI;
        flower(M4(Math.cos(a) * 3.4 + (rnd() - 0.5) * 0.6, stageY + Math.sin(a) * 3.95 + (rnd() - 0.5) * 0.5, zb - 0.2 + (rnd() - 0.5) * 0.8, rnd() * 6, 1.1 + rnd() * 0.9));
        if (k % 3 === 0) shrubs.push(M4(Math.cos(a) * 3.5, stageY + Math.sin(a) * 3.9, zb - 0.4, rnd() * 6, 0.8));
      }
      disco(stageY + 3.0);
      break;
    }
  }
}

/** Free GPU memory of an arena that is being replaced. */
export function disposeArena(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
    for (const mm of mats) {
      for (const v of Object.values(mm)) if (v instanceof THREE.Texture && !(v as THREE.Texture & { userData: { shared?: boolean } }).userData?.shared) v.dispose();
      mm.dispose();
    }
  });
  root.removeFromParent();
}
