// The score. Everything is synthesised with Web Audio and pre-scheduled against
// the AudioContext clock, so music and picture stay locked to the same time.
// Idea: every bot that joins adds an instrument; every wall break is a hit;
// the finale strips everything away to a drone, a crack, and silence.
import { BOTS, WALLS, RSI, END_T, T_ASSAULT, T_SLUMP, T_FARSIDE, T_CRACK0, FAR_THUMPS } from './timeline.js';
import { mulberry32 } from './sim.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Dm - Bb - Gm - A, eight seconds each
const CHORDS = [
  { root: 38, tones: [0, 7, 12, 15, 19, 24] },
  { root: 34, tones: [0, 7, 12, 16, 19, 24] },
  { root: 43, tones: [0, 7, 12, 15, 19, 24] },
  { root: 33, tones: [0, 7, 12, 16, 19, 24] },
];
const chordAt = (t) => CHORDS[Math.floor(Math.max(0, t) / 8) % 4];
const BPM = [[0, 54], [40, 60], [80, 70], [120, 82], [150, 96], [176, 60]];
function bpmAt(t) {
  for (let i = 1; i < BPM.length; i++) if (t <= BPM[i][0]) { const [a, x] = BPM[i - 1], [b, y] = BPM[i]; return x + (y - x) * (t - a) / (b - a); }
  return BPM[BPM.length - 1][1];
}

