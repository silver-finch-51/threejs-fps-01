// bots.js — the nine simulated players. Each bot runs a small brain: perception on a
// staggered tick (vision cone + line of sight + smoke, hearing from the noise channel),
// waypoint navigation over the map graph, and a team plan written by planRound — attackers
// push a chosen site behind a bomb carrier, defenders hold angles and rotate on information.
// In a fight a bot stops to shoot in bursts like the gunplay rules reward, with aim error
// that grows when it or its target moves. Bots buy their own gear in the buy phase.

import { G, PHASE, TEAM } from './state.js';
import { NODES, findPath, nearestNode, nodesWithTag, siteAt, SITES } from './map.js';
import { moveActor, lineOfSight, horizontalSpeed } from './physics.js';
import { easeHeight } from './actor.js';
import {
  WEAPONS, currentDef, giveWeapon, smokeBlocks, startReload, switchTo, throwGrenade,
  tryShoot, updateWeapon, actorEye,
} from './weapons.js';
import { randRange } from './rng.js';
import { sfx } from './audio.js';
import { makeNoise } from './state.js';

export const EMBER_BOT_NAMES = ['Vex', 'Onyx', 'Rook', 'Sable'];
export const WARD_BOT_NAMES = ['Hale', 'Moss', 'Quill', 'Tern', 'Vigil'];

export function makeBrain() {
  return {
    role: 'support',
    state: 'advance',
    path: [],
    pathI: 0,
    goal: null, // { x, z } final steering target after the path
    holdYaw: 0,
    thinkT: Math.random() * 0.1,
    seeT: Math.random() * 0.1,
    enemy: null,
    lastSeenX: 0, lastSeenZ: 0, lastSeenT: -99,
    firstSightT: 0,
    burstLeft: 0, burstPauseT: 0,
    strafeT: 0, strafeDir: 1,
    stuckT: 0, lastX: 0, lastZ: 0,
    crouchHold: false,
    heardX: 0, heardZ: 0, heardT: -99,
    planSite: 'A',
    grenadePlan: null,
  };
}

// ---- Team plans ---------------------------------------------------------------

// Written once per round by rounds.js. Attackers: a carrier and an entry pair push the
// chosen site through one lane, a support follows, a lurker crosses late through mid.
// Defenders: pairs hold each site's angles, one flex watches mid and rotates first.
export function planRound() {
  const rng = G.rng;
  const site = rng() < 0.5 ? 'A' : 'B';
  const attackers = G.actors.filter((a) => !a.isPlayer && a.team === TEAM.EMBER);
  const defenders = G.actors.filter((a) => a.team === TEAM.WARD);

  const carrier = G.bomb && G.bomb.carrier && !G.bomb.carrier.isPlayer
    ? G.bomb.carrier
    : attackers[0];
  const laneNode = site === 'A' ? 'a_link' : 'b_link';
  const entryNode = site === 'A' ? 'a_entry' : 'b_entry';
  attackers.forEach((bot, i) => {
    const b = bot.brain;
    b.planSite = site;
    b.state = 'advance';
    b.enemy = null;
    if (bot === carrier) {
      b.role = 'carrier';
      setRoute(bot, [laneNode, entryNode], { x: SITES[site].x + randRange(rng, -1.2, 1.2), z: SITES[site].z + randRange(rng, -1.2, 1.2) });
    } else if (i <= 2) {
      b.role = 'entry';
      setRoute(bot, [laneNode, entryNode], holdGoal(site, i));
    } else {
      b.role = 'lurk';
      setRoute(bot, ['mid', 'mid_n', site === 'A' ? 'a_conn' : 'b_conn', entryNode], holdGoal(site, i));
    }
  });

  const holdsA = nodesWithTag('holdA');
  const holdsB = nodesWithTag('holdB');
  defenders.forEach((bot, i) => {
    const b = bot.brain;
    b.state = 'advance';
    b.enemy = null;
    if (i === 4) {
      b.role = 'flex';
      b.planSite = site;
      setRoute(bot, ['mid_n'], { x: 0, z: -11 });
      b.holdYaw = Math.PI; // watch south, down mid
    } else {
      const toA = i < 2;
      b.role = 'holder';
      b.planSite = toA ? 'A' : 'B';
      const holdId = (toA ? holdsA : holdsB)[i % 2];
      const n = NODES[holdId];
      setRoute(bot, [holdId], { x: n.x, z: n.z });
      b.holdYaw = Math.atan2(-(0 - n.x), -(20 - n.z)); // face the yard (south)
    }
  });
}

