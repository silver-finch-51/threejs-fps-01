// weapons.js — the armoury: weapon definitions, the firing model (spread, recoil, falloff,
// part multipliers), damage and armour, and the three grenades. Player and bots fire through
// the same tryShoot path, so a bot's rifle obeys exactly the rules the player's does.
//
// Accuracy model (the tactical heart): a shot's spread is the weapon's base spread plus a
// movement bloom that grows with the shooter's speed, tripled in the air, cut by crouching —
// and each shot adds recoil that blooms further shots until it settles. Standing still and
// firing in bursts is measurably tighter than running and spraying.

import { G, CFG, makeNoise, addFeed } from './state.js';
import { SOLIDS } from './map.js';
import { rayVsSolids, rayVsActor, horizontalSpeed } from './physics.js';
import { randGauss } from './rng.js';
import { sfx } from './audio.js';
import * as fx from './effects.js';

export const PART_MULT = { head: 4, chest: 1, legs: 0.75 };

export const WEAPONS = {
  kestrel: {
    name: 'Kestrel-9', kind: 'sidearm', price: 0, damage: 26, rpm: 400, auto: false,
    mag: 12, reserve: 96, reload: 1.6, spreadStand: 0.35, spreadMove: 2.2, recoil: 0.5,
    falloffStart: 16, falloffEnd: 42, speed: 1.0, pellets: 1, heavy: false, zoom: false,
  },
  mule: {
    name: 'Mule .45', kind: 'sidearm', price: 700, damage: 40, rpm: 320, auto: false,
    mag: 8, reserve: 64, reload: 1.9, spreadStand: 0.5, spreadMove: 2.6, recoil: 0.85,
    falloffStart: 14, falloffEnd: 38, speed: 1.0, pellets: 1, heavy: false, zoom: false,
  },
  ripper: {
    name: 'Ripper-9', kind: 'primary', price: 1250, damage: 21, rpm: 880, auto: true,
    mag: 32, reserve: 128, reload: 2.2, spreadStand: 0.9, spreadMove: 2.4, recoil: 0.3,
    falloffStart: 14, falloffEnd: 40, speed: 1.02, pellets: 1, heavy: false, zoom: false,
  },
  breacher: {
    name: 'Breacher-12', kind: 'primary', price: 1100, damage: 11, rpm: 65, auto: false,
    mag: 6, reserve: 32, reload: 3.1, spreadStand: 3.4, spreadMove: 4.2, recoil: 1.5,
    falloffStart: 6, falloffEnd: 20, speed: 0.98, pellets: 8, heavy: true, zoom: false,
  },
  longbow: {
    name: 'Longbow AR', kind: 'primary', price: 2700, damage: 33, rpm: 700, auto: true,
    mag: 30, reserve: 120, reload: 2.4, spreadStand: 0.22, spreadMove: 3.4, recoil: 0.6,
    falloffStart: 24, falloffEnd: 60, speed: 0.96, pellets: 1, heavy: false, zoom: false,
  },
  aegis: {
    name: 'Aegis DMR', kind: 'primary', price: 4750, damage: 72, rpm: 230, auto: false,
    mag: 10, reserve: 50, reload: 2.6, spreadStand: 0.06, spreadMove: 4.6, recoil: 1.25,
    falloffStart: 30, falloffEnd: 80, speed: 0.94, pellets: 1, heavy: true, zoom: true,
  },
};

export const GRENADES = {
  frag: { name: 'Shard Grenade', price: 300, fuse: 1.5 },
  flash: { name: 'Blink Grenade', price: 200, fuse: 1.3 },
  smoke: { name: 'Veil Grenade', price: 300, fuse: 0.7 },
};

