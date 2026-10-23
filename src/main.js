import * as THREE from 'three';
import { SPEED, BOTS, WALLS, RSI, END_T, DURATION, T_ASSAULT, T_CRACK0, T_CRACK1, T_FARSIDE, FAR_THUMPS } from './timeline.js';
import { markerX, botState, yearAt, wallFaceX, smoothstep, clamp, lerp, botById } from './sim.js';
import { placedCards } from './cards.js';
import { buildRobot, poseRobot } from './robot.js';
import { createWall } from './wall.js';
import { createWorld } from './world.js';
import { createBurst, createBeam, createCrack, fxShared } from './fx.js';
import { makeCard, makeNameplate } from './text.js';
import { cameraAt } from './camera.js';
import { createPost } from './post.js';
import { createAudio, renderWav, buildScore } from './audio.js';

const params = new URLSearchParams(location.search);
const SEEK = params.has('t') ? parseFloat(params.get('t')) : null;
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
// quality tiers: 0 full, 1 no shadows, 2 + no bloom at 1x, 3 + reduced resolution
let tier = params.get('q') === 'low' ? 2 : params.get('q') === 'high' ? 0 : IS_MOBILE ? 1 : 0;
const LOWQ = tier >= 2;
if (params.get('ar')) {
  const [a, b] = params.get('ar').split(':').map(Number);
  if (a && b) document.documentElement.style.setProperty('--ar', String(a / b));
}

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: tier < 2, powerPreference: 'high-performance', preserveDrawingBuffer: SEEK !== null });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.insertBefore(renderer.domElement, stage.firstChild);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 2.39, 0.1, 2200);
const world = createWorld(scene, renderer);
const post = createPost(renderer, scene, camera);

// ---- bots ------------------------------------------------------------------------
const robots = BOTS.map((bot) => {
  const r = buildRobot(bot);
  scene.add(r.root);
  r.plate = makeNameplate(bot.name, bot.color);
  r.nameAnchor.add(r.plate);
  return r;
});

// ---- walls ----------------------------------------------------------------------------
const HIT = { punch: [1.45, 0.9], slam: [0.9, 1.3], charge: [1.3, 2.0] };
const walls = WALLS.map((spec) => {
  const hits = spec.strikes.filter((s) => s.kind !== 'beam').map((s) => {
    const [y, power] = HIT[s.kind];
    return { ti: s.ti, y, power, z: botState(botById[s.bot], s.ti).z, kind: s.kind, success: !s.fail };
  });
  const w = createWall(spec, hits);
  w.hits = hits;
  scene.add(w.group);
  return w;
});

// ---- bursts ----------------------------------------------------------------------------
const bursts = [];
const addBurst = (kind, opts) => { const b = createBurst(kind, opts); scene.add(b.points); bursts.push(b); return b; };
let seed = 1;
for (const w of walls) {
  const sp = w.spec, face = wallFaceX(sp);
  if (sp.tBreak) {
    const rx = sp.hole.rx, ry = sp.hole.ry;
    addBurst('dust', { origin: [face + 0.4, 0.2, 0], t0: sp.tBreak + 0.05, seed: seed++, box: [0.8, ry * 0.9, rx * 0.9], dir: [0.9, 0, 0], spread: 1.1, scale: 1 + ry / 14 });
    addBurst('dust', { origin: [face + 2.5, 0.2, 0], t0: sp.tBreak + 0.45, seed: seed++, box: [1.5, ry * 0.5, rx * 0.8], dir: [0.5, 0, 0], spread: 0.9, scale: 1.1 });
    if (sp.type === 'steel' || sp.type === 'racks' || sp.type === 'stone') {
      addBurst('sparks', { origin: [face + 0.2, ry * 0.5, 0], t0: sp.tBreak, seed: seed++, box: [0.2, ry * 0.6, rx * 0.8], dir: [1.2, 0.2, 0], spread: 0.9, scale: 1.4 });
    }
  }
  for (const h of w.hits) {
    if (sp.tBreak && h.ti >= sp.tBreak - 0.05) continue;
    addBurst('puff', { origin: [face - 0.1, h.y, h.z], t0: h.ti, seed: seed++, dir: [-0.6, 0, 0], spread: 0.8, scale: 0.9 });
    if (sp.type !== 'brick' && sp.type !== 'concrete') addBurst('sparks', { origin: [face - 0.1, h.y, h.z], t0: h.ti, seed: seed++, dir: [-1.0, 0.3, 0], spread: 0.7, scale: 0.8 });
  }
}
for (const h of walls[5].hits) {
  const face = wallFaceX(RSI);
  addBurst('embers', { origin: [face - 0.05, h.y, h.z], t0: h.ti, seed: seed++, dir: [-1.1, 0.2, 0], spread: 0.8, scale: 0.9 });
}

