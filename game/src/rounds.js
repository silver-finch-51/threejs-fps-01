// rounds.js — the match itself: phases (buy → live → planted → round over), the round
// clock, win checks, the economy (win/loss pay, the escalating loss ladder, kill and
// objective rewards), bomb plant/defuse channels and pickups, and bot purchasing. It owns
// every rule about when a round starts and ends; bots and the player only express intent
// (wantPlant / wantDefuse), and this module validates and completes the actions.

import { G, CFG, PHASE, TEAM, resetMatch, announce, aliveActors } from './state.js';
import { SPAWNS, SITES, siteAt } from './map.js';
import { createActor } from './actor.js';
import { freshLoadout, WEAPONS, CATALOG } from './weapons.js';
import { EMBER_BOT_NAMES, WARD_BOT_NAMES, makeBrain, planRound, planPostPlant, botBuy } from './bots.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import * as fx from './effects.js';
import { randRange } from './rng.js';

export function createMatch(seed) {
  resetMatch(seed);
  const player = createActor({ name: 'You', team: TEAM.EMBER, isPlayer: true });
  player.money = CFG.startMoney;
  G.player = player;
  G.actors.push(player);
  for (const name of EMBER_BOT_NAMES) G.actors.push(makeBot(name, TEAM.EMBER));
  for (const name of WARD_BOT_NAMES) G.actors.push(makeBot(name, TEAM.WARD));
  return G.actors;
}

function makeBot(name, team) {
  const bot = createActor({ name, team });
  bot.money = CFG.startMoney;
  bot.brain = makeBrain();
  bot.skill = randRange(G.rng, 0.35, 0.75);
  bot.reaction = randRange(G.rng, 0.26, 0.42);
  return bot;
}

export function startMatch() {
  G.round = 0;
  G.score.ember = 0;
  G.score.ward = 0;
  for (const a of G.actors) {
    a.money = CFG.startMoney;
    a.kills = 0;
    a.deaths = 0;
    a.loadout = freshLoadout();
    a.armor = 0;
    a.helmet = false;
  }
  nextRound();
}

function nextRound() {
  G.round += 1;
  const rng = G.rng;
  // Respawn everyone at their team's points, facing the yard. Survivors keep their gear
  // and remaining armour; the dead start over with a sidearm.
  const counters = { ember: 0, ward: 0 };
  for (const a of G.actors) {
    const i = counters[a.team]++;
    const spawn = SPAWNS[a.team][i % SPAWNS[a.team].length];
    a.pos.set(spawn.x + randRange(rng, -0.4, 0.4), 0, spawn.z + randRange(rng, -0.4, 0.4));
    a.vel.set(0, 0, 0);
    a.yaw = a.team === TEAM.EMBER ? 0 : Math.PI;
    a.pitch = 0;
    a.alive = true;
    a.health = 100;
    a.deathT = 0;
    a.blindT = 0;
    a.channelKind = null;
    if (a.deaths > 0 && a.lostLoadout) {
      a.loadout = freshLoadout();
      a.armor = 0;
      a.helmet = false;
    }
    a.lostLoadout = false;
    if (a.brain) {
      a.brain.enemy = null;
      a.brain.state = 'advance';
      a.brain.grenadePlan = null;
      a.brain.lastSeenT = -99;
    }
  }
  // The charge goes to a random Ember bot.
  const emberBots = G.actors.filter((a) => a.team === TEAM.EMBER && !a.isPlayer);
  const carrier = emberBots[Math.floor(rng() * emberBots.length)];
  G.bomb = {
    state: 'carried', carrier, pos: null, site: null,
    plantT: 0, defuseT: 0, beepT: 0,
  };
  planRound();
  for (const a of G.actors) if (a.brain) botBuy(a);
  G.phase = PHASE.BUY;
  G.phaseT = CFG.buySeconds;
  announce(`Round ${G.round}`, 'Buy phase — press B', 2.2);
}

// ---- Buying (player) --------------------------------------------------------------

export function tryBuy(id) {
  const p = G.player;
  if (G.phase !== PHASE.BUY || !p.alive) return;
  const row = CATALOG.find((c) => c.id === id);
  if (!row || p.money < row.price) {
    sfx.denied();
    return;
  }
  const lo = p.loadout;
  if (id === 'vest') {
    if (p.armor >= 100) return;
    p.armor = 100;
  } else if (id === 'vesthelm') {
    if (p.armor >= 100 && p.helmet) return;
    p.armor = 100;
    p.helmet = true;
  } else if (id === 'frag' || id === 'flash' || id === 'smoke') {
    if (lo.grenades[id] >= 1) return;
    lo.grenades[id] += 1;
  } else {
    const def = WEAPONS[id];
    const owned = def.kind === 'primary' ? lo.primary : lo.sidearm;
    if (owned && owned.id === id) return;
    if (def.kind === 'primary') lo.primary = { id, mag: def.mag, reserve: def.reserve };
    else lo.sidearm = { id, mag: def.mag, reserve: def.reserve };
    lo.current = def.kind;
  }
  p.money -= row.price;
  sfx.buy();
}

