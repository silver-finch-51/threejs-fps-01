// shots.js — deterministic scenes for the entry's screenshots, reached with ?shot=<name>.
// Each scene starts a real match, then poses the actors, the clock and the HUD into one
// honest frame of the game: a mid-lane firefight, the buy phase, a plant in progress, and
// a round-end banner. Nothing is composited — the capture is the game rendering itself.

import { G, PHASE, TEAM, announce, addFeed } from './state.js';
import { createMatch, startMatch } from './rounds.js';
import { giveWeapon, switchTo } from './weapons.js';
import { forceBuyOpen } from './hud.js';
import * as fx from './effects.js';

function place(actor, x, z, yaw, pitch = 0) {
  actor.pos.set(x, 0, z);
  actor.yaw = yaw;
  actor.pitch = pitch;
}

function arm(actor, weaponId, mag) {
  if (weaponId) {
    giveWeapon(actor, weaponId);
    switchTo(actor, 'primary');
    if (mag !== undefined) actor.loadout.primary.mag = mag;
  }
}

function byName(name) {
  return G.actors.find((a) => a.name === name);
}

export function setupShotScene(name) {
  createMatch(7);
  startMatch();
  const p = G.player;
  arm(p, 'longbow', 24);
  p.money = 2750;

  if (name === 'buy') {
    G.phase = PHASE.BUY;
    G.phaseT = 11;
    p.money = 4350;
    place(p, 0, 33.2, 0.1);
    place(byName('Vex'), -6, 24, -0.2);
    place(byName('Onyx'), 5, 22, 0.3);
    place(byName('Rook'), -11, 26, 0);
    place(byName('Sable'), 10, 27, -0.3);
    forceBuyOpen(true);
    announce('Round 1', 'Buy phase — press B', 99);
    return;
  }

  if (name === 'plant') {
    G.phase = PHASE.LIVE;
    G.phaseT = 38;
    place(p, -17.5, -17.5, 1.0, -0.01);
    const carrier = G.bomb.carrier;
    place(carrier, -26, -23, 2.4);
    carrier.crouching = true;
    carrier.height = 1.24;
    carrier.channelKind = 'plant';
    G.bomb.plantT = 2.1;
    place(byName('Hale'), -8, -20.5, Math.PI + 0.4);
    arm(byName('Hale'), 'longbow');
    // The cover man must not be the carrier herself (with seed 7 the carrier is Vex,
    // and placing "Vex" again would teleport the planter out of frame).
    const cover = G.actors.find((a) => a.team === TEAM.EMBER && !a.isPlayer && a !== carrier);
    place(cover, -16, -10, 0.7);
    arm(cover, 'longbow');
    announce('Site A — Foundry', '', 99);
    return;
  }

  if (name === 'end') {
    G.phase = PHASE.ROUND_OVER;
    G.phaseT = 4.5;
    G.score.ember = 5;
    G.score.ward = 3;
    G.round = 9;
    G.lastRound = { winner: TEAM.EMBER, reason: 'detonation' };
    G.bomb.state = 'exploded';
    G.bomb.pos = { x: -24, z: -24 };
    place(p, -10, -8, 0.72, 0.03);
    p.health = 64;
    place(byName('Vex'), -14, -12, 0.7);
    const hale = byName('Hale');
    hale.alive = false;
    hale.health = 0;
    place(hale, -21, -19, 1.2);
    announce('EMBER WINS THE ROUND', 'charge detonated · 5 — 3', 99);
    setTimeout(() => fx.bombExplosion(-24, -24), 420);
    return;
  }

  // firefight (the cover): mid lane, two Ward crossing, a teammate alongside.
  G.phase = PHASE.LIVE;
  G.phaseT = 47;
  place(p, 0.5, 7.5, 0.15, 0.01);
  p.health = 82;
  const hale = byName('Hale');
  place(hale, -1.2, -2.5, Math.PI - 0.15);
  hale.health = 45;
  arm(hale, 'longbow');
  const moss = byName('Moss');
  place(moss, 4, -7, Math.PI + 0.3);
  arm(moss, 'ripper');
  const vex = byName('Vex');
  place(vex, -3.4, 10.5, 0.14);
  arm(vex, 'longbow', 30);
  G.hitmarkT = 99;
  G.hitmarkKill = false;
  addFeed('Vex ▸ Longbow AR ▸ Tern');
  addFeed('Quill ▸ Ripper-9 ▸ Onyx');
  G.messages.length = 0;
  // Tracers live for a fraction of a second, so re-fire them on a loop: whatever moment
  // the capture lands on, a fresh exchange is on screen.
  const exchange = () => {
    fx.tracer(-3.2, 1.5, 9.8, -1.3, 1.25, -2.2);
    fx.muzzle(-3.25, 1.5, 9.7, 0.05, -0.02, -1, false);
    fx.tracer(0.6, 1.45, 7.0, -1.25, 1.3, -2.3);
    fx.impact(-1.2, 1.1, -2.4);
    fx.impact(-1.0, 0.7, -2.6);
  };
  exchange();
  setInterval(exchange, 380);
}
