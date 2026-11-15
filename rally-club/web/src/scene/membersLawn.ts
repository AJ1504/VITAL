// The Members' Lawn — Rally Club's regal championship venue (original design).
// A sunken grass court with mowing stripes and baseline wear, bottle-green backstops with gold
// lettering, a full bowl of tiered stands under white cantilevered canopies, a claret-and-gold Members'
// Box, ivy-clad corner towers, hydrangea borders, a scoreboard with a working clock, officials and ball
// crew, and an ivory garden bandstand where the DJ plays. Built from primitives + procedural textures.

import * as THREE from 'three';
import { type Court, netHeightAt } from '../../../shared/src/court.ts';
import { ROYAL } from './palette.ts';
import { addDetailMap, applyPbr, loadSky, scatterModel } from './assets.ts';
import { backstopTexture, cloudSkyTexture, ivyTexture, lawnTexture, signTexture } from './textures.ts';
import type { Venue } from './venue.ts';

export interface Seat {
  pos: THREE.Vector3;
  yaw: number;
  standing: boolean;
  members?: boolean;
}

export interface Official {
  kind: 'umpire' | 'line' | 'ballkid';
  pos: THREE.Vector3;
  yaw: number;
  seatHeight: number;
}

export interface LawnExtras {
  officials: Official[];
  /** Redraws the scoreboard. */
  setScoreboard(names: [string, string], score: [number, number], server: number, call: string): void;
  /** Animate clock hands etc. */
  tick(now: Date): void;
  /** Upgrade to real CC0 assets (HDRI sky, PBR textures, garden models). Safe to skip (low preset). */
  enhance(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Promise<void>;
}

const mat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });

/** Merge many boxes of one material into a single mesh (keeps draw calls low). */
class BoxBatch {
  private geos: THREE.BufferGeometry[] = [];
  private material: THREE.Material;
  private cast: boolean;
  constructor(material: THREE.Material, cast = true) {
    this.material = material;
    this.cast = cast;
  }
  add(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): void {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.geos.push(g);
  }
  addGeo(g: THREE.BufferGeometry): void {
    this.geos.push(g);
  }
  /** Metres per texture tile for world-space UVs (0 = keep per-box UVs). */
  worldUV = 0;
  build(parent: THREE.Object3D): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const merged = mergeGeometries(this.geos);
    if (this.worldUV > 0) worldBoxUV(merged, this.worldUV);
    const m = new THREE.Mesh(merged, this.material);
    m.castShadow = this.cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
}

