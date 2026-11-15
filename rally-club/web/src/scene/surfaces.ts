// Stylised, tileable surface textures (painted-game look): mown grass, beach sand, stone paving,
// court acrylic grain, planks and canvas. Generated once on canvas in neutral light tones so the
// material colour tints them; UVs are in metres where the geometry allows (ShapeGeometry), so
// `metres` sets the size of one tile.
import * as THREE from 'three';

let seed = 1234;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, metres: number, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(1 / metres, 1 / metres);
  t.generateMipmaps = true;
  return t;
}

/** Soft value noise blotches (tileable by wrapping draws across the edges). */
function blotches(g: CanvasRenderingContext2D, s: number, n: number, rMin: number, rMax: number, rgba: () => string): void {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = rMin + rnd() * (rMax - rMin);
    const col = rgba();
    for (const ox of [-s, 0, s])
      for (const oy of [-s, 0, s]) {
        const cx = x + ox;
        const cy = y + oy;
        if (cx + r < 0 || cx - r > s || cy + r < 0 || cy - r > s) continue;
        const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grd.addColorStop(0, col);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
  }
}

const cache = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Mown lawn: two-tone stripes, soft patches and blade flecks. One tile = `metres` (two stripes). */
export function grassTex(metres = 6): THREE.CanvasTexture {
  return cached(`grass${metres}`, () =>
    canvasTexture(
      512,
      (g, s) => {
        g.fillStyle = '#e9f0dc';
        g.fillRect(0, 0, s, s);
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillRect(0, 0, s / 2, s);
        blotches(g, s, 26, 30, 90, () => (rnd() < 0.5 ? 'rgba(170,190,120,0.18)' : 'rgba(255,255,230,0.22)'));
        for (let i = 0; i < 5200; i++) {
          const x = rnd() * s;
          const y = rnd() * s;
          const l = 3 + rnd() * 5;
          g.strokeStyle = rnd() < 0.55 ? `rgba(120,150,80,${0.08 + rnd() * 0.12})` : `rgba(255,255,235,${0.12 + rnd() * 0.18})`;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (rnd() - 0.5) * 2, y - l);
          g.stroke();
        }
      },
      metres,
    ),
  );
}

/** Beach sand: warm speckle and gentle ripples. */
export function sandTex(metres = 4): THREE.CanvasTexture {
  return cached(`sand${metres}`, () =>
    canvasTexture(
      512,
      (g, s) => {
        g.fillStyle = '#f7efe0';
        g.fillRect(0, 0, s, s);
        blotches(g, s, 22, 40, 110, () => (rnd() < 0.5 ? 'rgba(225,200,160,0.25)' : 'rgba(255,252,240,0.3)'));
        for (let k = 0; k < 9; k++) {
          g.strokeStyle = 'rgba(210,185,140,0.18)';
          g.lineWidth = 3;
          g.beginPath();
          const y0 = (k / 9) * s;
          for (let x = 0; x <= s; x += 8) g.lineTo(x, y0 + Math.sin((x / s) * Math.PI * 4 + k) * 6);
          g.stroke();
        }
        for (let i = 0; i < 9000; i++) {
          g.fillStyle = rnd() < 0.5 ? `rgba(190,160,110,${0.15 + rnd() * 0.25})` : `rgba(255,255,255,${0.3 + rnd() * 0.4})`;
          g.fillRect(rnd() * s, rnd() * s, 1.3, 1.3);
        }
      },
      metres,
    ),
  );
}

