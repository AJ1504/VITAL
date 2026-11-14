// Sunset Rooftop Club — the first destination (brief §3). Built entirely from primitives and
// procedural textures: emerald/terracotta court, cream lines, intimate grandstands, striped awnings,
// rooftop gardens, skyline silhouettes, a DJ balcony and golden-hour shadows.

import * as THREE from 'three';
import { type Court, netHeightAt } from '../../../shared/src/court.ts';
import { PALETTE } from './palette.ts';
import { courtGrainTexture, netTexture, signTexture, stripeTexture, tileTexture, windowsTexture } from './textures.ts';

export interface Venue {
  root: THREE.Group;
  sun: THREE.DirectionalLight;
  /** Seats for spectators: position + facing yaw. */
  seats: { pos: THREE.Vector3; yaw: number; standing: boolean; members?: boolean }[];
  djAnchor: THREE.Vector3;
  /** Facing of the DJ character (radians about +y; 0 faces -z). */
  djYaw?: number;
  djBooth: THREE.Group;
  djLights: THREE.Mesh[];
  stringLights: THREE.InstancedMesh;
  bunting: THREE.Group;
}

const std = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function buildVenue(scene: THREE.Scene, court: Court): Venue {
  const root = new THREE.Group();
  scene.add(root);

  // ---------------------------------------------------------------- sky, fog, light
  scene.background = new THREE.Color(PALETTE.sky1);
  scene.fog = new THREE.Fog(0xf3b386, 38, 120);
  const skyGeo = new THREE.SphereGeometry(200, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      c0: { value: new THREE.Color(PALETTE.sky0) },
      c1: { value: new THREE.Color(PALETTE.sky1) },
      c2: { value: new THREE.Color(PALETTE.sky2) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; varying vec3 vP; void main(){ float h = vP.y; vec3 col = h < 0.08 ? mix(c0, c1, smoothstep(-0.05, 0.08, h)) : mix(c1, c2, smoothstep(0.08, 0.6, h)); gl_FragColor = vec4(col,1.0); }',
  });
  root.add(new THREE.Mesh(skyGeo, skyMat));
  // Low sun disc on the horizon.
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xffe7a8, fog: false }));
  sunDisc.position.set(-60, 9, -150);
  sunDisc.lookAt(0, 5, 0);
  root.add(sunDisc);

  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x6b4a5a, 1.1));
  const sun = new THREE.DirectionalLight(0xffc98a, 3.2);
  sun.position.set(-18, 11, -14); // low golden-hour sun: long shadows raking across the court
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -22;
  sc.right = 22;
  sc.top = 22;
  sc.bottom = -22;
  sc.near = 1;
  sc.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xb7a6ff, 0.35);
  fill.position.set(10, 8, 12);
  scene.add(fill);

  // ---------------------------------------------------------------- deck & court
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(34, 44), std(0xffffff, { map: tileTexture(PALETTE.terracotta, 0x8f4a30, 8, 7) }));
  deck.rotation.x = -Math.PI / 2;
  deck.receiveShadow = true;
  root.add(deck);

  // Playing area (30 x 60 ft) in deep emerald, court in emerald, kitchens slightly lighter.
  const runoff = new THREE.Mesh(new THREE.PlaneGeometry(30 * 0.3048, 60 * 0.3048), std(0xffffff, { map: courtGrainTexture(PALETTE.emeraldDeep), roughness: 0.9 }));
  runoff.rotation.x = -Math.PI / 2;
  runoff.position.y = 0.004;
  runoff.receiveShadow = true;
  root.add(runoff);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(court.width, court.length), std(0xffffff, { map: courtGrainTexture(PALETTE.emerald), roughness: 0.8 }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.008;
  surface.receiveShadow = true;
  root.add(surface);
  for (const s of [1, -1]) {
    const k = new THREE.Mesh(new THREE.PlaneGeometry(court.width, court.nvzDepth), std(PALETTE.emeraldKitchen, { roughness: 0.8 }));
    k.rotation.x = -Math.PI / 2;
    k.position.set(0, 0.01, (s * court.nvzDepth) / 2);
    k.receiveShadow = true;
    root.add(k);
  }

  // Lines (cream). Lines are inside the court dimensions.
  const lineMat = std(PALETTE.cream, { roughness: 0.6 });
  const lw = court.lineWidth;
  const line = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.013, z);
    m.receiveShadow = true;
    root.add(m);
  };
  const hw = court.halfWidth;
  const hl = court.halfLength;
  line(court.width, lw, 0, hl - lw / 2);
  line(court.width, lw, 0, -hl + lw / 2);
  line(lw, court.length, hw - lw / 2, 0);
  line(lw, court.length, -hw + lw / 2, 0);
  line(court.width, lw, 0, court.nvzDepth - lw / 2);
  line(court.width, lw, 0, -court.nvzDepth + lw / 2);
  // Centre lines run from the kitchen line to the baseline.
  const cl = hl - court.nvzDepth;
  line(lw, cl, 0, court.nvzDepth + cl / 2);
  line(lw, cl, 0, -court.nvzDepth - cl / 2);

  // ---------------------------------------------------------------- net
  const span = hw + court.netPostOffset;
  const postMat = std(PALETTE.ink, { metalness: 0.4, roughness: 0.4 });
  for (const s of [1, -1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, court.netHeightPost + 0.05, 12), postMat);
    post.position.set(s * span, (court.netHeightPost + 0.05) / 2, 0);
    post.castShadow = true;
    root.add(post);
  }
  // Net mesh: geometry with sagging top edge.
  const netGeo = new THREE.PlaneGeometry(span * 2, 1, 24, 1);
  const pos = netGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const top = pos.getY(i) > 0;
    pos.setY(i, top ? netHeightAt(court, x) : 0.05);
  }
  pos.needsUpdate = true;
  netGeo.computeVertexNormals();
  const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, alphaTest: 0.2, roughness: 1 }));
  net.castShadow = true;
  root.add(net);
  // Tape along the top.
  const tapePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = -span + (2 * span * i) / 24;
    tapePts.push(new THREE.Vector3(x, netHeightAt(court, x), 0));
  }
  const tape = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tapePts), 48, 0.028, 6), std(PALETTE.cream, { roughness: 0.5 }));
  tape.castShadow = true;
  root.add(tape);

  // ---------------------------------------------------------------- parapet walls
  const wallMat = std(PALETTE.terracottaLight);
  const copeMat = std(PALETTE.cream);
  const W = 17;
  const L = 22;
  for (const s of [1, -1]) {
    root.add(box(0.4, 1.0, L * 2, wallMat, s * W, 0.5, 0));
    root.add(box(0.55, 0.08, L * 2, copeMat, s * W, 1.04, 0));
  }
  root.add(box(W * 2, 1.0, 0.4, wallMat, 0, 0.5, -L));
  root.add(box(W * 2, 0.08, 0.55, copeMat, 0, 1.04, -L));

  // ---------------------------------------------------------------- grandstands along both sidelines
  const seats: Venue['seats'] = [];
  const standMat = std(PALETTE.cream);
  const riserMat = std(PALETTE.terracottaDark);
  const benchMat = std(0x8a5a3c, { roughness: 0.7 });
  const rows = 4;
  for (const s of [1, -1]) {
    const baseX = s * 6.3;
    const group = new THREE.Group();
    for (let r = 0; r < rows; r++) {
      const x = baseX + s * r * 0.85;
      const h = 0.35 + r * 0.45;
      group.add(box(0.85, h, 12.5, r % 2 === 0 ? standMat : riserMat, x, h / 2, 0));
      group.add(box(0.45, 0.08, 12.4, benchMat, x + s * 0.12, h + 0.25, 0));
      for (let i = 0; i < 18; i++) {
        const z = -5.9 + (i * 11.8) / 17 + (r % 2) * 0.2;
        seats.push({ pos: new THREE.Vector3(x + s * 0.12, h + 0.25, z), yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2, standing: false });
      }
    }
    // Striped canopy over the back rows.
    const canopy = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 13.5), std(0xffffff, { map: stripeTexture(PALETTE.coral, PALETTE.cream, 14), side: THREE.DoubleSide }));
    canopy.rotation.x = -Math.PI / 2;
    canopy.castShadow = true;
    const canopyPivot = new THREE.Group();
    canopyPivot.position.set(baseX + s * 2.4, 4.4, 0);
    canopyPivot.rotation.z = s * 0.25; // slope down toward the court
    canopyPivot.add(canopy);
    group.add(canopyPivot);
    for (const z of [-6.5, 0, 6.5]) group.add(box(0.1, 4.4, 0.1, postMat, baseX + s * 3.8, 2.2, z));
    root.add(group);
  }

  // Standing VIP terrace behind the near baseline corners.
  for (const x of [-5.5, -4.6, 4.6, 5.5, -3.2, 3.2]) {
    for (const dz of [0, 0.7]) seats.push({ pos: new THREE.Vector3(x, 0, 10.6 + dz), yaw: Math.PI, standing: true });
  }

  // ---------------------------------------------------------------- clubhouse facade (far end)
  const club = new THREE.Group();
  const facadeMat = std(PALETTE.cream);
  club.add(box(26, 6, 1.2, facadeMat, 0, 3, -15.5));
  // Arched openings suggested by dark insets + terracotta pilasters.
  const insetMat = std(0x5a3424, { roughness: 1 });
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    club.add(box(1.4, 2.4, 0.2, insetMat, i * 2.2, 1.6, -14.85, false));
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.2, 16, 1, false, -Math.PI / 2, Math.PI), insetMat);
    arch.rotation.x = -Math.PI / 2; // half-disc, curved edge up
    arch.position.set(i * 2.2, 2.8, -14.85);
    club.add(arch);
    club.add(box(0.35, 6, 0.3, std(PALETTE.terracotta), i * 2.2 + 1.1, 3, -14.8));
  }
  // Long striped awning.
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(26, 2.2), std(0xffffff, { map: stripeTexture(PALETTE.coral, PALETTE.cream, 40), side: THREE.DoubleSide }));
  awning.position.set(0, 4.3, -14.0);
  awning.rotation.x = -Math.PI / 2 + 0.45;
  awning.castShadow = true;
  club.add(awning);
  // Club sign.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshStandardMaterial({ map: signTexture('Rally Club', 'SUNSET ROOFTOP · EST. 2026', PALETTE.emerald, PALETTE.cream), roughness: 0.6 }));
  sign.position.set(0, 5.25, -14.85);
  club.add(sign);
  // Upper terrace with balustrade.
  club.add(box(26, 0.25, 3, std(PALETTE.terracottaLight), 0, 6.1, -15));
  for (let x = -12.5; x <= 12.5; x += 0.6) club.add(box(0.12, 0.8, 0.12, facadeMat, x, 6.6, -13.6, false));
  club.add(box(26, 0.1, 0.2, facadeMat, 0, 7.05, -13.6, false));
  root.add(club);

  // ---------------------------------------------------------------- DJ balcony (far-left corner)
  const djBooth = new THREE.Group();
  const djBase = new THREE.Vector3(-5.2, 0, -12.6); // in front of the clubhouse, visible from the broadcast camera
  djBooth.position.copy(djBase);
  djBooth.add(box(4.2, 1.6, 3.0, std(PALETTE.terracottaDark), 0, 0.8, 0)); // balcony plinth
  djBooth.add(box(4.4, 0.12, 3.2, copeMat, 0, 1.66, 0));
  djBooth.add(box(2.2, 1.0, 0.8, std(PALETTE.ink, { roughness: 0.4, metalness: 0.3 }), 0, 2.2, 0.6)); // booth desk
  djBooth.add(box(2.24, 0.12, 0.84, std(PALETTE.gold, { metalness: 0.6, roughness: 0.3 }), 0, 2.74, 0.6));
  // Turntables.
  const deckMat = std(0x222222, { roughness: 0.3 });
  for (const x of [-0.55, 0.55]) {
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24), deckMat);
    platter.position.set(x, 2.82, 0.6);
    platter.name = 'platter';
    djBooth.add(platter);
  }
  // Speaker stacks.
  const spMat = std(0x1d1a1a, { roughness: 0.5 });
  const coneMat = std(0x3a3a3a, { roughness: 0.3, metalness: 0.3 });
  for (const x of [-1.85, 1.85]) {
    djBooth.add(box(0.7, 1.6, 0.6, spMat, x, 2.5, 0.7));
    for (const y of [2.1, 2.85]) {
      const cone = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), coneMat);
      cone.position.set(x, y, 1.01);
      cone.name = 'cone';
      djBooth.add(cone);
    }
  }
  // Light bar that pulses on the beat.
  const djLights: THREE.Mesh[] = [];
  const lightColors = [PALETTE.coral, PALETTE.gold, PALETTE.lavender, PALETTE.cobalt, PALETTE.coral];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: lightColors[i], emissive: lightColors[i], emissiveIntensity: 1 }));
    m.position.set(-1.2 + i * 0.6, 3.6, 0.2);
    djLights.push(m);
    djBooth.add(m);
  }
  djBooth.add(box(3.0, 0.06, 0.06, postMat, 0, 3.6, 0.2, false));
  for (const x of [-1.5, 1.5]) djBooth.add(box(0.06, 2.0, 0.06, postMat, x, 2.6, 0.2, false));
  root.add(djBooth);
  const djAnchor = djBase.clone().add(new THREE.Vector3(0, 1.72, -0.15));

  // ---------------------------------------------------------------- gardens, parasols, cafe
  const leafMats = [std(0x3f7a4a), std(0x2f6a43), std(0x5b8f4f)];
  const potMat = std(PALETTE.terracotta);
  const addTree = (x: number, z: number, scale = 1) => {
    const g = new THREE.Group();
    g.add(box(0.9 * scale, 0.7 * scale, 0.9 * scale, potMat, 0, 0.35 * scale, 0));
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.09 * scale, 1.4 * scale), std(0x6b4a33));
    trunk.position.y = 1.2 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry((0.55 - i * 0.08) * scale, 0), leafMats[i % 3]);
      leaf.position.set((i - 1) * 0.2 * scale, (1.9 + i * 0.35) * scale, ((i % 2) - 0.5) * 0.2 * scale);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    root.add(g);
  };
  for (const z of [-13, -9, 9, 13]) {
    addTree(-15.5, z, 1.1);
    addTree(15.5, z, 1.1);
  }
  for (const x of [-12, -6, 6, 12]) addTree(x, -20.5, 1.2);
  // Low planter boxes framing the near baseline.
  const hedgeMat = std(0x3c7448);
  for (const x of [-8.5, 8.5]) {
    root.add(box(3, 0.6, 0.8, potMat, x, 0.3, 12.5));
    root.add(box(2.9, 0.45, 0.7, hedgeMat, x, 0.82, 12.5));
  }

  const addParasol = (x: number, z: number, a: number, b: number) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3), postMat);
    pole.position.y = 1.15;
    g.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.55, 16, 1, true), std(0xffffff, { map: stripeTexture(a, b, 16), side: THREE.DoubleSide }));
    top.position.y = 2.35;
    top.castShadow = true;
    g.add(top);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 16), std(PALETTE.cream));
    table.position.y = 0.75;
    table.castShadow = true;
    g.add(table);
    g.add(box(0.06, 0.75, 0.06, postMat, 0, 0.37, 0));
    for (const s of [1, -1]) g.add(box(0.4, 0.45, 0.4, std(PALETTE.cobalt), s * 0.75, 0.22, 0));
    g.position.set(x, 0, z);
    root.add(g);
  };
  addParasol(-12.5, 14.5, PALETTE.coral, PALETTE.cream);
  addParasol(12.5, 14.5, PALETTE.cobalt, PALETTE.cream);
  addParasol(-13, -4, PALETTE.gold, PALETTE.cream);
  addParasol(13, -4, PALETTE.lavender, PALETTE.cream);
  addParasol(13, 4, PALETTE.coral, PALETTE.cream);

  // ---------------------------------------------------------------- bunting & string lights
  const bunting = new THREE.Group();
  const flagColors = [PALETTE.coral, PALETTE.gold, PALETTE.cobalt, PALETTE.cream, PALETTE.lavender, PALETTE.emerald];
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.38, 0], 3));
  flagGeo.computeVertexNormals();
  const strands: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(-10.2, 6.2, -13.6), new THREE.Vector3(10.2, 6.2, -13.6)],
    [new THREE.Vector3(-8.8, 4.6, -8), new THREE.Vector3(8.8, 4.6, -8)],
  ];
  const bulbPositions: THREE.Vector3[] = [];
  for (const [a, b] of strands) {
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * 0.9;
      const f = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: flagColors[i % flagColors.length], side: THREE.DoubleSide, roughness: 0.9 }));
      f.position.copy(p);
      bunting.add(f);
      bulbPositions.push(p.clone().add(new THREE.Vector3(0.18, 0.02, 0)));
    }
  }
  // Strings over the side stands.
  for (const s of [1, -1]) {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      bulbPositions.push(new THREE.Vector3(s * 9.0, 4.6 - Math.sin(t * Math.PI) * 0.5, -6.5 + t * 13));
    }
  }
  root.add(bunting);
  const stringLights = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 1.6 }),
    bulbPositions.length,
  );
  const mtx = new THREE.Matrix4();
  bulbPositions.forEach((p, i) => stringLights.setMatrixAt(i, mtx.makeTranslation(p.x, p.y, p.z)));
  root.add(stringLights);

  // ---------------------------------------------------------------- skyline silhouettes
  const skyline = new THREE.Group();
  const wallCols = [0x8f5d6e, 0x9d6a62, 0x7e6390, 0xa4735a, 0x6f5a7f];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const angle = -Math.PI * 0.95 + (i / 45) * Math.PI * 0.9;
    const dist = 55 + rnd() * 40;
    const w = 5 + rnd() * 9;
    const h = 8 + rnd() * 34;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (z > -20) continue;
    const t = windowsTexture(wallCols[i % wallCols.length], 0xffd48a, 4 + Math.floor(rnd() * 4), 10 + Math.floor(rnd() * 10));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25, roughness: 1 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    b.position.set(x, h / 2 - 6, z);
    b.lookAt(0, b.position.y, 0);
    skyline.add(b);
    if (rnd() < 0.25) {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(w * 0.3, h * 0.25, 4), new THREE.MeshStandardMaterial({ color: wallCols[(i + 2) % wallCols.length], roughness: 1 }));
      spire.position.set(x, h - 6 + h * 0.12, z);
      skyline.add(spire);
    }
  }
  root.add(skyline);

  return { root, sun, seats, djAnchor, djBooth, djLights, stringLights, bunting };
}