// ---- Bomb channels ------------------------------------------------------------------

function actorStationary(a) {
  return Math.hypot(a.vel.x, a.vel.z) < 0.6;
}

function updateBomb(dt) {
  const bomb = G.bomb;
  if (!bomb) return;

  if (bomb.state === 'dropped') {
    for (const a of G.actors) {
      if (!a.alive || a.team !== TEAM.EMBER) continue;
      if (Math.hypot(a.pos.x - bomb.pos.x, a.pos.z - bomb.pos.z) < 1.2) {
        bomb.state = 'carried';
        bomb.carrier = a;
        bomb.pos = null;
        if (a.brain) a.brain.role = 'carrier';
        announce('Charge picked up', '', 1.2);
        break;
      }
    }
    return;
  }

  if (bomb.state === 'carried' && (G.phase === PHASE.LIVE)) {
    const carrier = bomb.carrier;
    const site = carrier && carrier.alive ? siteAt(carrier.pos.x, carrier.pos.z) : null;
    const wants = carrier && (carrier.isPlayer
      ? input.keys.has('KeyE')
      : carrier.wantPlant);
    if (carrier && carrier.alive && site && wants && actorStationary(carrier)) {
      carrier.channelKind = 'plant';
      bomb.plantT += dt;
      if (bomb.plantT >= CFG.plantSeconds) {
        bomb.state = 'planted';
        bomb.site = site.id;
        bomb.pos = { x: carrier.pos.x, z: carrier.pos.z };
        bomb.carrier = null;
        bomb.defuseT = 0;
        carrier.channelKind = null;
        carrier.money = Math.min(CFG.maxMoney, carrier.money + CFG.plantReward);
        G.phase = PHASE.PLANTED;
        G.phaseT = CFG.bombSeconds;
        announce('Charge planted', `Site ${site.id} — ${site.name}`, 2.4);
        sfx.plantDone();
        planPostPlant();
      }
    } else {
      bomb.plantT = Math.max(0, bomb.plantT - dt * 2.5);
      if (carrier) carrier.channelKind = null;
    }
    return;
  }

  if (bomb.state === 'planted') {
    // Beeps quicken as the timer runs down.
    bomb.beepT -= dt;
    const urgency = 1 - G.phaseT / CFG.bombSeconds;
    if (bomb.beepT <= 0) {
      bomb.beepT = 0.9 - urgency * 0.62;
      const d = G.player ? Math.hypot(G.player.pos.x - bomb.pos.x, G.player.pos.z - bomb.pos.z) : 99;
      sfx.beep(d, urgency > 0.85);
    }
    // Defuse channel: a Ward actor at the charge, holding intent, standing still.
    let defuser = null;
    for (const a of G.actors) {
      if (!a.alive || a.team !== TEAM.WARD) continue;
      const near = Math.hypot(a.pos.x - bomb.pos.x, a.pos.z - bomb.pos.z) < 2.3;
      const wants = a.isPlayer ? input.keys.has('KeyE') : a.wantDefuse;
      if (near && wants && actorStationary(a)) {
        defuser = a;
        break;
      }
    }
    if (defuser) {
      defuser.channelKind = 'defuse';
      bomb.defuseT += dt;
      if (bomb.defuseT >= CFG.defuseSeconds) {
        bomb.state = 'defused';
        defuser.channelKind = null;
        defuser.money = Math.min(CFG.maxMoney, defuser.money + CFG.defuseReward);
        endRound(TEAM.WARD, 'defuse');
      }
    } else {
      bomb.defuseT = Math.max(0, bomb.defuseT - dt * 2.5);
    }
  }
}

// ---- Phase machine --------------------------------------------------------------------