// What the buy menu sells, in key order (keys 1..9, 0).
export const CATALOG = [
  { key: 'Digit1', id: 'mule', label: 'Mule .45 pistol', price: 700 },
  { key: 'Digit2', id: 'ripper', label: 'Ripper-9 SMG', price: 1250 },
  { key: 'Digit3', id: 'breacher', label: 'Breacher-12 shotgun', price: 1100 },
  { key: 'Digit4', id: 'longbow', label: 'Longbow AR rifle', price: 2700 },
  { key: 'Digit5', id: 'aegis', label: 'Aegis DMR', price: 4750 },
  { key: 'Digit6', id: 'vest', label: 'Kevlar vest', price: 650 },
  { key: 'Digit7', id: 'vesthelm', label: 'Vest + helmet', price: 1000 },
  { key: 'Digit8', id: 'frag', label: 'Shard grenade', price: 300 },
  { key: 'Digit9', id: 'flash', label: 'Blink grenade', price: 200 },
  { key: 'Digit0', id: 'smoke', label: 'Veil grenade', price: 300 },
];

export function freshLoadout() {
  return {
    primary: null,
    sidearm: { id: 'kestrel', mag: WEAPONS.kestrel.mag, reserve: WEAPONS.kestrel.reserve },
    current: 'sidearm',
    reloadT: 0,
    switchT: 0,
    nextShotT: 0,
    recoilHeat: 0,
    grenades: { frag: 0, flash: 0, smoke: 0 },
  };
}

export function giveWeapon(actor, id) {
  const def = WEAPONS[id];
  const inst = { id, mag: def.mag, reserve: def.reserve };
  if (def.kind === 'primary') actor.loadout.primary = inst;
  else actor.loadout.sidearm = inst;
  return inst;
}

export function currentInst(actor) {
  return actor.loadout.current === 'primary' ? actor.loadout.primary : actor.loadout.sidearm;
}

export function currentDef(actor) {
  const inst = currentInst(actor);
  return inst ? WEAPONS[inst.id] : null;
}

export function switchTo(actor, slot) {
  if (actor.loadout.current === slot) return;
  if (slot === 'primary' && !actor.loadout.primary) return;
  actor.loadout.current = slot;
  actor.loadout.switchT = 0.32;
  actor.loadout.reloadT = 0;
}

export function startReload(actor) {
  const inst = currentInst(actor);
  if (!inst || actor.loadout.reloadT > 0) return;
  const def = WEAPONS[inst.id];
  if (inst.mag >= def.mag || inst.reserve <= 0) return;
  actor.loadout.reloadT = def.reload;
  if (actor.isPlayer) sfx.reload();
}

function finishReload(actor) {
  const inst = currentInst(actor);
  const def = WEAPONS[inst.id];
  const take = Math.min(def.mag - inst.mag, inst.reserve);
  inst.mag += take;
  inst.reserve -= take;
}

// Damage with armour: a vest (and a helmet, for the head) absorbs half the damage while it
// has points left. Returns true when the target died.
export function applyDamage(target, rawDamage, part, attacker, weaponId) {
  if (!target.alive) return false;
  let damage = rawDamage * (PART_MULT[part] ?? 1);
  const armoured = target.armor > 0 && (part !== 'head' || target.helmet);
  if (armoured) {
    const absorbed = Math.min(target.armor, damage * 0.5);
    target.armor -= absorbed;
    damage -= absorbed;
  }
  target.health -= damage;
  target.lastAttacker = attacker;
  target.lastHitT = G.time;
  if (target.isPlayer) {
    G.shake = Math.min(0.6, G.shake + damage * 0.006);
    sfx.hurt();
  }
  if (target.health <= 0) {
    target.health = 0;
    killActor(target, attacker, weaponId, part);
    return true;
  }
  return false;
}

