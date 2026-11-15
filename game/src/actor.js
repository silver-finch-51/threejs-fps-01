// actor.js — the shared actor record and its per-step upkeep. The player and every bot are
// the same shape: a position capsule, view angles, health and armour, a loadout, and the
// timers the other modules read. One factory keeps the shape in exactly one place.

import * as THREE from 'three';
import { freshLoadout } from './weapons.js';

export const STAND_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.24;

export function createActor({ name, team, isPlayer = false }) {
  return {
    name,
    team,
    isPlayer,
    pos: new THREE.Vector3(0, 0, 0),
    vel: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    radius: 0.42,
    height: STAND_HEIGHT,
    crouching: false,
    onGround: true,
    alive: true,
    health: 100,
    armor: 0,
    helmet: false,
    money: 0,
    loadout: freshLoadout(),
    kills: 0,
    deaths: 0,
    kick: 0,
    walkCycle: 0,
    deathT: 0,
    deathByHeadshot: false,
    lastAttacker: null,
    lastHitT: -99,
    stepAcc: 0, // distance accumulated toward the next footstep sound
    semiLatch: false,
    grenadeT: 0,
    view: null, // bot mesh handle from world.js (bots only)
    brain: null, // bot AI state (bots only)
  };
}

// Crouch eases the capsule height toward its target; the map has no low ceilings, so
// standing back up never needs a clearance check.
export function easeHeight(actor, dt, wantCrouch) {
  const target = wantCrouch ? CROUCH_HEIGHT : STAND_HEIGHT;
  actor.crouching = wantCrouch;
  const rate = dt * 3.6;
  actor.height += Math.max(-rate, Math.min(rate, target - actor.height));
}