/** Minimal non-indexed geometry merge (position/normal/uv) — avoids pulling in BufferGeometryUtils. */
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** Planar UVs from world position along each face's dominant axis: 1 UV unit = `metres` m (seamless tiling across merged boxes). */
function worldBoxUV(g: THREE.BufferGeometry, metres: number): void {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (ax >= az) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv[i * 2] = u / metres;
    uv[i * 2 + 1] = v / metres;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function buildMembersLawn(scene: THREE.Scene, court: Court): Venue & { extras: LawnExtras } {
  const root = new THREE.Group();
  scene.add(root);
  // Shared materials, upgraded in place by enhance() once the PBR textures arrive.
  const M = {
    surround: mat(0x8a8b72, { roughness: 1 }),
    concrete: mat(0xe9e3d3, { roughness: 0.95 }),
    stone: mat(ROYAL.stone, { roughness: 0.6 }),
    brick: mat(0xffffff, { map: ivyTexture(), roughness: 1 }),
    ivy: mat(0xffffff, { map: ivyTexture(), roughness: 1 }),
    plaster: mat(0xefe7d6, { roughness: 0.8 }),
    plinth: mat(ROYAL.ivory, { roughness: 0.7 }),
    wood: mat(0x6b4a33, { roughness: 0.6 }),
    members: mat(ROYAL.claret, { roughness: 0.7 }),
  };

  // ------------------------------------------------------------ sky & light (late-afternoon summer)
  const skyTex = cloudSkyTexture('#6f9fd6', '#e9eef0');
  const sky = new THREE.Mesh(new THREE.SphereGeometry(260, 48, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  root.add(sky);
  scene.background = new THREE.Color(0xdfe8ee);
  scene.fog = new THREE.Fog(0xdfe6e6, 70, 220);

  const hemi = new THREE.HemisphereLight(0xdfeeff, 0x5b6b3c, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e2, 4.0);
  // Late-afternoon sun from the west at ~33°: the west stand throws a long shadow across part of the lawn,
  // the classic championship-court look.
  sun.position.set(-20, 30, -8); // bright early-afternoon sun: crisp but shorter shadows
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight(0xbfe0a8, 0.35); // green bounce from the lawn
  bounce.position.set(8, -2, 10);
  scene.add(bounce);

  // ------------------------------------------------------------ ground: lawn, surround
  const LW = 14.4; // lawn width (x)
  const LL = 24.4; // lawn length (z)
  const lawnMat = mat(0xffffff, { map: lawnTexture(LW, LL, 1.22, ROYAL.lawnLight, ROYAL.lawnDark, ROYAL.lawnWorn, { halfLength: court.halfLength, halfWidth: court.halfWidth }), roughness: 0.95 });
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(LW, LL), lawnMat);
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  root.add(lawn);
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), M.surround);
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.02;
  surround.receiveShadow = true;
  root.add(surround);

  // Court lines (crisp white chalk).
  const lineMat = mat(0xfbfbf6, { roughness: 0.7 });
  const lines = new BoxBatch(lineMat, false);
  const lw = court.lineWidth;
  const hw = court.halfWidth;
  const hl = court.halfLength;
  const L = (w: number, d: number, x: number, z: number) => lines.add(w, 0.004, d, x, 0.003, z);
  L(court.width, lw, 0, hl - lw / 2);
  L(court.width, lw, 0, -hl + lw / 2);
  L(lw, court.length, hw - lw / 2, 0);
  L(lw, court.length, -hw + lw / 2, 0);
  L(court.width, lw, 0, court.nvzDepth - lw / 2);
  L(court.width, lw, 0, -court.nvzDepth + lw / 2);
  const cl = hl - court.nvzDepth;
  L(lw, cl, 0, court.nvzDepth + cl / 2);
  L(lw, cl, 0, -court.nvzDepth - cl / 2);
  lines.build(root);

  // ------------------------------------------------------------ net
  const span = hw + court.netPostOffset;
  const postMat = mat(ROYAL.bottle, { roughness: 0.4, metalness: 0.3 });
  for (const s of [1, -1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, court.netHeightPost + 0.06, 16), postMat);
    post.position.set(s * span, (court.netHeightPost + 0.06) / 2, 0);
    post.castShadow = true;
    root.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat(ROYAL.gold, { metalness: 0.8, roughness: 0.3 }));
    cap.position.set(s * span, court.netHeightPost + 0.08, 0);
    root.add(cap);
  }
  const netCanvas = document.createElement('canvas');
  netCanvas.width = netCanvas.height = 64;
  const ng = netCanvas.getContext('2d')!;
  ng.strokeStyle = 'rgba(16,30,22,0.9)';
  ng.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) {
    ng.beginPath();
    ng.moveTo(i, 0);
    ng.lineTo(i, 64);
    ng.moveTo(0, i);
    ng.lineTo(64, i);
    ng.stroke();
  }
  const netTex = new THREE.CanvasTexture(netCanvas);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(60, 8);
  const netGeo = new THREE.PlaneGeometry(span * 2, 1, 32, 1);
  const np = netGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < np.count; i++) np.setY(i, np.getY(i) > 0 ? netHeightAt(court, np.getX(i)) : 0.04);
  np.needsUpdate = true;
  netGeo.computeVertexNormals();
  const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 1 }));
  net.castShadow = true;
  root.add(net);
  const tapePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 32; i++) {
    const x = -span + (2 * span * i) / 32;
    tapePts.push(new THREE.Vector3(x, netHeightAt(court, x) - 0.02, 0));
  }
  const tape = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tapePts), 64, 0.03, 8), mat(0xffffff, { roughness: 0.5 }));
  tape.castShadow = true;
  root.add(tape);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, court.netHeightCenter, 0.012), mat(0xffffff));
  strap.position.set(0, court.netHeightCenter / 2, 0);
  root.add(strap);

  // ------------------------------------------------------------ backstop walls with gold lettering
  const WX = LW / 2;
  const WZ = LL / 2;
  const WH = 1.15;
  const wallSide = mat(0xffffff, { map: backstopTexture('RALLY CLUB  ·  THE MEMBERS’ LAWN', ROYAL.bottle, ROYAL.gold, 2), roughness: 0.7 });
  const wallEnd = mat(0xffffff, { map: backstopTexture('RALLY CLUB  ·  THE MEMBERS’ LAWN', ROYAL.bottle, ROYAL.gold, 1), roughness: 0.7 });
  const addWall = (w: number, x: number, z: number, ry: number, m: THREE.Material) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WH, 0.25), m);
    wall.position.set(x, WH / 2, z);
    wall.rotation.y = ry;
    wall.castShadow = true;
    wall.receiveShadow = true;
    root.add(wall);
  };
  addWall(LL, WX + 0.12, 0, -Math.PI / 2, wallSide);
  addWall(LL, -WX - 0.12, 0, Math.PI / 2, wallSide);
  addWall(LW + 0.5, 0, -WZ - 0.12, 0, wallEnd);
  addWall(LW + 0.5, 0, WZ + 0.12, Math.PI, wallEnd);
  // Gold capping + hydrangea borders on top of the walls.
  const capping = new BoxBatch(M.stone, false);
  capping.worldUV = 1.5;
  capping.add(0.4, 0.06, LL + 0.5, WX + 0.12, WH + 0.03, 0);
  capping.add(0.4, 0.06, LL + 0.5, -WX - 0.12, WH + 0.03, 0);
  capping.add(LW + 0.5, 0.06, 0.4, 0, WH + 0.03, -WZ - 0.12);
  capping.add(LW + 0.5, 0.06, 0.4, 0, WH + 0.03, WZ + 0.12);
  capping.build(root);

  const flowerGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const flowerSpots: { p: THREE.Vector3; c: number }[] = [];
  const flowerCols = [ROYAL.hydrangea, ROYAL.hydrangeaWhite, 0xa79bd8, ROYAL.hydrangeaWhite, 0x7d74bb];
  let fs = 5;
  const fr = () => ((fs = (fs * 16807) % 2147483647) / 2147483647);
  const pushRow = (x0: number, z0: number, x1: number, z1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      flowerSpots.push({ p: new THREE.Vector3(x0 + (x1 - x0) * t + (fr() - 0.5) * 0.1, WH + 0.6, z0 + (z1 - z0) * t + (fr() - 0.5) * 0.1), c: flowerCols[i % flowerCols.length] });
    }
  };
  // Flower boxes sit on the walkway just behind the backstops.
  pushRow(-WX - 0.55, -WZ + 0.5, -WX - 0.55, WZ - 0.5, 60);
  pushRow(WX + 0.55, -WZ + 0.5, WX + 0.55, WZ - 0.5, 60);
  pushRow(-WX + 0.5, -WZ - 0.55, WX - 0.5, -WZ - 0.55, 36);
  const planterBatch = new BoxBatch(M.stone);
  planterBatch.worldUV = 1.5;
  planterBatch.add(0.55, 0.55, LL - 0.6, -WX - 0.55, WH + 0.25, 0);
  planterBatch.add(0.55, 0.55, LL - 0.6, WX + 0.55, WH + 0.25, 0);
  planterBatch.add(LW - 0.6, 0.55, 0.55, 0, WH + 0.25, -WZ - 0.55);
  planterBatch.build(root);
  // Each planting spot = a mound of leaves with a cluster of small hydrangea florets.
  const FLORETS = 5;
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 1), mat(0x3a6431, { roughness: 0.95 }), flowerSpots.length * 2);
  const flowers = new THREE.InstancedMesh(flowerGeo, mat(0xffffff, { roughness: 0.95 }), flowerSpots.length * FLORETS);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const q4 = new THREE.Quaternion();
  const sc4 = new THREE.Vector3();
  flowerSpots.forEach((f, i) => {
    for (let k = 0; k < FLORETS; k++) {
      const s4 = 0.45 + fr() * 0.3;
      m4.compose(new THREE.Vector3(f.p.x + (fr() - 0.5) * 0.3, f.p.y - 0.02 + fr() * 0.12, f.p.z + (fr() - 0.5) * 0.3), q4.random(), sc4.set(s4, s4 * 0.85, s4));
      flowers.setMatrixAt(i * FLORETS + k, m4);
      flowers.setColorAt(i * FLORETS + k, col.setHex(f.c).offsetHSL(0, 0, (fr() - 0.5) * 0.08));
    }
    for (let k = 0; k < 2; k++) {
      m4.compose(new THREE.Vector3(f.p.x + (fr() - 0.5) * 0.3, f.p.y - 0.1, f.p.z + (fr() - 0.5) * 0.3), q4.random(), sc4.set(1, 0.7, 1));
      leaves.setMatrixAt(i * 2 + k, m4);
    }
  });
  flowers.castShadow = leaves.castShadow = true;
  root.add(leaves, flowers);

  // ------------------------------------------------------------ the bowl: tiered stands on all four sides
  const seats: Seat[] = [];
  const ROWS = 12;
  const RISE = 0.45;
  const DEPTH = 0.82;
  const concrete = new BoxBatch(M.concrete);
  concrete.worldUV = 2.5;
  const seatBatch = new BoxBatch(mat(ROYAL.bottle, { roughness: 0.55 }));
  const membersSeatBatch = new BoxBatch(M.members);
  const railBatch = new BoxBatch(mat(ROYAL.gold, { metalness: 0.75, roughness: 0.3 }), false);
  const gangwayBatch = new BoxBatch(mat(0xd6cdb6, { roughness: 1 }), false);

  const side = (sx: 1 | -1) => {
    const x0 = WX + 1.2;
    const zHalf = WZ - 0.4;
    for (let r = 0; r < ROWS; r++) {
      const x = sx * (x0 + r * DEPTH + DEPTH / 2);
      const h = 0.7 + r * RISE;
      concrete.add(DEPTH, h, zHalf * 2, x, h / 2, 0);
      const n = Math.floor((zHalf * 2) / 0.62);
      for (let i = 0; i < n; i++) {
        const z = -zHalf + 0.31 + i * 0.62;
        if (Math.abs(z - -4.1) < 0.4 || Math.abs(z - 4.1) < 0.4) {
          gangwayBatch.add(0.6, 0.02, DEPTH * 0.9, x, h + 0.01, z, Math.PI / 2);
          continue; // aisles
        }
        const members = sx === 1 && r >= 2 && r <= 6 && Math.abs(z) < 3.6;
        (members ? membersSeatBatch : seatBatch).add(0.46, 0.42, 0.42, x - sx * 0.1, h + 0.21, z);
        (members ? membersSeatBatch : seatBatch).add(0.46, 0.5, 0.06, x + sx * 0.12, h + 0.55, z, Math.PI / 2);
        seats.push({ pos: new THREE.Vector3(x - sx * 0.1, h + 0.42, z), yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2, standing: false, members });
      }
    }
    // Front rail.
    railBatch.add(0.05, 0.05, zHalf * 2, sx * (x0 - 0.05), 0.7 + 0.95, 0);
    // Members' Box enclosure on the east stand: gold rail, claret skirt, crest.
    if (sx === 1) {
      railBatch.add(0.05, 0.05, 7.4, x0 + 2 * DEPTH - 0.05, 0.7 + 2 * RISE + 0.95, 0);
      railBatch.add(0.05, 0.9, 0.05, x0 + 2 * DEPTH - 0.05, 0.7 + 2 * RISE + 0.5, -3.7);
      railBatch.add(0.05, 0.9, 0.05, x0 + 2 * DEPTH - 0.05, 0.7 + 2 * RISE + 0.5, 3.7);
      const skirt = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 0.5), mat(ROYAL.claret, { side: THREE.DoubleSide }));
      skirt.position.set(x0 + 2 * DEPTH - 0.08, 0.7 + 2 * RISE + 0.35, 0);
      skirt.rotation.y = -Math.PI / 2;
      root.add(skirt);
    }
    // Rear wall with ivy, and the cantilevered canopy.
    const backX = sx * (x0 + ROWS * DEPTH + 0.2);
    const backH = 0.7 + ROWS * RISE + 3.2;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, backH, zHalf * 2 + 0.8), M.brick);
    back.position.set(backX, backH / 2, 0);
    back.castShadow = back.receiveShadow = true;
    root.add(back);
    const canopyY = backH + 0.1;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.18, zHalf * 2 + 1.2), mat(0xf7f5ee, { roughness: 0.6 }));
    canopy.position.set(backX - sx * 2.9, canopyY, 0);
    canopy.rotation.z = sx * 0.1;
    canopy.castShadow = true;
    root.add(canopy);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, zHalf * 2 + 1.2), mat(ROYAL.bottle, { roughness: 0.5 }));
    fascia.position.set(backX - sx * 5.95, canopyY - 0.48, 0);
    root.add(fascia);
    for (const z of [-zHalf + 0.5, -zHalf / 3, zHalf / 3, zHalf - 0.5]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.3, 8), postMat);
      strut.position.set(backX - sx * 2.9, canopyY + 0.55, z);
      strut.rotation.z = sx * (Math.PI / 2 - 0.2);
      root.add(strut);
    }
  };
  side(1);
  side(-1);

  const end = (sz: 1 | -1) => {
    const z0 = WZ + 1.2;
    const xHalf = WX + 1.0;
    for (let r = 0; r < ROWS; r++) {
      const z = sz * (z0 + r * DEPTH + DEPTH / 2);
      const h = 0.7 + r * RISE;
      concrete.add(xHalf * 2, h, DEPTH, 0, h / 2, z);
      const n = Math.floor((xHalf * 2) / 0.62);
      for (let i = 0; i < n; i++) {
        const x = -xHalf + 0.31 + i * 0.62;
        if (Math.abs(x) < 0.4) {
          gangwayBatch.add(0.6, 0.02, DEPTH * 0.9, x, h + 0.01, z);
          continue;
        }
        seatBatch.add(0.42, 0.42, 0.46, x, h + 0.21, z - sz * 0.1);
        seatBatch.add(0.5, 0.5, 0.06, x, h + 0.55, z + sz * 0.12);
        seats.push({ pos: new THREE.Vector3(x, h + 0.42, z - sz * 0.1), yaw: sz > 0 ? 0 : Math.PI, standing: false });
      }
    }
    railBatch.add(xHalf * 2, 0.05, 0.05, 0, 0.7 + 0.95, sz * (z0 - 0.05));
    const backZ = sz * (z0 + ROWS * DEPTH + 0.2);
    const backH = 0.7 + ROWS * RISE + 3.2;
    const back = new THREE.Mesh(new THREE.BoxGeometry(xHalf * 2 + 0.8, backH, 0.4), M.brick);
    back.position.set(0, backH / 2, backZ);
    back.castShadow = back.receiveShadow = true;
    root.add(back);
  };
  end(-1);
  end(1);

  // Corner towers (ivy-clad, ivory cornice) close the bowl.
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const cx = sx * (WX + 1.2 + (ROWS * DEPTH) / 2 + 0.2);
      const cz = sz * (WZ + 1.2 + (ROWS * DEPTH) / 2 + 0.2);
      if (sx === -1 && sz === -1) continue; // north-west corner is the garden bandstand
      const tower = new THREE.Mesh(new THREE.BoxGeometry(ROWS * DEPTH + 0.4, 8.6, ROWS * DEPTH + 0.4), M.ivy);
      tower.position.set(cx, 4.3, cz);
      tower.castShadow = tower.receiveShadow = true;
      root.add(tower);
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(ROWS * DEPTH + 0.8, 0.35, ROWS * DEPTH + 0.8), mat(ROYAL.ivory, { roughness: 0.6 }));
      cornice.position.set(cx, 8.75, cz);
      cornice.castShadow = true;
      root.add(cornice);
    }
  }

  concrete.build(root);
  seatBatch.build(root);
  membersSeatBatch.build(root);
  railBatch.build(root);
  gangwayBatch.build(root);

  // ------------------------------------------------------------ scoreboard + clock above the north stand
  const sbCanvas = document.createElement('canvas');
  sbCanvas.width = 1024;
  sbCanvas.height = 384;
  const sbTex = new THREE.CanvasTexture(sbCanvas);
  sbTex.colorSpace = THREE.SRGBColorSpace;
  sbTex.anisotropy = 8;
  const sbZ = -(WZ + 1.2 + ROWS * DEPTH + 0.5);
  const sbY = 0.7 + ROWS * RISE + 5.4;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3.4, 0.35), mat(ROYAL.bottleDeep, { roughness: 0.5 }));
  frame.position.set(0, sbY, sbZ);
  frame.castShadow = true;
  root.add(frame);
  const goldFrame = new THREE.Mesh(new THREE.BoxGeometry(8.6, 3.6, 0.2), mat(ROYAL.gold, { metalness: 0.8, roughness: 0.3 }));
  goldFrame.position.set(0, sbY, sbZ - 0.12);
  root.add(goldFrame);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshStandardMaterial({ map: sbTex, emissive: 0xffffff, emissiveMap: sbTex, emissiveIntensity: 0.35, roughness: 0.6 }));
  board.position.set(0, sbY, sbZ + 0.18);
  root.add(board);
  // Clock.
  const clockCanvas = document.createElement('canvas');
  clockCanvas.width = clockCanvas.height = 256;
  const clockTex = new THREE.CanvasTexture(clockCanvas);
  clockTex.colorSpace = THREE.SRGBColorSpace;
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.5 }));
  clock.position.set(0, sbY + 2.5, sbZ + 0.2);
  root.add(clock);
  const clockRim = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.06, 10, 48), mat(ROYAL.gold, { metalness: 0.85, roughness: 0.25 }));
  clockRim.position.copy(clock.position);
  root.add(clockRim);
  const clockHousing = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.1, 0.3), mat(ROYAL.bottleDeep, { roughness: 0.5 }));
  clockHousing.position.set(0, sbY + 2.5, sbZ - 0.02);
  root.add(clockHousing);
  const pediment = new THREE.Mesh(new THREE.CylinderGeometry(0, 1.5, 0.8, 3, 1), mat(ROYAL.ivory));
  pediment.rotation.set(Math.PI / 2, 0, Math.PI);
  pediment.scale.set(1, 0.25, 1);
  pediment.position.set(0, sbY + 3.75, sbZ);
  root.add(pediment);
  for (const x of [-4.2, 4.2]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, sbY, 0.3), mat(ROYAL.bottleDeep));
    pole.position.set(x, sbY / 2, sbZ - 0.1);
    root.add(pole);
  }

  const drawClock = (now: Date) => {
    const g = clockCanvas.getContext('2d')!;
    g.fillStyle = '#f5efe1';
    g.fillRect(0, 0, 256, 256);
    g.translate(128, 128);
    g.fillStyle = '#123d2f';
    g.font = '600 26px "Cormorant Garamond", Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    numerals.forEach((n, i) => {
      const a = (i / 12) * Math.PI * 2;
      g.fillText(n, Math.sin(a) * 96, -Math.cos(a) * 96);
    });
    const hand = (a: number, len: number, w: number) => {
      g.strokeStyle = '#123d2f';
      g.lineWidth = w;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.sin(a) * len, -Math.cos(a) * len);
      g.stroke();
    };
    const h = now.getHours() % 12;
    const m = now.getMinutes();
    hand(((h + m / 60) / 12) * Math.PI * 2, 55, 8);
    hand((m / 60) * Math.PI * 2, 80, 5);
    g.fillStyle = '#c9a45c';
    g.beginPath();
    g.arc(0, 0, 8, 0, Math.PI * 2);
    g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
    clockTex.needsUpdate = true;
  };

  const setScoreboard = (names: [string, string], score: [number, number], server: number, call: string) => {
    const g = sbCanvas.getContext('2d')!;
    g.fillStyle = '#0b2a20';
    g.fillRect(0, 0, 1024, 384);
    g.strokeStyle = '#c9a45c';
    g.lineWidth = 3;
    g.strokeRect(14, 14, 996, 356);
    g.fillStyle = '#c9a45c';
    g.font = '600 30px "Cormorant Garamond", Georgia, serif';
    g.textAlign = 'center';
    g.fillText('THE MEMBERS’ LAWN  ·  SINGLES', 512, 62);
    g.font = '500 66px "Cormorant Garamond", Georgia, serif';
    for (let i = 0; i < 2; i++) {
      const y = 158 + i * 104;
      g.textAlign = 'left';
      g.fillStyle = '#f5efe1';
      g.fillText(names[i].toUpperCase(), 110, y);
      if (server === i) {
        g.fillStyle = '#e8f53c';
        g.beginPath();
        g.arc(70, y - 22, 12, 0, Math.PI * 2);
        g.fill();
      }
      g.textAlign = 'right';
      g.fillStyle = '#f5efe1';
      g.font = '600 86px "Cormorant Garamond", Georgia, serif';
      g.fillText(String(score[i]), 940, y + 6);
      g.font = '500 66px "Cormorant Garamond", Georgia, serif';
    }
    g.fillStyle = '#c9a45c';
    g.font = '500 26px "Cormorant Garamond", Georgia, serif';
    g.textAlign = 'center';
    g.fillText(call.toUpperCase(), 512, 352);
    sbTex.needsUpdate = true;
  };
  setScoreboard(['', ''], [0, 0], -1, 'Welcome to the Members’ Lawn');
  drawClock(new Date());

  // ------------------------------------------------------------ officials & ball crew
  const officials: Official[] = [
    { kind: 'umpire', pos: new THREE.Vector3(-(hw + 1.1), 0, 0), yaw: -Math.PI / 2, seatHeight: 1.75 },
    { kind: 'line', pos: new THREE.Vector3(-(hw + 1.6), 0, -hl + 0.2), yaw: -Math.PI / 2, seatHeight: 0.45 },
    { kind: 'line', pos: new THREE.Vector3(hw + 1.6, 0, 1.2), yaw: Math.PI / 2, seatHeight: 0.45 },
    { kind: 'line', pos: new THREE.Vector3(hw - 0.6, 0, -WZ + 0.6), yaw: Math.PI, seatHeight: 0.45 },
    { kind: 'ballkid', pos: new THREE.Vector3(span + 0.5, 0, 0.5), yaw: Math.PI / 2, seatHeight: 0 },
    { kind: 'ballkid', pos: new THREE.Vector3(-span - 0.5, 0, -0.5), yaw: -Math.PI / 2, seatHeight: 0 },
    { kind: 'ballkid', pos: new THREE.Vector3(-WX + 0.6, 0, -WZ + 0.5), yaw: Math.PI, seatHeight: 0 },
  ];
  // Umpire's chair (tall, bottle green, gold trim) and line judges' chairs.
  const chairBatch = new BoxBatch(mat(ROYAL.bottle, { roughness: 0.5 }));
  for (const o of officials) {
    if (o.kind === 'ballkid') continue;
    const { x, z } = o.pos;
    const h = o.seatHeight;
    if (o.kind === 'umpire') {
      for (const dx of [-0.3, 0.3]) for (const dz of [-0.3, 0.3]) chairBatch.add(0.07, h, 0.07, x + dx, h / 2, z + dz);
      chairBatch.add(0.75, 0.08, 0.75, x, h, z);
      chairBatch.add(0.75, 0.08, 0.75, x, h * 0.45, z);
      chairBatch.add(0.08, 0.7, 0.75, x - 0.36, h + 0.35, z);
      chairBatch.add(0.75, 0.05, 0.3, x + 0.22, h + 0.95 - 0.5, z + 0.4);
    } else {
      chairBatch.add(0.45, 0.06, 0.45, x, h, z);
      for (const dx of [-0.18, 0.18]) for (const dz of [-0.18, 0.18]) chairBatch.add(0.04, h, 0.04, x + dx, h / 2, z + dz);
    }
  }
  chairBatch.build(root);

  // ------------------------------------------------------------ the DJ's garden bandstand (north-west corner)
  const djBooth = new THREE.Group();
  const bx = -(WX + 1.2 + (ROWS * DEPTH) / 2 + 0.6);
  const bz = -(WZ + 1.2 + (ROWS * DEPTH) / 2 + 0.6);
  djBooth.position.set(bx, 0, bz);
  const plinthH = 2.0;
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, plinthH, 8), M.plinth);
  plinth.position.y = plinthH / 2;
  plinth.castShadow = plinth.receiveShadow = true;
  djBooth.add(plinth);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 0.08, 8), M.wood);
  floor.position.y = plinthH + 0.04;
  floor.receiveShadow = true;
  djBooth.add(floor);
  const colMat = mat(0xfbf8f0, { roughness: 0.5 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.4, 12), colMat);
    c.position.set(Math.cos(a) * 3.7, plinthH + 1.7, Math.sin(a) * 3.7);
    c.castShadow = true;
    djBooth.add(c);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.8, 8, 1), mat(ROYAL.bottle, { roughness: 0.4, metalness: 0.2 }));
  roof.position.y = plinthH + 3.4 + 0.9;
  roof.rotation.y = Math.PI / 8;
  roof.castShadow = true;
  djBooth.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat(ROYAL.gold, { metalness: 0.9, roughness: 0.2 }));
  finial.position.y = plinthH + 5.25;
  djBooth.add(finial);
  const eave = new THREE.Mesh(new THREE.TorusGeometry(4.05, 0.08, 6, 8), mat(ROYAL.gold, { metalness: 0.8, roughness: 0.3 }));
  eave.rotation.set(Math.PI / 2, 0, Math.PI / 8);
  eave.position.y = plinthH + 3.4;
  djBooth.add(eave);
  // DJ desk facing the court (court is toward +x,+z from the bandstand).
  const desk = new THREE.Group();
  desk.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.8), mat(0x1b1714, { roughness: 0.35, metalness: 0.2 })), { castShadow: true }));
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.06, 0.85), mat(ROYAL.gold, { metalness: 0.8, roughness: 0.25 }));
  deskTop.position.y = 0.53;
  desk.add(deskTop);
  for (const x of [-0.55, 0.55]) {
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 28), mat(0x111111, { roughness: 0.25 }));
    platter.position.set(x, 0.58, 0);
    platter.name = 'platter';
    desk.add(platter);
  }
  // The desk sits on the bandstand's court-facing diagonal, its long axis perpendicular to it.
  desk.position.set(1.1, plinthH + 0.5, 1.1);
  desk.rotation.y = Math.PI / 4;
  djBooth.add(desk);
  for (const p of [...desk.children]) {
    if (p.name !== 'platter') continue;
    // Re-parent platters onto the bandstand so the animator (which spins direct children) finds them.
    p.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), desk.rotation.y).add(desk.position);
    djBooth.add(p);
  }
  // Speakers (walnut cabinets) and festoon lights under the roof.
  const spMat = mat(0x3b2a1e, { roughness: 0.5 });
  for (const a of [Math.PI / 4 - 0.75, Math.PI / 4 + 0.75]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.6), spMat);
    s.position.set(Math.cos(a) * 2.8, plinthH + 0.75, Math.sin(a) * 2.8);
    s.rotation.y = Math.PI / 4; // cabinet fronts (+z) face the court diagonal
    s.castShadow = true;
    djBooth.add(s);
    for (const y of [0.35, -0.3]) {
      const cone = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), mat(0x222222, { roughness: 0.3 }));
      cone.position.set(0, y, 0.31);
      cone.name = 'cone';
      s.add(cone);
    }
  }
  const djLights: THREE.Mesh[] = [];
  const bulbs: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const a1 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      const a = a0 + (a1 - a0) * t;
      bulbs.push(new THREE.Vector3(Math.cos(a) * 3.7 + bx, plinthH + 3.2 - Math.sin(t * Math.PI) * 0.35, Math.sin(a) * 3.7 + bz));
    }
  }
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffd27a, emissiveIntensity: 1 }));
    const a = Math.PI / 4 + (i - 2) * 0.35;
    m.position.set(Math.cos(a) * 2.3, plinthH + 2.6, Math.sin(a) * 2.3);
    djLights.push(m);
    djBooth.add(m);
  }
  root.add(djBooth);
  const stringLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 1.4 }), bulbs.length);
  bulbs.forEach((p, i) => stringLights.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  root.add(stringLights);
  const djAnchor = new THREE.Vector3(bx + Math.cos(Math.PI / 4) * 0.4, plinthH + 0.05, bz + Math.sin(Math.PI / 4) * 0.4);

  // ------------------------------------------------------------ parkland beyond: tall trees
  const trunkM = mat(0x5a4632);
  const leafMs = [mat(0x2c4f2a, { roughness: 1 }), mat(0x365c30, { roughness: 1 }), mat(0x25462a, { roughness: 1 })];
  const treeTrunks = new BoxBatch(trunkM);
  const canopies: THREE.BufferGeometry[][] = [[], [], []];
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    const r = 34 + fr() * 18;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 1.2;
    const h = 7 + fr() * 6;
    treeTrunks.add(0.5, h * 0.5, 0.5, x, h * 0.25, z);
    for (let k = 0; k < 3; k++) {
      const g = new THREE.IcosahedronGeometry(2.4 + fr() * 1.8, 1);
      g.translate(x + (fr() - 0.5) * 2, h * 0.55 + k * 1.6, z + (fr() - 0.5) * 2);
      canopies[(i + k) % 3].push(g);
    }
  }
  treeTrunks.build(root);
  canopies.forEach((list, i) => {
    const m = new THREE.Mesh(mergeGeometries(list), leafMs[i]);
    m.castShadow = true;
    root.add(m);
  });
  // Club pavilion roofline glimpsed beyond the north stand.
  const pav = new THREE.Mesh(new THREE.BoxGeometry(30, 7, 8), M.plaster);
  pav.position.set(-6, 3.5, -40);
  root.add(pav);
  const pavRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 5.5, 3.2, 4, 1), mat(0x4a3b3a, { roughness: 0.7 }));
  pavRoof.rotation.y = Math.PI / 4;
  pavRoof.scale.set(3.9, 1, 1.05);
  pavRoof.position.set(-6, 8.6, -40);
  root.add(pavRoof);
  const pavSign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshStandardMaterial({ map: signTexture('Rally Club', 'THE MEMBERS’ PAVILION', ROYAL.bottle, ROYAL.gold), roughness: 0.6 }));
  pavSign.position.set(-6, 4.2, -35.95);
  root.add(pavSign);

  const bunting = new THREE.Group();
  root.add(bunting);

  let lastMinute = -1;
  const extras: LawnExtras = {
    officials,
    async enhance(renderer: THREE.WebGLRenderer, sc: THREE.Scene) {
      const jobs: Promise<unknown>[] = [];
      // HDRI sky for lighting + background; hide the painted fallback dome once it is in.
      jobs.push(
        loadSky(renderer, sc, { background: true, intensity: 0.55, rotationY: 0.6 }).then((ok) => {
          if (ok) {
            sky.visible = false;
            hemi.intensity = 0.25; // the HDRI now provides the sky fill
            sc.fog = new THREE.Fog(0xcfdde6, 90, 260);
          }
        }),
      );
      // Real grass blades and normal detail over the art-directed mowing stripes.
      jobs.push(addDetailMap(lawnMat, 'leafy_grass', 22, 0.55));
      jobs.push(applyPbr(M.surround, 'precast_stone_paving', [40, 40], { tint: 0xd8d2c4 }));
      // Concrete terraces (world-space UVs already sized), brick stand backs, plaster pavilion & bandstand.
      jobs.push(applyPbr(M.concrete, 'concrete_floor_02', [1, 1], { tint: 0xf2ede2 }));
      jobs.push(applyPbr(M.stone, 'concrete_floor_02', [1, 1], { tint: 0xe2d8c0 }));
      jobs.push(applyPbr(M.brick, 'red_brick_03', [10, 4], { tint: 0xd9c2b4 }));
      jobs.push(applyPbr(M.plaster, 'white_plaster_02', [8, 2], { tint: 0xf6efe0 }));
      jobs.push(applyPbr(M.plinth, 'white_plaster_02', [6, 1], { tint: 0xf8f2e6 }));
      jobs.push(applyPbr(M.wood, 'wood_table_001', [3, 3], { tint: 0xb48a62 }));
      jobs.push(applyPbr(M.members, 'leather_red_02', [2, 2], { useColor: false, roughness: 0.75 }));
      // Garden planting from Poly Haven: shrubs around the bandstand and the outer walkways, potted palms
      // flanking the Members' Box, planter boxes along the north walkway.
      const shrubs: { pos: THREE.Vector3; rotY: number; scale: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * 0.05 + (i / 6) * Math.PI * 0.4;
        shrubs.push({ pos: new THREE.Vector3(bx + Math.cos(a) * 5.4, 0, bz + Math.sin(a) * 5.4), rotY: i * 1.3, scale: 1.1 + (i % 3) * 0.15 });
      }
      for (const x of [-26, -20, 20, 26]) for (const z of [-30, 30]) shrubs.push({ pos: new THREE.Vector3(x, 0, z), rotY: x * 0.3, scale: 1.6 });
      jobs.push(scatterModel(root, 'shrub_02', shrubs));
      const memX = WX + 1.2 + 2 * DEPTH;
      jobs.push(
        scatterModel(root, 'potted_plant_02', [
          { pos: new THREE.Vector3(memX - 0.2, 0.7 + 2 * RISE, -4.0), scale: 1.1 },
          { pos: new THREE.Vector3(memX - 0.2, 0.7 + 2 * RISE, 4.0), scale: 1.1 },
          { pos: new THREE.Vector3(bx + 2.9, plinthH + 0.04, bz - 1.2), scale: 1.0 },
          { pos: new THREE.Vector3(bx - 1.2, plinthH + 0.04, bz + 2.9), scale: 1.0 },
        ]),
      );
      const boxes: { pos: THREE.Vector3; rotY: number }[] = [];
      for (let x = -9; x <= 9; x += 3) boxes.push({ pos: new THREE.Vector3(x, 0, -(WZ + 1.2 + ROWS * DEPTH + 1.6)), rotY: 0 });
      jobs.push(scatterModel(root, 'planter_box_01', boxes));
      await Promise.all(jobs);
    },
    setScoreboard,
    tick(now: Date) {
      if (now.getMinutes() !== lastMinute) {
        lastMinute = now.getMinutes();
        drawClock(now);
      }
    },
  };

  return { root, sun, seats, djAnchor, djYaw: (-3 * Math.PI) / 4, djBooth, djLights, stringLights, bunting, extras };
}
