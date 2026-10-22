// Particle bursts (dust, sparks), beams, and the final crack. Everything is a
// function of (t - t0) evaluated on the GPU, so effects are scrubbable too.
import * as THREE from 'three';
import { mulberry32, clamp, smoothstep } from './sim.js';

export const fxShared = { uScale: { value: 800 }, uLight: { value: 1 } };

const burstVS = /* glsl */`
attribute vec4 aRand;
attribute vec3 aDir;
attribute vec3 aOff;
uniform float uT, uLife, uSize, uSpeed, uDrag, uGravity, uRise, uGrow;
uniform vec3 uOrigin, uBox;
uniform float uScale;
varying float vA;
void main() {
  float life = uLife * (0.55 + 0.9 * aRand.x);
  float k = uDrag;
  float s = (1.0 - exp(-k * uT)) / k;
  vec3 p = uOrigin + aOff * uBox + aDir * (uSpeed * (0.35 + aRand.y)) * s;
  p.y += uRise * uT * (0.3 + aRand.z) - 0.5 * uGravity * uT * uT;
  p.y = max(p.y, 0.04);
  float u = clamp(uT / life, 0.0, 1.0);
  vA = (1.0 - u) * (1.0 - u) * smoothstep(0.0, 0.05, uT);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.5 + aRand.w) * (1.0 + uGrow * u) * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const burstFS = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity, uSharp, uLight, uLit;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, mix(0.0, 0.6, uSharp), d);
  gl_FragColor = vec4(uColor * mix(1.0, uLight, uLit), a * vA * uOpacity);
}`;

export const PRESETS = {
  dust: { count: 170, size: 1.5, speed: 5.5, drag: 1.5, gravity: 0, rise: 0.9, grow: 4, life: 3.6, color: 0x6b5d54, opacity: 0.3, additive: false, sharp: 0, upBias: 0.35 },
  puff: { count: 34, size: 0.6, speed: 2.4, drag: 2.2, gravity: 0, rise: 0.5, grow: 2.5, life: 1.5, color: 0x6b5d54, opacity: 0.26, additive: false, sharp: 0, upBias: 0.3 },
  sparks: { count: 46, size: 0.1, speed: 8, drag: 0.8, gravity: 16, rise: 0, grow: 0, life: 0.95, color: 0xffb060, opacity: 1, additive: true, sharp: 1, upBias: 0.5 },
  embers: { count: 90, size: 0.14, speed: 11, drag: 0.6, gravity: 12, rise: 0, grow: 0, life: 1.6, color: 0xff7a3a, opacity: 1, additive: true, sharp: 1, upBias: 0.6 },
};

export function createBurst(kind, { origin, t0, seed = 1, box = [0, 0, 0], dir = [0, 0.2, 0], spread = 1, scale = 1, color }) {
  const P = PRESETS[kind];
  const rnd = mulberry32(seed * 7919 + 13);
  const n = P.count;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const rand = new Float32Array(n * 4), dirs = new Float32Array(n * 3), off = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) rand[i * 4 + k] = rnd();
    let x = rnd() * 2 - 1, y = rnd() * 2 - 1 + P.upBias, z = rnd() * 2 - 1;
    const l = Math.hypot(x, y, z) || 1;
    dirs[i * 3] = (x / l) * spread + dir[0];
    dirs[i * 3 + 1] = (y / l) * spread + dir[1];
    dirs[i * 3 + 2] = (z / l) * spread + dir[2];
    off[i * 3] = rnd() * 2 - 1; off[i * 3 + 1] = rnd(); off[i * 3 + 2] = rnd() * 2 - 1;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  g.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
  g.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: burstVS, fragmentShader: burstFS, transparent: true, depthWrite: false,
    blending: P.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uT: { value: 0 }, uLife: { value: P.life }, uSize: { value: P.size * scale }, uSpeed: { value: P.speed * scale },
      uDrag: { value: P.drag }, uGravity: { value: P.gravity }, uRise: { value: P.rise }, uGrow: { value: P.grow },
      uOrigin: { value: new THREE.Vector3(...origin) }, uBox: { value: new THREE.Vector3(...box) },
      uColor: { value: new THREE.Color(color ?? P.color) }, uOpacity: { value: P.opacity }, uSharp: { value: P.sharp }, uLit: { value: P.additive ? 0 : 1 },
      uScale: fxShared.uScale, uLight: fxShared.uLight,
    },
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = P.additive ? 6 : 5;
  const maxT = P.life * 1.5;
  return {
    points, t0,
    update(t) {
      const d = t - t0;
      const vis = d >= 0 && d <= maxT;
      points.visible = vis;
      if (vis) mat.uniforms.uT.value = d;
    },
  };
}

