// rng.js — a tiny seeded random number generator (mulberry32) plus the few helpers the game
// uses everywhere. One generator lives in the match state and is re-seeded every round, so a
// round with the same seed plays out the same way — that is what makes the screenshot scenes
// (and any replay of a round) deterministic.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// A roughly gaussian spread sample in [-1, 1], for recoil and bot aim error.
export function randGauss(rng) {
  return (rng() + rng() + rng() - 1.5) * 0.6667;
}