function holdGoal(site, salt) {
  const holds = nodesWithTag(site === 'A' ? 'holdA' : 'holdB');
  const n = NODES[holds[salt % holds.length]];
  return { x: n.x, z: n.z };
}

// Route a bot from wherever it stands to a goal, through the given via-nodes.
export function setRoute(bot, viaIds, goal) {
  const b = bot.brain;
  const start = nearestNode(bot.pos.x, bot.pos.z);
  let full = [];
  let from = start;
  for (const via of viaIds) {
    const leg = findPath(from, via);
    full = full.concat(full.length ? leg.slice(1) : leg);
    from = via;
  }
  b.path = full;
  b.pathI = 0;
  b.goal = goal;
}

// After the plant: attackers fall back to the site's hold angles; defenders converge.
export function planPostPlant() {
  const site = G.bomb.site;
  const holds = nodesWithTag(site === 'A' ? 'holdA' : 'holdB');
  for (const a of G.actors) {
    if (a.isPlayer || !a.alive) continue;
    const b = a.brain;
    if (a.team === TEAM.EMBER) {
      const n = NODES[holds[Math.abs(a.name.length + a.kills) % holds.length]];
      b.state = 'advance';
      setRoute(a, [site === 'A' ? 'a_entry' : 'b_entry'], { x: n.x, z: n.z });
      b.holdYaw = Math.atan2(-(SITES[site].x - n.x), -(SITES[site].z - n.z));
    } else {
      b.state = 'advance';
      setRoute(a, [site === 'A' ? 'a_entry' : 'b_entry'], { x: SITES[site].x, z: SITES[site].z });
    }
  }
}

// ---- Buying ---------------------------------------------------------------------

export function botBuy(bot) {
  const rng = G.rng;
  const lo = bot.loadout;
  const spend = (fn) => fn();
  if (!lo.primary && bot.money >= 2700) {
    if (bot.money >= 4750 && rng() < 0.3) spend(() => { bot.money -= 4750; giveWeapon(bot, 'aegis'); });
    else spend(() => { bot.money -= 2700; giveWeapon(bot, 'longbow'); });
  } else if (!lo.primary && bot.money >= 1800) {
    const id = rng() < 0.6 ? 'ripper' : 'breacher';
    bot.money -= WEAPONS[id].price;
    giveWeapon(bot, id);
  } else if (!lo.primary && bot.money >= 800 && rng() < 0.4) {
    bot.money -= WEAPONS.mule.price;
    giveWeapon(bot, 'mule');
  }
  if (lo.primary && lo.current === 'sidearm') switchTo(bot, 'primary');
  if (bot.money >= 1000 && !bot.helmet) {
    bot.money -= 1000;
    bot.armor = 100;
    bot.helmet = true;
  } else if (bot.money >= 650 && bot.armor <= 30) {
    bot.money -= 650;
    bot.armor = 100;
  }
  if (bot.money >= 600 && lo.grenades.frag === 0 && rng() < 0.7) {
    bot.money -= 300;
    lo.grenades.frag = 1;
  }
  if (bot.money >= 400 && rng() < 0.5) {
    if (bot.brain.role === 'entry' && lo.grenades.flash === 0) {
      bot.money -= 200;
      lo.grenades.flash = 1;
    } else if (lo.grenades.smoke === 0) {
      bot.money -= 300;
      lo.grenades.smoke = 1;
    }
  }
}

// ---- Perception -------------------------------------------------------------------