export function buildScore(ctx, dest, t0 = 0) {
  const rnd = mulberry32(2025);
  const T = (t) => t0 + t;

  // --- buses ------------------------------------------------------------------
  const master = ctx.createGain(); master.gain.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.25;
  const limiter = ctx.createDynamicsCompressor(); // catch the peaks the glue compressor lets through
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
  master.connect(comp); comp.connect(limiter); limiter.connect(dest);

  const music = ctx.createGain(); music.gain.value = 1; music.connect(master);
  const rev = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 4.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  rev.buffer = ir;
  const revSend = ctx.createGain(); revSend.gain.value = 1;
  const revOut = ctx.createGain(); revOut.gain.value = 0.55;
  revSend.connect(rev); rev.connect(revOut); revOut.connect(master);

  // noise source
  const nlen = ctx.sampleRate * 3;
  const nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
  { const d = nbuf.getChannelData(0); for (let i = 0; i < nlen; i++) d[i] = rnd() * 2 - 1; }

  // bit-crusher curve for the primitive models
  const crush = ctx.createWaveShaper();
  { const n = 256, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.round(x * 5) / 5; } crush.curve = c; }
  const crushBus = ctx.createGain(); crushBus.gain.value = 1;
  crushBus.connect(crush); crush.connect(music);

  const wet = (node, send = 0.3) => { const g = ctx.createGain(); g.gain.value = send; node.connect(g); g.connect(revSend); };

  // --- voice helpers ----------------------------------------------------------
  function osc(type, freq, a, b, detune = 0) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    o.start(T(a)); o.stop(T(b));
    return o;
  }
  function pluck(f, t, dur, { type = 'triangle', vol = 0.1, cut = 3000, q = 1, bus = music, send = 0.25, det = 0 } = {}) {
    const o = osc(type, f, t, t + dur + 0.1, det);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = q;
    lp.frequency.setValueAtTime(cut * 3, T(t)); lp.frequency.exponentialRampToValueAtTime(cut, T(t + 0.15));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t)); g.gain.linearRampToValueAtTime(vol, T(t + 0.006));
    g.gain.exponentialRampToValueAtTime(0.0002, T(t + dur));
    o.connect(lp); lp.connect(g); g.connect(bus); wet(g, send);
  }
  function pad(freqs, t, dur, { type = 'sawtooth', vol = 0.05, cut = 1200, att = 1.5, rel = 2, bus = music, send = 0.45, spread = 7, vib = 0 } = {}) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut; lp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t));
    g.gain.linearRampToValueAtTime(vol, T(t + att));
    g.gain.setValueAtTime(vol, T(t + dur - rel));
    g.gain.linearRampToValueAtTime(0.0001, T(t + dur));
    lp.connect(g); g.connect(bus); wet(g, send);
    for (const f of freqs) for (const d of [-spread, spread]) {
      const o = osc(type, f, t, t + dur + 0.05, d);
      if (vib) { const l = ctx.createOscillator(); l.frequency.value = 5.2; const lg = ctx.createGain(); lg.gain.value = vib; l.connect(lg); lg.connect(o.detune); l.start(T(t)); l.stop(T(t + dur + 0.05)); }
      o.connect(lp);
    }
  }
  function noise(t, dur, { type = 'lowpass', f0 = 800, f1 = f0, q = 0.7, vol = 0.2, att = 0.005, bus = music, send = 0.3, shape = 'exp' } = {}) {
    const s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true;
    s.start(T(t), rnd() * 2); s.stop(T(t + dur + 0.05));
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, T(t)); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), T(t + dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t)); g.gain.linearRampToValueAtTime(vol, T(t + att));
    if (shape === 'exp') g.gain.exponentialRampToValueAtTime(0.0002, T(t + dur)); else g.gain.linearRampToValueAtTime(0.0001, T(t + dur));
    s.connect(f); f.connect(g); g.connect(bus); wet(g, send);
  }
  function boom(t, { vol = 0.9, f0 = 90, f1 = 30, dur = 1.8 } = {}) {
    const o = osc('sine', f0, t, t + dur + 0.1);
    o.frequency.setValueAtTime(f0, T(t)); o.frequency.exponentialRampToValueAtTime(f1, T(t + dur * 0.8));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(t)); g.gain.linearRampToValueAtTime(vol, T(t + 0.01)); g.gain.exponentialRampToValueAtTime(0.0003, T(t + dur));
    o.connect(g); g.connect(master); wet(g, 0.5);
  }
  function kick(t, vol = 0.5) { boom(t, { vol, f0: 120, f1: 40, dur: 0.45 }); noise(t, 0.04, { type: 'highpass', f0: 2000, vol: vol * 0.25, send: 0.05 }); }
  function tom(t, f = 90, vol = 0.4) { boom(t, { vol, f0: f * 1.6, f1: f, dur: 0.55 }); noise(t, 0.08, { type: 'bandpass', f0: 600, vol: vol * 0.2, send: 0.2 }); }
  function clang(t, vol = 0.18) {
    for (const [f, m] of [[310, 1], [517, 0.7], [803, 0.5], [1250, 0.35]]) {
      pluck(f * (0.97 + rnd() * 0.06), t, 1.6, { type: 'square', vol: vol * m, cut: 3500, q: 6, send: 0.5 });
    }
    noise(t, 0.12, { type: 'bandpass', f0: 3200, vol: vol * 0.7, send: 0.3 });
  }

  // --- the drone ---------------------------------------------------------------
  {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T(0)); g.gain.linearRampToValueAtTime(0.16, T(6));
    g.gain.linearRampToValueAtTime(0.26, T(130)); g.gain.linearRampToValueAtTime(0.34, T(T_SLUMP));
    g.gain.linearRampToValueAtTime(0.22, T(T_FARSIDE)); g.gain.linearRampToValueAtTime(0.12, T(T_CRACK0));
    g.gain.linearRampToValueAtTime(0.5, T(END_T - 0.1)); g.gain.setValueAtTime(0.0001, T(END_T));
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(90, T(0)); lp.frequency.linearRampToValueAtTime(260, T(100));
    lp.frequency.linearRampToValueAtTime(520, T(T_SLUMP)); lp.frequency.linearRampToValueAtTime(140, T(T_FARSIDE + 2));
    lp.frequency.linearRampToValueAtTime(900, T(END_T - 0.1));
    lp.connect(g); g.connect(music);
    for (const [f, ty, v] of [[36.7, 'sawtooth', 0.7], [36.9, 'sawtooth', 0.7], [73.4, 'sine', 0.8], [55, 'sawtooth', 0.35]]) {
      const o = osc(ty, f, 0, END_T + 0.1);
      const og = ctx.createGain(); og.gain.value = v; o.connect(og); og.connect(lp);
    }
    // slow pulse on the drone
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ctx.createGain(); lg.gain.value = 40; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(T(0)); lfo.stop(T(END_T));
  }

  // --- heartbeat / march ---------------------------------------------------------
  {
    let t = 3, beat = 0;
    while (t < T_SLUMP) {
      const strong = beat % 4 === 0, off = beat % 2 === 1;
      const early = t < 19;
      if (strong) kick(t, early ? 0.3 : 0.5);
      else if (!early && !off) kick(t, 0.22);
      if (t > 19 && off) noise(t, 0.12, { type: 'bandpass', f0: 1800, vol: 0.05, send: 0.2 });
      if (t > 44 && beat % 4 === 3) tom(t + 0.5 * 60 / bpmAt(t), 110, 0.22);
      if (t > 95 && t < T_ASSAULT) for (let k = 1; k < 4; k++) noise(t + k * 0.25 * 60 / bpmAt(t), 0.05, { type: 'highpass', f0: 6000, vol: 0.035, send: 0.1 });
      t += 60 / bpmAt(t); beat++;
    }
    // assault clock: accelerating ticks
    let tt = T_ASSAULT, dt = 0.5;
    while (tt < T_SLUMP) {
      noise(tt, 0.04, { type: 'highpass', f0: 4000, vol: 0.06, send: 0.1 });
      if (Math.round((tt - T_ASSAULT) / dt) % 4 === 0) kick(tt, 0.45);
      tt += dt; dt = Math.max(0.17, dt * 0.985);
    }
  }

  // --- the bots: one instrument each --------------------------------------------
  const fade = (t) => (t >= T_SLUMP ? 0 : 1);
  function botMusic(bot) {
    const start = Math.ceil(Math.max(bot.tJoin + 3, 1.5));
    const vol = (v) => v;
    switch (bot.id) {
      case 'gpt1': // crude bit-crushed plinks that sometimes fail to play
        for (let t = start; t < T_SLUMP; t += 1) {
          if (rnd() < 0.3) continue;
          const c = chordAt(t);
          pluck(mtof(c.root + 24 + c.tones[Math.floor(rnd() * 3)]), t, 0.5, { type: 'square', vol: 0.045, cut: 2200, bus: crushBus, det: (rnd() - 0.5) * 70, send: 0.15 });
        }
        break;
      case 'gpt2':
        for (let t = start + 0.5; t < T_SLUMP; t += 1) {
          if (rnd() < 0.2) continue;
          const c = chordAt(t);
          pluck(mtof(c.root + 24 + c.tones[2 + Math.floor(rnd() * 3)]), t, 0.45, { type: 'square', vol: 0.04, cut: 2600, bus: crushBus, det: (rnd() - 0.5) * 40 });
        }
        break;
      case 'gpt3': {
        let i = 0;
        for (let t = start; t < T_SLUMP; t += 0.5, i++) {
          const c = chordAt(t); const seq = [0, 2, 1, 3, 2, 4, 3, 2];
          pluck(mtof(c.root + 24 + c.tones[seq[i % 8]]), t, 0.6, { type: 'sawtooth', vol: 0.045, cut: 1600, q: 3 });
        }
        break;
      }
      case 'gpt4':
        for (let t = Math.ceil(start / 8) * 8; t < T_SLUMP; t += 8) {
          const c = chordAt(t); pad(c.tones.slice(0, 4).map((x) => mtof(c.root + 12 + x)), t, 8.5, { vol: 0.03, cut: 1400, att: 2.5, rel: 2.5 });
        }
        break;
      case 'claude': { // warm cello line, long notes
        const mel = [4, 3, 2, 3, 4, 5, 4, 2];
        let i = 0;
        for (let t = Math.ceil(start / 4) * 4; t < T_SLUMP; t += 4, i++) {
          const c = chordAt(t);
          pad([mtof(c.root + 24 + c.tones[mel[i % 8]])], t, 4.3, { type: 'sawtooth', vol: 0.06, cut: 1700, att: 0.7, rel: 1.4, spread: 5, vib: 7, send: 0.5 });
        }
        break;
      }
      case 'gemini':
        for (let t = Math.ceil(start / 4) * 4; t < T_SLUMP; t += 4) {
          const c = chordAt(t);
          [0, 2, 4].forEach((k, j) => pluck(mtof(c.root + 48 + c.tones[k]), t + j * 0.25, 2.4, { type: 'sine', vol: 0.05, cut: 6000, send: 0.6 }));
        }
        break;
      case 'llama': {
        let i = 0;
        for (let t = start; t < T_SLUMP; t += 0.25, i++) {
          if (i % 3 === 1 || rnd() < 0.35) continue;
          const c = chordAt(t);
          pluck(mtof(c.root + 36 + c.tones[(i * 2) % 5]), t, 0.3, { type: 'triangle', vol: 0.06, cut: 2400, send: 0.2 });
        }
        break;
      }
      case 'grok':
        for (let t = start; t < T_SLUMP; t += 0.5) {
          const c = chordAt(t);
          pluck(mtof(c.root + (Math.floor(t * 2) % 4 === 3 ? 7 : 0)), t, 0.4, { type: 'square', vol: 0.07, cut: 380, q: 4, send: 0.05 });
        }
        break;
      case 'o1': { // the reasoning model: fast climbing sequences
        let i = 0;
        for (let t = start; t < T_SLUMP; t += 0.125, i++) {
          const c = chordAt(t);
          pluck(mtof(c.root + 36 + c.tones[[0, 1, 2, 3, 4, 3, 2, 1][i % 8]]), t, 0.2, { type: 'sawtooth', vol: 0.03 + 0.012 * Math.min(1, (t - start) / 40), cut: 2800, q: 5, send: 0.3 });
        }
        break;
      }
      case 'deepseek':
        for (let t = start; t < T_SLUMP; t += 2) { tom(t, 70, 0.3); tom(t + 1.5, 82, 0.2); }
        break;
      case 'qwen':
        for (let t = Math.ceil(start / 4) * 4; t < T_SLUMP; t += 8) {
          const c = chordAt(t);
          pad([mtof(c.root + 48 + c.tones[2]), mtof(c.root + 48 + c.tones[4])], t + 2, 5, { type: 'sine', vol: 0.05, cut: 5000, att: 0.8, rel: 1.5, spread: 3, vib: 9, send: 0.6 });
        }
        break;
      case 'mistral':
        for (let t = Math.ceil(start / 8) * 8; t < T_SLUMP; t += 8) {
          noise(t, 7.5, { type: 'bandpass', f0: 500, f1: 2400, q: 6, vol: 0.05, att: 3.5, send: 0.7, shape: 'lin' });
        }
        break;
    }
  }
  BOTS.forEach(botMusic);

  // ducking helper: dip the music bus right before a big hit
  function dip(tHit, dur = 0.35) {
    music.gain.setValueAtTime(1, T(tHit - dur - 0.02));
    music.gain.linearRampToValueAtTime(0.12, T(tHit - dur));
    music.gain.setValueAtTime(0.12, T(tHit - 0.02));
    music.gain.linearRampToValueAtTime(1, T(tHit + 0.5));
  }

  // --- walls -------------------------------------------------------------------
  WALLS.slice(0, 5).forEach((w, i) => {
    const tb = w.tBreak, R = 6.5;
    // riser
    noise(tb - R, R, { type: 'bandpass', f0: 200, f1: 5200, q: 1.5, vol: 0.28, att: R * 0.9, send: 0.5, shape: 'lin' });
    const o = osc('sawtooth', 110, tb - R, tb);
    o.frequency.setValueAtTime(110, T(tb - R)); o.frequency.exponentialRampToValueAtTime(880, T(tb - 0.35));
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, T(tb - R)); lp.frequency.exponentialRampToValueAtTime(5000, T(tb - 0.35));
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T(tb - R)); g.gain.linearRampToValueAtTime(0.1 + 0.02 * i, T(tb - 0.4)); g.gain.linearRampToValueAtTime(0.0001, T(tb - 0.3));
    o.connect(lp); lp.connect(g); g.connect(master); wet(g, 0.5);
    dip(tb, 0.3);
    // the break
    const big = 0.8 + 0.08 * i;
    boom(tb, { vol: big, f0: 95, f1: 28, dur: 2.2 });
    noise(tb, 1.6, { type: 'lowpass', f0: 1800, f1: 120, vol: 0.55, send: 0.6 });
    noise(tb, 0.5, { type: 'bandpass', f0: 2600, f1: 900, q: 1, vol: 0.4, send: 0.3 });
    clang(tb + 0.02, 0.1);
    // brass stab
    const c = chordAt(tb);
    pad([c.root + 12, c.root + 19, c.root + 24, c.root + 28].map(mtof), tb, 3.4, { type: 'sawtooth', vol: 0.09, cut: 1800, att: 0.04, rel: 2.6, spread: 9, send: 0.5 });
    // failed strikes: dull thuds
    for (const s of w.strikes) {
      if (s.ti === tb || s.kind === 'beam') continue;
      boom(s.ti, { vol: 0.35 + (s.kind === 'slam' ? 0.15 : 0), f0: 110, f1: 45, dur: 0.5 });
      noise(s.ti, 0.18, { type: 'bandpass', f0: 900, vol: 0.18, send: 0.25 });
    }
  });
  // reasoning beam at wall 4
  {
    const b = WALLS[3].strikes.find((s) => s.kind === 'beam');
    const o = osc('sawtooth', 220, b.ti, b.ti + b.dur);
    o.frequency.setValueAtTime(220, T(b.ti)); o.frequency.exponentialRampToValueAtTime(1100, T(b.ti + 1.4));
    o.frequency.setValueAtTime(1100, T(b.ti + 1.4)); o.frequency.linearRampToValueAtTime(1500, T(b.ti + b.dur));
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T(b.ti)); g.gain.linearRampToValueAtTime(0.07, T(b.ti + 0.4)); g.gain.setValueAtTime(0.07, T(b.ti + b.dur - 0.6)); g.gain.linearRampToValueAtTime(0.0001, T(b.ti + b.dur));
    const lfo = ctx.createOscillator(); lfo.frequency.value = 36; const lg = ctx.createGain(); lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency); lfo.start(T(b.ti)); lfo.stop(T(b.ti + b.dur));
    o.connect(lp); lp.connect(g); g.connect(music); wet(g, 0.4);
  }

  // --- the monolith ------------------------------------------------------------
  {
    // reveal: low brass tritone swell
    for (const [f, d] of [[38, 0], [44, 0.0], [50, 0]]) {
      pad([mtof(f), mtof(f + 12)], 134 + d, 20, { type: 'sawtooth', vol: 0.07, cut: 700, att: 10, rel: 3, spread: 12, send: 0.6 });
    }
    boom(T_ASSAULT - 0.05, { vol: 0.9, f0: 70, f1: 25, dur: 3 });
    // strikes: thud + clang
    for (const s of RSI.strikes) {
      if (s.kind === 'beam') {
        const o = osc('sawtooth', 600, s.ti, s.ti + s.dur);
        o.frequency.setValueAtTime(600, T(s.ti)); o.frequency.linearRampToValueAtTime(1300, T(s.ti + s.dur));
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, T(s.ti)); g.gain.linearRampToValueAtTime(0.03, T(s.ti + 1)); g.gain.setValueAtTime(0.03, T(s.ti + s.dur - 1)); g.gain.linearRampToValueAtTime(0.0001, T(s.ti + s.dur));
        o.connect(lp); lp.connect(g); g.connect(music); wet(g, 0.5);
        continue;
      }
      boom(s.ti, { vol: 0.28, f0: 100, f1: 40, dur: 0.6 });
      if (rnd() < 0.6) clang(s.ti, 0.045);
    }
    // choir that builds through the assault, then dies with the bots
    const ch = [50, 57, 62, 65, 69, 74];
    pad(ch.map(mtof), T_ASSAULT, T_SLUMP - T_ASSAULT + 2, { type: 'sawtooth', vol: 0.05, cut: 1500, att: 14, rel: 3, spread: 10, send: 0.65 });
    pad(ch.map((m) => mtof(m - 12)), T_ASSAULT + 6, T_SLUMP - T_ASSAULT - 4, { type: 'sawtooth', vol: 0.05, cut: 1100, att: 12, rel: 3, spread: 12, send: 0.65 });
  }

  // --- far side: stillness, muffled thuds, wind, the crack ---------------------------
  {
    noise(T_FARSIDE, END_T - T_FARSIDE, { type: 'bandpass', f0: 380, f1: 520, q: 1.2, vol: 0.05, att: 3, send: 0.6, shape: 'lin' });
    for (const { t, v } of FAR_THUMPS) {
      boom(t, { vol: v, f0: 62, f1: 30, dur: 1.2 });
      noise(t, 0.4, { type: 'lowpass', f0: 220, f1: 80, vol: v * 0.8, send: 0.7 });
    }
    // the crack: ticks, a glassy shimmer, then the whole choir
    for (let k = 0; k < 14; k++) {
      const t = T_CRACK0 + k * (0.9 - k * 0.04) + rnd() * 0.2;
      noise(t, 0.05, { type: 'highpass', f0: 5000, vol: 0.12, send: 0.5 });
      pluck(2400 + rnd() * 3500, t, 0.9, { type: 'sine', vol: 0.03 + k * 0.004, cut: 9000, send: 0.8 });
    }
    for (const [f, v] of [[1174.7, 0.03], [1760, 0.025], [2349, 0.02], [3520, 0.015]]) {
      pad([f], T_CRACK0 + 1, END_T - T_CRACK0 - 1, { type: 'sine', vol: v, cut: 9000, att: 9, rel: 0.05, spread: 4, send: 0.8 });
    }
    const swell = [38, 45, 50, 53, 57, 62, 65, 69, 74];
    pad(swell.map(mtof), T_CRACK0 + 3, END_T - T_CRACK0 - 3, { type: 'sawtooth', vol: 0.08, cut: 2600, att: 9, rel: 0.02, spread: 14, send: 0.55 });
    // silence on the cut, then a single sub tone you feel more than hear
    music.gain.setValueAtTime(1, T(END_T - 0.001)); music.gain.linearRampToValueAtTime(0.0001, T(END_T));
    revOut.gain.setValueAtTime(0.55, T(END_T - 0.001)); revOut.gain.linearRampToValueAtTime(0.0001, T(END_T + 0.02));
    boom(END_T + 0.05, { vol: 0.5, f0: 48, f1: 22, dur: 3.6 });
  }

  return { master };
}