export function killActor(target, attacker, weaponId, part) {
  target.alive = false;
  target.deathT = 0;
  target.deathByHeadshot = part === 'head';
  fx.deathPuff(target);
  if (G.bomb && G.bomb.state === 'carried' && G.bomb.carrier === target) {
    G.bomb.state = 'dropped';
    G.bomb.carrier = null;
    G.bomb.pos = { x: target.pos.x, z: target.pos.z };
  }
  if (attacker && attacker !== target) {
    if (attacker.team !== target.team) {
      attacker.money = Math.min(CFG.maxMoney, attacker.money + CFG.killReward);
      attacker.kills += 1;
    }
    const wname = weaponId ? WEAPONS[weaponId].name : 'explosion';
    addFeed(`${attacker.name} ▸ ${wname} ▸ ${target.name}${part === 'head' ? ' ⌖' : ''}`);
    if (attacker.isPlayer) {
      G.hitmarkT = 0.35;
      G.hitmarkKill = true;
      sfx.hit(true);
      if (part === 'head') sfx.headshotDing();
    }
  }
  target.deaths += 1;
}

const solidHit = { dist: 0, x: 0, y: 0, z: 0 };
const actorHit = { dist: 0, part: 'chest' };

// Fire one shot (all pellets) for an actor aiming along the unit vector d. Handles cooldown,
// ammunition, spread, recoil heat, tracers, impacts, noise and sound.
export function tryShoot(actor, dx, dy, dz, now) {
  const lo = actor.loadout;
  const inst = currentInst(actor);
  if (!inst || lo.reloadT > 0 || lo.switchT > 0 || now < lo.nextShotT) return false;
  const def = WEAPONS[inst.id];
  if (inst.mag <= 0) {
    if (actor.isPlayer) sfx.dryFire();
    lo.nextShotT = now + 0.3;
    startReload(actor);
    return false;
  }
  inst.mag -= 1;
  lo.nextShotT = now + 60 / def.rpm;
  lo.recoilHeat = Math.min(1.6, lo.recoilHeat + def.recoil * 0.22);

  const eye = actorEye(actor);
  const speed = horizontalSpeed(actor);
  let spreadDeg = def.spreadStand + def.spreadMove * Math.min(1, speed / 5.4) + lo.recoilHeat * 0.85;
  if (!actor.onGround) spreadDeg *= 2.6;
  if (actor.crouching) spreadDeg *= 0.68;
  const spread = spreadDeg * Math.PI / 180;

  // Orthonormal basis around the aim direction, for jitter.
  const ux = -dz, uz = dx; // horizontal perpendicular (d is near-horizontal in practice)
  const ul = Math.hypot(ux, uz) || 1;
  const px = ux / ul, pz = uz / ul;
  const qx = dy * pz, qy = dz * px - dx * pz, qz = -dy * px; // d × p

  const muzzleX = eye.x + dx * 0.55 + px * 0.16;
  const muzzleY = eye.y - 0.14;
  const muzzleZ = eye.z + dz * 0.55 + pz * 0.16;
  fx.muzzle(muzzleX, muzzleY, muzzleZ, dx, dy, dz, def.heavy);

  for (let p = 0; p < def.pellets; p++) {
    const j1 = randGauss(G.rng) * spread;
    const j2 = randGauss(G.rng) * spread;
    let vx = dx + px * j1 + qx * j2;
    let vy = dy + qy * j2 + 0; // vertical jitter mostly from q; keep some from p's y (0)
    let vz = dz + pz * j1 + qz * j2;
    vy += randGauss(G.rng) * spread * 0.6;
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;

    const hitSolid = rayVsSolids(eye.x, eye.y, eye.z, vx, vy, vz, 220, solidHit);
    const maxD = hitSolid ? solidHit.dist : 220;
    let bestActor = null;
    let bestDist = maxD;
    for (const other of G.actors) {
      if (other === actor || !other.alive || other.team === actor.team) continue;
      const part = rayVsActor(eye.x, eye.y, eye.z, vx, vy, vz, other, bestDist, actorHit);
      if (part && actorHit.dist < bestDist) {
        bestDist = actorHit.dist;
        bestActor = other;
        actorHit.part = part;
      }
    }
    if (bestActor) {
      const dist = bestDist;
      let dmg = def.damage;
      if (dist > def.falloffStart) {
        const t = Math.min(1, (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart));
        dmg *= 1 - 0.55 * t;
      }
      fx.bloodPuff(eye.x + vx * dist, eye.y + vy * dist, eye.z + vz * dist, bestActor.team);
      const died = applyDamage(bestActor, dmg, actorHit.part, actor, inst.id);
      if (actor.isPlayer && !died) {
        G.hitmarkT = 0.18;
        G.hitmarkKill = false;
        sfx.hit(false);
        if (actorHit.part === 'head') sfx.headshotDing();
      }
      fx.tracer(muzzleX, muzzleY, muzzleZ, eye.x + vx * dist, eye.y + vy * dist, eye.z + vz * dist);
    } else if (hitSolid) {
      fx.impact(solidHit.x, solidHit.y, solidHit.z);
      fx.tracer(muzzleX, muzzleY, muzzleZ, solidHit.x, solidHit.y, solidHit.z);
    } else {
      fx.tracer(muzzleX, muzzleY, muzzleZ, eye.x + vx * 160, eye.y + vy * 160, eye.z + vz * 160);
    }
  }

  actor.kick = Math.min(1, (actor.kick ?? 0) + def.recoil * 0.5);
  actor.lastShotT = now;
  makeNoise(actor.pos.x, actor.pos.z, 34, actor.team, 'gunfire');
  const distToPlayer = G.player ? Math.hypot(G.player.pos.x - actor.pos.x, G.player.pos.z - actor.pos.z) : 0;
  sfx.shot(actor.isPlayer ? 0 : distToPlayer, def.heavy);
  if (inst.mag === 0) startReload(actor);
  return true;
}