// ---------------------------------------------------------------------------
// Beam: a glowing cylinder between two points
// ---------------------------------------------------------------------------
export function createBeam(color) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const core = new THREE.Mesh(geo, mat);
  const halo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const g = new THREE.Group();
  g.add(core, halo);
  g.visible = false;
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  g.userData.set = (a, b, t, power = 1) => {
    d.subVectors(b, a);
    const len = d.length();
    g.position.copy(a);
    g.quaternion.setFromUnitVectors(up, d.normalize());
    const flick = 0.85 + 0.15 * Math.sin(t * 90);
    core.scale.set(0.02 * power * flick, len, 0.02 * power * flick);
    halo.scale.set(0.07 * power, len, 0.07 * power);
    g.visible = true;
  };
  return g;
}

// ---------------------------------------------------------------------------
// The crack: a jagged glowing fissure on the far face of the monolith.
// ---------------------------------------------------------------------------
export function createCrack({ x, y0, z0, t0, t1, seed = 5 }) {
  const rnd = mulberry32(seed);
  const verts = [], norms = [], aT = [], aW = [], idx = [];
  const lines = [];
  // jagged random walk with side branches; param runs 0..1 along each branch
  function walk(sz, sy, ang, len, depth, tStart) {
    const pts = [[sz, sy, tStart, 1]];
    let z = sz, y = sy, a = ang;
    const steps = Math.floor(len / 0.3);
    for (let i = 1; i <= steps; i++) {
      a += (rnd() - 0.5) * 0.7;
      z += Math.cos(a) * 0.3; y += Math.sin(a) * 0.3;
      const tt = tStart + (i / steps) * (1 - tStart) * (depth ? 0.5 : 1);
      pts.push([z, y, tt, Math.max(0.12, 1 - (i / steps) * 0.88)]);
      if (depth < 2 && i > 3 && i < steps - 2 && rnd() < 0.11) {
        walk(z, y, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), len * (0.35 + rnd() * 0.25), depth + 1, tt);
      }
    }
    lines.push(pts);
  }
  walk(z0, y0, 0.15, 6.2, 0, 0);
  walk(z0, y0, Math.PI + 0.25, 4.6, 0, 0);
  for (const pts of lines) {
    const base = verts.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
      let tx = q[0] - r[0], ty = q[1] - r[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      for (const sd of [-1, 1]) {
        verts.push(x, p[1], p[0]);
        norms.push(tx * sd * p[3], ty * sd * p[3]); // (z, y) offset direction scaled by taper... rotated below
        aT.push(p[2]); aW.push(sd);
      }
      if (i < pts.length - 1) idx.push(base + i * 2, base + i * 2 + 1, base + i * 2 + 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2);
    }
  }
  // normals: perpendicular to the tangent (stored above as tangent*side*taper)
  for (let i = 0; i < norms.length; i += 2) { const a = norms[i], b = norms[i + 1]; norms[i] = -b; norms[i + 1] = a; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('aN', new THREE.Float32BufferAttribute(norms, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(aW, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uGrow: { value: 0 }, uWidth: { value: 0.03 }, uGlow: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec2 aN; attribute float aT; attribute float aW;
      uniform float uWidth;
      varying float vT; varying float vW;
      void main() {
        vT = aT; vW = aW;
        vec3 p = position;
        p.z += aN.x * uWidth;
        p.y += aN.y * uWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uGrow; uniform float uGlow;
      varying float vT; varying float vW;
      void main() {
        if (vT > uGrow) discard;
        float edge = 1.0 - abs(vW) * 0.0;
        float head = smoothstep(0.0, 0.06, uGrow - vT);
        vec3 col = mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.8, 0.45), 0.35 + 0.55 * uGlow);
        gl_FragColor = vec4(col * (0.9 + 1.8 * uGlow) * head, head);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.visible = false;
  return {
    mesh,
    update(t) {
      const u = clamp((t - t0) / (t1 - t0), 0, 1);
      mesh.visible = t >= t0;
      mat.uniforms.uGrow.value = smoothstep(0, 1, u) * 1.02;
      mat.uniforms.uGlow.value = smoothstep(0.1, 1, u);
      mat.uniforms.uWidth.value = 0.010 + 0.07 * smoothstep(0.05, 1, u);
    },
  };
}
