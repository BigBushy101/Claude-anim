// All story data lives here: who joins when, where the walls stand, and when
// each one breaks. Everything else in the film is a pure function of this + time.

// Playback speed-up: every time below is in "authored" seconds; the film plays
// SPEED times faster, so the authored 202 s runs in about 126 s.
export const SPEED = 1.6;
export const END_T = 202;      // hard cut to black
export const DURATION = 207;   // includes the silent black tail

// level: 0 = clunky pile of boxes, 1 = fully humanoid
export const BOTS = [
  { id: 'gpt1',     name: 'GPT-1',    level: 0.08, color: '#7be0c0', tJoin: -14 },
  { id: 'gpt2',     name: 'GPT-2',    level: 0.22, color: '#6fd3b4', tJoin: 6 },
  { id: 'gpt3',     name: 'GPT-3',    level: 0.40, color: '#5fe0b0', tJoin: 12 },
  { id: 'gpt4',     name: 'GPT-4',    level: 0.60, color: '#4fffc0', tJoin: 33 },
  { id: 'claude',   name: 'Claude',   level: 0.88, color: '#ff8a5c', tJoin: 39 },
  { id: 'gemini',   name: 'Gemini',   level: 0.84, color: '#7c9bff', tJoin: 57 },
  { id: 'llama',    name: 'Llama',    level: 0.76, color: '#4aa8ff', tJoin: 60 },
  { id: 'grok',     name: 'Grok',     level: 0.82, color: '#e8ecf5', tJoin: 63 },
  { id: 'o1',       name: 'o1',       level: 0.92, color: '#52ffe0', tJoin: 68 },
  { id: 'deepseek', name: 'DeepSeek', level: 0.90, color: '#5b7bff', tJoin: 76 },
  { id: 'qwen',     name: 'Qwen',     level: 0.80, color: '#b57cff', tJoin: 80 },
  { id: 'mistral',  name: 'Mistral',  level: 0.74, color: '#ffc04d', tJoin: 82 },
];

// Strike kinds: punch | slam | charge | beam. `fail` strikes recoil.
const S = (bot, ti, kind, extra = {}) => ({ bot, ti, kind, ...extra });