const eyeTmp = { x: 0, y: 0, z: 0 };
function perceive(bot, dt) {
  const b = bot.brain;
  b.seeT -= dt;
  if (b.seeT > 0) return;
  b.seeT = 0.1;
  if ((bot.blindT ?? 0) > 0) {
    b.enemy = null;
    return;
  }
  const eye = actorEye(bot);
  let best = null;
  let bestDist = Infinity;
  for (const other of G.actors) {
    if (other === bot || !other.alive || other.team === bot.team) continue;
    const dx = other.pos.x - bot.pos.x;
    const dz = other.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 40) continue;
    // Field of view: 110°, wider up close; a target that just fired is easier to place.
    const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
    const dot = (fx * dx + fz * dz) / (dist || 1);
    const justFired = G.time - (other.lastShotT ?? -99) < 1.0;
    if (dot < 0.35 && dist > 7 && !justFired) continue;
    const oy = other.pos.y + other.height * 0.62;
    if (!lineOfSight(eye.x, eye.y, eye.z, other.pos.x, oy, other.pos.z)) continue;
    if (smokeBlocks(eye.x, eye.y, eye.z, other.pos.x, oy, other.pos.z)) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = other;
    }
  }
  if (best) {
    if (b.enemy !== best) b.firstSightT = G.time;
    b.enemy = best;
    b.lastSeenX = best.pos.x;
    b.lastSeenZ = best.pos.z;
    b.lastSeenT = G.time;
  } else if (G.time - b.lastSeenT > 2.5) {
    b.enemy = null;
  }

  // Hearing: enemy gunfire and running steps arrive through the noise channel.
  for (const n of G.noises) {
    if (n.team === bot.team || n.t <= (b.noiseSeenT ?? -99)) continue;
    const d = Math.hypot(n.x - bot.pos.x, n.z - bot.pos.z);
    if (d <= n.radius) {
      b.heardX = n.x;
      b.heardZ = n.z;
      b.heardT = G.time;
      if (!b.enemy && b.state === 'hold') {
        b.holdYaw = Math.atan2(-(n.x - bot.pos.x), -(n.z - bot.pos.z));
      }
    }
  }
  b.noiseSeenT = G.time;
}

// ---- Steering ---------------------------------------------------------------------

function steer(bot, tx, tz, dt, runSpeed) {
  const b = bot.brain;
  const dx = tx - bot.pos.x;
  const dz = tz - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  let wishX = 0, wishZ = 0;
  if (dist > 0.05) {
    wishX = dx / dist;
    wishZ = dz / dist;
  }
  moveActor(bot, wishX, wishZ, runSpeed, dt, true);
  // Running feet are information: they feed the noise channel and the player's ears.
  const speedNow = horizontalSpeed(bot);
  if (speedNow > 3) {
    bot.stepAcc += speedNow * dt;
    if (bot.stepAcc > 2.6) {
      bot.stepAcc = 0;
      makeNoise(bot.pos.x, bot.pos.z, 11, bot.team, 'steps');
      if (G.player) {
        sfx.footstep(Math.hypot(G.player.pos.x - bot.pos.x, G.player.pos.z - bot.pos.z), true);
      }
    }
  }
  if (dist > 0.4) faceToward(bot, Math.atan2(-dx, -dz), dt, 3.4);
  // Stuck detection: wanting to move but barely moving — hop and re-path from here.
  const moved = Math.hypot(bot.pos.x - b.lastX, bot.pos.z - b.lastZ);
  if (dist > 1 && moved < dt * 0.4) {
    b.stuckT += dt;
    if (b.stuckT > 0.9) {
      b.stuckT = 0;
      bot.vel.y = 5;
      const here = nearestNode(bot.pos.x, bot.pos.z);
      if (b.path.length && b.pathI < b.path.length) {
        const target = b.path[b.path.length - 1];
        b.path = findPath(here, target);
        b.pathI = 0;
      }
    }
  } else {
    b.stuckT = Math.max(0, b.stuckT - dt);
  }
  b.lastX = bot.pos.x;
  b.lastZ = bot.pos.z;
  return dist;
}

function faceToward(bot, targetYaw, dt, rate) {
  let diff = targetYaw - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  bot.yaw += step;
}

// Follow the route; returns true when the bot has arrived at its goal.
function followRoute(bot, dt, speed) {
  const b = bot.brain;
  while (b.pathI < b.path.length) {
    const n = NODES[b.path[b.pathI]];
    const d = Math.hypot(n.x - bot.pos.x, n.z - bot.pos.z);
    if (d < 0.85) {
      b.pathI += 1;
      continue;
    }
    steer(bot, n.x, n.z, dt, speed);
    return false;
  }
  if (b.goal) {
    const d = steer(bot, b.goal.x, b.goal.z, dt, speed);
    if (d < 0.6) {
      b.goal = null;
      return true;
    }
    return false;
  }
  return true;
}

// ---- Combat -----------------------------------------------------------------------