// dust shaken loose on the far side by the muffled blows
FAR_THUMPS.forEach((th, i) => {
  const r = ((i * 2654435761) >>> 0) / 4294967296;
  addBurst('puff', { origin: [wallFaceX(RSI) + RSI.depth + 0.4, 0.3, (r - 0.5) * 12], t0: th.t + 0.05, seed: seed++, box: [0.2, 0.2, 5], dir: [0.5, 0.2, 0], spread: 0.9, scale: 1.6 });
});

// ---- beams -------------------------------------------------------------------------------
const beams = [];
for (const bot of BOTS) for (const s of bot.strikes) if (s.kind === 'beam') {
  const g = createBeam(bot.color);
  scene.add(g);
  beams.push({ g, s, bot, robot: robots[BOTS.indexOf(bot)] });
}
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
function updateBeams(t) {
  for (const b of beams) {
    const { s } = b;
    if (t < s.ti || t > s.ti + s.dur) { b.g.visible = false; continue; }
    const wall = s.wall, face = wallFaceX(wall);
    let ty, tz;
    if (wall.sweep) {
      const u = clamp((t - wall.tBreak) / wall.sweep, 0, 1);
      tz = -wall.hole.rx + 2 * wall.hole.rx * u;
      ty = wall.hole.ry * 0.95 * Math.sqrt(Math.max(0, 1 - (tz / wall.hole.rx) ** 2)) + 0.4;
    } else {
      const st = botState(b.bot, t);
      tz = st.z + s.sweepZ * Math.sin(t * 0.8 + b.bot.seed * 9);
      ty = 4 + 3.2 * Math.sin(t * 1.15 + b.bot.seed * 5);
    }
    b.robot.arms[1].muzzle.getWorldPosition(tmpA);
    tmpB.set(face - 0.05, ty, tz);
    const power = smoothstep(0, 0.5, t - s.ti) * smoothstep(0, 0.6, s.ti + s.dur - t);
    b.g.userData.set(tmpA, tmpB, t, power);
  }
}

// ---- cards -----------------------------------------------------------------------------------
const cards = placedCards().map((c) => {
  const mesh = makeCard(c);
  mesh.position.set(c.x, c.y, c.z);
  scene.add(mesh);
  return { c, mesh, y0: c.y };
});
function updateCards(t) {
  for (const k of cards) {
    const { c, mesh } = k;
    const a = smoothstep(c.t0, c.t0 + 1.4, t) * (1 - smoothstep(c.t1 - 1.6, c.t1, t));
    mesh.material.opacity = a;
    mesh.visible = a > 0.002;
    if (!mesh.visible) continue;
    mesh.position.y = k.y0 + 0.14 * (t - c.t0) + 0.12 * Math.sin(t * 0.7 + c.t0);
    mesh.rotation.y = Math.atan2(camera.position.x - mesh.position.x, camera.position.z - mesh.position.z);
  }
}

// ---- the crack -------------------------------------------------------------------------------
const farX = wallFaceX(RSI) + RSI.depth + 0.04;
const crack = createCrack({ x: farX, y0: 3.3, z0: -0.4, t0: T_CRACK0, t1: T_CRACK1, seed: 11 });
scene.add(crack.mesh);
const crackLight = new THREE.PointLight(0xffb870, 0, 60, 1.6);
crackLight.position.set(farX + 0.6, 3.4, -0.4);
scene.add(crackLight);
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const crackGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc58a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
);
crackGlow.rotation.x = -Math.PI / 2;
crackGlow.position.set(farX + 5, 0.05, -0.4);
scene.add(crackGlow);

// ---- HUD ----------------------------------------------------------------------------------------
const hud = document.getElementById('hud'), yearEl = document.getElementById('year');
const titleEl = document.getElementById('title');
let lastYear = '';

// ---- frame ----------------------------------------------------------------------------------------
const fadeAt = (t) => smoothstep(0, 3.2, t) * (t >= END_T ? 0 : 1);