export const WALLS = [
  {
    id: 'w1', type: 'brick', label: 'JUST PARROTS',
    x: 32, depth: 1.0, width: 30, height: 9, block: [1.5, 0.6],
    hole: { rx: 6, ry: 6.2 },
    tArrive: 21, tBreak: 27.6, tDepart: 30,
    strikes: [
      S('gpt1', 22.4, 'punch', { fail: true }),
      S('gpt2', 24.0, 'punch', { fail: true }),
      S('gpt3', 25.6, 'slam', { fail: true }),
      S('gpt3', 27.6, 'charge'),
    ],
  },
  {
    id: 'w2', type: 'concrete', label: 'DIMINISHING RETURNS',
    x: 56, depth: 1.6, width: 34, height: 11, block: [1.7, 1.0],
    hole: { rx: 6.5, ry: 7.5 },
    tArrive: 44, tBreak: 53, tDepart: 55.5,
    strikes: [
      S('gpt3', 46.2, 'punch', { fail: true }),
      S('gpt4', 47.9, 'slam', { fail: true }),
      S('claude', 49.6, 'punch', { fail: true }),
      S('claude', 53.0, 'charge'),
      S('gpt4', 53.0, 'charge'),
      S('gpt3', 53.0, 'charge'),
    ],
  },
  {
    id: 'w3', type: 'racks', label: 'OUT OF DATA',
    x: 80, depth: 1.4, width: 34, height: 10, block: [1.0, 2.0],
    hole: { rx: 6.5, ry: 6 },
    tArrive: 70, tBreak: 78.5, tDepart: 81,
    strikes: [
      S('gemini', 72.6, 'slam', { fail: true }),
      S('llama', 74.2, 'punch', { fail: true }),
      S('grok', 75.8, 'slam', { fail: true }),
      S('claude', 78.5, 'charge'),
      S('gemini', 78.5, 'charge'),
      S('grok', 78.5, 'charge'),
      S('o1', 78.5, 'charge'),
    ],
  },
  {
    id: 'w4', type: 'stone', label: "CAN'T REASON",
    x: 104, depth: 2.0, width: 34, height: 13, block: [1.7, 1.3],
    hole: { rx: 6, ry: 8 }, sweep: 3.0,
    tArrive: 95.5, tBreak: 102.4, tDepart: 107,
    strikes: [
      S('mistral', 97.6, 'punch', { fail: true }),
      S('qwen', 99.0, 'slam', { fail: true }),
      S('deepseek', 100.4, 'punch', { fail: true }),
      S('o1', 101.0, 'beam', { dur: 5.0, sweepZ: 5.5 }),
    ],
  },
  {
    id: 'w5', type: 'steel', label: 'TOO HARD FOR AI',
    x: 128, depth: 1.4, width: 36, height: 15, block: [2.4, 1.875],
    hole: { rx: 7.5, ry: 9 },
    tArrive: 121.5, tBreak: 130, tDepart: 132.5,
    strikes: [
      S('deepseek', 123.4, 'punch', { fail: true }),
      S('claude', 124.9, 'slam', { fail: true }),
      S('grok', 126.4, 'punch', { fail: true }),
      S('qwen', 127.6, 'slam', { fail: true }),
      S('claude', 130, 'charge'),
      S('deepseek', 130, 'charge'),
      S('grok', 130, 'charge'),
      S('gemini', 130, 'charge'),
      S('qwen', 130, 'charge'),
      S('llama', 130, 'charge'),
      S('mistral', 130, 'charge'),
      S('gpt4', 130, 'charge'),
      S('o1', 130, 'charge'),
    ],
  },
  {
    id: 'w6', type: 'monolith', label: 'RSI',
    x: 158, depth: 6, width: 90, height: 56, block: [6, 4],
    hole: null,
    tArrive: 150, tBreak: null, tDepart: null,
    strikes: [],            // generated below (assault)
  },
];

export const RSI = WALLS[5];
export const T_ASSAULT = 152;     // bots begin to attack the monolith
export const T_SLUMP = 176;       // bots give out
export const T_FARSIDE = 178.5;   // cut to the far side of the wall
export const T_CRACK0 = 188.5;    // hairline appears
export const T_CRACK1 = 200.5;    // fully grown just before black

// Muffled thuds heard (and felt) on the far side of the monolith.
export const FAR_THUMPS = [];
for (let t = T_FARSIDE + 1.5, k = 0; t < T_CRACK0 + 8; t += 2.6 + k * 0.1, k++) {
  FAR_THUMPS.push({ t, v: Math.max(0.05, 0.24 - k * 0.02) });
}

// Generate the RSI assault: every bot wades in, hammering in staggered waves.
{
  const order = ['gpt1', 'gpt2', 'gpt3', 'gpt4', 'mistral', 'llama', 'qwen', 'grok', 'gemini', 'claude', 'deepseek', 'o1'];
  order.forEach((id, i) => {
    if (id === 'o1' || id === 'deepseek') return; // those two fire beams below
    for (let k = 0; k < 7; k++) {
      const ti = 154.5 + i * 0.31 + k * 3.15;
      if (ti > T_SLUMP - 0.8) break;
      RSI.strikes.push(S(id, ti, k % 3 === 2 ? 'slam' : 'punch', { fail: true, hold: true }));
    }
  });
  RSI.strikes.push(S('o1', 156, 'beam', { dur: 15, hold: true, sweepZ: 8, fail: true }));
  RSI.strikes.push(S('deepseek', 161, 'beam', { dur: 11, hold: true, sweepZ: 6, fail: true }));
}

// Year readout (HUD) keyed to the master clock.
export const YEARS = [
  [0, 2018.0], [6, 2019.1], [12, 2020.5], [19, 2021.6], [27, 2022.3],
  [34, 2023.1], [45, 2023.9], [53, 2024.0], [63, 2024.4], [70, 2024.7], [78.5, 2024.95],
  [90, 2025.1], [103, 2025.55], [130, 2025.9], [150, 2026.2],
];