const aimTarget = { x: 0, y: 0, z: 0 };
function engage(bot, dt) {
  const b = bot.brain;
  const foe = b.enemy;
  const def = currentDef(bot);
  if (!def) return;
  const dist = Math.hypot(foe.pos.x - bot.pos.x, foe.pos.z - bot.pos.z);

  // Aim at the foe's chest-to-head line, leading a moving target a little, with error
  // that grows with range, target speed and the bot's own movement.
  const lead = Math.min(0.35, dist * 0.006);
  aimTarget.x = foe.pos.x + foe.vel.x * lead;
  aimTarget.z = foe.pos.z + foe.vel.z * lead;
  aimTarget.y = foe.pos.y + foe.height * (0.66 + (bot.skill ?? 0.5) * 0.2);
  const eye = actorEye(bot);
  const dx = aimTarget.x - eye.x, dy = aimTarget.y - eye.y, dz = aimTarget.z - eye.z;
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
  faceToward(bot, wantYaw, dt, 4.2);
  let pdiff = wantPitch - bot.pitch;
  bot.pitch += Math.max(-2.6 * dt, Math.min(2.6 * dt, pdiff));

  // Strafe between bursts, stand still during them: the spread rules reward it.
  b.strafeT -= dt;
  if (b.strafeT <= 0) {
    b.strafeT = randRange(G.rng, 0.5, 1.1);
    b.strafeDir = G.rng() < 0.5 ? -1 : 1;
  }
  const inBurst = b.burstLeft > 0;
  if (dist > 26) {
    // Too far for a decisive fight: close the distance while engaging, rather than
    // plinking across the yard until the clock decides the round.
    steer(bot, foe.pos.x, foe.pos.z, dt, 5.3 * def.speed * 0.85);
  } else if (!inBurst && dist > 9) {
    const px = -Math.cos(bot.yaw) * b.strafeDir;
    const pz = Math.sin(bot.yaw) * b.strafeDir;
    moveActor(bot, px, pz, 1.7, dt, true);
  } else {
    moveActor(bot, 0, 0, 0, dt, true);
  }

  const reacted = G.time - b.firstSightT > (bot.reaction ?? 0.3);
  if (!reacted) return;
  if (b.burstPauseT > 0) {
    b.burstPauseT -= dt;
    return;
  }
  if (b.burstLeft <= 0) {
    const mag = currentInstMag(bot);
    if (mag <= 0) {
      startReload(bot);
      b.burstPauseT = 0.4;
      return;
    }
    b.burstLeft = def.auto ? 3 + Math.floor(G.rng() * 4) : 1;
  }
  // Apply aim error as a small angular offset from the true direction.
  const err = 0.016 + dist * 0.0006 + horizontalSpeed(foe) * 0.006 + horizontalSpeed(bot) * 0.01;
  const ex = (G.rng() * 2 - 1) * err;
  const ey = (G.rng() * 2 - 1) * err * 0.7;
  const fx2 = -Math.sin(bot.yaw + ex), fz2 = -Math.cos(bot.yaw + ex);
  const fy2 = Math.sin(bot.pitch + ey);
  const shot = tryShoot(bot, fx2 * Math.cos(bot.pitch + ey), fy2, fz2 * Math.cos(bot.pitch + ey), G.time);
  if (shot) {
    bot.lastShotT = G.time;
    b.burstLeft -= 1;
    if (b.burstLeft <= 0) b.burstPauseT = randRange(G.rng, 0.34, 0.68);
  }
}

function currentInstMag(bot) {
  const inst = bot.loadout.current === 'primary' ? bot.loadout.primary : bot.loadout.sidearm;
  return inst ? inst.mag : 0;
}

// ---- Main per-step update -----------------------------------------------------------