export function updateRounds(dt) {
  if (G.phase === PHASE.MENU || G.phase === PHASE.MATCH_OVER) return;
  G.phaseT -= dt;

  if (G.phase === PHASE.BUY) {
    if (G.phaseT <= 0) {
      G.phase = PHASE.LIVE;
      G.phaseT = CFG.roundSeconds;
      announce(`Round ${G.round}`, 'Live — good hunting', 1.6);
    }
    return;
  }

  if (G.phase === PHASE.LIVE || G.phase === PHASE.PLANTED) {
    updateBomb(dt);
    const emberAlive = aliveActors(TEAM.EMBER).length;
    const wardAlive = aliveActors(TEAM.WARD).length;
    if (G.phase === PHASE.LIVE) {
      if (wardAlive === 0) return endRound(TEAM.EMBER, 'elimination');
      if (emberAlive === 0) return endRound(TEAM.WARD, 'elimination');
      if (G.phaseT <= 0) return endRound(TEAM.WARD, 'time');
    } else {
      if (wardAlive === 0) return endRound(TEAM.EMBER, 'elimination');
      if (G.phaseT <= 0) {
        // Detonation.
        const bp = G.bomb.pos;
        fx.bombExplosion(bp.x, bp.z);
        sfx.explosion(G.player ? Math.hypot(G.player.pos.x - bp.x, G.player.pos.z - bp.z) : 99);
        G.bomb.state = 'exploded';
        return endRound(TEAM.EMBER, 'detonation');
      }
    }
    return;
  }

  if (G.phase === PHASE.ROUND_OVER) {
    if (G.phaseT <= 0) {
      const decided = G.score.ember >= CFG.roundsToWin || G.score.ward >= CFG.roundsToWin
        || G.round >= CFG.maxRounds;
      if (decided) {
        G.winner = G.score.ember > G.score.ward ? TEAM.EMBER : TEAM.WARD;
        G.phase = PHASE.MATCH_OVER;
        announce(
          G.winner === TEAM.EMBER ? 'EMBER TAKES THE YARD' : 'WARD HOLDS THE YARD',
          `Final score ${G.score.ember} — ${G.score.ward}`,
          6,
        );
        if (G.winner === TEAM.EMBER) sfx.roundWin(); else sfx.roundLose();
      } else {
        nextRound();
      }
    }
  }
}

function endRound(winner, reason) {
  const loser = winner === TEAM.EMBER ? TEAM.WARD : TEAM.EMBER;
  G.score[winner] += 1;
  G.lastRound = { winner, reason };
  // Economy: winners paid by how they won; losers climb the loss ladder.
  const winPay = reason === 'elimination' ? CFG.winElimination : CFG.winObjective;
  G.lossStreak[winner] = 0;
  G.lossStreak[loser] = Math.min(5, G.lossStreak[loser] + 1);
  const lossPay = Math.min(CFG.lossMax, CFG.lossBase + (G.lossStreak[loser] - 1) * CFG.lossStep);
  for (const a of G.actors) {
    a.money = Math.min(CFG.maxMoney, a.money + (a.team === winner ? winPay : lossPay));
    if (!a.alive) a.lostLoadout = true;
  }
  G.phase = PHASE.ROUND_OVER;
  G.phaseT = CFG.roundEndSeconds;
  const reasonText = {
    elimination: 'by elimination',
    detonation: 'charge detonated',
    defuse: 'charge defused',
    time: 'time expired',
  }[reason];
  announce(
    winner === TEAM.EMBER ? 'EMBER WINS THE ROUND' : 'WARD WINS THE ROUND',
    `${reasonText} · ${G.score.ember} — ${G.score.ward}`,
    3.4,
  );
  if (winner === TEAM.EMBER) sfx.roundWin(); else sfx.roundLose();
}

// For the HUD: what the centre of the screen should say about the bomb, if anything.
export function bombHint() {
  const bomb = G.bomb;
  if (!bomb) return null;
  if (bomb.state === 'carried' && bomb.carrier && bomb.carrier.isPlayer) {
    const site = siteAt(G.player.pos.x, G.player.pos.z);
    if (site) return { text: 'Hold E to plant the charge', progress: bomb.plantT / CFG.plantSeconds };
    return { text: 'You carry the charge — reach a site', progress: 0 };
  }
  if (bomb.state === 'planted' && G.player.team === TEAM.WARD) {
    const d = Math.hypot(G.player.pos.x - bomb.pos.x, G.player.pos.z - bomb.pos.z);
    if (d < 2.3) return { text: 'Hold E to defuse', progress: bomb.defuseT / CFG.defuseSeconds };
  }
  if (bomb.state === 'planted' && bomb.defuseT > 0) {
    return { text: 'Defuse in progress', progress: bomb.defuseT / CFG.defuseSeconds };
  }
  if (bomb.state === 'carried' && bomb.plantT > 0 && bomb.carrier) {
    return { text: `${bomb.carrier.name} is planting`, progress: bomb.plantT / CFG.plantSeconds };
  }
  return null;
}
