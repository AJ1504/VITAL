// Swing arcs: a soft additive ribbon that follows the paddle face through each stroke and fades out,
// so every swing reads clearly from the broadcast camera.
import * as THREE from 'three';

const N = 14;

export class SwingTrail {
  readonly mesh: THREE.Mesh;
  private pos = new Float32Array(N * 2 * 3);
  private col = new Float32Array(N * 2 * 3);
  private inner: THREE.Vector3[] = [];
  private outer: THREE.Vector3[] = [];
  private color: THREE.Color;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  constructor(color: number) {
    this.color = new THREE.Color(color);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** `paddle` is the paddle group (face along its local −y); `active` while a stroke is in motion. */
  update(paddle: THREE.Object3D, active: boolean): void {
    if (active) {
      paddle.localToWorld(this.a.set(0, -0.1, -0.02));
      paddle.localToWorld(this.b.set(0, -0.36, -0.02));
      this.inner.unshift(this.a.clone());
      this.outer.unshift(this.b.clone());
      if (this.inner.length > N) {
        this.inner.pop();
        this.outer.pop();
      }
    } else if (this.inner.length) {
      this.inner.pop();
      this.outer.pop();
    }
    const n = this.inner.length;
    this.mesh.visible = n > 1;
    if (n < 2) return;
    for (let i = 0; i < N; i++) {
      const k = Math.min(i, n - 1);
      const p = this.inner[k];
      const q = this.outer[k];
      this.pos.set([p.x, p.y, p.z, q.x, q.y, q.z], i * 6);
      const f = i < n ? Math.pow(1 - i / N, 1.6) * 0.55 : 0;
      this.col.set([this.color.r * f * 0.5, this.color.g * f * 0.5, this.color.b * f * 0.5, this.color.r * f, this.color.g * f, this.color.b * f], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