export function updateBot(bot, dt) {
  const b = bot.brain;
  bot.wantPlant = false;
  bot.wantDefuse = false;
  if (!bot.alive) return;
  bot.blindT = Math.max(0, (bot.blindT ?? 0) - dt);
  perceive(bot, dt);
  updateWeapon(bot, dt);
  easeHeight(bot, dt, b.crouchHold && !b.enemy);

  const phase = G.phase;
  if (phase === PHASE.BUY || phase === PHASE.MENU || phase === PHASE.ROUND_OVER || phase === PHASE.MATCH_OVER) {
    moveActor(bot, 0, 0, 0, dt, true);
    return;
  }

  const def = currentDef(bot);
  const runSpeed = 5.3 * (def ? def.speed : 1);

  // A visible enemy interrupts everything but a plant/defuse already under way.
  if (b.enemy && b.enemy.alive && G.time - b.lastSeenT < 0.4) {
    if (bot.channelKind) {
      moveActor(bot, 0, 0, 0, dt, true);
      return;
    }
    engage(bot, dt);
    maybeThrowGrenade(bot);
    return;
  }
  if (b.enemy && !b.enemy.alive) b.enemy = null;

  // Bomb planted: defenders converge and defuse; attackers hold the site.
  if (phase === PHASE.PLANTED) {
    if (bot.team === TEAM.WARD) {
      const bp = G.bomb.pos;
      const d = Math.hypot(bp.x - bot.pos.x, bp.z - bot.pos.z);
      if (d > 1.6) {
        if (!b.goal || Math.hypot(b.goal.x - bp.x, b.goal.z - bp.z) > 2) {
          setRoute(bot, [G.bomb.site === 'A' ? 'a_entry' : 'b_entry'], { x: bp.x, z: bp.z });
        }
        followRoute(bot, dt, runSpeed);
      } else {
        moveActor(bot, 0, 0, 0, dt, true);
        faceToward(bot, G.time * 0.4 % (Math.PI * 2), dt, 1.2); // scanning while defusing
        bot.wantDefuse = true;
      }
      return;
    }
    // Attackers post-plant: get to a hold angle if not already near one.
    if (b.state !== 'hold') {
      if (followRoute(bot, dt, runSpeed * 0.8)) {
        b.state = 'hold';
        b.crouchHold = G.rng() < 0.5;
      }
    } else {
      moveActor(bot, 0, 0, 0, dt, true);
      faceToward(bot, b.holdYaw, dt, 1.6);
    }
    return;
  }

  // Live phase, no visible enemy: work the plan.
  if (b.enemy === null && G.time - b.lastSeenT < 2.5 && G.time - b.lastSeenT > 0) {
    // Push the last seen position — a glimpse is worth chasing briefly.
    steer(bot, b.lastSeenX, b.lastSeenZ, dt, runSpeed * 0.85);
    return;
  }

  if (bot.team === TEAM.EMBER) {
    // Pick up a dropped charge on the way.
    if (G.bomb && G.bomb.state === 'dropped' && b.role !== 'carrier') {
      const bp = G.bomb.pos;
      const d = Math.hypot(bp.x - bot.pos.x, bp.z - bot.pos.z);
      const carrierAlive = G.actors.some((a) => a.team === TEAM.EMBER && a.alive && a.brain && a.brain.role === 'carrier');
      if (!carrierAlive && d < 14) {
        steer(bot, bp.x, bp.z, dt, runSpeed);
        return;
      }
    }
    if (b.role === 'carrier' && G.bomb && G.bomb.state === 'carried' && G.bomb.carrier === bot) {
      const site = siteAt(bot.pos.x, bot.pos.z);
      if (site && site.id === b.planSite) {
        moveActor(bot, 0, 0, 0, dt, true);
        bot.wantPlant = true;
        b.crouchHold = true;
        return;
      }
      b.crouchHold = false;
    }
    if (followRoute(bot, dt, b.role === 'lurk' ? runSpeed * 0.72 : runSpeed)) {
      b.state = 'hold';
      // Arrived: hold the angle toward the yard.
      moveActor(bot, 0, 0, 0, dt, true);
      faceToward(bot, b.holdYaw || Math.PI, dt, 1.4);
    }
    return;
  }

  // Ward, live phase: holders stay; the flex rotates on hard information.
  if (b.role === 'flex' && G.bomb && G.bomb.state === 'carried') {
    const heardSite = b.heardT > G.time - 3 && Math.abs(b.heardX) > 12 ? (b.heardX < 0 ? 'A' : 'B') : null;
    if (heardSite && heardSite !== b.planSite) {
      b.planSite = heardSite;
      setRoute(bot, [heardSite === 'A' ? 'a_entry' : 'b_entry'], holdGoal(heardSite, 1));
    }
  }
  if (followRoute(bot, dt, runSpeed)) {
    b.state = 'hold';
    moveActor(bot, 0, 0, 0, dt, true);
    faceToward(bot, b.holdYaw, dt, 1.2);
  }
}

// Entry bots flash their way in once per round when they reach the site entry.
function maybeThrowGrenade(bot) {
  const b = bot.brain;
  if (b.grenadePlan === 'thrown' || b.grenadePlan === null) {
    // Set a plan the first time the bot nears its target site with a grenade in hand.
    if (b.grenadePlan === null) {
      const site = SITES[b.planSite];
      const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
      if (d < 17 && (bot.loadout.grenades.flash > 0 || bot.loadout.grenades.frag > 0)) {
        b.grenadePlan = 'ready';
      } else {
        return;
      }
    }
  }
  if (b.grenadePlan !== 'ready' || !b.enemy) return;
  const kind = bot.loadout.grenades.flash > 0 ? 'flash' : 'frag';
  const dx = b.enemy.pos.x - bot.pos.x;
  const dz = b.enemy.pos.z - bot.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  if (throwGrenade(bot, kind, dx / l, 0.25, dz / l)) {
    b.grenadePlan = 'thrown';
    sfx.throwWhoosh();
  }
}
