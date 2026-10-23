// Authored camera: a list of cuts, each a pair/triple of (pos, look, fov, roll)
// keyframes expressed relative to an anchor (the marching group, one robot, or a
// wall face). A cut lasts until the next one starts. Hard cuts, close-ups,
// low angles, impact shake and a small lens punch on every hit.
// Pure function of t.
import { toReal, WALLS, T_ASSAULT, T_SLUMP, T_FARSIDE, END_T, RSI, FAR_THUMPS } from './timeline.js';
import { markerX, botState, botById, smoothstep, lerp, wallFaceX } from './sim.js';

const K = (pos, look, fov = 36, roll = 0) => ({ pos, look, fov, roll });
const cuts = [];
// anchor: undefined = the group's marker, { bot } = that robot, { wall } = that wall's face
const C = (t, keys, anchor, ease = 0.6) => cuts.push({ t, keys, anchor, ease });

const M6 = markerX(160); // marker parked at the monolith
const FAR = wallFaceX(RSI) + RSI.depth; // x of the monolith's far face
const HIT_Y = { punch: 1.45, slam: 0.9, charge: 1.3 };

// ---- templates -----------------------------------------------------------------
// on a robot (x, z relative to it, y absolute; +x is the way it walks)
const BT = {
  face:   () => [K([2.6, 1.75, 1.5], [0, 1.75, 0], 30), K([1.9, 1.85, 1.15], [0, 1.8, 0], 27)],
  feet:   () => [K([0.8, 0.28, 2.5], [-0.1, 0.45, 0], 38), K([1.7, 0.34, 2.1], [0.3, 0.5, 0], 36, 3)],
  hero:   () => [K([3.4, 0.45, 3.0], [0, 2.1, 0], 36), K([2.5, 0.6, 2.5], [0, 2.2, 0], 33)],
  behind: () => [K([-3.2, 2.3, 0.9], [5, 1.7, 0], 40), K([-2.7, 2.1, 0.6], [5, 1.7, 0], 38)],
  side:   () => [K([0.5, 1.6, 5.4], [0.6, 1.6, 0], 34), K([1.6, 1.5, 5.0], [1.0, 1.6, 0], 32)],
  chase:  () => [K([-4.5, 1.3, 3.2], [3, 1.5, 0], 36, -3), K([-2.8, 1.2, 2.6], [3, 1.6, 0], 34, -3)],
  run:    () => [K([5.5, 1.1, 3.2], [0, 1.5, 0], 34, -3), K([2.6, 1.3, 3.4], [-1.5, 1.5, 0], 34, -3)],
};
// on the group
const MT = {
  front:  () => [K([14, 1.4, 3.6], [-2, 1.7, 0], 40, 2), K([9, 1.2, 3.2], [-3, 1.7, 0], 38, 2)],
  crane:  () => [K([-10, 6.5, 22], [-2, 2.0, 0], 40), K([-4, 5.5, 22], [0, 2.2, 0], 40)],
  low:    () => [K([-1, 1.1, 8.5], [-6, 1.6, 0.5], 42), K([-2, 1.3, 9], [-7, 1.7, 0.5], 42)],
  wide:   () => [K([-3, 2.6, 20], [-2, 2.0, 0], 40), K([0, 2.9, 20.5], [0, 2.1, 0], 40)],
  charge: () => [K([-12, 0.7, 3.5], [2, 1.4, 0], 44, -2), K([-8, 0.9, 4.0], [3, 1.5, 0], 42, -2)],
};
// on a spot of a wall (x relative to the face, y and z absolute)
const WT = [
  (y, z) => [K([-6.5, y - 0.2, z + 5.5], [-1.5, y, z], 34), K([-5, y - 0.1, z + 4.5], [-1.0, y, z], 32)],
  (y, z) => [K([-8, y + 0.6, z + 2.2], [-0.5, y, z], 38), K([-6, y + 0.3, z + 1.6], [-0.5, y, z], 34)],
  (y, z) => [K([-4.5, y + 3.6, z + 4.2], [-1, y - 0.3, z], 38), K([-4, y + 2.6, z + 3.4], [-0.8, y - 0.2, z], 34, 4)],
];

const bot = (id) => ({ bot: id });
const wall = (w) => ({ wall: w });

