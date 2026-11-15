// Vital arenas: one pickleball stadium at a time, built from the club's mood boards — a rounded court
// surround with the painted Vital script, a seating bowl (pastel chairs, white amphitheatre steps or
// terrace benches), a DJ booth on the far end, shades, a bar and lush planting, lit for morning,
// golden hour or dusk. Everything is generated here (no external meshes); static geometry is merged per
// material and repeated props are instanced.

import * as THREE from 'three';
import { type Court, netHeightAt } from '../../../shared/src/court.ts';
import { Batches, M4, css, drawCrest, drawLaurel, drawLogo, liveTex, merge, roundedRectSamples, roundedRectShape, spacedText, std } from './kit.ts';
import { COURTS, type CourtId, type CourtTheme, RESORT } from './themes.ts';
import type { Venue } from './venue.ts';

export interface Seat {
  pos: THREE.Vector3;
  yaw: number;
  standing: boolean;
  members?: boolean;
}

export interface ResortExtras {
  theme: CourtTheme;
  courts: { theme: CourtTheme; anchor: THREE.Vector3 }[];
  walkPaths: THREE.Vector3[][];
  bartender: { pos: THREE.Vector3; yaw: number };
  otherDjs: { pos: THREE.Vector3; yaw: number }[];
  /** Radius / height of the menu fly-around. */
  orbit: { radius: number; height: number };
  /** Materials that should pick up the sky reflection (gloss court, disco ball, glass). */
  reflective: THREE.MeshStandardMaterial[];
  exposure: number;
  tick(t: number, beat: number): void;
}

const SKY: Record<CourtTheme['time'], { stops: [number, string][]; sun: number; sunI: number; sunPos: [number, number, number]; hemiSky: number; hemiGround: number; hemiI: number; fog: number; exposure: number }> = {
  morning: { stops: [[0, '#7fb8e6'], [0.45, '#bfdcf2'], [0.52, '#f6f0e4'], [1, '#f2ead9']], sun: 0xfff2dc, sunI: 2.7, sunPos: [-14, 26, 10], hemiSky: 0xeaf4ff, hemiGround: 0xe6dbc6, hemiI: 1.3, fog: 0xefeee6, exposure: 1.0 },
  golden: { stops: [[0, '#8fb6dc'], [0.36, '#f3d2bb'], [0.5, '#ffd6ab'], [1, '#f4dcc4']], sun: 0xffe0bf, sunI: 2.8, sunPos: [20, 13, -7], hemiSky: 0xfff1e6, hemiGround: 0xeed8c6, hemiI: 1.45, fog: 0xf6dcc6, exposure: 1.04 },
  dusk: { stops: [[0, '#5d6aa8'], [0.32, '#b39bd2'], [0.47, '#ffc6a8'], [1, '#e9d6e2']], sun: 0xffbfa6, sunI: 1.7, sunPos: [-18, 8, -12], hemiSky: 0xe6e0f6, hemiGround: 0xe8d6dc, hemiI: 1.35, fog: 0xd9c6dc, exposure: 1.1 },
};

// Court surround: half extents + corner radius (local: x across, z along the court, DJ at −z).
const SA = 6.4;
const SB = 10.6;
const SR = 2.6;

