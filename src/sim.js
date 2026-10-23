// Pure functions of time: where the marching group is, where each bot stands,
// what it is doing. No state, so any frame can be rendered at any t.
import { BOTS, WALLS, YEARS, T_ASSAULT, T_SLUMP } from './timeline.js';

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const wallFaceX = (w) => w.x - w.depth / 2;
const stopX = (w) => wallFaceX(w) - (w.id === 'w6' ? 2.4 : 1.65);

// ---- marker: the front of the group -------------------------------------
const keys = [{ t: 0, x: 0 }];
for (const w of WALLS) {
  keys.push({ t: w.tArrive, x: stopX(w) });
  if (w.tDepart != null) keys.push({ t: w.tDepart, x: stopX(w) });
}
const walkEase = (u) => 0.55 * u + 0.45 * (u * u * (3 - 2 * u));

export function markerX(t) {
  if (t <= keys[0].t) return keys[0].x;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1], b = keys[i];
      return lerp(a.x, b.x, walkEase((t - a.t) / (b.t - a.t)));
    }
  }
  return keys[keys.length - 1].x;
}

// ---- formation -----------------------------------------------------------
const SPACING = 1.0;
const LANES = [-2.6, 0.1, 2.6];
const JOIN_TIME = 14;
const JOIN_DIST = 18;

const byLevel = [...BOTS].sort((a, b) => b.level - a.level);
byLevel.forEach((b, i) => { b.rank = i; });
const botById = {};
for (const b of BOTS) {
  botById[b.id] = b;
  const r = mulberry32(hashStr(b.id));
  b.lane = LANES[b.rank % 3] + (r() - 0.5) * 0.7;
  b.strikes = [];
  b.seed = r();
}
for (const w of WALLS) for (const s of w.strikes) {
  s.wall = w;
  botById[s.bot].strikes.push(s);
}
for (const b of BOTS) b.strikes.sort((p, q) => p.ti - q.ti);
export { botById };

const joinEase = (u) => 0.7 * u + 0.3 * (u * u * (3 - 2 * u));
export const presence = (b, t) => clamp((t - b.tJoin) / JOIN_TIME, 0, 1);

// A retired model decelerates over STOP_T and then stands dead where it halted.
const STOP_T = 2.2;
const RETIRE_FADE = 2.5;
export const retiredAt = (b) => b.tRetire ?? Infinity;
export const alive = (b, t) => (b.tRetire == null ? 1 : 1 - smoothstep(b.tRetire, b.tRetire + RETIRE_FADE, t));
// the bot's own clock: runs at 1 until it starts to brake, then eases to a halt
function ownTime(b, t) {
  const tr = retiredAt(b);
  if (t <= tr - STOP_T) return t;
  const u = Math.min(1, (t - (tr - STOP_T)) / STOP_T);
  return tr - STOP_T + STOP_T * (u - u * u / 2);
}
// speed a model can keep up with (story units / s); the group outruns the older ones
const pace = (b) => 0.7 + 2.3 * b.level;
const speedOf = (t) => (markerX(t + 0.1) - markerX(t - 0.1)) / 0.2;

function baseState(b, t, joined = false) {
  const p = joined ? 1 : presence(b, t);
  let ahead = 0;
  for (const o of BOTS) if (o.level > b.level) ahead += smoothstep(0, 1, presence(o, t)) * alive(o, t);
  const q = joinEase(p);
  const side = b.lane >= 0.1 ? 1 : -1;
  return {
    x: markerX(t) - SPACING * ahead - JOIN_DIST * (1 - q) - 3.2 * Math.max(0, speedOf(t) - pace(b)) * p,
    z: b.lane + side * 3.6 * (1 - smoothstep(0.25, 1, p)),
    p, ahead,
  };
}

// bots that hold position at the monolith for the whole assault
const holders = BOTS.filter((b) => b.strikes.some((s) => s.hold));
holders.forEach((b, i) => {
  const r = mulberry32(hashStr(b.id + 'hold'));
  b.hold = { t0: T_ASSAULT + i * 0.22, z: (i - (holders.length - 1) / 2) * 1.55, jitter: r() * 0.4 };
});

const LEAD = { punch: 0.55, slam: 0.9, charge: 1.1, beam: 0 };
const POST = { punch: 0.9, slam: 1.3, charge: 1.6, beam: 0 };
const REACH = 0.78;

function lungeFor(b, s) {
  if (s._lunge != null) return s._lunge;
  if (s.kind === 'beam') return (s._lunge = 0);
  const base = baseState(b, s.ti, true);
  // chargers pile up in rows so they don't occupy the same spot
  const row = s.kind === 'charge' ? Math.min(2, Math.floor(base.ahead / 3)) : 0;
  const reach = wallFaceX(s.wall) - REACH - row * 0.85;
  return (s._lunge = Math.max(0, reach - base.x));
}

