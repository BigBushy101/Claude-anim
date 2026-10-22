// Authored camera: a list of shots, each a pair/triple of (pos, look, fov)
// keyframes expressed relative to the marching group's marker. Hard cuts between
// shots, plus impact shake. Pure function of t.
import { WALLS, T_ASSAULT, T_SLUMP, T_FARSIDE, END_T, RSI, FAR_THUMPS } from './timeline.js';
import { markerX, smoothstep, lerp, wallFaceX } from './sim.js';

const key = (pos, look, fov = 40) => ({ pos, look, fov });
const shots = [];
const S = (t0, t1, a, b, c, o = {}) => shots.push({ t0, t1, keys: c ? [a, b, c] : [a, b], ease: o.ease ?? 0.7 });

const M6 = markerX(160); // marker parked at the monolith
const FAR = wallFaceX(RSI) + RSI.depth; // x of the monolith's far face

// ---- Act 1: GPT-1 alone, then the first bots -------------------------------
S(0, 9.5, key([2.6, 0.9, 8.6], [0.8, 2.5, 1.5], 44), key([5.5, 1.4, 10], [1.5, 3.0, 1], 44));
S(9.5, 21, key([-2, 2.6, 17], [-2, 1.9, 0], 40), key([-1, 2.8, 17.5], [1, 2.1, 0], 40));

// ---- one set of shots per wall (3/4 views from the +z side) -------------------
function wallShots(w) {
  const firstHit = Math.min(...w.strikes.map((s) => s.ti));
  const tb = w.tBreak;
  const h = w.height;
  const ly = Math.min(h * 0.3 + 0.8, 4.2);
  // establishing: the group approaches, wall looming right
  S(w.tArrive, firstHit + 1.2, key([-17, 3.4, 12.5], [1.5, ly, -1], 42), key([-14, 3.0, 11.5], [1.6, ly, -0.6], 42));
  // building: closer, lower, in profile with the wall behind
  S(firstHit + 1.2, tb - 1.1, key([-9.5, 1.7, 8.6], [1.0, 2.3, 0.3], 40), key([-8, 1.6, 8.0], [1.2, 2.3, 0.3], 40));
  // impact, then pull back to show the breach
  S(tb - 1.1, tb + 3.6, key([-6.8, 1.0, 6.6], [1.8, 2.2, 0], 44), key([-14, 3.8, 14], [4, ly, 0], 46));
  // aftermath: look through the breach as the group readies to leave
  if (w.tDepart) S(tb + 3.6, w.tDepart + 1, key([-14, 2.6, 11], [6, 3, -1], 44), key([-9, 2.2, 10], [9, 3, -1], 44));
}
WALLS.slice(0, 5).forEach((w) => wallShots(w));

// ---- walking between walls -----------------------------------------------------------
function walk(t0, t1, i) {
  // first half of a gap is wide (the group is still near the breach); second half goes close
  const v = i % 2 === 0 ? (i % 4 === 0 ? 0 : 3) : (i % 4 === 1 ? 1 : 2);
  if (v === 0) S(t0, t1, key([-3, 2.6, 20], [-2, 2.0, 0], 40), key([0, 2.9, 20.5], [0, 2.1, 0], 40));
  else if (v === 1) S(t0, t1, key([-1, 1.7, 8], [-5, 1.9, 0.5], 42), key([-2, 1.6, 8], [-6, 1.8, 0.5], 42)); // beside the group, looking back at it
  else if (v === 2) S(t0, t1, key([-1, 1.1, 8.5], [-6, 1.6, 0.5], 42), key([-2, 1.3, 9], [-7, 1.7, 0.5], 42));
  else S(t0, t1, key([-10, 6.5, 22], [-2, 2.0, 0], 40), key([-4, 5.5, 22], [0, 2.2, 0], 40));
}
{
  let i = 0;
  for (let k = 0; k < 4; k++) {
    const a = WALLS[k].tDepart + 1, b = WALLS[k + 1].tArrive, mid = (a + b) / 2;
    walk(a, mid, i++);
    walk(mid, b, i++);
  }
}

// ---- the reveal: past the last breach, something enormous ----------------------------
S(WALLS[4].tDepart + 1, 141, key([-8, 2.0, 3.0], [20, 11, 0], 52), key([-8, 2.6, 4.5], [24, 14, -1], 56));
S(141, T_ASSAULT, key([-20, 3.6, 24], [14, 15, 0], 58), key([-14, 2.8, 23], [10, 11, 0], 62));