function renderAt(t) {
  window.__t = t;
  const mx = markerX(t);
  cameraAt(t, camera);
  camera.updateMatrixWorld();
  fxShared.uScale.value = (renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
  world.update(t, mx);

  robots.forEach((r, i) => {
    const bot = BOTS[i];
    const st = botState(bot, t);
    poseRobot(r, st, t);
    const since = t - bot.tJoin - 3;
    // name tags when a bot joins, and a roll-call as they march on the monolith
    const intro = smoothstep(0, 1, since) * (1 - smoothstep(7, 9, since));
    const roll = smoothstep(137, 139, t) * (1 - smoothstep(158, 160, t));
    const nameA = Math.max(intro, roll * 0.9);
    r.plate.material.opacity = st.visible ? nameA : 0;
  });
  for (const w of walls) { w.group.visible = Math.abs(w.spec.x - mx) < 260; if (w.group.visible) w.update(t); }
  for (const b of bursts) b.update(t);
  updateBeams(t);
  updateCards(t);

  crack.update(t);
  const cu = smoothstep(T_CRACK0, T_CRACK1, t);
  crackLight.intensity = 3 + 70 * cu * cu;
  crackGlow.material.opacity = 0.55 * cu * cu;
  crackGlow.scale.set(6 + 40 * cu, 4 + 3 * cu, 1);

  post.set(t, fadeAt(t), 1 + 0.35 * smoothstep(T_CRACK0, T_CRACK1, t));
  post.composer.render();

  const y = t >= T_ASSAULT ? '20??' : String(Math.floor(yearAt(t)));
  if (y !== lastYear) { yearEl.textContent = y; lastYear = y; }
  hud.classList.toggle('on', t > 3.5 && t < T_FARSIDE - 0.5);
  const ta = smoothstep(0.6, 2.2, t) * (1 - smoothstep(5, 7, t));
  titleEl.style.opacity = ta;
}

function applyTier() {
  world.sun.castShadow = tier < 1;
  post.bloom.enabled = tier < 2;
  resize();
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const dpr = [Math.min(window.devicePixelRatio || 1, 2), Math.min(window.devicePixelRatio || 1, 1.5), 1, 0.7][tier];
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
applyTier();

// ---- playback ----------------------------------------------------------------------------------------
const audio = createAudio();
let playing = false, paused = false, wallStart = 0, pausedAt = 0, ended = false;
let useAudio = false;
// real seconds -> authored seconds (the film is sped up by SPEED)
const nowT = () => {
  if (useAudio) { const a = audio.time(); if (a != null) return a * SPEED; }
  return ((performance.now() - wallStart) / 1000) * SPEED;
};

// step quality down if the device can't hold ~30 fps
let lastFrame = 0, slow = 0, frames = 0;
function watchPerf() {
  const now = performance.now();
  if (lastFrame && !document.hidden) {
    slow += now - lastFrame > 36 ? 1 : 0;
    if (++frames >= 90) {
      if (slow > 45 && tier < 3 && SEEK === null) { tier++; applyTier(); }
      slow = 0; frames = 0;
    }
  }
  lastFrame = now;
}

function loop() {
  requestAnimationFrame(loop);
  if (!playing || paused) { lastFrame = 0; return; }
  watchPerf();
  const t = Math.max(0, nowT());
  renderAt(Math.min(t, DURATION));
  if (t >= DURATION && !ended) { ended = true; document.getElementById('end').classList.add('on'); }
}

function begin(withSound) {
  document.getElementById('start').classList.add('hidden');
  document.getElementById('end').classList.remove('on');
  ended = false;
  useAudio = withSound && audio.start();
  wallStart = performance.now() + 1600;
  playing = true; paused = false;
  // if the browser kept the audio context suspended, offer a tap to start it
  setTimeout(() => {
    if (useAudio && audio.ctx && audio.ctx.state !== 'running') soundBtn.classList.add('on');
  }, 1800);
}
const soundBtn = document.getElementById('sound');
soundBtn.onclick = () => { audio.ctx?.resume(); audio.blip(); soundBtn.classList.remove('on'); };
document.getElementById('begin').onclick = () => begin(true);
document.getElementById('beginMuted').onclick = () => begin(false);
document.getElementById('replay').onclick = () => { audio.stop(); begin(true); };
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && playing) {
    e.preventDefault();
    paused = !paused;
    if (paused) { pausedAt = performance.now(); if (useAudio) audio.ctx?.suspend(); }
    else { wallStart += performance.now() - pausedAt; if (useAudio) audio.ctx?.resume(); }
  }
});

// test / capture hooks
window.__film = {
  seek(t) { renderAt(t); return true; },
  cam() { return { p: camera.position.toArray().map((v) => +v.toFixed(2)), fov: camera.fov, marker: markerX(window.__t ?? 0) }; },
  wav: renderWav,
  buildMs() { const c = new OfflineAudioContext(2, 44100, 44100); const t0 = performance.now(); buildScore(c, c.destination, 0); return performance.now() - t0; },
  END_T, DURATION, SPEED,
};

if (SEEK !== null) {
  document.body.classList.add('capture');
  document.getElementById('start').remove();
  renderAt(SEEK);
  window.__ready = true;
} else {
  renderAt(0);
  window.__ready = true;
  loop();
}
