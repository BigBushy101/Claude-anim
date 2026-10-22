// Walls are grids of instanced blocks with a painted decal projected across the
// whole face. Breaking is analytic ballistic motion seeded per block, so a wall's
// state is a pure function of time (scrubbable, deterministic).
import * as THREE from 'three';
import { clamp, lerp, smoothstep, mulberry32, hashStr } from './sim.js';
import { MONO, SANS, SERIF } from './text.js';

const G = 17;
const BASE = {
  brick: { color: 0x9a5240, rough: 0.95, metal: 0.0, gap: 0.965, bond: true },
  concrete: { color: 0x8e8f91, rough: 0.92, metal: 0.0, gap: 0.975 },
  racks: { color: 0x2a2e36, rough: 0.55, metal: 0.5, gap: 0.985 },
  stone: { color: 0x8a8272, rough: 0.9, metal: 0.0, gap: 0.97 },
  steel: { color: 0x707986, rough: 0.38, metal: 0.85, gap: 0.985 },
  monolith: { color: 0x0e1016, rough: 0.4, metal: 0.55, gap: 1.0 },
};

// ---------------------------------------------------------------------------
// Decals
// ---------------------------------------------------------------------------
function canvasFor(w, ppu) {
  const c = document.createElement('canvas');
  c.width = Math.round(w.width * ppu);
  c.height = Math.round(w.height * ppu);
  return c;
}

function stencil(ctx, text, cx, cy, size, fill, glow, font = SANS, weight = 900) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.18; }
  ctx.fillStyle = fill;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

function fitSize(ctx, text, maxW, size, font, weight = 900) {
  ctx.font = `${weight} ${size}px ${font}`;
  const m = ctx.measureText(text).width;
  return m > maxW ? size * (maxW / m) : size;
}