// Per-step weapon upkeep: reload timers, draw timers, recoil settling.
export function updateWeapon(actor, dt) {
  const lo = actor.loadout;
  if (lo.reloadT > 0) {
    lo.reloadT -= dt;
    if (lo.reloadT <= 0) finishReload(actor);
  }
  if (lo.switchT > 0) lo.switchT -= dt;
  lo.recoilHeat = Math.max(0, lo.recoilHeat - dt * 1.5);
  actor.kick = Math.max(0, (actor.kick ?? 0) - dt * 5);
}

export function actorEye(actor) {
  return {
    x: actor.pos.x,
    y: actor.pos.y + actor.height - 0.14,
    z: actor.pos.z,
  };
}

export function viewDir(actor, out) {
  const cp = Math.cos(actor.pitch);
  out.x = -Math.sin(actor.yaw) * cp;
  out.y = Math.sin(actor.pitch);
  out.z = -Math.cos(actor.yaw) * cp;
  return out;
}

// ---- Grenades ---------------------------------------------------------------

export const projectiles = []; // { kind, x,y,z, vx,vy,vz, fuse, team, thrower, settled }
export const smokes = []; // { x, y, z, r, t } active clouds

export function throwGrenade(actor, kind, dx, dy, dz) {
  if (actor.loadout.grenades[kind] <= 0) return false;
  actor.loadout.grenades[kind] -= 1;
  const eye = actorEye(actor);
  const power = 13.5;
  projectiles.push({
    kind,
    x: eye.x + dx * 0.4, y: eye.y, z: eye.z + dz * 0.4,
    vx: dx * power + actor.vel.x * 0.5, vy: dy * power + 3.2, vz: dz * power + actor.vel.z * 0.5,
    fuse: GRENADES[kind].fuse, team: actor.team, thrower: actor, settled: false,
  });
  if (actor.isPlayer) sfx.throwWhoosh();
  return true;
}

export function updateGrenades(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.fuse -= dt;
    if (!p.settled) {
      p.vy -= 16 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.18) {
        p.y = 0.18;
        p.vy = Math.abs(p.vy) > 1.6 ? -p.vy * 0.38 : 0;
        p.vx *= 0.7;
        p.vz *= 0.7;
        if (p.kind === 'smoke' && p.fuse <= 0) p.settled = true;
      }
      // Bounce off tall solids by footprint test.
      bounceOffSolids(p);
    }
    if (p.fuse <= 0) {
      projectiles.splice(i, 1);
      detonate(p);
    }
  }
  for (let i = smokes.length - 1; i >= 0; i--) {
    smokes[i].t -= dt;
    if (smokes[i].t <= 0) smokes.splice(i, 1);
  }
}