// Everything the renderer needs for one bot at time t.
export function botState(b, t) {
  const tau = ownTime(b, t);
  const st = coreState(b, tau);
  if (tau === t) return st;
  // after the brake starts, velocity follows the bot's own clock rate
  const e = 0.06;
  st.v = (coreState_x(b, ownTime(b, t + e)) - coreState_x(b, ownTime(b, t - e))) / (2 * e);
  st.off = smoothstep(b.tRetire, b.tRetire + RETIRE_FADE, t);
  st.dying = smoothstep(b.tRetire - STOP_T, b.tRetire, t);
  return st;
}
const coreState_x = (b, tau) => baseOf(b, tau);

function coreState(b, t) {
  const base = baseState(b, t);
  let x = base.x, z = base.z;
  let lunge = 0, knock = 0, stagger = 0, lungeEnv = 0;
  let strike = null, beam = null;

  for (const s of b.strikes) {
    if (s.hold) continue;
    const L = lungeFor(b, s);
    const up = smoothstep(s.ti - Math.max(1.8, L / 2.0), s.ti - 0.3, t);
    const down = s.fail ? smoothstep(s.ti + 1.2, s.ti + 4.2, t) : smoothstep(s.ti + 3, s.ti + 8, t);
    const kick = t > s.ti ? 1 - Math.exp(-9 * (t - s.ti)) : 0;
    lunge = Math.max(lunge, L * up * (1 - down));
    if (s.kind !== 'charge' && s.kind !== 'beam') lungeEnv = Math.max(lungeEnv, up * (1 - down));
    if (s.fail) {
      knock = Math.max(knock, 1.9 * kick * (1 - down));
      stagger = Math.max(stagger, kick * (1 - smoothstep(s.ti + 0.8, s.ti + 3.2, t)));
    }
  }
  x += lunge - knock;
  // step out of line so a lone striker doesn't walk through its lane-mates
  z += (b.seed < 0.5 ? -1 : 1) * 1.3 * lungeEnv;

  if (b.hold) {
    const h = b.hold;
    const reach = wallFaceX(WALLS[5]) - REACH - h.jitter;
    const k = smoothstep(h.t0, h.t0 + 3.5, t);
    const kz = smoothstep(h.t0, h.t0 + 4, t);
    const b0 = baseState(b, T_ASSAULT);
    x += (reach - b0.x) * k;
    z = lerp(z, h.z, kz);
  }

  for (const s of b.strikes) {
    if (s.kind === 'beam') {
      if (t >= s.ti && t <= s.ti + s.dur) { strike = { kind: 'beam', dt: t - s.ti, s }; beam = { s, u: (t - s.ti) / s.dur }; }
    } else if (t >= s.ti - LEAD[s.kind] && t <= s.ti + POST[s.kind]) {
      strike = { kind: s.kind, dt: t - s.ti, s };
    }
  }

  const e = 0.06;
  const vx = (baseOf(b, t + e) - baseOf(b, t - e)) / (2 * e);
  return {
    x, z, p: base.p,
    v: vx,
    visible: base.p > 0.001,
    scale: smoothstep(0, 0.04, base.p),
    stagger, strike, beam,
    slump: smoothstep(T_SLUMP, T_SLUMP + 2.5, t),
    off: 0, dying: 0,
  };
}

// x without recomputing everything, for velocity
function baseOf(b, t) {
  let x = baseState(b, t).x, lunge = 0, knock = 0;
  for (const s of b.strikes) {
    if (s.hold) continue;
    const L = lungeFor(b, s);
    const up = smoothstep(s.ti - Math.max(1.8, L / 2.0), s.ti - 0.3, t);
    const down = s.fail ? smoothstep(s.ti + 1.2, s.ti + 4.2, t) : smoothstep(s.ti + 3, s.ti + 8, t);
    const kick = t > s.ti ? 1 - Math.exp(-9 * (t - s.ti)) : 0;
    lunge = Math.max(lunge, L * up * (1 - down));
    if (s.fail) knock = Math.max(knock, 1.9 * kick * (1 - down));
  }
  x += lunge - knock;
  if (b.hold) {
    const h = b.hold;
    const reach = wallFaceX(WALLS[5]) - REACH - h.jitter;
    x += (reach - baseState(b, T_ASSAULT).x) * smoothstep(h.t0, h.t0 + 3.5, t);
  }
  return x;
}

export function yearAt(t) {
  if (t <= YEARS[0][0]) return YEARS[0][1];
  for (let i = 1; i < YEARS.length; i++) {
    if (t <= YEARS[i][0]) {
      const [t0, y0] = YEARS[i - 1], [t1, y1] = YEARS[i];
      return lerp(y0, y1, (t - t0) / (t1 - t0));
    }
  }
  return YEARS[YEARS.length - 1][1];
}

// world x where the marker passes a given year (for ground inscriptions)
export function xAtYear(year) {
  for (let i = 1; i < YEARS.length; i++) {
    if (year <= YEARS[i][1]) {
      const [t0, y0] = YEARS[i - 1], [t1, y1] = YEARS[i];
      return markerX(lerp(t0, t1, (year - y0) / (y1 - y0)));
    }
  }
  return markerX(YEARS[YEARS.length - 1][0]);
}