// ---- Act 1: GPT-1 alone, then the first bots ---------------------------------------
C(0, BT.feet(), bot('gpt1'), 0.3);
C(3.2, BT.face(), bot('gpt1'));
C(6.6, [K([2.6, 0.9, 8.6], [0.8, 2.5, 1.5], 44), K([5.5, 1.4, 10], [1.5, 3.0, 1], 44)]);
C(10, BT.run(), bot('gpt2'));
C(12.6, BT.side(), bot('gpt3'));
C(15, MT.crane());

// ---- the five walls --------------------------------------------------------------------
function fight(w, wi) {
  const hits = [];
  for (const s of [...w.strikes].sort((a, b) => a.ti - b.ti)) {
    if (s.kind === 'beam') continue;
    const last = hits[hits.length - 1];
    if (last && s.ti - last.ti < 0.4) last.n++;
    else hits.push({ ...s, n: 1 });
  }
  const fails = hits.filter((h) => h.fail);
  const tb = w.tBreak;
  const lead = hits.find((h) => !h.fail);
  // arrival: the wall looms
  C(w.tArrive - 2.6, [K([-17, 3.0, 4.2], [1.5, 3.4, -0.5], 42), K([-14, 2.7, 3.6], [1.6, 3.4, -0.3], 42)]);
  let prev = w.tArrive - 1.0;
  fails.forEach((h, k) => {
    const z = botState(botById[h.bot], h.ti).z, y = HIT_Y[h.kind];
    const tImp = h.ti - 0.45;
    if (tImp - prev > 1.1) C(h.ti - 1.55, BT[['behind', 'side', 'feet'][(wi + k) % 3]](), bot(h.bot));
    C(tImp, WT[(wi + k) % 3](y, z), wall(w));
    prev = h.ti + 0.9;
    // reaction on the bot that bounced
    C(h.ti + 0.9, BT[['side', 'behind', 'feet'][(wi + k) % 3]](), bot(h.bot));
  });
  if (w.type === 'stone') {
    // the reasoning model cuts an arch with a beam
    C(tb - 4.2, BT.behind(), bot('o1'));
    C(tb - 2.9, [K([-7, 1.4, 5.5], [1, 5.5, 0], 44), K([-6, 1.8, 4.5], [1, 6.5, 1], 46)], wall(w));
    C(tb - 0.9, [K([-9, 2.2, 10], [0, 5.5, 0], 50, 2), K([-8, 2.6, 9], [0, 5, 0], 54, 2)], wall(w));
    C(tb + 1.0, BT.face(), bot('o1'));
    C(tb + 2.6, [K([-4.5, 1.5, 5.5], [3, 2.2, 0], 40), K([-1, 1.8, 4.5], [6, 2.2, 0], 40)], wall(w));
  } else {
    // the charge, and the break in slow motion
    C(tb - 2.9, MT.charge());
    C(tb - 1.3, BT.chase(), bot(lead.bot));
    C(tb - 0.35, [K([-8.5, 2.0, 9], [0, w.height * 0.28, 0], 46), K([-7, 1.8, 8], [0.5, w.height * 0.26, 0], 50)], wall(w));
    C(tb + 1.0, [K([-4.5, 1.5, 5.5], [3, 2.2, 0], 40), K([-1, 1.8, 4.5], [6, 2.2, 0], 40)], wall(w));
  }
  // pull back and look through the breach as the group readies to go
  if (w.tDepart) C(tb + 3.0, [K([-14, 2.6, 11], [6, 3, -1], 44), K([-9, 2.2, 10], [9, 3, -1], 44)], wall(w));
}
WALLS.slice(0, 5).forEach((w, i) => fight(w, i));