export function buildArena(scene: THREE.Scene, court: Court, id: CourtId): Venue & { extras: ResortExtras } {
  const T = COURTS[id];
  const L = SKY[T.time];
  const root = new THREE.Group();
  root.name = `arena-${id}`;
  scene.add(root);
  const B = new Batches();
  const reflective: THREE.MeshStandardMaterial[] = [];
  let seed = 7 + id.length * 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dusk = T.time === 'dusk';
  const warm = T.time !== 'morning';

  const mat = {
    stone: std(T.stone, { roughness: 0.92 }),
    stoneShade: std(new THREE.Color(T.stone).multiplyScalar(0.93).getHex(), { roughness: 0.95 }),
    paving: std(T.paving, { roughness: 0.95 }),
    wood: std(RESORT.wood, { roughness: 0.7 }),
    dark: std(0x2b2a2e, { roughness: 0.45 }),
    white: std(0xfbf8f3, { roughness: 0.6 }),
    fabric: std(RESORT.fabric, { roughness: 0.9, side: THREE.DoubleSide }),
    metal: std(0xe8e4dc, { roughness: 0.35, metalness: 0.4 }),
    green: std(T.id === 'terrace' ? 0x2f5b3d : 0xf4f1ea, { roughness: 0.45 }),
    glow: new THREE.MeshStandardMaterial({ color: T.glow, emissive: T.glow, emissiveIntensity: dusk ? 1.6 : warm ? 0.9 : 0.35, roughness: 0.4 }),
    leaf: std(0x6f9452, { roughness: 1 }),
    pot: std(0xf3ece2, { roughness: 0.9 }),
  };

  // ---------------------------------------------------------------- sky + light
  const skyTex = liveTex(16, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    for (const [s, c] of L.stops) grd.addColorStop(s, c);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false }));
  root.add(sky);
  // Soft clouds as a few billboards high in the sky.
  const cloudTex = liveTex(256, 128, (g) => {
    for (let k = 0; k < 9; k++) {
      const x = 40 + k * 22 + (k % 3) * 6;
      const y = 70 - Math.sin(k * 0.9) * 18;
      const r = 26 + (k % 4) * 9;
      const cg = g.createRadialGradient(x, y, 0, x, y, r);
      cg.addColorStop(0, dusk ? 'rgba(255,214,206,0.85)' : 'rgba(255,255,255,0.85)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  for (let k = 0; k < 7; k++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(90, 45), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
    const a = (k / 7) * Math.PI * 2 + 0.4;
    c.position.set(Math.cos(a) * 260, 70 + (k % 3) * 18, Math.sin(a) * 260);
    c.lookAt(0, c.position.y, 0);
    root.add(c);
  }
  scene.background = new THREE.Color(L.stops[1][1]);
  scene.fog = new THREE.Fog(L.fog, 80, 300);
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

  // ---------------------------------------------------------------- ground, plaza, distant land
  const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 48), std(T.trees === 'palm' ? 0xa9c98a : RESORT.lawn, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  root.add(ground);
  const plaza = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(SA + 12, SB + 13, SR + 9), 12), mat.paving);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = -0.01;
  plaza.receiveShadow = true;
  root.add(plaza);
  const hillMat = std(RESORT.hills, { roughness: 1 });
  const farMat = std(RESORT.hillsFar, { roughness: 1 });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 150 + (i % 3) * 35;
    B.add(i % 2 ? hillMat : farMat, new THREE.SphereGeometry(38 + (i % 4) * 12, 16, 8), new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, -16, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(1.7, 0.55, 1)), false);
  }

  // ---------------------------------------------------------------- court + surround
  const surroundMat = std(T.surround, { roughness: T.gloss ? 0.25 : 0.88 });
  const courtMat = std(T.court, { roughness: T.gloss ? 0.12 : 0.85 });
  const kitchenMat = std(T.kitchen, { roughness: T.gloss ? 0.12 : 0.85 });
  if (T.gloss) reflective.push(surroundMat, courtMat, kitchenMat);
  const lineMat = std(T.line, { roughness: 0.6 });
  // Plinth (a soft white rim) under the surround.
  B.add(mat.white, new THREE.ExtrudeGeometry(roundedRectShape(SA + 0.25, SB + 0.25, SR + 0.25), { depth: 0.1, bevelEnabled: false, curveSegments: 10 }), M4(0, 0.1, 0, 0, 1, Math.PI / 2), false);
  const sur = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(SA, SB, SR), 12), surroundMat);
  sur.rotation.x = -Math.PI / 2;
  sur.position.y = 0.105;
  sur.receiveShadow = true;
  root.add(sur);
  const cw = court.width;
  const cl = court.length;
  if (T.alley) B.add(std(T.alley, { roughness: 0.85 }), new THREE.BoxGeometry(cw + 3.2, 0.02, cl + 0.4), M4(0, 0.112, 0), false);
  B.add(courtMat, new THREE.BoxGeometry(cw, 0.02, cl), M4(0, 0.12, 0), false);
  for (const s of [1, -1]) B.add(kitchenMat, new THREE.BoxGeometry(cw, 0.022, court.nvzDepth), M4(0, 0.123, (s * court.nvzDepth) / 2), false);
  const Y = 0.136;
  const lw = 0.05;
  const line = (w: number, d: number, x: number, z: number) => B.add(lineMat, new THREE.BoxGeometry(w, 0.006, d), M4(x, Y, z), false);
  line(cw, lw, 0, cl / 2 - lw / 2);
  line(cw, lw, 0, -cl / 2 + lw / 2);
  line(lw, cl, cw / 2 - lw / 2, 0);
  line(lw, cl, -cw / 2 + lw / 2, 0);
  line(cw, lw, 0, court.nvzDepth - lw / 2);
  line(cw, lw, 0, -court.nvzDepth + lw / 2);
  const c2 = cl / 2 - court.nvzDepth;
  line(lw, c2, 0, court.nvzDepth + c2 / 2);
  line(lw, c2, 0, -court.nvzDepth - c2 / 2);
  if (T.alley) {
    for (const s of [1, -1]) line(lw, cl + 0.4, s * (cw / 2 + 1.6), 0);
    line(cw + 3.2, lw, 0, cl / 2 + 0.2);
    line(cw + 3.2, lw, 0, -cl / 2 - 0.2);
  }

  // Painted decals: the Vital script across the centre, club lettering and crests on the surround.
  const decalW = SA * 2;
  const decalH = SB * 2;
  const PX = 64;
  const decalTex = liveTex(Math.round(decalW * PX), Math.round(decalH * PX), (g, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const m = (v: number) => v * PX;
    const ink = T.logo;
    const end = cl / 2 + 1.35;
    g.fillStyle = ink;
    g.strokeStyle = ink;
    g.globalAlpha = 0.95;
    g.font = `600 ${m(0.34)}px "Josefin Sans", "Nunito", sans-serif`;
    if (T.id === 'terrace') {
      for (const s of [1, -1]) {
        g.save();
        g.translate(cx, cy + s * m(end + 0.6));
        if (s < 0) g.rotate(Math.PI);
        drawLogo(g, 0, 0, m(4.2), ink);
        g.lineWidth = m(0.035);
        g.beginPath();
        g.moveTo(-m(5.6), m(0.3));
        g.lineTo(-m(2.6), m(0.3));
        g.moveTo(m(2.6), m(0.3));
        g.lineTo(m(5.6), m(0.3));
        g.stroke();
        g.restore();
      }
    } else {
      for (const s of [1, -1]) {
        g.save();
        g.translate(cx, cy + s * m(end));
        if (s < 0) g.rotate(Math.PI);
        spacedText(g, T.id === 'lavender' ? 'PICKLEBALL' : 'VITAL  PICKLEBALL  CLUB', 0, 0, m(0.16));
        g.lineWidth = m(0.025);
        g.beginPath();
        g.moveTo(-m(5.3), 0);
        g.lineTo(-m(3.4), 0);
        g.moveTo(m(3.4), 0);
        g.lineTo(m(5.3), 0);
        g.stroke();
        if (T.id === 'lavender') drawLaurel(g, 0, m(0.75), m(0.75), ink);
        g.restore();
      }
      // Crests beside the court.
      for (const [sx, sz] of [
        [1, 1],
        [-1, -1],
        ...(T.id === 'coral' ? [] : [[1, -1], [-1, 1]]),
      ] as [number, number][]) {
        g.save();
        g.translate(cx + sx * m(cw / 2 + (T.alley ? 2.45 : 1.6)), cy + sz * m(T.id === 'coral' ? 0 : 4.6));
        g.rotate(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
        if (T.id === 'lavender') drawLogo(g, 0, 0, m(1.5), ink);
        else drawCrest(g, 0, 0, m(1.1), ink);
        g.restore();
      }
    }
  });
  decalTex.anisotropy = 8;
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(decalW, decalH), new THREE.MeshStandardMaterial({ map: decalTex, transparent: true, depthWrite: false, roughness: T.gloss ? 0.2 : 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.14;
  decal.receiveShadow = true;
  root.add(decal);
  if (T.id !== 'terrace') {
    // Big script across the middle of the court (under the net).
    const midTex = liveTex(1024, 420, (g, w, h) => {
      g.globalAlpha = 0.92;
      drawLogo(g, w / 2, h / 2, w * 0.96, T.logo);
    });
    const mid = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.72), new THREE.MeshStandardMaterial({ map: midTex, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
    mid.rotation.x = -Math.PI / 2;
    mid.rotation.z = Math.PI / 2;
    mid.position.y = 0.141;
    mid.receiveShadow = true;
    root.add(mid);
  }

  // Net: posts, mesh, tape (the posts carry a little crest plaque).
  const span = cw / 2 + 0.3;
  const postMat = T.id === 'terrace' ? mat.green : mat.white;
  for (const s of [1, -1]) {
    B.add(postMat, new THREE.CylinderGeometry(0.05, 0.06, court.netHeightPost + 0.12, 14), M4(s * span, 0.12 + (court.netHeightPost + 0.12) / 2, 0));
    B.add(postMat, new THREE.SphereGeometry(0.07, 12, 8), M4(s * span, 0.12 + court.netHeightPost + 0.14, 0));
  }
  const netTex = liveTex(64, 64, (g) => {
    g.strokeStyle = T.id === 'terrace' ? 'rgba(30,70,45,0.95)' : 'rgba(40,40,46,0.95)';
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
  for (let i = 0; i < np.count; i++) np.setY(i, np.getY(i) > 0 ? 0.12 + netHeightAt(court, np.getX(i)) : 0.16);
  np.needsUpdate = true;
  netGeo.computeVertexNormals();
  const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 }));
  net.castShadow = true;
  root.add(net);
  B.add(T.id === 'terrace' ? mat.green : mat.white, new THREE.BoxGeometry(span * 2, 0.06, 0.03), M4(0, 0.12 + court.netHeightCenter + 0.01, 0));

  // ---------------------------------------------------------------- seating bowl
  const seats: Seat[] = [];
  const chairs: { m: THREE.Matrix4; c: number }[] = [];
  const cushions: { m: THREE.Matrix4; c: number }[] = [];
  const bougainvillea: THREE.Matrix4[] = [];
  const shrubs: THREE.Matrix4[] = [];
  const hydrangea: THREE.Matrix4[] = [];
  const lavenderStems: THREE.Matrix4[] = [];
  const palms: THREE.Matrix4[] = [];
  const olives: THREE.Matrix4[] = [];
  const cypress: THREE.Matrix4[] = [];
  const pottedPalms: THREE.Matrix4[] = [];
  const glowStrips: THREE.Matrix4[] = [];

  const gapFar = 3.6;
  const gapNear = T.seating === 'benches' ? 99 : 3.8;
  const inGap = (x: number, z: number) => (z < -SB + 0.5 && Math.abs(x) < gapFar) || (z > SB - 0.5 && Math.abs(x) < gapNear);
  const d0 = 1.15;
  const rowD = T.seating === 'steps' ? 1.0 : 0.9;
  const rise = T.seating === 'steps' ? 0.42 : 0.4;
  const rows = T.rows;
  const yawOf = (nx: number, nz: number) => Math.atan2(nx, nz);
  let outerD = d0;

  if (T.seating !== 'benches') {
    for (let k = 0; k < rows; k++) {
      const d = d0 + k * rowD;
      const h = 0.3 + k * rise;
      const samples = roundedRectSamples(SA + d + rowD / 2, SB + d + rowD / 2, SR + d + rowD / 2, 0.5);
      for (const p of samples) {
        if (inGap(p.x, p.z)) continue;
        const yaw = yawOf(p.nx, p.nz);
        B.add(k % 2 ? mat.stone : mat.stoneShade, new THREE.BoxGeometry(0.53, h, rowD), M4(p.x, h / 2, p.z, yaw), k === rows - 1);
        // Warm LED strip on each riser edge.
        if (warm || T.seating === 'steps') glowStrips.push(M4(p.x - p.nx * (rowD / 2 - 0.02), h - 0.02, p.z - p.nz * (rowD / 2 - 0.02), yaw, [0.53, 0.025, 0.03]));
      }
      const seatsOnRow = roundedRectSamples(SA + d + rowD / 2, SB + d + rowD / 2, SR + d + rowD / 2, T.seating === 'chairs' ? 0.62 : 0.66);
      seatsOnRow.forEach((p, i) => {
        if (inGap(p.x, p.z)) return;
        if (Math.abs(p.z) < 0.45 && Math.abs(p.x) > SA) return; // aisles across the middle
        const yaw = yawOf(p.nx, p.nz);
        const cx = p.x + p.nx * 0.08;
        const cz = p.z + p.nz * 0.08;
        const colIdx = Math.floor(rnd() * T.seatColors.length);
        if (T.seating === 'chairs') {
          chairs.push({ m: M4(cx, h, cz, yaw), c: T.seatColors[(colIdx + (i % 2)) % T.seatColors.length] });
          seats.push({ pos: new THREE.Vector3(cx, h + 0.5, cz), yaw, standing: false });
        } else {
          cushions.push({ m: M4(cx, h + 0.04, cz, yaw), c: T.seatColors[colIdx] });
          seats.push({ pos: new THREE.Vector3(cx, h + 0.14, cz), yaw, standing: false });
        }
      });
    }
    outerD = d0 + rows * rowD;
    // Parapet with planters of bougainvillea on top and a glowing rim.
    const hTop = 0.3 + (rows - 1) * rise;
    const par = roundedRectSamples(SA + outerD + 0.3, SB + outerD + 0.3, SR + outerD + 0.3, 0.6);
    for (const p of par) {
      if (inGap(p.x, p.z)) continue;
      const yaw = yawOf(p.nx, p.nz);
      B.add(mat.stone, new THREE.BoxGeometry(0.64, hTop + 0.9, 0.6), M4(p.x, (hTop + 0.9) / 2, p.z, yaw));
      glowStrips.push(M4(p.x - p.nx * 0.31, hTop + 0.75, p.z - p.nz * 0.31, yaw, [0.64, 0.03, 0.03]));
      if (rnd() < 0.55) {
        for (let q = 0; q < 2; q++) bougainvillea.push(M4(p.x + (rnd() - 0.5) * 0.4, hTop + 1.0 + rnd() * 0.35, p.z + (rnd() - 0.5) * 0.3, rnd() * 6, 0.8 + rnd() * 0.6));
        shrubs.push(M4(p.x, hTop + 0.95, p.z, rnd() * 6, 0.9 + rnd() * 0.3));
      }
    }
    outerD += 0.6;
  } else {
    // Terrace: built-in stone benches with cushions along both sides, and loungers.
    for (const sx of [1, -1]) {
      for (let r = 0; r < 2; r++) {
        const x = sx * (SA + 1.2 + r * 1.0);
        const h = 0.42 + r * 0.38;
        B.add(mat.stone, new THREE.BoxGeometry(0.9, h, 14), M4(x, h / 2, -1.2));
        B.add(std(r ? 0xa8d8bf : 0xf8f4ea, { roughness: 1 }), new THREE.BoxGeometry(0.7, 0.1, 13.6), M4(x, h + 0.05, -1.2), false);
        for (let i = 0; i < 20; i++) {
          const z = -7.9 + i * 0.7;
          seats.push({ pos: new THREE.Vector3(x + sx * 0.1, h + 0.2, z), yaw: sx > 0 ? Math.PI / 2 : -Math.PI / 2, standing: false });
        }
      }
      // Low wall with planters behind.
      B.add(mat.stone, new THREE.BoxGeometry(0.6, 1.6, 22), M4(sx * (SA + 3.2), 0.8, -1));
      for (let k = 0; k < 6; k++) {
        const z = -10 + k * 3.8;
        B.add(mat.pot, new THREE.CylinderGeometry(0.55, 0.45, 0.7, 16), M4(sx * (SA + 3.2), 1.95, z));
        olives.push(M4(sx * (SA + 3.2), 2.2, z, rnd() * 6, 0.45 + rnd() * 0.1));
        for (let q = 0; q < 4; q++) hydrangea.push(M4(sx * (SA + 3.0) + (rnd() - 0.5) * 0.6, 1.95 + rnd() * 0.3, z + 1.6 + (rnd() - 0.5) * 0.8, 0, 1.2 + rnd() * 0.4));
      }
    }
    outerD = 3.6;
  }

  // ---------------------------------------------------------------- DJ booth (far end)
  const zb = -(SB + 1.9);
  const lights: THREE.Mesh[] = [];
  const spinners: THREE.Object3D[] = [];
  const beams: THREE.Mesh[] = [];
  B.add(mat.white, new THREE.CylinderGeometry(2.6, 2.7, 0.32, 40), M4(0, 0.16, zb));
  const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.025, 6, 64), mat.glow);
  ringGlow.rotation.x = Math.PI / 2;
  ringGlow.position.set(0, 0.3, zb);
  root.add(ringGlow);
  // Desk: a curved front with the logo.
  const deskMat = std(0xfbf8f3, { roughness: 0.4 });
  B.add(deskMat, new THREE.CylinderGeometry(1.35, 1.35, 1.0, 32, 1, false, -Math.PI / 2, Math.PI), M4(0, 0.82, zb + 0.25));
  B.add(std(0xe9e4dc, { roughness: 0.3 }), new THREE.CylinderGeometry(1.42, 1.42, 0.06, 32, 1, false, -Math.PI / 2, Math.PI), M4(0, 1.34, zb + 0.25));
  B.add(mat.dark, new THREE.BoxGeometry(1.7, 0.06, 0.5), M4(0, 1.39, zb + 0.15));
  for (const s of [-1, 1]) B.add(mat.dark, new THREE.CylinderGeometry(0.18, 0.18, 0.04, 20), M4(s * 0.45, 1.43, zb + 0.15));
  const deskGlow = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.02, 6, 40, Math.PI), mat.glow);
  deskGlow.rotation.x = Math.PI / 2;
  deskGlow.position.set(0, 0.36, zb + 0.25);
  root.add(deskGlow);
  const deskLogoTex = liveTex(512, 200, (g, w, h) => drawLogo(g, w / 2, h / 2, w * 0.82, T.id === 'terrace' ? '#2f6b4a' : dusk ? '#b9a3d8' : '#c9a37a'));
  const deskLogo = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.5), new THREE.MeshStandardMaterial({ map: deskLogoTex, transparent: true, roughness: 0.5, emissive: dusk ? 0x6b4fa8 : 0x000000, emissiveMap: dusk ? deskLogoTex : null, emissiveIntensity: 0.8 }));
  deskLogo.position.set(0, 0.85, zb + 1.62);
  root.add(deskLogo);
  // Speakers with crest plaques.
  const crestTex = liveTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2b2a2e';
    g.fillRect(0, 0, w, h);
    drawCrest(g, w / 2, h / 2, w * 0.7, '#e6cf98');
  });
  for (const s of [-1, 1]) {
    B.add(mat.dark, new THREE.BoxGeometry(0.75, 1.6, 0.65), M4(s * 2.25, 1.1, zb + 0.4));
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: crestTex, roughness: 0.6 }));
    plaque.position.set(s * 2.25, 1.35, zb + 0.73);
    root.add(plaque);
    for (const y of [0.75, 1.0]) B.add(std(0x18181b, { roughness: 0.3 }), new THREE.CylinderGeometry(0.13, 0.13, 0.02, 18), M4(s * 2.25, y, zb + 0.73, 0, 1, Math.PI / 2));
    pottedPalms.push(M4(s * 3.3, 0.32, zb + 0.6, rnd() * 6, 0.75));
  }

  // Canopy styles.
  if (T.id === 'terrace') {
    // Stone wall with three arches; the DJ plays in the middle (mint) arch.
    const wallZ = zb - 1.3;
    const wall = new THREE.Shape();
    wall.moveTo(-10, 0);
    wall.lineTo(10, 0);
    wall.lineTo(10, 5);
    wall.lineTo(-10, 5);
    wall.lineTo(-10, 0);
    for (const ax of [-5.2, 0, 5.2]) {
      const w = ax === 0 ? 2.3 : 1.7;
      const hole = new THREE.Path();
      hole.moveTo(ax - w, 0.001);
      hole.lineTo(ax + w, 0.001);
      hole.lineTo(ax + w, 2.6);
      hole.absarc(ax, 2.6, w, 0, Math.PI, false);
      hole.lineTo(ax - w, 0.001);
      wall.holes.push(hole);
    }
    B.add(mat.stone, new THREE.ExtrudeGeometry(wall, { depth: 0.8, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, curveSegments: 18 }), M4(0, 0, wallZ - 0.8));
    // Niche backs: mint centre, cream sides, with brass sconces.
    B.add(std(0xa9d9c0, { roughness: 0.8 }), new THREE.BoxGeometry(4.8, 5, 0.1), M4(0, 2.5, wallZ - 1.0));
    for (const ax of [-5.2, 5.2]) B.add(mat.stoneShade, new THREE.BoxGeometry(3.6, 5, 0.1), M4(ax, 2.5, wallZ - 1.0));
    for (const sx of [-2.6, 2.6]) {
      B.add(std(0xc9a46a, { roughness: 0.3, metalness: 0.6 }), new THREE.BoxGeometry(0.12, 0.35, 0.12), M4(sx, 3.2, wallZ + 0.05));
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 12), new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 1.2 }));
      lamp.position.set(sx, 3.45, wallZ + 0.12);
      root.add(lamp);
      lights.push(lamp);
    }
    // Planters with white hydrangeas along the top of the wall.
    for (let k = 0; k < 10; k++) {
      const x = -9 + k * 2;
      B.add(mat.pot, new THREE.BoxGeometry(1.7, 0.5, 0.7), M4(x, 5.25, wallZ - 0.4));
      for (let q = 0; q < 5; q++) hydrangea.push(M4(x + (rnd() - 0.5) * 1.4, 5.6 + rnd() * 0.25, wallZ - 0.4 + (rnd() - 0.5) * 0.4, 0, 1.3 + rnd() * 0.4));
      shrubs.push(M4(x, 5.5, wallZ - 0.4, rnd() * 6, 0.9));
    }
  } else {
    const backR = 2.9;
    // Curved backdrop of vertical slats.
    for (let k = 0; k <= 22; k++) {
      const a = Math.PI + (k / 22) * Math.PI;
      B.add(dusk ? mat.white : std(0xf3e6d6, { roughness: 0.7 }), new THREE.BoxGeometry(0.22, 4.2, 0.08), M4(Math.cos(a) * backR, 2.4, zb + Math.sin(a) * backR * 0.55 - 0.2, -a - Math.PI / 2));
    }
    if (T.id === 'lavender') {
      // White shell canopy with stage spots and lavender beams.
      const shell = new THREE.SphereGeometry(3.6, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.32);
      B.add(mat.white, shell, M4(0, 3.2, zb - 0.3, 0, [1.25, 0.55, 0.8]));
      const shellGlow = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.03, 6, 64), mat.glow);
      shellGlow.scale.set(2.2, 1.4, 1);
      shellGlow.rotation.x = Math.PI / 2;
      shellGlow.position.set(0, 4.55, zb - 0.3);
      root.add(shellGlow);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xc8a8ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      for (let k = 0; k < 6; k++) {
        const x = -2 + k * 0.8;
        B.add(mat.dark, new THREE.CylinderGeometry(0.09, 0.12, 0.22, 12), M4(x, 4.3, zb + 0.4));
        const beam = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.8, 18, 1, true).translate(0, -1.9, 0), beamMat);
        beam.position.set(x, 4.25, zb + 0.4);
        beam.rotation.x = 0.25;
        root.add(beam);
        beams.push(beam);
      }
      // Wisteria/bougainvillea pouring over the shell.
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        bougainvillea.push(M4(Math.cos(a) * 4.2 + (rnd() - 0.5), 4.6 + rnd() * 0.5, zb - 0.3 + Math.sin(a) * 2.6, rnd() * 6, 1 + rnd()));
      }
    } else {
      // Arched canopy (coral: cream arch; rosé: blush wave) with a disco ball.
      const archMat = T.id === 'rose' ? std(0xf7e7ea, { roughness: 0.5 }) : std(0xfbf3ea, { roughness: 0.5 });
      const arch = new THREE.TorusGeometry(3.05, 0.32, 14, 48, Math.PI);
      B.add(archMat, arch, M4(0, 0.3, zb - 0.2, 0, [1, 1.3, 1]));
      B.add(archMat, new THREE.CylinderGeometry(3.4, 3.4, 0.35, 48, 1, false, Math.PI / 2, Math.PI).scale(1, 1, 0.55), M4(0, 4.35, zb - 0.2));
      const archGlow = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.035, 6, 64, Math.PI), mat.glow);
      archGlow.scale.set(1, 1.3, 1);
      archGlow.position.set(0, 0.3, zb + 0.15);
      root.add(archGlow);
      for (let k = 0; k < 46; k++) {
        const a = (k / 45) * Math.PI;
        bougainvillea.push(M4(Math.cos(a) * 3.4 + (rnd() - 0.5) * 0.6, 0.3 + Math.sin(a) * 3.95 + (rnd() - 0.5) * 0.5, zb - 0.2 + (rnd() - 0.5) * 0.8, rnd() * 6, 1.1 + rnd() * 0.9));
        if (k % 3 === 0) shrubs.push(M4(Math.cos(a) * 3.5, 0.3 + Math.sin(a) * 3.9, zb - 0.4, rnd() * 6, 0.8));
      }
      const discoMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f6, metalness: 1, roughness: 0.12, flatShading: true });
      reflective.push(discoMat);
      const disco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 3), discoMat);
      disco.position.set(0, 3.3, zb + 0.2);
      disco.castShadow = true;
      root.add(disco);
      spinners.push(disco);
      B.add(mat.dark, new THREE.CylinderGeometry(0.006, 0.006, 0.9, 4), M4(0, 4.15, zb + 0.2), false);
    }
  }
  // Pendant/fairy bulbs over the booth.
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff1cc, emissive: 0xffd99a, emissiveIntensity: 1 }));
    m.position.set(-1.2 + k * 1.2, 2.6, zb + 0.9);
    root.add(m);
    lights.push(m);
  }

  // Seats either side of the booth for the bowl styles are already in the rows; flank with palms.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) (T.trees === 'olive' ? olives : palms).push(M4(s * (5.5 + k * 2.2), 0, zb - 2.5 - k * 0.8, rnd() * 6, 0.9 + rnd() * 0.3));
  }

  // ---------------------------------------------------------------- shades, banners, lounges, bar
  const OA = SA + outerD;
  const OB = SB + outerD;
  const stripeTex = (a: number, b: number) =>
    liveTex(256, 32, (g) => {
      for (let i = 0; i < 16; i++) {
        g.fillStyle = css(i % 2 ? a : b);
        g.fillRect(i * 16, 0, 16, 32);
      }
    });
  const umbrella = (x: number, z: number, a: number, b: number, size = 1.5) => {
    const top = new THREE.Mesh(new THREE.ConeGeometry(size, 0.55, 16, 1, true), new THREE.MeshStandardMaterial({ map: stripeTex(a, b), side: THREE.DoubleSide, roughness: 0.9 }));
    top.position.set(x, 2.55, z);
    top.castShadow = true;
    root.add(top);
    B.add(mat.white, new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8), M4(x, 1.25, z));
    B.add(mat.white, new THREE.CylinderGeometry(0.45, 0.45, 0.05, 18), M4(x, 0.74, z));
    B.add(mat.white, new THREE.CylinderGeometry(0.06, 0.14, 0.72, 10), M4(x, 0.36, z));
    for (const d of [-1, 1]) {
      B.add(mat.white, new THREE.BoxGeometry(0.62, 0.42, 0.62), M4(x + d * 0.85, 0.21, z));
      B.add(std(T.seatColors[(d + 1) % T.seatColors.length], { roughness: 1 }), new THREE.BoxGeometry(0.58, 0.1, 0.58), M4(x + d * 0.85, 0.47, z), false);
      seats.push({ pos: new THREE.Vector3(x + d * 0.85, 0.62, z), yaw: d > 0 ? Math.PI / 2 : -Math.PI / 2, standing: false, members: true });
    }
    B.add(std(0xf7d98a, { roughness: 0.2 }), new THREE.CylinderGeometry(0.045, 0.04, 0.16, 10), M4(x + 0.12, 0.85, z + 0.1), false);
    B.add(std(0xf2a9b8, { roughness: 0.2 }), new THREE.CylinderGeometry(0.045, 0.04, 0.16, 10), M4(x - 0.12, 0.85, z - 0.08), false);
  };
  const sail = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3) => {
    const g = new THREE.BufferGeometry().setFromPoints([p0, p1, p2]);
    g.computeVertexNormals();
    B.add(mat.fabric, g, undefined, true);
    for (const p of [p0, p1, p2]) B.add(mat.white, new THREE.CylinderGeometry(0.07, 0.09, p.y, 10), M4(p.x, p.y / 2, p.z));
  };
  const logoBanner = (x: number, z: number, yaw: number, w: number, h: number, bg: string, ink: string, vertical = false) => {
    const tex = liveTex(vertical ? 256 : 512, vertical ? 640 : 300, (g, tw, th) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, tw, th);
      if (vertical) {
        g.save();
        g.translate(tw / 2, th * 0.42);
        g.rotate(-Math.PI / 2);
        drawLogo(g, 0, 0, th * 0.62, ink);
        g.restore();
        drawLaurel(g, tw / 2, th * 0.84, tw * 0.45, ink);
      } else drawLogo(g, tw / 2, th / 2, tw * 0.62, ink);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 8, 1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
    if (!vertical) {
      const pp = m.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) pp.setZ(i, -Math.pow(pp.getX(i) / (w / 2), 2) * 0.5);
      m.geometry.computeVertexNormals();
    }
    m.position.set(x, vertical ? 3.4 : 4.4, z);
    m.rotation.y = yaw;
    if (!vertical) m.rotation.x = -0.35;
    m.castShadow = true;
    root.add(m);
    return m;
  };

  if (T.id === 'coral') {
    // Two big curved sail banners with the script at the far corners.
    for (const s of [-1, 1]) {
      const b = logoBanner(s * (OA - 1.2), -OB + 2.4, s * 0.8, 5.2, 2.6, '#fbf7f0', '#2f5b3d');
      b.rotation.z = s * -0.15;
      B.add(mat.white, new THREE.CylinderGeometry(0.08, 0.1, 6, 10), M4(s * (OA + 0.6), 3, -OB + 0.6));
      B.add(mat.white, new THREE.CylinderGeometry(0.08, 0.1, 5, 10), M4(s * (OA - 3.2), 2.5, -OB + 4.2));
    }
    for (const [x, z] of [
      [OA + 2.4, -2],
      [-(OA + 2.4), -2],
      [OA + 2.4, 5],
      [-(OA + 2.4), 5],
    ])
      umbrella(x, z, 0x9fbf9f, 0xfbf7f0);
    // Striped entrance awning with the script.
    const aw = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 4.2, 24, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ map: stripeTex(0x9fbf9f, 0xfbf7f0), side: THREE.DoubleSide, roughness: 0.9 }));
    aw.rotation.x = Math.PI / 2;
    aw.rotation.z = Math.PI;
    aw.scale.set(1, 1, 0.45);
    aw.position.set(0, 2.2, OB + 4.4);
    aw.castShadow = true;
    root.add(aw);
    const awLogo = logoBanner(0, OB + 2.3, 0, 2.6, 1.0, '#9fbf9f', '#fbf7f0');
    awLogo.position.y = 2.6;
    awLogo.rotation.x = 0;
  } else if (T.id === 'rose') {
    // Triangular sail shades over the four corners of the bowl.
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const cx = sx * (OA - 0.6);
      const cz = sz * (OB - 0.6);
      sail(new THREE.Vector3(cx + sx * 1.2, 5.6, cz + sz * 1.2), new THREE.Vector3(cx - sx * 4.6, 4.2, cz + sz * 0.4), new THREE.Vector3(cx + sx * 0.4, 4.0, cz - sz * 4.8));
    }
    // Striped cabanas with crest panels on both sides.
    const cabTex = liveTex(256, 256, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#fbf6f4' : '#c9b6e2';
        g.fillRect(i * (w / 8), 0, w / 8, h);
      }
    });
    const crestPanel = liveTex(256, 256, (g, w, h) => {
      g.fillStyle = '#fbf6f4';
      g.fillRect(0, 0, w, h);
      drawCrest(g, w / 2, h / 2, w * 0.7, '#7d8f7e');
    });
    for (const sx of [1, -1]) {
      for (const z of [-4.5, 4.5]) {
        const x = sx * (OA + 2.2);
        for (const [dx, dz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          B.add(mat.white, new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), M4(x + dx * 1.1, 1.4, z + dz * 1.3));
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 2.9), new THREE.MeshStandardMaterial({ map: cabTex, roughness: 0.9 }));
        roof.position.set(x, 2.85, z);
        roof.castShadow = true;
        root.add(roof);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshStandardMaterial({ map: crestPanel, side: THREE.DoubleSide }));
        panel.position.set(x - sx * 1.12, 2.25, z);
        panel.rotation.y = Math.PI / 2;
        root.add(panel);
        B.add(std(0xf6efe8, { roughness: 1 }), new THREE.BoxGeometry(1.8, 0.35, 0.8), M4(x + sx * 0.3, 0.3, z));
        seats.push({ pos: new THREE.Vector3(x + sx * 0.3, 0.6, z - 0.2), yaw: sx > 0 ? Math.PI / 2 : -Math.PI / 2, standing: false, members: true });
      }
      umbrella(sx * (OA + 2.4), 0, 0xa9c9ad, 0xfbf6f4);
      umbrella(sx * (OA + 2.6), -OB + 1, 0xa9c9ad, 0xfbf6f4);
    }
  } else if (T.id === 'lavender') {
    for (const s of [-1, 1]) {
      B.add(mat.white, new THREE.CylinderGeometry(0.07, 0.09, 6.4, 10), M4(s * (OA - 0.4), 3.2, OB + 0.8));
      B.add(mat.white, new THREE.SphereGeometry(0.12, 12, 8), M4(s * (OA - 0.4), 6.45, OB + 0.8));
      B.add(mat.white, new THREE.BoxGeometry(1.3, 0.05, 0.05), M4(s * (OA - 0.4) - s * 0.62, 5.9, OB + 0.8));
      const ban = logoBanner(s * (OA - 0.4) - s * 0.64, OB + 0.82, 0, 1.15, 3.2, '#a99ad0', '#fbf8ff', true);
      ban.position.y = 4.25;
      // Glowing script on the inner walls beside the booth.
      const wallTex = liveTex(512, 220, (g, w, h) => drawLogo(g, w / 2, h / 2, w * 0.86, '#fff6ea'));
      const wl = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.35), new THREE.MeshStandardMaterial({ map: wallTex, transparent: true, emissive: 0xffe8c8, emissiveMap: wallTex, emissiveIntensity: 1.1, depthWrite: false }));
      const hTop = 0.3 + (rows - 1) * rise;
      wl.position.set(s * 5.6, hTop + 2.2, -OB + 0.1);
      root.add(wl);
      B.add(mat.stone, new THREE.BoxGeometry(5.6, 2.8, 0.5), M4(s * 6.2, hTop + 1.6, -OB - 0.2));
      umbrella(s * (OA + 2.2), OB + 1.5, 0xfbf8ff, 0xfbf8ff, 1.6);
    }
    // Curved lounges round a fire bowl at the entrance.
    const sofaMat = std(0xfbf8f3, { roughness: 0.95 });
    for (const s of [-1, 1]) {
      const sofa = new THREE.TorusGeometry(1.3, 0.32, 10, 24, Math.PI * 0.9);
      B.add(sofaMat, sofa, M4(s * 2.0, 0.35, OB + 4.4, s > 0 ? Math.PI * 0.55 : Math.PI * 0.45, 1, Math.PI / 2));
      for (let k = 0; k < 3; k++) B.add(std(0xa8b9e0, { roughness: 1 }), new THREE.BoxGeometry(0.4, 0.4, 0.14), M4(s * 2.0 + s * Math.cos(k * 0.9 - 0.9) * 1.1, 0.75, OB + 4.4 + Math.sin(k * 0.9 - 0.9) * 1.1, k * 0.6));
    }
    B.add(std(0xd9d4cc, { roughness: 0.4, metalness: 0.3 }), new THREE.CylinderGeometry(0.55, 0.4, 0.5, 20), M4(0, 0.25, OB + 4.4));
    const fire = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa860, emissiveIntensity: 2.2 }));
    fire.position.set(0, 0.55, OB + 4.4);
    fire.scale.set(1, 0.6, 1);
    root.add(fire);
    lights.push(fire);
    // Lavender beds around the bowl.
    for (let i = 0; i < 380; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 1 + rnd() * 1.4;
      const x = Math.cos(a) * (OA + 1.5 + rnd() * 1.6);
      const z = Math.sin(a) * (OB + 1.5 + rnd() * 1.6);
      if (z > OB && Math.abs(x) < 4.5) continue;
      lavenderStems.push(M4(x, 0, z, rnd() * 6, r));
    }
  } else {
    // Terrace: loungers, a big parasol, a built-in bench with cushions and lemonade.
    const loungerMat = std(0xfbf8f3, { roughness: 0.9 });
    for (let k = 0; k < 3; k++) {
      const x = -(SA + 0.0);
      const z = 5.8 + k * 1.3;
      B.add(mat.wood, new THREE.BoxGeometry(1.9, 0.2, 0.75), M4(x - 1.2, 0.25, z, Math.PI / 2 - 0.2));
      B.add(loungerMat, new THREE.BoxGeometry(1.4, 0.16, 0.7), M4(x - 1.3, 0.42, z, Math.PI / 2 - 0.2));
      B.add(loungerMat, new THREE.BoxGeometry(0.7, 0.16, 0.7), M4(x - 1.3, 0.66, z + 0.75, Math.PI / 2 - 0.2, 1, -0.9));
      B.add(std(0xa8d8bf, { roughness: 1 }), new THREE.BoxGeometry(0.42, 0.28, 0.12), M4(x - 1.3, 0.8, z + 0.85, Math.PI / 2 - 0.2, 1, -0.6));
    }
    umbrella(-(SA + 1.4), 4.2, 0xfbf8f3, 0xfbf8f3, 2.0);
    B.add(mat.stone, new THREE.BoxGeometry(0.9, 0.5, 5.5), M4(SA + 1.5, 0.25, 7.2));
    for (let k = 0; k < 4; k++) B.add(std(k % 2 ? 0xa8d8bf : 0xfbf8f3, { roughness: 1 }), new THREE.BoxGeometry(0.15, 0.45, 0.5), M4(SA + 1.85, 0.72, 5.4 + k * 1.2, 0, 1, 0, 0.15));
    B.add(mat.stone, new THREE.CylinderGeometry(0.3, 0.25, 0.55, 16), M4(SA + 0.7, 0.28, 8.5));
    B.add(std(0xf7e8a0, { roughness: 0.1, transparent: true, opacity: 0.85 }), new THREE.CylinderGeometry(0.08, 0.09, 0.25, 12), M4(SA + 0.7, 0.68, 8.5));
    for (let k = 0; k < 2; k++) B.add(std(0xf7e8a0, { roughness: 0.1 }), new THREE.CylinderGeometry(0.04, 0.035, 0.12, 10), M4(SA + 0.82 - k * 0.24, 0.62, 8.62));
    for (const [x, z] of [
      [-(SA + 0.9), 9.6],
      [SA + 0.9, 9.8],
      [-(SA + 0.6), -9.8],
      [SA + 0.6, -9.8],
    ]) {
      B.add(mat.pot, new THREE.CylinderGeometry(0.5, 0.4, 0.75, 18), M4(x, 0.38, z));
      shrubs.push(M4(x, 1.1, z, rnd() * 6, 1.4));
      for (let q = 0; q < 6; q++) hydrangea.push(M4(x + (rnd() - 0.5) * 0.7, 1.0 + rnd() * 0.4, z + (rnd() - 0.5) * 0.7, 0, 1.4 + rnd() * 0.4));
    }
    // Cypress line along the far view.
    for (let k = 0; k < 9; k++) cypress.push(M4(-16 + k * 4, 0, -24 - (k % 2) * 3, 0, 1 + rnd() * 0.3));
  }

  // Bar kiosk outside the near-right corner of the bowl; the bartender serves spritzes and snacks.
  const bx = T.id === 'terrace' ? SA + 2.1 : OA + 2.6;
  const bzz = T.id === 'terrace' ? 11.2 : OB - 1.5;
  B.box(mat.wood, 3.4, 1.05, 0.9, bx, 0.53, bzz);
  B.box(mat.white, 3.6, 0.07, 1.05, bx, 1.08, bzz);
  B.box(mat.white, 3.4, 2.7, 0.15, bx, 1.35, bzz + 1.35);
  const barAwning = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.08, 2.1), new THREE.MeshStandardMaterial({ map: stripeTex(T.accent, 0xfbf7f0), roughness: 0.9 }));
  barAwning.position.set(bx, 2.95, bzz + 0.45);
  barAwning.rotation.x = -0.12;
  barAwning.castShadow = true;
  root.add(barAwning);
  for (const s of [-1, 1]) B.box(mat.white, 0.1, 2.9, 0.1, bx + s * 1.8, 1.45, bzz - 0.5);
  for (let k = 0; k < 8; k++) B.add(std([0xf7d98a, 0xf2a9b8, 0xb9dcb0, 0xc8b8e3][k % 4], { roughness: 0.15 }), new THREE.CylinderGeometry(0.05, 0.05, 0.26, 10), M4(bx - 1.4 + k * 0.4, 1.3, bzz + 1.2), false);
  for (let k = 0; k < 5; k++) B.add(std(RESORT.lemon, { roughness: 0.6 }), new THREE.SphereGeometry(0.07, 8, 6), M4(bx - 0.5 + k * 0.15, 1.18, bzz - 0.2), false);
  B.add(std(0xe8b06a, { roughness: 0.8 }), new THREE.BoxGeometry(0.5, 0.06, 0.3), M4(bx + 0.9, 1.15, bzz - 0.15), false); // focaccia
  const menuTex = liveTex(320, 200, (g, w, h) => {
    g.fillStyle = css(T.accentDeep);
    g.fillRect(0, 0, w, h);
    drawLogo(g, w / 2, 42, 150, '#fbf6ec');
    g.fillStyle = '#fbf6ec';
    g.font = '600 20px Nunito, sans-serif';
    g.textAlign = 'center';
    ['Spritz · Rosé · Lemonade', 'Iced matcha · Espresso', 'Olives · Focaccia · Fruit'].forEach((t, i) => g.fillText(t, w / 2, 98 + i * 32));
  });
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.88), new THREE.MeshStandardMaterial({ map: menuTex, roughness: 0.9 }));
  menu.position.set(bx, 2.15, bzz + 1.26);
  menu.rotation.y = Math.PI;
  root.add(menu);
  for (const s of [-1, 1]) B.add(mat.wood, new THREE.CylinderGeometry(0.2, 0.2, 0.75, 12), M4(bx + s * 1.0, 0.38, bzz - 1.05));

  // ---------------------------------------------------------------- trees around the grounds
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rnd() * 0.1;
    const rx = OA + 6 + rnd() * 10;
    const rz = OB + 6 + rnd() * 10;
    const x = Math.cos(a) * rx;
    const z = Math.sin(a) * rz;
    const list = T.trees === 'palm' ? (i % 4 === 0 ? olives : palms) : i % 3 === 0 ? cypress : olives;
    list.push(M4(x, 0, z, rnd() * 6, 0.9 + rnd() * 0.5));
  }
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * (OA + 3.5 + rnd() * 3);
    const z = Math.sin(a) * (OB + 3.5 + rnd() * 3);
    if (z > OB && Math.abs(x) < 5) continue;
    shrubs.push(M4(x, 0.3, z, rnd() * 6, 1.1 + rnd() * 0.8));
    if (T.flowers[0] !== 0xfbf8f1 && rnd() < 0.6) bougainvillea.push(M4(x, 0.7 + rnd() * 0.5, z, rnd() * 6, 1 + rnd()));
  }

  // ---------------------------------------------------------------- instanced meshes
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
  // Chair: rounded seat + back + slim legs, front facing −z (toward the court after rotation).
  const chairGeo = merge([
    new THREE.BoxGeometry(0.48, 0.09, 0.44).translate(0, 0.44, 0),
    new THREE.BoxGeometry(0.48, 0.42, 0.07).translate(0, 0.7, 0.22).rotateX(0),
    new THREE.CylinderGeometry(0.22, 0.22, 0.07, 14).scale(1.1, 1, 0.3).translate(0, 0.92, 0.24),
    new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(-0.19, 0.2, -0.16),
    new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(0.19, 0.2, -0.16),
    new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(-0.19, 0.2, 0.16),
    new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(0.19, 0.2, 0.16),
  ]);
  inst(chairGeo, new THREE.MeshStandardMaterial({ roughness: 0.55 }), chairs.map((c) => c.m), true, chairs.map((c) => c.c));
  inst(new THREE.BoxGeometry(0.5, 0.09, 0.46), new THREE.MeshStandardMaterial({ roughness: 1 }), cushions.map((c) => c.m), false, cushions.map((c) => c.c));
  inst(new THREE.BoxGeometry(1, 1, 1), mat.glow, glowStrips, false);
  // Palms: curved trunk + drooping fronds.
  const trunkParts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const t = k / 7;
    trunkParts.push(new THREE.CylinderGeometry(0.17 - t * 0.06, 0.2 - t * 0.06, 0.9, 8).translate(Math.pow(t, 1.6) * 0.9, 0.45 + k * 0.85, 0));
  }
  const palmTrunk = merge(trunkParts);
  const frondParts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const leaf = new THREE.PlaneGeometry(0.55, 2.6, 1, 8);
    const lp = leaf.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < lp.count; i++) {
      const y = lp.getY(i) + 1.3; // 0..2.6 along the frond
      const w = Math.sin((y / 2.6) * Math.PI) * 1.0;
      lp.setX(i, lp.getX(i) * w);
      lp.setZ(i, -y);
      lp.setY(i, Math.sin((y / 2.6) * 1.9) * 0.9 - (y / 2.6) * (y / 2.6) * 1.6);
    }
    leaf.computeVertexNormals();
    leaf.rotateY((k / 9) * Math.PI * 2);
    leaf.translate(0.9, 6.2, 0);
    frondParts.push(leaf);
  }
  const palmFronds = merge(frondParts);
  inst(palmTrunk, std(RESORT.palmTrunk, { roughness: 1 }), palms);
  inst(palmFronds, std(RESORT.palm, { roughness: 0.9, side: THREE.DoubleSide }), palms);
  // Potted palms (smaller) by the booth.
  inst(new THREE.CylinderGeometry(0.42, 0.34, 0.65, 16), mat.pot, pottedPalms);
  inst(palmFronds.clone().translate(-0.9, -4.6, 0).scale(0.5, 0.5, 0.5), std(RESORT.palm, { roughness: 0.9, side: THREE.DoubleSide }), pottedPalms);
  // Olive + cypress.
  const oliveTrunk = new THREE.CylinderGeometry(0.12, 0.22, 2.2, 7).translate(0, 1.1, 0);
  const oliveCanopy = merge([0, 1, 2, 3, 4].map((k) => new THREE.IcosahedronGeometry(1.0 + (k % 2) * 0.3, 1).translate(Math.cos(k * 1.3) * 0.9, 2.6 + (k % 3) * 0.35, Math.sin(k * 1.3) * 0.9)));
  inst(oliveTrunk, std(RESORT.trunk, { roughness: 1 }), olives);
  inst(oliveCanopy, std(RESORT.olive, { roughness: 1 }), olives);
  inst(new THREE.SphereGeometry(0.9, 12, 10).scale(1, 4, 1).translate(0, 3.6, 0), std(RESORT.cypress, { roughness: 1 }), cypress);
  // Flowers + greenery.
  const bougCols = bougainvillea.map(() => T.flowers[Math.floor(rnd() * T.flowers.length)]);
  inst(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), bougainvillea, false, bougCols);
  inst(new THREE.IcosahedronGeometry(0.42, 1), mat.leaf, shrubs, true);
  inst(new THREE.IcosahedronGeometry(0.15, 1), std(T.id === 'lavender' ? 0xc9d6f2 : 0xfbf8f1, { roughness: 1 }), hydrangea, false);
  inst(new THREE.ConeGeometry(0.06, 0.5, 5).translate(0, 0.25, 0), std(RESORT.lavender, { roughness: 1 }), lavenderStems, false);

  B.build(root);

  // Disco ball, spot beams, pendant pulse.
  const tick = (t: number, beat: number) => {
    for (const s of spinners) s.rotation.y = t * 0.6;
    beams.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 0.8 + i * 0.9) * 0.45;
      (b.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.pow(1 - beat, 3) * 0.12;
    });
  };

  const walkPaths: THREE.Vector3[][] = [
    [new THREE.Vector3(bx - 1.2, 0, bzz - 1.6), new THREE.Vector3(SA + 0.6, 0, 8), new THREE.Vector3(SA + 0.6, 0, -8), new THREE.Vector3(SA + 0.6, 0, 8)],
  ];
  const djAnchor = new THREE.Vector3(0, 0.32, zb - 0.45);
  const extras: ResortExtras = {
    theme: T,
    courts: [],
    walkPaths,
    bartender: { pos: new THREE.Vector3(bx, 0, bzz + 0.7), yaw: Math.PI },
    otherDjs: [],
    orbit: { radius: Math.max(OA, OB) + 15, height: 25 },
    reflective,
    exposure: L.exposure,
    tick,
  };
  return {
    root,
    sun,
    seats,
    djAnchor,
    djYaw: Math.PI,
    djBooth: root,
    djLights: lights,
    stringLights: new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 4, 3), mat.glow, 0),
    bunting: new THREE.Group(),
    extras,
  };
}

/** Free GPU memory of an arena that is being replaced. */
export function disposeArena(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
    for (const mm of mats) {
      for (const v of Object.values(mm)) if (v instanceof THREE.Texture) v.dispose();
      mm.dispose();
    }
  });
  root.removeFromParent();
}