/** Stone paving: 2 × 2 slabs per tile, varied tint, soft grout, worn edges. */
export function pavingTex(metres = 1.6): THREE.CanvasTexture {
  return cached(`paving${metres}`, () =>
    canvasTexture(
      512,
      (g, s) => {
        g.fillStyle = '#d9d2c6';
        g.fillRect(0, 0, s, s);
        const n = 2;
        const cs = s / n;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            const v = 244 + Math.floor(rnd() * 11);
            g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
            const x = i * cs + (j % 2 ? cs / 2 : 0);
            for (const ox of [0, -s]) g.fillRect(x + ox + 4, j * cs + 4, cs - 8, cs - 8);
          }
        blotches(g, s, 30, 10, 50, () => (rnd() < 0.5 ? 'rgba(200,190,170,0.18)' : 'rgba(255,255,255,0.25)'));
        for (let i = 0; i < 2500; i++) {
          g.fillStyle = `rgba(160,150,130,${rnd() * 0.12})`;
          g.fillRect(rnd() * s, rnd() * s, 2, 2);
        }
      },
      metres,
    ),
  );
}

/** Fine acrylic grain for court surfaces (very subtle). */
export function grainTex(metres = 2): THREE.CanvasTexture {
  return cached(`grain${metres}`, () =>
    canvasTexture(
      256,
      (g, s) => {
        g.fillStyle = '#f4f4f4';
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < 12000; i++) {
          const v = 236 + Math.floor(rnd() * 19);
          g.fillStyle = `rgba(${v},${v},${v},0.5)`;
          g.fillRect(rnd() * s, rnd() * s, 1, 1);
        }
      },
      metres,
    ),
  );
}

/** Light plaster / smooth stone for stands and walls. */
export function plasterTex(metres = 3): THREE.CanvasTexture {
  return cached(`plaster${metres}`, () =>
    canvasTexture(
      256,
      (g, s) => {
        g.fillStyle = '#f3f1ec';
        g.fillRect(0, 0, s, s);
        blotches(g, s, 30, 10, 45, () => (rnd() < 0.5 ? 'rgba(225,218,205,0.35)' : 'rgba(255,255,255,0.5)'));
        for (let i = 0; i < 3000; i++) {
          g.fillStyle = `rgba(190,180,165,${rnd() * 0.12})`;
          g.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
        }
      },
      metres,
    ),
  );
}

/** Warm timber planks. */
export function woodTex(metres = 1.2): THREE.CanvasTexture {
  return cached(`wood${metres}`, () =>
    canvasTexture(
      256,
      (g, s) => {
        g.fillStyle = '#efe3d2';
        g.fillRect(0, 0, s, s);
        const planks = 4;
        for (let p = 0; p < planks; p++) {
          const y = (p / planks) * s;
          const v = 236 + Math.floor(rnd() * 16);
          g.fillStyle = `rgb(${v},${v - 12},${v - 26})`;
          g.fillRect(0, y + 2, s, s / planks - 4);
          for (let k = 0; k < 14; k++) {
            g.strokeStyle = `rgba(150,110,70,${0.06 + rnd() * 0.1})`;
            g.lineWidth = 1;
            g.beginPath();
            const yy = y + 4 + rnd() * (s / planks - 8);
            for (let x = 0; x <= s; x += 16) g.lineTo(x, yy + Math.sin(x * 0.05 + k) * 1.5);
            g.stroke();
          }
        }
      },
      metres,
    ),
  );
}

/** Material helpers: textured standard material tinted by colour. */
export function texturedMat(color: number, map: THREE.Texture, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, map, roughness: 0.9, ...opts });
}

/**
 * Box geometry whose UVs are world-scaled (metres) per face, so tiling textures keep their size on
 * long steps and walls.
 */
export function worldBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const [su, sv] = nx > 0.5 ? [d, h] : ny > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return g;
}

/** Adds a soft fresnel rim light (the bright edge of stylised characters) to a standard material. */
export function addRim(m: THREE.MeshStandardMaterial, color = 0xfff4e6, strength = 0.35, power = 2.6): THREE.MeshStandardMaterial {
  const rim = new THREE.Color(color).multiplyScalar(strength);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: rim };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += rimColor * pow(rimF, ${power.toFixed(2)});`,
      );
  };
  m.customProgramCacheKey = () => `rim-${power}`;
  return m;
}