function bounceOffSolids(p) {
  for (const s of SOLIDS) {
    if (p.y > s.h) continue;
    const dx = p.x - s.x, dz = p.z - s.z;
    const px = s.w / 2 + 0.15 - Math.abs(dx);
    if (px <= 0) continue;
    const pz = s.d / 2 + 0.15 - Math.abs(dz);
    if (pz <= 0) continue;
    if (px < pz) {
      p.x = s.x + (dx >= 0 ? 1 : -1) * (s.w / 2 + 0.15);
      p.vx = -p.vx * 0.4;
    } else {
      p.z = s.z + (dz >= 0 ? 1 : -1) * (s.d / 2 + 0.15);
      p.vz = -p.vz * 0.4;
    }
  }
}

function detonate(p) {
  const distToPlayer = G.player ? Math.hypot(G.player.pos.x - p.x, G.player.pos.z - p.z) : 99;
  if (p.kind === 'smoke') {
    smokes.push({ x: p.x, y: 1.4, z: p.z, r: 3.4, t: 17 });
    fx.smokePuff(p.x, p.y, p.z);
    return;
  }
  if (p.kind === 'flash') {
    fx.flashPuff(p.x, p.y, p.z);
    sfx.flashbang(distToPlayer);
    for (const a of G.actors) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d > 24) continue;
      const eye = actorEye(a);
      if (!losClear(eye.x, eye.y, eye.z, p.x, p.y + 0.4, p.z)) continue;
      const dir = viewDir(a, { x: 0, y: 0, z: 0 });
      const toX = (p.x - eye.x) / (d || 1), toZ = (p.z - eye.z) / (d || 1);
      const facing = Math.max(0, dir.x * toX + dir.z * toZ);
      const strength = (1 - d / 24) * (0.25 + 0.75 * facing);
      if (a.isPlayer) G.flashT = Math.max(G.flashT ?? 0, strength * 3.2);
      else a.blindT = Math.max(a.blindT ?? 0, strength * 4.5);
    }
    return;
  }
  // frag
  fx.explosionFx(p.x, p.y, p.z);
  sfx.explosion(distToPlayer);
  if (distToPlayer < 9) G.shake = Math.min(0.8, G.shake + (1 - distToPlayer / 9) * 0.5);
  for (const a of G.actors) {
    if (!a.alive) continue;
    const d = Math.hypot(a.pos.x - p.x, (a.pos.y + 0.9) - p.y, a.pos.z - p.z);
    if (d > 6.5) continue;
    let dmg = 95 * (1 - d / 6.5) + 8;
    const eye = actorEye(a);
    if (!losClear(p.x, p.y + 0.3, p.z, eye.x, eye.y - 0.5, eye.z)) dmg *= 0.25;
    applyDamage(a, dmg, 'chest', p.thrower, null);
  }
}

const grenadeHit = { dist: 0, x: 0, y: 0, z: 0 };
export function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-4) return true;
  const hit = rayVsSolids(ax, ay, az, dx / dist, dy / dist, dz / dist, dist, grenadeHit);
  return !hit || grenadeHit.dist >= dist - 0.05;
}

// Does a smoke cloud block the line between two points? Used by bot perception.
export function smokeBlocks(ax, ay, az, bx, by, bz) {
  for (const s of smokes) {
    // Distance from the cloud centre to the segment.
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const len2 = abx * abx + aby * aby + abz * abz || 1;
    let t = ((s.x - ax) * abx + (s.y - ay) * aby + (s.z - az) * abz) / len2;
    t = Math.min(1, Math.max(0, t));
    const dx = ax + abx * t - s.x, dy = ay + aby * t - s.y, dz = az + abz * t - s.z;
    if (dx * dx + dy * dy + dz * dz < s.r * s.r) return true;
  }
  return false;
}

export function resetGrenades() {
  projectiles.length = 0;
  smokes.length = 0;
}