// --- playback wrapper --------------------------------------------------------------
// A looping silent <audio> element flips iOS into its "playback" audio session,
// so Web Audio is heard even with the ringer switch on silent.
function silentWavUri() {
  const n = 8000, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44);
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return 'data:audio/wav;base64,' + btoa(s);
}

export function createAudio() {
  let ctx = null, start = 0;
  return {
    get ready() { return !!ctx; },
    get ctx() { return ctx; },
    start() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
      try { const a = new Audio(silentWavUri()); a.loop = true; a.play().catch(() => {}); } catch (e) { /* optional */ }
      ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      start = ctx.currentTime + 1.6; // headroom: scheduling the whole score takes a moment (longer on phones)
      buildScore(ctx, ctx.destination, start);
      return true;
    },
    // film time according to the audio clock
    time() { return ctx ? ctx.currentTime - start : null; },
    stop() { if (ctx) ctx.close(); ctx = null; },
  };
}

// Render the score offline to a 16-bit WAV (used by tools/capture.mjs).
export async function renderWav(seconds = END_T + 5, sr = 44100) {
  const ctx = new OfflineAudioContext(2, Math.floor(seconds * sr), sr);
  buildScore(ctx, ctx.destination, 0);
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const out = new DataView(new ArrayBuffer(44 + L.length * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + L.length * 4, true); w(8, 'WAVEfmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, L.length * 4, true);
  for (let i = 0; i < L.length; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  return out.buffer;
}
