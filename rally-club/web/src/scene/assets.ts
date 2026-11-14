// Real CC0 assets (Poly Haven): HDRI sky/lighting, PBR texture sets and garden models.
// Fetched by scripts/fetch-assets.py into web/public/assets; recorded in docs/ASSET_LICENSING.md.
// Everything degrades gracefully: if an asset fails to load, the procedural fallback stays in place.

import * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const BASE = './assets/';
const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

export interface PbrSet {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  aoMap?: THREE.Texture;
}

function loadTex(url: string, srgb: boolean, anisotropy: number): Promise<THREE.Texture | undefined> {
  return new Promise((resolve) => {
    texLoader.load(
      url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = anisotropy;
        resolve(t);
      },
      undefined,
      () => resolve(undefined),
    );
  });
}

const pbrCache = new Map<string, Promise<PbrSet>>();

/** Load a Poly Haven texture set (color/normal/roughness/ao). Missing maps are simply absent. */
export function loadPbr(id: string, anisotropy = 8): Promise<PbrSet> {
  let p = pbrCache.get(id);
  if (!p) {
    const dir = `${BASE}textures/${id}/`;
    p = Promise.all([
      loadTex(dir + 'color.jpg', true, anisotropy),
      loadTex(dir + 'normal.jpg', false, anisotropy),
      loadTex(dir + 'roughness.jpg', false, anisotropy),
      loadTex(dir + 'ao.jpg', false, anisotropy),
    ]).then(([map, normalMap, roughnessMap, aoMap]) => ({ map, normalMap, roughnessMap, aoMap }));
    pbrCache.set(id, p);
  }
  return p;
}

/**
 * Apply a PBR set to a material with a texture repeat. Textures are cloned per call so different
 * surfaces can use different repeats. `tint` multiplies the colour map (keeps the art-directed palette).
 */
export async function applyPbr(
  material: THREE.MeshStandardMaterial,
  id: string,
  repeat: [number, number],
  opts: { tint?: number; useColor?: boolean; normalScale?: number; roughness?: number } = {},
): Promise<void> {
  const set = await loadPbr(id);
  const prep = (t?: THREE.Texture) => {
    if (!t) return null;
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  };
  if (opts.useColor !== false && set.map) {
    material.map = prep(set.map);
    if (opts.tint !== undefined) material.color.setHex(opts.tint);
  }
  if (set.normalMap) {
    material.normalMap = prep(set.normalMap);
    const n = opts.normalScale ?? 1;
    material.normalScale.set(n, n);
  }
  if (set.roughnessMap) {
    material.roughnessMap = prep(set.roughnessMap);
    material.roughness = opts.roughness ?? 1;
  }
  if (set.aoMap) {
    material.aoMap = prep(set.aoMap);
    material.aoMapIntensity = 0.8;
  }
  material.needsUpdate = true;
}

/**
 * Multiply a high-frequency detail colour texture into a material's existing map (e.g. real grass
 * blades over the art-directed mowing stripes). Detail UVs = map UVs × repeat.
 */
export async function addDetailMap(material: THREE.MeshStandardMaterial, id: string, repeat: number, strength = 0.75): Promise<void> {
  const set = await loadPbr(id);
  if (!set.map) return;
  const detail = set.map;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detail };
    shader.uniforms.detailRepeat = { value: repeat };
    shader.uniforms.detailStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nuniform float detailRepeat;\nuniform float detailStrength;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        #ifdef USE_MAP
          vec3 det = texture2D(detailMap, vMapUv * detailRepeat).rgb;
          // Normalise the detail around its mean luminance so it adds texture without shifting the hue.
          float l = dot(det, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb *= mix(vec3(1.0), det / max(l, 0.05) * 0.5 + 0.5, detailStrength) ;
        #endif`,
      );
  };
  if (set.normalMap) {
    const n = set.normalMap.clone();
    n.repeat.set(repeat, repeat);
    n.needsUpdate = true;
    material.normalMap = n;
    material.normalScale.set(0.6, 0.6);
  }
  if (set.roughnessMap) {
    const r = set.roughnessMap.clone();
    r.repeat.set(repeat, repeat);
    r.needsUpdate = true;
    material.roughnessMap = r;
  }
  material.needsUpdate = true;
}

/** HDRI sky: used for image-based lighting and as the visible background. */
export function loadSky(renderer: THREE.WebGLRenderer, scene: THREE.Scene, opts: { background: boolean; intensity: number; rotationY?: number }): Promise<boolean> {
  return new Promise((resolve) => {
    new RGBELoader().load(
      `${BASE}hdri/sky_2k.hdr`,
      (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromEquirectangular(hdr).texture;
        scene.environmentIntensity = opts.intensity;
        if (opts.rotationY) scene.environmentRotation.y = opts.rotationY;
        if (opts.background) {
          scene.background = hdr;
          scene.backgroundIntensity = 0.9;
          if (opts.rotationY) scene.backgroundRotation.y = opts.rotationY;
        }
        pmrem.dispose();
        resolve(true);
      },
      undefined,
      () => resolve(false),
    );
  });
}

const modelCache = new Map<string, Promise<GLTF | null>>();

export function loadModel(id: string): Promise<GLTF | null> {
  let p = modelCache.get(id);
  if (!p) {
    p = gltfLoader.loadAsync(`${BASE}models/${id}/${id}.gltf`).catch(() => null);
    modelCache.set(id, p);
  }
  return p;
}

/** Place clones of a model (geometry/material shared) with shadows enabled. */
export async function scatterModel(parent: THREE.Object3D, id: string, placements: { pos: THREE.Vector3; rotY?: number; scale?: number }[]): Promise<void> {
  const gltf = await loadModel(id);
  if (!gltf) return;
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  for (const pl of placements) {
    const c = gltf.scene.clone(true);
    c.position.copy(pl.pos);
    c.rotation.y = pl.rotY ?? 0;
    c.scale.setScalar(pl.scale ?? 1);
    parent.add(c);
  }
}