function makeDecals(w, rnd) {
  const ppu = { brick: 48, concrete: 44, racks: 44, stone: 44, steel: 40, monolith: 22 }[w.type];
  const paint = canvasFor(w, ppu), emit = canvasFor(w, ppu);
  const p = paint.getContext('2d'), e = emit.getContext('2d');
  const W = paint.width, H = paint.height;
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);

  if (w.type === 'brick') {
    const s = fitSize(p, w.label, W * 0.8, H * 0.3, SANS);
    stencil(p, w.label, W / 2, H * 0.46, s, 'rgba(244,238,228,0.93)', 'rgba(255,255,255,0.4)');
    p.strokeStyle = 'rgba(244,238,228,0.8)'; p.lineWidth = 5;
    for (let i = 0; i < 16; i++) { // paint drips
      const x = W * 0.1 + rnd() * W * 0.8, y = H * 0.55;
      p.beginPath(); p.moveTo(x, y); p.lineTo(x, y + 10 + rnd() * H * 0.18); p.stroke();
    }
  }

  if (w.type === 'concrete') {
    p.fillStyle = 'rgba(40,42,48,0.35)'; p.fillRect(W * 0.12, H * 0.14, W * 0.76, H * 0.72);
    p.strokeStyle = 'rgba(250,246,236,0.92)'; p.lineWidth = 10; p.lineCap = 'round';
    const ox = W * 0.18, oy = H * 0.8, gw = W * 0.64, gh = H * 0.56;
    p.beginPath(); p.moveTo(ox, oy - gh - 20); p.lineTo(ox, oy); p.lineTo(ox + gw + 20, oy); p.stroke();
    p.strokeStyle = 'rgba(255,214,90,0.95)'; p.lineWidth = 14;
    p.beginPath();
    for (let i = 0; i <= 80; i++) { // steep rise that bends over into a plateau
      const u = i / 80, y = 1 - Math.exp(-4.2 * u);
      const x = ox + u * gw, yy = oy - y * gh;
      i ? p.lineTo(x, yy) : p.moveTo(x, yy);
    }
    p.stroke();
    p.setLineDash([16, 18]); p.strokeStyle = 'rgba(250,246,236,0.7)'; p.lineWidth = 6;
    p.beginPath(); p.moveTo(ox, oy - gh * 0.98); p.lineTo(ox + gw, oy - gh * 0.98); p.stroke(); p.setLineDash([]);
    const s = fitSize(p, w.label, W * 0.74, H * 0.17, SANS);
    stencil(p, w.label, W / 2, H * 0.1, s, 'rgba(255,214,90,0.95)', null);
    stencil(p, 'COMPUTE →', ox + gw * 0.5, oy + H * 0.07, H * 0.05, 'rgba(250,246,236,0.85)', null, MONO, 600);
  }

  if (w.type === 'racks') {
    const cw = (w.block[0] / w.width) * W, ch = (w.block[1] / w.height) * H;
    p.fillStyle = '#12151a'; p.fillRect(0, 0, W, H);
    for (let cy = 0; cy < H; cy += ch) for (let cx = 0; cx < W; cx += cw) {
      p.fillStyle = '#1d2128'; p.fillRect(cx + 3, cy + 3, cw - 6, ch - 6);
      for (let k = 0; k < 9; k++) {
        const y = cy + 8 + k * ((ch - 16) / 9);
        p.fillStyle = '#0d0f13'; p.fillRect(cx + 6, y, cw - 12, (ch - 16) / 9 - 4);
        for (let l = 0; l < 3; l++) {
          if (rnd() < 0.75) {
            const hue = rnd();
            e.fillStyle = hue < 0.7 ? '#37ff8a' : hue < 0.9 ? '#ffb43a' : '#ff4a3a';
            e.fillRect(cx + 10 + l * 11, y + 6, 6, 6);
          }
        }
      }
    }
    // the data is gone: a band of dead racks with a red message
    p.fillStyle = 'rgba(0,0,0,0.55)'; p.fillRect(0, H * 0.3, W, H * 0.34);
    e.fillStyle = '#000'; e.fillRect(0, H * 0.3, W, H * 0.34);
    const s = fitSize(e, w.label, W * 0.8, H * 0.26, SANS);
    stencil(e, w.label, W / 2, H * 0.47, s, '#ff3b2e', '#ff3b2e');
    stencil(p, w.label, W / 2, H * 0.47, s, 'rgba(60,10,8,1)', null);
    stencil(e, 'DISK 100% · NO NEW TOKENS', W / 2, H * 0.6, H * 0.045, '#ff8a6a', null, MONO, 600);
  }

  if (w.type === 'stone') {
    const glyphs = '∑∫∂∇≈≠≤≥∞√πθλΩ∀∃⊕∈∴';
    p.fillStyle = 'rgba(30,26,20,0.55)'; e.fillStyle = 'rgba(60,200,230,0.28)';
    const fs = H * 0.075;
    p.font = e.font = `600 ${fs}px ${SERIF}`; p.textAlign = e.textAlign = 'center'; p.textBaseline = e.textBaseline = 'middle';
    for (let r = 0; r < 12; r++) for (let c = 0; c < 28; c++) {
      if (rnd() < 0.45) continue;
      const g = glyphs[Math.floor(rnd() * glyphs.length)];
      p.fillText(g, (c + 0.5) * (W / 28), (r + 0.5) * (H / 12));
      e.fillText(g, (c + 0.5) * (W / 28), (r + 0.5) * (H / 12));
    }
    const s = fitSize(p, w.label, W * 0.8, H * 0.24, SERIF);
    p.fillStyle = 'rgba(20,16,12,0.9)'; p.fillRect(W * 0.08, H * 0.32, W * 0.84, H * 0.3);
    e.fillStyle = '#000'; e.fillRect(W * 0.08, H * 0.32, W * 0.84, H * 0.3);
    stencil(p, w.label, W / 2, H * 0.47, s, 'rgba(10,8,6,1)', null, SERIF, 800);
    stencil(e, w.label, W / 2, H * 0.47, s, '#ffb347', '#ff9a2e', SERIF, 800);
  }

  if (w.type === 'steel') {
    const cw = (w.block[0] / w.width) * W, ch = (w.block[1] / w.height) * H;
    p.fillStyle = 'rgba(0,0,0,0.0)';
    for (let cy = 0; cy < H; cy += ch) for (let cx = 0; cx < W; cx += cw) {
      p.fillStyle = 'rgba(20,24,30,0.65)';
      for (const [dx, dy] of [[10, 10], [cw - 10, 10], [10, ch - 10], [cw - 10, ch - 10]]) {
        p.beginPath(); p.arc(cx + dx, cy + dy, 5, 0, 7); p.fill();
      }
    }
    p.fillStyle = 'rgba(14,16,20,0.92)'; p.fillRect(0, H * 0.36, W, H * 0.3);
    p.save(); p.beginPath(); p.rect(0, H * 0.7, W, H * 0.12); p.clip();
    p.fillStyle = 'rgba(240,200,40,0.9)';
    for (let x = -H; x < W + H; x += 70) { p.beginPath(); p.moveTo(x, H * 0.82); p.lineTo(x + 36, H * 0.82); p.lineTo(x + 36 + H * 0.12, H * 0.7); p.lineTo(x + H * 0.12, H * 0.7); p.fill(); }
    p.restore();
    const s = fitSize(p, w.label, W * 0.84, H * 0.2, SANS);
    stencil(p, w.label, W / 2, H * 0.51, s, 'rgba(240,200,40,0.96)', null);
  }

  if (w.type === 'monolith') {
    // seams along the block grid, circuit-like traces, and a faint "RSI"
    const cw = (w.block[0] / w.width) * W, ch = (w.block[1] / w.height) * H;
    e.strokeStyle = 'rgba(255,92,40,0.55)'; e.lineWidth = 2;
    for (let x = 0; x <= W; x += cw) { e.beginPath(); e.moveTo(x, 0); e.lineTo(x, H); e.stroke(); }
    for (let y = 0; y <= H; y += ch) { e.beginPath(); e.moveTo(0, y); e.lineTo(W, y); e.stroke(); }
    e.strokeStyle = 'rgba(255,120,60,0.5)'; e.lineWidth = 3;
    for (let i = 0; i < 70; i++) {
      let x = rnd() * W, y = rnd() * H;
      e.beginPath(); e.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        if (rnd() < 0.5) x += (rnd() < 0.5 ? -1 : 1) * (20 + rnd() * 90); else y += (rnd() < 0.5 ? -1 : 1) * (20 + rnd() * 90);
        e.lineTo(x, y);
      }
      e.stroke();
    }
    e.strokeStyle = 'rgba(255,120,70,0.65)'; e.lineWidth = 6;
    e.beginPath(); e.arc(W / 2, H * 0.44, H * 0.2, 0, 7); e.stroke();
    e.lineWidth = 3; e.beginPath(); e.arc(W / 2, H * 0.44, H * 0.26, 0, 7); e.stroke();
    stencil(e, 'RSI', W / 2, H * 0.44, H * 0.2, 'rgba(255,110,60,0.5)', '#ff6a2e', MONO, 800);
    stencil(e, 'RECURSIVE SELF-IMPROVEMENT', W / 2, H * 0.44 + H * 0.2, H * 0.028, 'rgba(255,150,100,0.5)', null, MONO, 600);
  }

  // far face of the monolith: seams and circuits only, no logo
  let emitBack = null;
  if (w.type === 'monolith') {
    const eb = canvasFor(w, ppu);
    const x = eb.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    const cw = (w.block[0] / w.width) * W, ch = (w.block[1] / w.height) * H;
    x.strokeStyle = 'rgba(255,92,40,0.55)'; x.lineWidth = 2;
    for (let xx = 0; xx <= W; xx += cw) { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, H); x.stroke(); }
    for (let yy = 0; yy <= H; yy += ch) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
    x.strokeStyle = 'rgba(255,120,60,0.4)'; x.lineWidth = 3;
    const r2 = mulberry32(777);
    for (let i = 0; i < 70; i++) {
      let px = r2() * W, py = r2() * H;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 6; k++) {
        if (r2() < 0.5) px += (r2() < 0.5 ? -1 : 1) * (20 + r2() * 90); else py += (r2() < 0.5 ? -1 : 1) * (20 + r2() * 90);
        x.lineTo(px, py);
      }
      x.stroke();
    }
    emitBack = eb;
  }

  const mk = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { paint: mk(paint), emit: mk(emit), emitB: mk(emitBack || emit) };
}