// ---- the walks between walls: faster each time ----------------------------------------
const gap = (list) => list.forEach(([t, tpl, who]) => C(t, tpl(), who ? bot(who) : undefined));
gap([ // 1: GPT-1 and GPT-2 run out of road
  [31.0, MT.front], [31.4, BT.face, 'gpt1'], [34.2, BT.run, 'gpt3'], [36.3, MT.wide],
  [38.6, BT.face, 'gpt2'],
]);
gap([ // 2: GPT-3 goes dark, the new models sprint in
  [56.6, MT.wide], [57.0, BT.face, 'gpt3'], [60.0, BT.run, 'claude'], [62.0, BT.side, 'gemini'],
  [64.0, BT.hero, 'llama'], [66.0, MT.crane],
]);
gap([ // 3: GPT-4 goes dark
  [82.0, MT.front], [82.8, BT.face, 'gpt4'], [86.0, BT.run, 'o1'], [87.8, BT.hero, 'deepseek'],
  [89.6, BT.feet, 'claude'], [91.2, MT.crane],
]);
gap([ // 4: a flat-out sprint
  [108.0, MT.front], [110.0, BT.run, 'claude'], [111.6, BT.feet, 'o1'], [113.0, BT.hero, 'deepseek'],
  [114.8, BT.side, 'grok'], [116.6, BT.run, 'qwen'],
]);

// ---- the reveal: past the last breach, something enormous -------------------------------
C(WALLS[4].tDepart + 1, [K([-8, 2.0, 3.0], [20, 11, 0], 52), K([-8, 2.6, 4.5], [24, 14, -1], 56)]);
C(137, [K([2.6, 2.05, 1.5], [0, 2.1, 0], 30), K([1.9, 2.1, 1.15], [0, 2.1, 0], 27)], bot('claude'));
C(139.5, BT.feet(), bot('deepseek'));
C(141.5, [K([-20, 3.6, 24], [14, 15, 0], 58), K([-14, 2.8, 23], [10, 11, 0], 62)]);
C(147.5, BT.behind(), bot('o1'));

// ---- the assault ----------------------------------------------------------------------------
{
  const hits = RSI.strikes.filter((s) => s.kind !== 'beam');
  const next = (t) => hits.find((s) => s.ti >= t) || hits[hits.length - 1];
  C(T_ASSAULT, [K([-9, 2.4, 9], [6, 7, 0], 56), K([-8, 2.6, 8.5], [6, 9, 0], 56)]);
  const pat = ['impact', 'side', 'wide', 'impact', 'beam', 'behind', 'impact', 'side'];
  const faces = ['claude', 'gemini', 'qwen', 'grok', 'llama', 'mistral'];
  let t = 154.2, k = 0;
  while (t < T_SLUMP - 0.8) {
    const type = pat[k % pat.length];
    if (type === 'impact') {
      const h = next(t + 0.6);
      const z = botState(botById[h.bot], h.ti).z, y = HIT_Y[h.kind];
      C(Math.max(t, h.ti - 0.7), WT[k % 3](y, z), wall(RSI));
    } else if (type === 'wide') {
      C(t, k % 16 === 2
        ? [K([-16, 6, 48], [6, 14, 0], 56), K([-12, 6, 44], [6, 15, 0], 56)]
        : [K([-20, 6, 34], [6, 14, 0], 58), K([-12, 4, 24], [6, 16, 0], 62)]);
    } else if (type === 'beam') {
      C(t, [K([-6, 1.8, 7], [6, 7, 0], 48, 3), K([-5, 2.6, 6], [7, 8, 0], 52, 3)]);
    } else {
      C(t, BT[type](), bot(faces[k % faces.length]));
    }
    t += type === 'wide' ? 2.2 : 1.9;
    k++;
  }
}
C(T_SLUMP, [K([-9, 1.2, 6.5], [3, 2.6, 0], 48), K([-13, 2.0, 9], [3, 3.2, 0], 48)]);

// ---- the far side ---------------------------------------------------------------------------
const fx = (x) => x - M6;
C(T_FARSIDE, [K([fx(FAR + 40), 3.4, 11], [fx(FAR), 13, 0], 50), K([fx(FAR + 26), 3.2, 7], [fx(FAR), 10, 0], 48)], undefined, 0.2);
C(189, [K([fx(FAR + 13.5), 3.1, 4.4], [fx(FAR), 3.3, -0.2], 46), K([fx(FAR + 6.2), 3.2, 1.6], [fx(FAR), 3.3, -0.4], 46)], undefined, 0.3);

cuts.sort((a, b) => a.t - b.t);
export const cutList = cuts;
// drop cuts that would be on screen for under ~0.4 s
for (let i = cuts.length - 2; i >= 0; i--) if (toReal(cuts[i + 1].t) - toReal(cuts[i].t) < 0.38) cuts.splice(i, 1);

