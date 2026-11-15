// The Rally Club resort — one connected Mediterranean-style world with four themed courts:
// the Garden Court (pickleball, playable, at the origin), the Clay Terrace (tennis), the Glass House
// (padel) and the Sunset Cliff (pickleball by the sea). Cream stone terraces, olive and cypress trees,
// lavender beds, sail shades, striped parasols, an arched DJ booth on every court, a bar, a villa
// clubhouse and lounges with drinks. Original design; built for speed: static geometry is merged per
// material and repeated props are instanced.

import * as THREE from 'three';
import { type Court, netHeightAt } from '../../../shared/src/court.ts';
import { COURTS, type CourtId, type CourtTheme, RESORT } from './themes.ts';
import type { Venue } from './venue.ts';

export interface Seat {
  pos: THREE.Vector3;
  yaw: number;
  standing: boolean;
  members?: boolean;
}

export interface ResortExtras {
  courts: { theme: CourtTheme; anchor: THREE.Vector3 }[];
  /** Ambient walkers (waiters) as polylines the game animates members along. */
  walkPaths: THREE.Vector3[][];
  /** Where the bartender stands (and faces). */
  bartender: { pos: THREE.Vector3; yaw: number };
  /** Static DJ spots on the non-playable courts. */
  otherDjs: { pos: THREE.Vector3; yaw: number }[];
  tick(t: number): void;
}

// ------------------------------------------------------------------ helpers

const std = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

function toNonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  return n;
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map(toNonIndexed);
  const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** Collects geometry per material and builds one mesh per material. */
class Batches {
  private map = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private shadows = new Map<THREE.Material, boolean>();
  add(material: THREE.Material, geo: THREE.BufferGeometry, m?: THREE.Matrix4, castShadow = true): void {
    const g = geo.clone();
    if (m) g.applyMatrix4(m);
    const list = this.map.get(material) ?? [];
    list.push(g);
    this.map.set(material, list);
    if (castShadow) this.shadows.set(material, true);
  }
  box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, cast = true): void {
    this.add(material, new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)), cast);
  }
  build(parent: THREE.Object3D): void {
    for (const [mat, list] of this.map) {
      const mesh = new THREE.Mesh(merge(list), mat);
      mesh.castShadow = !!this.shadows.get(mat);
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.map.clear();
  }
}