// ---------------------------------------------------------------------------
// Wall
// ---------------------------------------------------------------------------
export function createWall(spec, hits) {
  const rnd = mulberry32(hashStr(spec.id));
  const cfg = BASE[spec.type];
  const { width: Wd, height: Ht, depth: Dp } = spec;

  // lay out blocks (local frame: x lateral, y up, z depth; +z faces the bots)
  const blocks = [];
  const [bw0, bh0] = spec.block;
  const cols = Math.max(1, Math.round(Wd / bw0)), rows = Math.max(1, Math.round(Ht / bh0));
  const bw = Wd / cols, bh = Ht / rows;
  for (let r = 0; r < rows; r++) {
    const off = cfg.bond && r % 2 ? bw / 2 : 0;
    for (let c = 0; c <= cols; c++) {
      let x0 = -Wd / 2 + c * bw - off, x1 = x0 + bw;
      x0 = Math.max(x0, -Wd / 2); x1 = Math.min(x1, Wd / 2);
      if (x1 - x0 < 0.05) continue;
      if (!cfg.bond && c === cols) continue;
      blocks.push({ x: (x0 + x1) / 2, y: (r + 0.5) * bh, w: x1 - x0, h: bh });
    }
  }
  const N = blocks.length;

  const mat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: cfg.rough, metalness: cfg.metal });
  const { paint, emit, emitB } = makeDecals(spec, rnd);
  const shaderRef = { uEmitK: { value: 1 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDecal = { value: paint };
    sh.uniforms.uEmit = { value: emit };
    sh.uniforms.uEmitB = { value: emitB };
    sh.uniforms.uEmitK = shaderRef.uEmitK;
    sh.uniforms.uBackK = { value: spec.type === 'monolith' ? 0.55 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRect;\nuniform float uBackK;\nvarying vec2 vDecalUV;\nvarying float vFront;\nvarying float vBack;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec2 fr = position.xy + 0.5;\nvec2 bk = vec2(mix(1.0 - aRect.x, 1.0 - aRect.z, fr.x), mix(aRect.y, aRect.w, fr.y));\nvDecalUV = normal.z > 0.5 ? mix(aRect.xy, aRect.zw, fr) : bk;\nvBack = step(normal.z, -0.5);\nvFront = step(0.5, normal.z) + vBack * uBackK;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDecal;\nuniform sampler2D uEmit;\nuniform sampler2D uEmitB;\nuniform float uEmitK;\nvarying vec2 vDecalUV;\nvarying float vFront;\nvarying float vBack;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 dcl = texture2D(uDecal, vDecalUV);\ndiffuseColor.rgb = mix(diffuseColor.rgb, dcl.rgb, dcl.a * vFront);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += (vBack > 0.5 ? texture2D(uEmitB, vDecalUV).rgb : texture2D(uEmit, vDecalUV).rgb) * uEmitK * vFront;');
  };

  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, N);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const rect = new Float32Array(N * 4);
  const col = new THREE.Color();
  blocks.forEach((b, i) => {
    rect[i * 4] = (b.x - b.w / 2 + Wd / 2) / Wd;
    rect[i * 4 + 1] = (b.y - b.h / 2) / Ht;
    rect[i * 4 + 2] = (b.x + b.w / 2 + Wd / 2) / Wd;
    rect[i * 4 + 3] = (b.y + b.h / 2) / Ht;
    const v = spec.type === 'monolith' ? 1 : 0.84 + rnd() * 0.3;
    col.setRGB(v, v, v * (0.98 + rnd() * 0.04));
    mesh.setColorAt(i, col);
  });
  mesh.geometry.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4));

  // fracture plan
  const hole = spec.hole;
  const T0 = spec.tBreak;
  for (const b of blocks) {
    b.d = Dp;
    b.s = cfg.gap;
    b.rel = false;
    if (!hole || T0 == null) continue;
    const e = (b.x / hole.rx) ** 2 + (b.y / hole.ry) ** 2;
    if (e > 1 + (rnd() - 0.5) * 0.35) continue;
    b.rel = true;
    const dist = Math.sqrt(e);
    b.delay = spec.sweep ? ((b.x + hole.rx) / (2 * hole.rx)) * spec.sweep + rnd() * 0.15 : dist * 0.32 + rnd() * 0.12;
    const speed = lerp(9.5, 3.8, clamp(dist, 0, 1.1) / 1.1) * (0.7 + rnd() * 0.6) * (spec.sweep ? 0.6 : 1);
    b.vx = (b.x / hole.rx) * 2.4 + (rnd() - 0.5) * 1.6;
    b.vy = 1.6 + rnd() * 4.2 + (1 - Math.min(1, dist)) * 2.4;
    b.vz = -speed;
    b.wt = (rnd() - 0.5) * 9;           // tumble rate
    b.ax = rnd() * 6.28;                // tumble axis angle
    b.yaw = (rnd() - 0.5) * 2.4;
    b.wy = (rnd() - 0.5) * 7;
    b.lane = Math.abs(b.x) < 6.5;
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(0, 0, 0, 'YXZ');
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const home = new THREE.Vector3();

  function write(i, b, px, py, pz, rx, ry, rz, s) {
    eu.set(rx, ry, rz);
    q.setFromEuler(eu);
    pos.set(px, py, pz);
    scl.set(b.w * b.s * s, b.h * b.s * s, b.d * s);
    m4.compose(pos, q, scl);
    mesh.setMatrixAt(i, m4);
  }

  function writeHome(i, b, dz = 0) { write(i, b, b.x, b.y, dz, 0, 0, 0, 1); }

  function writeFlying(i, b, dt) {
    const kx = 1.1;
    const sx = (1 - Math.exp(-kx * dt)) / kx;
    const hy = b.y, rest = b.h * 0.5 * b.s;
    const tl = (b.vy + Math.sqrt(b.vy * b.vy + 2 * G * Math.max(0, hy - rest))) / G;
    let y;
    if (dt < tl) y = hy + b.vy * dt - 0.5 * G * dt * dt;
    else {
      const vb = (G * tl - b.vy) * 0.28, d2 = dt - tl, tb = (2 * vb) / G;
      y = rest + (d2 < tb ? vb * d2 - 0.5 * G * d2 * d2 : 0);
    }
    const flight = 1 - smoothstep(tl * 0.55, tl, dt);
    const tumble = b.wt * Math.min(dt, tl) * flight;
    const yaw = b.yaw + (b.wy * (1 - Math.exp(-2 * dt))) / 2;
    const shrink = b.lane ? 1 - smoothstep(7, 13, dt) : 1;
    if (shrink <= 0.001) { write(i, b, 0, -50, 0, 0, 0, 0, 0.0001); return; }
    write(i, b, b.x + b.vx * sx, y, b.vz * sx, Math.cos(b.ax) * tumble, yaw, Math.sin(b.ax) * tumble, shrink);
  }

  let mode = '';
  let lastDentT = -1;
  const hitList = hits || [];
  const dentStart = hitList.length ? Math.min(...hitList.map((h) => h.ti)) - 0.1 : Infinity;

  function update(t) {
    if (!spec.tBreak) { // monolith: only seam flare
      let flare = 0;
      for (const h of hitList) { const d = t - h.ti; if (d >= 0 && d < 1.4) flare = Math.max(flare, Math.exp(-d * 4.5)); }
      shaderRef.uEmitK.value = 0.85 + 0.35 * Math.sin(t * 1.3) + flare * 1.6 + smoothstep(140, 150, t) * 0.4;
      if (!mode) { for (let i = 0; i < N; i++) writeHome(i, blocks[i]); mesh.instanceMatrix.needsUpdate = true; mode = 'home'; }
      return;
    }
    if (spec.type === 'racks') shaderRef.uEmitK.value = 0.9 + 0.12 * Math.sin(t * 9) * (t < spec.tBreak ? 1 : 0.2);
    const tEnd = spec.tBreak + (spec.sweep || 0) + 15;
    if (t < dentStart && t < spec.tBreak - 0.01) {
      if (mode !== 'home') { for (let i = 0; i < N; i++) writeHome(i, blocks[i]); mesh.instanceMatrix.needsUpdate = true; mode = 'home'; }
      return;
    }
    if (t > tEnd && mode === 'final') return;
    mode = t > tEnd ? 'final' : 'anim';
    for (let i = 0; i < N; i++) {
      const b = blocks[i];
      const dt = t - (spec.tBreak + (b.rel ? b.delay : 0));
      if (b.rel && dt > 0) { writeFlying(i, b, dt); continue; }
      // pre-break dents from failed strikes
      let dz = 0;
      for (const h of hitList) {
        const d = t - h.ti;
        if (d < 0 || d > 1.6 || h.ti >= spec.tBreak - 0.05) continue;
        const r2 = (b.x - h.z) ** 2 + (b.y - h.y) ** 2;
        dz -= h.power * 0.22 * Math.exp(-d * 5) * Math.exp(-r2 / 7);
      }
      writeHome(i, b, dz);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  const group = new THREE.Group();
  group.add(mesh);
  group.position.set(spec.x, 0, 0);
  group.rotation.y = -Math.PI / 2;

  return { spec, group, mesh, update, blocks };
}