// ---- impact shake and lens punch ------------------------------------------------------------
const shakes = [];
for (const w of WALLS) {
  if (w.tBreak) shakes.push({ t: w.tBreak, a: 0.6, d: 1.8, f: 5 });
  for (const s of w.strikes) {
    if (w.id === 'w6') shakes.push({ t: s.ti, a: 0.05, d: 6, f: 0.8 });
    else if (s.kind !== 'beam') shakes.push({ t: s.ti, a: s.fail ? 0.14 : 0.05, d: 5, f: s.fail ? 2.5 : 1 });
  }
}
for (const th of FAR_THUMPS) shakes.push({ t: th.t, a: 0.25 + th.v, d: 3, f: 0 });
shakes.sort((a, b) => a.t - b.t);

function shake(t) {
  let a = 0, punch = 0;
  for (const s of shakes) {
    const d = t - s.t;
    if (d >= 0 && d < 2.5) { const e = Math.exp(-d * s.d); a += s.a * e; punch += s.f * e; }
  }
  return { a, punch };
}

export const camDebug = { clamped: false };
// keep the lens out of any wall slab that still stands (or its remains)
function clearWalls(t, p) {
  for (const w of WALLS) {
    const face = wallFaceX(w);
    const broken = w.tBreak && t > w.tBreak + 0.8;
    if (broken && Math.abs(p[2]) < w.hole.rx - 1.2) continue;
    if (Math.abs(p[2]) < w.width / 2 + 1 && p[0] > face - 1.6 && p[0] < face + w.depth + 2.0) {
      p[0] = p[0] < face + w.depth / 2 ? face - 1.6 : face + w.depth + 2.0;
      camDebug.clamped = true;
    }
  }
}

function anchorOf(an, t) {
  if (!an) return [markerX(t), 0];
  if (an.bot) { const s = botState(botById[an.bot], t); return [s.x, s.z]; }
  return [wallFaceX(an.wall), 0];
}

export function cameraAt(t, cam) {
  let ci = cuts.length - 1;
  for (let i = 0; i < cuts.length; i++) if (t < cuts[i].t) { ci = Math.max(0, i - 1); break; }
  const sh = cuts[ci];
  const end = ci + 1 < cuts.length ? cuts[ci + 1].t : END_T + 5;
  const u = Math.min(1, Math.max(0, (t - sh.t) / (end - sh.t)));
  const e = lerp(u, smoothstep(0, 1, u), sh.ease);
  const keys = sh.keys;
  let A, B, f;
  if (keys.length === 3) { if (e < 0.5) { A = keys[0]; B = keys[1]; f = e * 2; } else { A = keys[1]; B = keys[2]; f = e * 2 - 1; } }
  else { A = keys[0]; B = keys[1]; f = e; }
  const [ax, az] = anchorOf(sh.anchor, t);
  const zAbs = sh.anchor && sh.anchor.wall; // wall-anchored shots use absolute z
  const L = (i, k) => lerp(A[k][i], B[k][i], f);
  const { a: k, punch } = shake(t);
  const n1 = Math.sin(t * 47.3) + Math.sin(t * 31.1 + 1.7), n2 = Math.sin(t * 53.9 + 0.4) + Math.sin(t * 37.7);
  const hh = 0.035;
  const p = [
    ax + L(0, 'pos') + k * n1 * 0.5 + hh * Math.sin(t * 0.9),
    L(1, 'pos') + k * n2 * 0.5 + hh * Math.sin(t * 1.3 + 1),
    (zAbs ? 0 : az) + L(2, 'pos') + k * (n1 - n2) * 0.25,
  ];
  camDebug.clamped = false;
  clearWalls(t, p);
  cam.position.set(p[0], p[1], p[2]);
  cam.lookAt(ax + L(0, 'look') + k * n2 * 0.3, L(1, 'look') + k * n1 * 0.3, (zAbs ? 0 : az) + L(2, 'look'));
  const roll = lerp(A.roll, B.roll, f) + k * n1 * 1.2;
  if (roll && cam.rotateZ) cam.rotateZ((roll * Math.PI) / 180);
  const fov = lerp(A.fov, B.fov, f) - punch;
  if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
}
