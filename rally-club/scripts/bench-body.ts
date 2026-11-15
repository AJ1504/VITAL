// Times the member-body sculpt (SDF + surface nets + skinning) per outfit cut: node scripts/bench-body.ts
import * as THREE from 'three';
import { createBody } from '../web/src/scene/body.ts';
const G = () => new THREE.Group();
const j = { hips: G(), spine: G(), head: G(), shR: G(), elR: G(), hand: G(), shL: G(), elL: G(), handL: G(), thR: G(), knR: G(), thL: G(), knL: G() };
const root = G();
root.add(j.hips); j.hips.position.y = 0.8; j.hips.add(j.spine); j.spine.add(j.head); j.head.position.y = 0.63;
for (const [sh, el, hd, s] of [[j.shR, j.elR, j.hand, 1], [j.shL, j.elL, j.handL, -1]] as const) { sh.position.set(s * 0.2, 0.5, 0); j.spine.add(sh); el.position.y = -0.21; sh.add(el); hd.position.y = -0.22; el.add(hd); }
for (const [th, kn, s] of [[j.thR, j.knR, 1], [j.thL, j.knL, -1]] as const) { th.position.set(s * 0.085, 0, 0); j.hips.add(th); kn.position.y = -0.34; th.add(kn); }
for (const top of ['polo', 'tank', 'cardigan'] as const) {
  const t0 = performance.now();
  const m = createBody({ skin: 0xe3b48f, shirt: 0x8fab83, lower: 0xf1e6d2, trim: 0xffffff, shoes: 0xfbf8f2, top, bottom: 'shorts', build: 0.5 }, root, j);
  console.log(top, (performance.now() - t0).toFixed(0), 'ms', m.geometry.attributes.position.count, 'verts', m.geometry.index!.count / 3, 'tris');
}