// ---- the assault ------------------------------------------------------------------------
S(T_ASSAULT, 158, key([-9, 2.4, 9], [6, 7, 0], 56), key([-8, 2.6, 8.5], [6, 9, 0], 56));
S(158, 164, key([-16, 6, 48], [6, 14, 0], 56), key([-12, 6, 44], [6, 15, 0], 56));
S(164, 170, key([-0.4, 1.9, 5.2], [2.8, 1.9, 0.8], 46), key([0.8, 2.0, 5.8], [3.0, 2.1, 0.6], 46));
S(170, T_SLUMP, key([-20, 6, 34], [6, 14, 0], 58), key([-12, 4, 24], [6, 16, 0], 62));
S(T_SLUMP, T_FARSIDE, key([-9, 1.2, 6.5], [3, 2.6, 0], 48), key([-13, 2.0, 9], [3, 3.2, 0], 48));

// ---- the far side -----------------------------------------------------------------------------
const fx = (x) => x - M6;
S(T_FARSIDE, 189, key([fx(FAR + 40), 3.4, 11], [fx(FAR), 13, 0], 50), key([fx(FAR + 26), 3.2, 7], [fx(FAR), 10, 0], 48), null, { ease: 0.2 });
S(189, END_T, key([fx(FAR + 13.5), 3.1, 4.4], [fx(FAR), 3.3, -0.2], 46), key([fx(FAR + 6.2), 3.2, 1.6], [fx(FAR), 3.3, -0.4], 46), null, { ease: 0.3 });

// ---- impact shake -------------------------------------------------------------
const shakes = [];
for (const w of WALLS) {
  if (w.tBreak) shakes.push({ t: w.tBreak, a: 0.55, d: 1.8 });
  for (const s of w.strikes) {
    if (w.id === 'w6') shakes.push({ t: s.ti, a: 0.05, d: 6 });
    else if (s.kind !== 'beam') shakes.push({ t: s.ti, a: s.fail ? 0.12 : 0.05, d: 5 });
  }
}
for (const th of FAR_THUMPS) shakes.push({ t: th.t, a: 0.25 + th.v, d: 3 });
shakes.sort((a, b) => a.t - b.t);

function shake(t) {
  let a = 0;
  for (const s of shakes) {
    const d = t - s.t;
    if (d >= 0 && d < 2.5) a += s.a * Math.exp(-d * s.d);
  }
  return a;
}

const out = { pos: [0, 0, 0], look: [0, 0, 0], fov: 40 };
export const camDebug = { clamped: false };
// keep the lens out of any wall slab that still stands (or its remains)
function clearWalls(t, p) {
  for (const w of WALLS) {
    const face = wallFaceX(w);
    const broken = w.tBreak && t > w.tBreak + 0.8;
    if (broken && Math.abs(p[2]) < w.hole.rx - 1.2) continue;
    if (Math.abs(p[2]) < w.width / 2 + 1 && p[0] > face - 2.0 && p[0] < face + w.depth + 2.0) {
      p[0] = p[0] < face + w.depth / 2 ? face - 2.0 : face + w.depth + 2.0;
      camDebug.clamped = true;
    }
  }
}

export function cameraAt(t, cam) {
  const sh = shots.find((s) => t >= s.t0 && t < s.t1) || shots[shots.length - 1];
  const u = Math.min(1, Math.max(0, (t - sh.t0) / (sh.t1 - sh.t0)));
  const e = lerp(u, smoothstep(0, 1, u), sh.ease);
  let A, B, f;
  if (sh.keys.length === 3) { if (e < 0.5) { A = sh.keys[0]; B = sh.keys[1]; f = e * 2; } else { A = sh.keys[1]; B = sh.keys[2]; f = e * 2 - 1; } }
  else { A = sh.keys[0]; B = sh.keys[1]; f = e; }
  const mx = markerX(t);
  const L = (i, k) => lerp(A[k][i], B[k][i], f);
  const k = shake(t);
  const n1 = Math.sin(t * 47.3) + Math.sin(t * 31.1 + 1.7), n2 = Math.sin(t * 53.9 + 0.4) + Math.sin(t * 37.7);
  const hh = 0.035;
  const p = [
    mx + L(0, 'pos') + k * n1 * 0.5 + hh * Math.sin(t * 0.9),
    L(1, 'pos') + k * n2 * 0.5 + hh * Math.sin(t * 1.3 + 1),
    L(2, 'pos') + k * (n1 - n2) * 0.25,
  ];
  camDebug.clamped = false;
  clearWalls(t, p);
  cam.position.set(p[0], p[1], p[2]);
  cam.lookAt(mx + L(0, 'look') + k * n2 * 0.3, L(1, 'look') + k * n1 * 0.3, L(2, 'look'));
  const fov = lerp(A.fov, B.fov, f);
  if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
}