const M4 = (x: number, y: number, z: number, ry = 0, s = 1, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Two laurel branches (the club mark), drawn into a canvas context centred at (cx, cy). */
export function drawLaurel(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = size * 0.045;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.save();
    g.scale(s, 1);
    g.beginPath();
    g.moveTo(size * 0.06, size * 0.42);
    g.quadraticCurveTo(size * 0.48, size * 0.25, size * 0.42, -size * 0.38);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const px = size * (0.12 + 0.36 * Math.sin(t * 1.4));
      const py = size * (0.36 - 0.72 * t);
      g.save();
      g.translate(px, py);
      g.rotate(-0.9 + t * 0.5);
      g.beginPath();
      g.ellipse(size * 0.07, 0, size * 0.1, size * 0.04, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.restore();
  }
  g.restore();
}

// ------------------------------------------------------------------ build

export function buildResort(scene: THREE.Scene, court: Court): Venue & { extras: ResortExtras } {
  const root = new THREE.Group();
  scene.add(root);
  const B = new Batches();

  // Shared materials.
  const mat = {
    stone: std(RESORT.stone, { roughness: 0.95 }),
    stoneShade: std(RESORT.stoneShade, { roughness: 0.95 }),
    plaster: std(RESORT.plaster, { roughness: 0.9 }),
    wood: std(RESORT.wood, { roughness: 0.7 }),
    woodDark: std(RESORT.woodDark, { roughness: 0.7 }),
    lawn: std(RESORT.lawn, { roughness: 1 }),
    path: std(0xeadcc1, { roughness: 1 }),
    metal: std(0xe9e4da, { roughness: 0.4, metalness: 0.3 }),
    dark: std(0x2f2b28, { roughness: 0.5 }),
    fabric: std(RESORT.fabric, { roughness: 0.9, side: THREE.DoubleSide }),
    cushionSage: std(0xa8bf9c, { roughness: 1 }),
    cushionLav: std(0xc8b8e3, { roughness: 1 }),
    cushionCream: std(0xf3e9d6, { roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xdff0f5, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    vine: std(0x7e9a62, { roughness: 1 }),
    flowerWhite: std(0xfbf8f1, { roughness: 1 }),
    flowerPink: std(0xf0a7c0, { roughness: 1 }),
    lemon: std(RESORT.lemon, { roughness: 0.7 }),
  };

  // ---------------------------------------------------------------- sky, light, distant land
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      map: canvasTex(1024, 512, (g) => {
        const grd = g.createLinearGradient(0, 0, 0, 512);
        grd.addColorStop(0, '#7fb2e5');
        grd.addColorStop(0.42, '#b9d7f0');
        grd.addColorStop(0.5, '#f5ead8');
        grd.addColorStop(1, '#f5ead8');
        g.fillStyle = grd;
        g.fillRect(0, 0, 1024, 512);
        for (let i = 0; i < 26; i++) {
          const x = Math.random() * 1024;
          const y = 90 + Math.random() * 130;
          for (let k = 0; k < 8; k++) {
            const r = 14 + Math.random() * 26;
            const cg = g.createRadialGradient(x + k * 12, y, 0, x + k * 12, y, r);
            cg.addColorStop(0, 'rgba(255,255,255,0.75)');
            cg.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = cg;
            g.fillRect(x + k * 12 - r, y - r, r * 2, r * 2);
          }
        }
      }),
    }),
  );
  root.add(sky);
  scene.background = new THREE.Color(0xcfe2f2);
  scene.fog = new THREE.Fog(0xe9e6dc, 70, 260);

  const hemi = new THREE.HemisphereLight(0xe4f0ff, 0xd8c7a4, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-16, 26, 12);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // Ground: a big soft lawn plateau, a cliff edge to the south (−z) with the sea below, hills around.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 200), mat.lawn);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, 38); // spans z -62 … 138: the plateau ends at the cliff south of the Sunset court
  ground.receiveShadow = true;
  root.add(ground);
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(320, 16, 2), std(0xe3cfac, { roughness: 1 }));
  cliff.position.set(0, -8, -63);
  root.add(cliff);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 600), std(RESORT.sea, { roughness: 0.25, metalness: 0.1 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -12, -360);
  root.add(sea);
  // Distant headland across the bay.
  const headland = new THREE.SphereGeometry(60, 20, 10);
  B.add(std(0xb9c3a0, { roughness: 1 }), headland, new THREE.Matrix4().compose(new THREE.Vector3(-150, -30, -260), new THREE.Quaternion(), new THREE.Vector3(2.2, 0.7, 1)), false);
  const hillMat = std(RESORT.hills, { roughness: 1 });
  const farMat = std(RESORT.hillsFar, { roughness: 1 });
  for (let i = 0; i < 22; i++) {
    const a = -Math.PI * 0.12 + (i / 21) * Math.PI * 1.24; // east, north (+z) and west; the sea is south
    const r = 150 + (i % 3) * 40;
    const hill = new THREE.SphereGeometry(40 + (i % 4) * 14, 18, 10);
    B.add(i % 2 ? hillMat : farMat, hill, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, -18, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(1.6, 0.55, 1)), false);
  }

  // Stone paths linking the courts and the villa.
  const pathTo = (x0: number, z0: number, x1: number, z1: number, w = 3) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.BoxGeometry(w, 0.04, len);
    B.add(mat.path, g, M4((x0 + x1) / 2, 0.0, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0)), false);
  };
  pathTo(0, 13, 0, 36);
  pathTo(8, -13, 30, -8);
  pathTo(-8, -13, -27, -6);
  pathTo(0, -13, 0, -22);
  pathTo(0, -33, 3, -38);

  // ---------------------------------------------------------------- instanced foliage
  const olive: THREE.Matrix4[] = [];
  const cypress: THREE.Matrix4[] = [];
  const lavender: THREE.Matrix4[] = [];
  const hydrangea: THREE.Matrix4[] = [];
  const rnd = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  const lavenderBed = (cx: number, cz: number, w: number, d: number, ry = 0) => {
    const n = Math.floor(w * d * 7);
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    B.add(std(0x8a7a62, { roughness: 1 }), new THREE.BoxGeometry(w + 0.2, 0.18, d + 0.2), M4(cx, 0.06, cz, ry), false);
    for (let i = 0; i < n; i++) {
      const lx = (rnd() - 0.5) * w;
      const lz = (rnd() - 0.5) * d;
      lavender.push(M4(cx + lx * c + lz * s, 0.15, cz - lx * s + lz * c, rnd() * 6, 0.8 + rnd() * 0.5));
    }
  };
  const hydrangeaPot = (x: number, z: number, s = 1) => {
    B.add(mat.stone, new THREE.CylinderGeometry(0.42 * s, 0.32 * s, 0.6 * s, 14), M4(x, 0.3 * s, z));
    for (let k = 0; k < 5; k++) hydrangea.push(M4(x + (rnd() - 0.5) * 0.4 * s, 0.75 * s + rnd() * 0.15, z + (rnd() - 0.5) * 0.4 * s, 0, s * (0.8 + rnd() * 0.3)));
  };

  // ---------------------------------------------------------------- courts
  const seats: Seat[] = [];
  const courts: ResortExtras['courts'] = [];
  const otherDjs: ResortExtras['otherDjs'] = [];
  let mainDj: { anchor: THREE.Vector3; yaw: number; booth: THREE.Group; lights: THREE.Mesh[] } | null = null;
  const bulbs: THREE.Vector3[] = [];

  const laurelTex = (bg: string, fg: string, w = 256, h = 512) =>
    canvasTex(w, h, (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      drawLaurel(g, w / 2, h * 0.42, w * 0.6, fg);
      g.fillStyle = fg;
      g.font = `600 ${Math.round(w * 0.11)}px Fredoka, Nunito, sans-serif`;
      g.textAlign = 'center';
      g.fillText('RALLY CLUB', w / 2, h * 0.8);
    });

  for (const id of ['garden', 'clay', 'glass', 'sunset'] as CourtId[]) {
    const T = COURTS[id];
    const grp = new THREE.Group();
    grp.position.set(T.x, 0, T.z);
    grp.rotation.y = T.yaw;
    root.add(grp);
    const local = new Batches();
    const isTennis = T.sport === 'Tennis';
    const isPadel = T.sport === 'Padel';
    const cw = isTennis ? 10.97 : isPadel ? 10 : court.width;
    const cl = isTennis ? 23.77 : isPadel ? 20 : court.length;
    const sw = cw + (isTennis ? 7 : isPadel ? 2 : 6.2); // surround width (x)
    const sl = cl + (isTennis ? 12 : isPadel ? 2 : 6.6); // surround length (z)
    const courtMat = std(T.court, { roughness: 0.9 });
    const surroundMat = std(T.surround, { roughness: 0.95 });
    const lineMat = std(T.line, { roughness: 0.7 });
    const accentMat = std(T.accent, { roughness: 0.9 });

    // Raised stone plinth, surround, court surface, kitchens, lines.
    local.add(mat.stoneShade, new THREE.BoxGeometry(sw + 1.2, 0.18, sl + 1.2), M4(0, 0.0, 0), false);
    local.add(surroundMat, new THREE.BoxGeometry(sw, 0.04, sl), M4(0, 0.1, 0), false);
    local.add(courtMat, new THREE.BoxGeometry(cw, 0.02, cl), M4(0, 0.12, 0), false);
    const Y = 0.135;
    const line = (w: number, d: number, x: number, z: number) => local.add(lineMat, new THREE.BoxGeometry(w, 0.006, d), M4(x, Y, z), false);
    const lw = 0.05;
    if (isTennis) {
      line(cw, lw, 0, cl / 2 - lw / 2);
      line(cw, lw, 0, -cl / 2 + lw / 2);
      for (const s of [1, -1]) {
        line(lw, cl, s * (cw / 2 - lw / 2), 0);
        line(lw, cl, s * (8.23 / 2), 0);
        line(8.23, lw, 0, s * 6.4);
      }
      line(lw, 12.8, 0, 0);
    } else if (isPadel) {
      line(cw, lw, 0, cl / 2 - lw / 2);
      line(cw, lw, 0, -cl / 2 + lw / 2);
      for (const s of [1, -1]) {
        line(lw, cl, s * (cw / 2 - lw / 2), 0);
        line(cw, lw, 0, s * 6.95);
        line(lw, 6.95, 0, s * 3.475);
      }
    } else {
      for (const s of [1, -1]) local.add(std(T.kitchen, { roughness: 0.9 }), new THREE.BoxGeometry(cw, 0.022, court.nvzDepth), M4(0, 0.123, (s * court.nvzDepth) / 2), false);
      line(cw, lw, 0, cl / 2 - lw / 2);
      line(cw, lw, 0, -cl / 2 + lw / 2);
      line(lw, cl, cw / 2 - lw / 2, 0);
      line(lw, cl, -cw / 2 + lw / 2, 0);
      line(cw, lw, 0, court.nvzDepth - lw / 2);
      line(cw, lw, 0, -court.nvzDepth + lw / 2);
      const c2 = cl / 2 - court.nvzDepth;
      line(lw, c2, 0, court.nvzDepth + c2 / 2);
      line(lw, c2, 0, -court.nvzDepth - c2 / 2);
    }

    // Net: sage posts with cream caps, dark mesh, white tape.
    const span = cw / 2 + (isTennis ? 0.9 : 0.3);
    const postH = isTennis ? 1.07 : court.netHeightPost;
    for (const s of [1, -1]) {
      local.add(std(0x6f8463, { roughness: 0.5 }), new THREE.CylinderGeometry(0.05, 0.055, postH + 0.1, 12), M4(s * span, 0.12 + (postH + 0.1) / 2, 0));
      local.add(mat.stone, new THREE.SphereGeometry(0.065, 12, 8), M4(s * span, 0.12 + postH + 0.12, 0));
    }
    const netTex = canvasTex(
      64,
      64,
      (g) => {
        g.strokeStyle = 'rgba(40,46,38,0.95)';
        g.lineWidth = 3;
        for (let i = 0; i <= 64; i += 8) {
          g.beginPath();
          g.moveTo(i, 0);
          g.lineTo(i, 64);
          g.moveTo(0, i);
          g.lineTo(64, i);
          g.stroke();
        }
      },
      [span * 14, 6],
    );
    const netGeo = new THREE.PlaneGeometry(span * 2, 1, 24, 1);
    const np = netGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < np.count; i++) np.setY(i, np.getY(i) > 0 ? 0.12 + (isTennis ? 0.95 : netHeightAt(court, np.getX(i))) : 0.16);
    np.needsUpdate = true;
    netGeo.computeVertexNormals();
    const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 }));
    net.castShadow = true;
    grp.add(net);
    local.add(lineMat, new THREE.BoxGeometry(span * 2, 0.06, 0.03), M4(0, 0.12 + (isTennis ? 0.92 : court.netHeightCenter + 0.01), 0));

    if (isPadel) {
      // Glass walls on the ends and back corners, white steel frames.
      const wallH = 3;
      for (const s of [1, -1]) {
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(cw, wallH), mat.glass);
        glass.position.set(0, 0.12 + wallH / 2, s * (cl / 2));
        grp.add(glass);
        for (const sx of [1, -1]) {
          const side = new THREE.Mesh(new THREE.PlaneGeometry(2, wallH), mat.glass);
          side.rotation.y = Math.PI / 2;
          side.position.set(sx * (cw / 2), 0.12 + wallH / 2, s * (cl / 2 - 1));
          grp.add(side);
        }
        for (let k = 0; k <= 5; k++) local.add(mat.metal, new THREE.BoxGeometry(0.06, wallH + 1, 0.06), M4(-cw / 2 + (k * cw) / 5, 0.12 + (wallH + 1) / 2, s * (cl / 2)));
        local.add(mat.metal, new THREE.BoxGeometry(cw, 0.06, 0.06), M4(0, 0.12 + wallH, s * (cl / 2)));
        for (const sx of [1, -1]) for (let k = 0; k <= 6; k++) local.add(mat.metal, new THREE.BoxGeometry(0.05, 2.2, 0.05), M4(sx * (cw / 2), 1.2, -cl / 2 + (k * cl) / 6));
      }
    }

    // Stone terraces along both long sides (3 tiers) with cushions, and short terraces at the far end.
    const tiers = 3;
    const tierD = 0.95;
    const tierH = 0.45;
    const tLen = sl - 2;
    for (const sx of [1, -1]) {
      for (let r = 0; r < tiers; r++) {
        const x = sx * (sw / 2 + 0.7 + r * tierD + tierD / 2);
        const h = 0.25 + r * tierH;
        local.add(r % 2 ? mat.stoneShade : mat.stone, new THREE.BoxGeometry(tierD, h, tLen), M4(x, h / 2, 0));
        // Cushion runs in the court's accent / sage.
        local.add(r === 1 ? accentMat : mat.cushionSage, new THREE.BoxGeometry(tierD * 0.55, 0.08, tLen - 0.6), M4(x + sx * 0.12, h + 0.04, 0), false);
        const n = Math.floor((tLen - 1) / 0.75);
        for (let i = 0; i < n; i++) {
          const z = -tLen / 2 + 0.6 + i * 0.75;
          if (Math.abs(z) < 0.5) continue; // aisle
          const wp = new THREE.Vector3(x - sx * 0.05, h + 0.08, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), T.yaw).add(new THREE.Vector3(T.x, 0, T.z));
          // Crowd yaw convention: yaw rotates the -z facing; +x-side spectators face -x (the court).
          seats.push({ pos: wp, yaw: (sx > 0 ? Math.PI / 2 : -Math.PI / 2) + T.yaw, standing: false, members: !T.playable });
        }
      }
      // Steps at the ends of the terraces.
      for (let r = 0; r < tiers; r++) local.add(mat.stoneShade, new THREE.BoxGeometry(tiers * tierD, 0.12 + r * 0.22, 0.5), M4(sx * (sw / 2 + 0.7 + (tiers * tierD) / 2), 0.06 + r * 0.11, tLen / 2 + 0.25 + r * 0.5));
      // Sail shade over the terrace: tensioned triangles between three poles.
      const px = sx * (sw / 2 + 0.7 + tiers * tierD + 0.6);
      const poles = [new THREE.Vector3(px, 4.6, -tLen / 2), new THREE.Vector3(px, 4.2, tLen / 2), new THREE.Vector3(sx * (sw / 2 + 0.6), 3.6, 0)];
      for (const p of poles.slice(0, 2)) local.add(mat.plaster, new THREE.CylinderGeometry(0.09, 0.11, p.y, 10), M4(p.x, p.y / 2, p.z));
      const sail = new THREE.BufferGeometry().setFromPoints([poles[0], poles[1], poles[2]]);
      sail.computeVertexNormals();
      local.add(mat.fabric, sail, undefined, true);
      const sail2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(px, 4.4, -tLen / 2 + 1), new THREE.Vector3(sx * (sw / 2 + 0.2), 3.2, -tLen / 4), new THREE.Vector3(px, 3.9, 0.5)]);
      sail2.computeVertexNormals();
      local.add(mat.fabric, sail2, undefined, true);
      // Lavender banners at the terrace corners.
      for (const bz of [-tLen / 2 - 0.6, tLen / 2 + 0.6]) {
        local.add(mat.plaster, new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8), M4(sx * (sw / 2 + 0.4), 2.1, bz));
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2), new THREE.MeshStandardMaterial({ map: laurelTex(css(T.id === 'clay' ? 0xe2b4a2 : RESORT.lavender), '#fbf6ec'), side: THREE.DoubleSide, roughness: 0.9 }));
        banner.position.set(sx * (sw / 2 + 0.4) + sx * 0.42, 2.9, bz);
        banner.rotation.y = Math.PI / 2;
        grp.add(banner);
      }
      // Lavender beds and hydrangea pots along the terrace front.
      lavenderBedLocal(grp, T, sx * (sw / 2 + 0.35), 0, 0.5, tLen * 0.8);
    }

    // DJ booth: a cream stucco arch with a slatted wood back, vines, white flowers and the laurel mark.
    const boothZ = -(sl / 2 + 2.2);
    const archShape = new THREE.Shape();
    archShape.moveTo(-3.6, 0);
    archShape.lineTo(3.6, 0);
    archShape.lineTo(3.6, 4.6);
    archShape.lineTo(-3.6, 4.6);
    archShape.lineTo(-3.6, 0);
    const hole = new THREE.Path();
    hole.moveTo(-2.3, 0.0001);
    hole.lineTo(2.3, 0.0001);
    hole.lineTo(2.3, 2.6);
    hole.absarc(0, 2.6, 2.3, 0, Math.PI, false);
    hole.lineTo(-2.3, 0.0001);
    archShape.holes.push(hole);
    const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: 1.1, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2, curveSegments: 18 });
    local.add(mat.plaster, archGeo, M4(0, 0.1, boothZ - 0.55));
    for (let k = 0; k < 14; k++) local.add(mat.wood, new THREE.BoxGeometry(0.28, 4.4, 0.08), M4(-2.2 + k * 0.34, 2.3, boothZ - 0.75));
    local.add(mat.wood, new THREE.BoxGeometry(3.4, 1.05, 0.9), M4(0, 0.62, boothZ + 0.15)); // desk
    local.add(mat.woodDark, new THREE.BoxGeometry(3.5, 0.06, 0.95), M4(0, 1.17, boothZ + 0.15));
    for (const s of [-1, 1]) {
      local.add(mat.dark, new THREE.BoxGeometry(0.7, 1.4, 0.6), M4(s * 1.95, 0.8, boothZ + 0.25));
      local.add(mat.dark, new THREE.CylinderGeometry(0.22, 0.22, 0.04, 16), M4(s * 0.6, 1.22, boothZ + 0.15));
    }
    const speakerLogo = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: laurelTex('#2f2b28', '#e6cf98', 256, 256), roughness: 0.6 }));
    for (const s of [-1, 1]) {
      const l = speakerLogo.clone();
      l.position.set(s * 1.95, 1.1, boothZ + 0.56);
      grp.add(l);
    }
    const deskLogo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ map: laurelTex(css(RESORT.wood), '#fbf6ec', 256, 128), roughness: 0.8 }));
    deskLogo.position.set(0, 0.68, boothZ + 0.61);
    grp.add(deskLogo);
    // Vines + flowers draped over the arch.
    for (let k = 0; k < 26; k++) {
      const a = (k / 25) * Math.PI;
      const x = Math.cos(a) * 3.0;
      const y = 4.4 + Math.sin(a) * 0.4 - (k % 3) * 0.25;
      local.add(mat.vine, new THREE.IcosahedronGeometry(0.32 + rnd() * 0.2, 0), M4(x, y, boothZ + 0.6 - rnd() * 0.3));
      if (k % 2) local.add(mat.flowerWhite, new THREE.IcosahedronGeometry(0.13, 0), M4(x + 0.1, y - 0.15, boothZ + 0.85));
      if (k % 5 === 0) for (let d = 0; d < 4; d++) local.add(mat.vine, new THREE.IcosahedronGeometry(0.18, 0), M4(x + (rnd() - 0.5) * 0.3, y - 0.4 - d * 0.35, boothZ + 0.7));
    }
    // Pendant lights under the arch.
    const lights: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff1cc, emissive: 0xffd99a, emissiveIntensity: 1 }));
      m.position.set(-1 + k, 3.0, boothZ + 0.1);
      grp.add(m);
      lights.push(m);
      local.add(mat.dark, new THREE.CylinderGeometry(0.008, 0.008, 1.4, 4), M4(-1 + k, 3.75, boothZ + 0.1), false);
    }
    // Terraces flanking the booth (far end).
    for (const sx of [1, -1]) {
      for (let r = 0; r < 2; r++) {
        const h = 0.25 + r * tierH;
        const z = boothZ - 0.2 + r * 0.0 - r * tierD;
        local.add(mat.stone, new THREE.BoxGeometry(sw / 2 - 3.8, h, tierD), M4(sx * (3.8 + (sw / 2 - 3.8) / 2), h / 2, z + 0.9));
        const n = Math.floor((sw / 2 - 4.2) / 0.75);
        for (let i = 0; i < n; i++) {
          const x = sx * (4.2 + i * 0.75);
          const wp = new THREE.Vector3(x, h + 0.08, z + 0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), T.yaw).add(new THREE.Vector3(T.x, 0, T.z));
          seats.push({ pos: wp, yaw: T.yaw + Math.PI, standing: false, members: !T.playable });
        }
      }
      hydrangeaPotLocal(T, sx * 3.0, boothZ + 1.3);
    }
    const anchor = new THREE.Vector3(0, 0.12, boothZ - 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), T.yaw).add(new THREE.Vector3(T.x, 0, T.z));
    if (T.playable) mainDj = { anchor, yaw: T.yaw, booth: grp, lights };
    else otherDjs.push({ pos: anchor, yaw: T.yaw + Math.PI });

    // Parasols + lounge tables with drinks at the near corners.
    const umbrella = (x: number, z: number, stripe: number) => {
      const tex = canvasTex(256, 32, (g) => {
        for (let i = 0; i < 16; i++) {
          g.fillStyle = i % 2 ? '#fbf6ec' : css(stripe);
          g.fillRect(i * 16, 0, 16, 32);
        }
      });
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.55, 16, 1, true), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
      top.position.set(x, 2.55, z);
      top.castShadow = true;
      grp.add(top);
      local.add(mat.wood, new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8), M4(x, 1.25, z));
      local.add(mat.plaster, new THREE.CylinderGeometry(0.5, 0.5, 0.05, 18), M4(x, 0.74, z));
      local.add(mat.wood, new THREE.CylinderGeometry(0.06, 0.12, 0.72, 8), M4(x, 0.36, z));
      for (const d of [-1, 1]) {
        local.add(mat.cushionCream, new THREE.BoxGeometry(0.75, 0.42, 0.75), M4(x + d * 1.0, 0.21, z));
        local.add(d > 0 ? accentMat : mat.cushionSage, new THREE.BoxGeometry(0.7, 0.12, 0.7), M4(x + d * 1.0, 0.48, z), false);
      }
      // Drinks: two glasses and a lemon bowl.
      local.add(std(0xf7d98a, { roughness: 0.2 }), new THREE.CylinderGeometry(0.045, 0.04, 0.16, 10), M4(x + 0.15, 0.85, z + 0.1), false);
      local.add(std(0xf2a9b8, { roughness: 0.2 }), new THREE.CylinderGeometry(0.045, 0.04, 0.16, 10), M4(x - 0.12, 0.85, z - 0.08), false);
      local.add(mat.lemon, new THREE.SphereGeometry(0.06, 10, 8), M4(x, 0.8, z - 0.2), false);
    };
    const uz = sl / 2 + 1.6;
    umbrella(sw / 2 + 3.2, uz, T.accent);
    umbrella(-(sw / 2 + 3.2), uz, RESORT.sage);
    if (!T.playable) umbrella(0, uz + 1.2, T.accent);

    // Olive trees and cypresses framing the court.
    for (const sx of [1, -1]) {
      for (const oz of [-sl / 2 - 3, sl / 2 + 3.5]) olive.push(M4(...lw2w(T, sx * (sw / 2 + 6.2), oz), rnd() * 6, 1 + rnd() * 0.25));
      for (let k = 0; k < 4; k++) cypress.push(M4(...lw2w(T, sx * (sw / 2 + 5.4), -sl / 2 + 2 + k * (sl / 4)), 0, 0.9 + rnd() * 0.3));
    }
    local.build(grp);
    courts.push({ theme: T, anchor: new THREE.Vector3(T.x, 0, T.z) });

    // Sunset court: low lanterns and a cliff railing.
    if (id === 'sunset') {
      for (let k = 0; k < 8; k++) {
        const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd7a0, emissiveIntensity: 0.8 }));
        lan.position.set(T.x - 7 + k * 2, 0.35, T.z + sl / 2 + 0.6);
        root.add(lan);
      }
      B.box(mat.stone, 40, 0.9, 0.4, 4, 0.45, -62);
      for (let k = 0; k < 40; k += 2) B.box(mat.stone, 0.18, 1.0, 0.18, -16 + k, 0.5, -61.8);
    }
  }

  // ---------------------------------------------------------------- villa clubhouse, bar, lounges
  const vz = -24;
  B.box(mat.plaster, 22, 5, 9, -2, 2.5, vz);
  B.box(mat.plaster, 12, 3, 7, -2, 6.5, vz - 0.5);
  B.box(mat.stone, 23, 0.3, 10, -2, 5.15, vz);
  for (let k = 0; k < 6; k++) {
    const arch = new THREE.Shape();
    arch.moveTo(-0.9, 0);
    arch.lineTo(0.9, 0);
    arch.lineTo(0.9, 2.2);
    arch.absarc(0, 2.2, 0.9, 0, Math.PI, false);
    arch.lineTo(-0.9, 0);
    B.add(std(0x6f8a96, { roughness: 0.2, metalness: 0.2 }), new THREE.ShapeGeometry(arch, 12), M4(-11 + 2 + k * 3.6, 0.2, vz + 4.52), false);
  }
  for (let k = 0; k < 10; k++) {
    const x = -12 + k * 2.2;
    B.box(mat.stone, 0.12, 0.9, 0.12, x, 5.75, vz + 4.4, 0, false);
  }
  B.box(mat.stone, 22, 0.08, 0.2, -2, 6.2, vz + 4.4, 0, false);
  // Bougainvillea on the villa.
  for (let k = 0; k < 30; k++) B.add(mat.flowerPink, new THREE.IcosahedronGeometry(0.35 + rnd() * 0.25, 0), M4(-12 + rnd() * 20, 3.5 + rnd() * 2.5, vz + 4.6), false);

  // Bar kiosk at the Garden Court's near-right corner.
  const bx = 13;
  const bzz = 9.5;
  B.box(mat.wood, 3.6, 1.1, 1.0, bx, 0.55, bzz);
  B.box(mat.plaster, 3.8, 0.08, 1.15, bx, 1.12, bzz);
  B.box(mat.wood, 3.6, 2.8, 0.15, bx, 1.4, bzz + 1.4);
  for (const s of [-1, 1]) B.box(mat.wood, 0.12, 3.0, 0.12, bx + s * 1.75, 1.5, bzz - 0.5);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.08, 2.2),
    new THREE.MeshStandardMaterial({
      map: canvasTex(256, 32, (g) => {
        for (let i = 0; i < 12; i++) {
          g.fillStyle = i % 2 ? '#fbf6ec' : css(RESORT.sage);
          g.fillRect(i * 22, 0, 22, 32);
        }
      }),
      roughness: 0.9,
    }),
  );
  awning.position.set(bx, 3.05, bzz + 0.4);
  awning.rotation.x = -0.12;
  awning.castShadow = true;
  root.add(awning);
  for (let k = 0; k < 8; k++) B.add(std([0xf7d98a, 0xf2a9b8, 0xb9dcb0, 0xc8b8e3][k % 4], { roughness: 0.2 }), new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8), M4(bx - 1.4 + k * 0.4, 1.3, bzz + 1.2), false);
  for (let k = 0; k < 6; k++) B.add(mat.lemon, new THREE.SphereGeometry(0.07, 8, 6), M4(bx - 0.6 + k * 0.15, 1.21, bzz - 0.2), false);
  const menu = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.8),
    new THREE.MeshStandardMaterial({
      map: canvasTex(256, 170, (g) => {
        g.fillStyle = '#5f7d55';
        g.fillRect(0, 0, 256, 170);
        g.fillStyle = '#fbf6ec';
        g.font = '600 26px Fredoka, sans-serif';
        g.textAlign = 'center';
        g.fillText('THE BAR', 128, 38);
        g.font = '500 18px Nunito, sans-serif';
        ['Lemonade · Spritz', 'Iced matcha · Rosé', 'Olives · Focaccia'].forEach((t, i) => g.fillText(t, 128, 78 + i * 28));
      }),
      roughness: 0.9,
    }),
  );
  menu.position.set(bx, 2.3, bzz + 1.32);
  menu.rotation.y = Math.PI;
  root.add(menu);
  for (const s of [-1, 1]) B.add(mat.wood, new THREE.CylinderGeometry(0.2, 0.2, 0.75, 10), M4(bx + s * 1.0, 0.38, bzz - 1.1));

  // Lemon trees in big pots by the bar; hydrangea pots around.
  for (const [x, z] of [
    [16.5, 8],
    [16.5, 12.5],
    [-14, 10],
  ]) {
    B.add(mat.stone, new THREE.CylinderGeometry(0.55, 0.42, 0.8, 14), M4(x, 0.4, z));
    B.add(std(0x6f8a4a, { roughness: 1 }), new THREE.IcosahedronGeometry(1.0, 1), M4(x, 2.0, z), true);
    B.add(std(RESORT.trunk), new THREE.CylinderGeometry(0.06, 0.08, 1.2, 6), M4(x, 1.1, z));
    for (let k = 0; k < 7; k++) B.add(mat.lemon, new THREE.SphereGeometry(0.09, 8, 6), M4(x + (rnd() - 0.5) * 1.5, 1.6 + rnd() * 0.9, z + (rnd() - 0.5) * 1.5), false);
  }
  for (const [x, z] of [
    [-11.5, 13],
    [10, 13.6],
    [-14, -15],
    [14, -15],
  ])
    hydrangeaPot(x, z, 1.1);

  // Garden beds and trees across the grounds.
  lavenderBed(-11, 14, 6, 1.4);
  lavenderBed(5, 15.5, 5, 1.2);
  lavenderBed(-20, -16, 1.4, 8, 0.3);
  lavenderBed(22, -16, 1.4, 8, -0.3);
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 30 + rnd() * 55;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.9;
    if (z < -60) continue;
    (i % 3 === 0 ? cypress : olive).push(M4(x, 0, z, rnd() * 6, 1 + rnd() * 0.5));
  }
  for (let k = 0; k < 7; k++) cypress.push(M4(-3.2, 0, 18 + k * 2.6, 0, 1.0), M4(3.2, 0, 18 + k * 2.6, 0, 1.0));

  // Instanced meshes.
  const oliveTrunk = new THREE.CylinderGeometry(0.12, 0.22, 2.2, 7);
  oliveTrunk.translate(0, 1.1, 0);
  const oliveCanopy = merge([0, 1, 2, 3, 4].map((k) => new THREE.IcosahedronGeometry(1.0 + (k % 2) * 0.3, 1).translate(Math.cos(k * 1.3) * 0.9, 2.6 + (k % 3) * 0.35, Math.sin(k * 1.3) * 0.9)));
  const cypressGeo = new THREE.SphereGeometry(0.9, 12, 10).scale(1, 4, 1).translate(0, 3.6, 0);
  const lavenderGeo = new THREE.ConeGeometry(0.06, 0.45, 5).translate(0, 0.22, 0);
  const hydGeo = new THREE.IcosahedronGeometry(0.17, 1);
  const inst = (geo: THREE.BufferGeometry, m: THREE.Material, list: THREE.Matrix4[], cast = true) => {
    const im = new THREE.InstancedMesh(geo, m, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = cast;
    im.receiveShadow = true;
    root.add(im);
    return im;
  };
  inst(oliveTrunk, std(RESORT.trunk, { roughness: 1 }), olive);
  inst(oliveCanopy, std(RESORT.olive, { roughness: 1 }), olive);
  inst(cypressGeo, std(RESORT.cypress, { roughness: 1 }), cypress);
  inst(lavenderGeo, std(RESORT.lavender, { roughness: 1 }), lavender, false);
  inst(hydGeo, mat.flowerWhite, hydrangea, false);

  // Court-local beds/pots helpers (declared after use via hoisting of function declarations).
  function lw2w(T: CourtTheme, lx: number, lz: number): [number, number, number] {
    const v = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), T.yaw);
    return [T.x + v.x, 0, T.z + v.z];
  }
  function lavenderBedLocal(_g: THREE.Group, T: CourtTheme, lx: number, lz: number, w: number, d: number): void {
    const [x, , z] = lw2w(T, lx, lz);
    lavenderBed(x, z, w, d, T.yaw);
  }
  function hydrangeaPotLocal(T: CourtTheme, lx: number, lz: number): void {
    const [x, , z] = lw2w(T, lx, lz);
    hydrangeaPot(x, z, 0.9);
  }

  B.build(root);

  const djBooth = mainDj!.booth;
  const stringLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 1.2 }), bulbs.length);
  root.add(stringLights);

  const walkPaths: THREE.Vector3[][] = [
    [new THREE.Vector3(13, 0, 8.2), new THREE.Vector3(11.4, 0, 4), new THREE.Vector3(11.4, 0, -9), new THREE.Vector3(8, 0, -14), new THREE.Vector3(11.4, 0, -9), new THREE.Vector3(11.4, 0, 4)],
    [new THREE.Vector3(-9, 0, 11.5), new THREE.Vector3(-11.4, 0, 6), new THREE.Vector3(-11.4, 0, -9), new THREE.Vector3(-11.4, 0, 6)],
  ];

  const extras: ResortExtras = {
    courts,
    walkPaths,
    bartender: { pos: new THREE.Vector3(bx, 0, bzz + 0.75), yaw: Math.PI },
    otherDjs,
    tick() {},
  };

  return {
    root,
    sun,
    seats,
    djAnchor: mainDj!.anchor,
    djYaw: Math.PI,
    djBooth,
    djLights: mainDj!.lights,
    stringLights,
    bunting: new THREE.Group(),
    extras,
  };
}
