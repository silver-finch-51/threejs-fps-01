// state.js — every piece of mutable match state lives in the single object G, created here.
// Modules read and write G; nothing keeps a second copy of the truth. CFG holds the tuning
// constants (round lengths, economy, team sizes) that never change at runtime.

import { mulberry32 } from './rng.js';

export const TEAM = { EMBER: 'ember', WARD: 'ward' };

export const CFG = {
  teamSize: 5,
  roundsToWin: 7,
  maxRounds: 13,
  buySeconds: 15,
  roundSeconds: 115,
  bombSeconds: 40,
  plantSeconds: 3.2,
  defuseSeconds: 5,
  roundEndSeconds: 5,
  startMoney: 800,
  maxMoney: 16000,
  winElimination: 3250,
  winObjective: 3500,
  lossBase: 1400,
  lossStep: 500,
  lossMax: 3400,
  killReward: 300,
  plantReward: 300,
  defuseReward: 300,
  simDt: 1 / 60,
};

export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  PLANTED: 'planted',
  ROUND_OVER: 'roundover',
  MATCH_OVER: 'matchover',
};

// The one match state. Fields are grouped: clock/phase, score, actors, the bomb, transient
// per-tick channels (noises, feed) and the seeded rng.
export const G = {
  phase: PHASE.MENU,
  phaseT: 0, // seconds left in the current phase
  round: 0,
  score: { ember: 0, ward: 0 },
  lossStreak: { ember: 0, ward: 0 },
  actors: [], // player first (index 0), then bots
  player: null,
  bomb: null, // { state, carrier, pos, site, plantT, defuseT, defuser }
  noises: [], // { x, z, radius, team, kind } heard this tick
  feed: [], // killfeed entries { text, t }
  messages: [], // center-screen announcements { text, sub, t }
  rng: mulberry32(1),
  time: 0, // simulated seconds since match start
  winner: null, // match winner team, once decided
  lastRound: null, // { winner, reason } for the round-over banner
  shake: 0, // camera shake impulse for the player
  slowmo: 1,
};

export function resetMatch(seed) {
  G.phase = PHASE.MENU;
  G.phaseT = 0;
  G.round = 0;
  G.score.ember = 0;
  G.score.ward = 0;
  G.lossStreak.ember = 0;
  G.lossStreak.ward = 0;
  G.actors.length = 0;
  G.player = null;
  G.bomb = null;
  G.noises.length = 0;
  G.feed.length = 0;
  G.messages.length = 0;
  G.rng = mulberry32(seed);
  G.time = 0;
  G.winner = null;
  G.lastRound = null;
  G.shake = 0;
}

export function aliveActors(team) {
  return G.actors.filter((a) => a.alive && (team === undefined || a.team === team));
}

export function announce(text, sub, seconds) {
  G.messages.push({ text, sub: sub ?? '', t: seconds ?? 2.6 });
}

export function addFeed(text) {
  G.feed.push({ text, t: 5 });
  if (G.feed.length > 6) G.feed.shift();
}

export function makeNoise(x, z, radius, team, kind) {
  G.noises.push({ x, z, radius, team, kind, t: G.time });
}
