// Turns the CARDS data into world positions. Cards are world-fixed (the group
// walks past them) but must never sit inside a wall slab, so each one is
// clamped between the last wall that has fallen and the next that stands.
import { CARDS } from './content.js';
import { WALLS } from './timeline.js';
import { markerX, wallFaceX } from './sim.js';

export const CARD_SCALE = 1.35;

export function placedCards() {
  return CARDS.map((c) => {
    const w = (c.w || 10) * CARD_SCALE, half = w / 2;
    let x = markerX(c.t0 + 2) + c.dx;
    const next = WALLS.find((wl) => !wl.tBreak || wl.tBreak > c.t0 + 1.5);
    const prev = [...WALLS].reverse().find((wl) => wl.tBreak && wl.tBreak <= c.t0 + 1.5);
    if (next) x = Math.min(x, wallFaceX(next) - 0.8 - half);
    if (prev) x = Math.max(x, prev.x + prev.depth / 2 + 0.6 + half);
    return { ...c, w, x };
  });
}
