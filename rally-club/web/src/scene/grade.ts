// Final colour grade (runs after tone mapping, in display space): vibrance that lifts muted pastels more
// than already-saturated colours, a gentle S-curve for contrast, a touch of warmth in the highlights and
// a soft vignette. Tuned for the bright, clean resort look rather than a cinematic grade.
import type * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export interface GradeSettings {
  vibrance: number;
  contrast: number;
  warmth: number;
  vignette: number;
  lift: number;
}

export const GRADE_DEFAULT: GradeSettings = { vibrance: 0.32, contrast: 0.07, warmth: 0.03, vignette: 0.16, lift: 0.015 };

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vibrance: { value: GRADE_DEFAULT.vibrance },
    contrast: { value: GRADE_DEFAULT.contrast },
    warmth: { value: GRADE_DEFAULT.warmth },
    vignette: { value: GRADE_DEFAULT.vignette },
    lift: { value: GRADE_DEFAULT.lift },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float vibrance; uniform float contrast; uniform float warmth;
    uniform float vignette; uniform float lift;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float mx = max(col.r, max(col.g, col.b));
      float mn = min(col.r, min(col.g, col.b));
      float sat = mx - mn;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // Vibrance: boost low-saturation colours most; never push skin or already-bright colours far.
      col = mix(vec3(luma), col, 1.0 + vibrance * (1.0 - sat));
      // Soft S-curve around mid grey.
      col = mix(col, col * col * (3.0 - 2.0 * col), contrast);
      // Warm highlights, keep shadows neutral.
      col += vec3(warmth, warmth * 0.35, -warmth * 0.6) * smoothstep(0.45, 1.0, luma);
      col = col * (1.0 - lift) + lift;
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export function createGradePass(): ShaderPass {
  return new ShaderPass(GradeShader);
}
