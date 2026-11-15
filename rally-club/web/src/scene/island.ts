// The resort island around every arena: a mown lawn plateau ringed by a sandy beach, an animated
// turquoise ocean (shader: shallow-to-deep colour, sky fresnel, sun glints and shore foam), puffy 3D
// clouds, distant islands with a lighthouse, and sailboats on the horizon. Original design.
import * as THREE from 'three';
import { M4, merge, std } from './kit.ts';
import { grassTex, sandTex } from './surfaces.ts';

export interface IslandLook {
  skyTop: string;
  horizon: string;
  sunDir: THREE.Vector3;
  sunColor: number;
  grass: number;
  dusk: boolean;
  night?: boolean;
  /** Shift the island along z (negative brings the far shore close behind the DJ). */
  centerZ?: number;
}

export const ISLAND_R = 78;
const BEACH_W = 16;

/** Flat ring with UVs in metres (for tiling textures), sloping from y0 at r0 to y1 at r1. */
function slopedRing(r0: number, r1: number, y0: number, y1: number, seg = 96, rings = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = r0 + (r1 - r0) * t;
    const y = y0 + (y1 - y0) * (t * t * (3 - 2 * t));
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const wob = 1 + Math.sin(a * 5) * 0.025 + Math.sin(a * 13) * 0.01;
      const x = Math.cos(a) * r * wob;
      const z = Math.sin(a) * r * wob;
      pos.push(x, y, z);
      uv.push(x, z);
    }
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function oceanMaterial(look: IslandLook, fogColor: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: look.sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(look.sunColor) },
      uShallow: { value: new THREE.Color(look.night ? 0x2f5f86 : look.dusk ? 0x8fd0d0 : 0x6fe0d6) },
      uMid: { value: new THREE.Color(look.night ? 0x1d3f6e : look.dusk ? 0x5aa0bf : 0x2fb2d8) },
      uDeep: { value: new THREE.Color(look.night ? 0x101e44 : look.dusk ? 0x3c5f99 : 0x1677c9) },
      uSky: { value: new THREE.Color(look.horizon) },
      uFog: { value: fogColor },
      uShore: { value: ISLAND_R + BEACH_W * 0.72 },
      uCenter: { value: new THREE.Vector2(0, look.centerZ ?? 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; uniform vec3 uSunColor; uniform vec3 uShallow; uniform vec3 uMid;
      uniform vec3 uDeep; uniform vec3 uSky; uniform vec3 uFog; uniform float uShore; uniform vec2 uCenter;
      varying vec3 vWorld;
      float h(vec2 p) {
        float t = uTime;
        return sin(p.x * 0.21 + t * 1.1) * 0.5 + sin(p.y * 0.17 - t * 0.9) * 0.5
             + sin((p.x + p.y) * 0.43 + t * 1.7) * 0.25 + sin((p.x - p.y) * 0.81 - t * 2.3) * 0.12
             + sin(p.x * 1.7 + p.y * 1.3 + t * 3.1) * 0.06;
      }
      void main() {
        vec2 p = vWorld.xz;
        float e = 0.35;
        vec3 n = normalize(vec3(h(p - vec2(e, 0.0)) - h(p + vec2(e, 0.0)), 6.0, h(p - vec2(0.0, e)) - h(p + vec2(0.0, e))));
        vec3 V = normalize(cameraPosition - vWorld);
        float r = length(p - uCenter);
        float depth = smoothstep(uShore, uShore + 60.0, r);
        vec3 water = mix(uShallow, uMid, smoothstep(0.0, 0.35, depth));
        water = mix(water, uDeep, smoothstep(0.35, 1.0, depth));
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec3 col = mix(water, uSky, fres * 0.55);
        vec3 R = reflect(-uSun, n);
        float spec = pow(max(dot(R, V), 0.0), 160.0);
        col += uSunColor * spec * 1.6;
        // Shore foam: a soft breaking band that laps in and out.
        vec2 pc = p - uCenter;
        float lap = sin(uTime * 0.8 + atan(pc.y, pc.x) * 7.0) * 0.8;
        float band = 1.0 - smoothstep(0.0, 2.2, abs(r - (uShore + 1.6 + lap)));
        float sparkle = step(0.55, fract(sin(dot(floor(p * 2.0), vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.15));
        float foam = band * (0.55 + 0.45 * sparkle) + (1.0 - smoothstep(0.0, 1.0, r - uShore)) * 0.9;
        col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.85);
        float dist = length(cameraPosition.xz - p);
        col = mix(col, uFog, smoothstep(220.0, 700.0, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
}

export function buildIsland(parent: THREE.Object3D, look: IslandLook, fogColor: THREE.Color, rnd: () => number): { tick(t: number): void } {
  const root = new THREE.Group();
  root.position.z = look.centerZ ?? 0;
  parent.add(root);
  // Lawn plateau (textured, slightly domed edge into the beach).
  const lawnMat = new THREE.MeshStandardMaterial({ color: look.grass, map: grassTex(7), roughness: 1 });
  const lawnShape = new THREE.Shape();
  lawnShape.absarc(0, 0, ISLAND_R + 0.5, 0, Math.PI * 2, false);
  const lawn = new THREE.Mesh(new THREE.ShapeGeometry(lawnShape, 64), lawnMat);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.03;
  lawn.receiveShadow = true;
  root.add(lawn);
  // Beach ring sloping down into the water, and a grassy lip over it.
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xf6e6c6, map: sandTex(3), roughness: 1 });
  const beach = new THREE.Mesh(slopedRing(ISLAND_R - 2, ISLAND_R + BEACH_W + 6, -0.05, -2.4), sandMat);
  beach.receiveShadow = true;
  root.add(beach);
  const lip = new THREE.Mesh(slopedRing(ISLAND_R - 4, ISLAND_R + 1.2, 0.02, -0.2, 96, 2), lawnMat);
  lip.receiveShadow = true;
  root.add(lip);

  // Ocean.
  const ocean = new THREE.Mesh(new THREE.CircleGeometry(820, 96), oceanMaterial(look, fogColor));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.9;
  root.add(ocean);

  // Beach dressing: palms leaning to the sea, loungers with parasols, rocks.
  const B: { mat: THREE.Material; geo: THREE.BufferGeometry[] }[] = [];
  const add = (mat: THREE.Material, geo: THREE.BufferGeometry, m: THREE.Matrix4) => {
    let e = B.find((x) => x.mat === mat);
    if (!e) B.push((e = { mat, geo: [] }));
    const g = geo.clone();
    g.applyMatrix4(m);
    e.geo.push(g);
  };
  const rock = std(0xd9ccb6, { roughness: 1, flatShading: true });
  const towel = [std(0xf2a9b8), std(0x8fd3c9), std(0xf7d98a), std(0xc8b8e3)];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = ISLAND_R + BEACH_W * (0.35 + rnd() * 0.4);
    add(rock, new THREE.IcosahedronGeometry(0.6 + rnd() * 1.2, 0), M4(Math.cos(a) * r, -1.2 + rnd() * 0.4, Math.sin(a) * r, rnd() * 6, 1));
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd() * 0.2;
    const r = ISLAND_R + 5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    add(towel[i % 4], new THREE.BoxGeometry(0.9, 0.03, 1.8), M4(x, -0.45, z, -a));
  }
  for (const e of B) {
    const m = new THREE.Mesh(merge(e.geo), e.mat);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }

  // Distant islands: grassy domes on sandy rims, one rocky islet, one with a lighthouse.
  const far = new THREE.Group();
  const hill = std(0x8fbf6a, { roughness: 1 });
  const hillDark = std(0x6fa457, { roughness: 1 });
  const rim = std(0xf4e2bf, { roughness: 1 });
  const cliff = std(0xd8c7a6, { roughness: 1, flatShading: true });
  const islands: [number, number, number, number][] = [
    [-0.6, 300, 46, 18],
    [0.35, 380, 70, 30],
    [1.35, 330, 38, 14],
    [2.4, 420, 90, 42],
    [3.6, 290, 34, 12],
    [4.6, 360, 56, 22],
    [5.5, 440, 80, 26],
  ];
  islands.forEach(([a, r, w, hgt], i) => {
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const sandRim = new THREE.Mesh(new THREE.CylinderGeometry(w * 1.12, w * 1.2, 2, 32), rim);
    sandRim.position.set(x, -1.2, z);
    far.add(sandRim);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(w, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? hill : hillDark);
    dome.scale.y = hgt / w;
    dome.position.set(x, -0.5, z);
    far.add(dome);
    if (i === 1) {
      // Lighthouse on a rocky point.
      const base = new THREE.Mesh(new THREE.IcosahedronGeometry(14, 0), cliff);
      base.position.set(x + w * 0.9, 2, z);
      base.scale.y = 0.6;
      far.add(base);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 22, 16), std(0xfbf8f3));
      tower.position.set(x + w * 0.9, 18, z);
      far.add(tower);
      for (let k = 0; k < 3; k++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(2.5 - k * 0.25, 2.7 - k * 0.25, 2.2, 16), std(0xe2766a));
        band.position.set(x + w * 0.9, 10 + k * 6, z);
        far.add(band);
      }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff3c8, emissive: 0xffe08a, emissiveIntensity: look.night ? 3 : look.dusk ? 2 : 0.6 }));
      lamp.position.set(x + w * 0.9, 30.5, z);
      far.add(lamp);
    }
    if (i === 4) {
      const crag = new THREE.Mesh(new THREE.IcosahedronGeometry(w * 0.7, 1), cliff);
      crag.scale.set(1, 1.4, 0.8);
      crag.position.set(x, hgt * 0.6, z);
      far.add(crag);
    }
  });
  root.add(far);

  // Puffy cumulus clouds (flat-bottomed sphere clusters) drifting slowly.
  const cloudGroup = new THREE.Group();
  const puffs: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const r = 1 + (k % 3) * 0.35;
    puffs.push(new THREE.SphereGeometry(r, 14, 10).translate((k - 3) * 1.1 + Math.sin(k) * 0.3, r * 0.45 + (k % 2) * 0.4, Math.cos(k * 1.7) * 0.6));
  }
  const cloudGeo = merge(puffs);
  const cp = cloudGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) if (cp.getY(i) < 0.2) cp.setY(i, 0.2); // flat bottoms
  cloudGeo.computeVertexNormals();
  const cloudMat = new THREE.MeshStandardMaterial({ color: look.night ? 0x5a5f92 : look.dusk ? 0xffe2e6 : 0xffffff, emissive: look.night ? 0x1c1f40 : look.dusk ? 0x6a4f7a : 0x9fb6d0, emissiveIntensity: 0.45, roughness: 1, fog: false });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 28);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + rnd() * 0.3;
    const r = 170 + rnd() * 160;
    const s = 6 + rnd() * 7;
    clouds.setMatrixAt(i, M4(Math.cos(a) * r, 48 + rnd() * 40, Math.sin(a) * r, rnd() * 6, [s * (1 + rnd() * 0.6), s * 0.75, s]));
  }
  cloudGroup.add(clouds);
  root.add(cloudGroup);

  // Sailboats on the horizon.
  const boats: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 6, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), std(0xfbf8f3));
    hull.scale.set(1, 0.6, 1);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), std(0xc8a37a));
    mast.position.y = 3.6;
    const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.6, 0.1), new THREE.Vector3(0, 7, 0.1), new THREE.Vector3(0, 0.8, 3.4)]), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xfde6d8, side: THREE.DoubleSide }));
    sail.geometry.computeVertexNormals();
    b.add(hull, mast, sail);
    b.userData = { a: rnd() * Math.PI * 2, r: 140 + rnd() * 90, w: (rnd() < 0.5 ? -1 : 1) * (0.004 + rnd() * 0.004) };
    root.add(b);
    boats.push(b);
  }

  const mat = ocean.material as THREE.ShaderMaterial;
  return {
    tick(t: number) {
      mat.uniforms.uTime.value = t;
      cloudGroup.rotation.y = t * 0.002;
      for (const b of boats) {
        const d = b.userData as { a: number; r: number; w: number };
        const a = d.a + t * d.w;
        b.position.set(Math.cos(a) * d.r, -0.9 + Math.sin(t * 1.3 + d.a) * 0.15, Math.sin(a) * d.r);
        b.rotation.y = -a + (d.w > 0 ? 0 : Math.PI);
        b.rotation.z = Math.sin(t * 1.1 + d.a) * 0.05;
      }
    },
  };
}
