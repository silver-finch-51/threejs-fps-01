// player.js — the human's controller: mouse look, WASD movement with acceleration, crouch,
// walk, jump, weapon handling (fire, reload, switch, grenades) and footstep noise. It reads
// input.js, moves through physics.js, and fires through weapons.js; the camera itself is
// placed by main.js from the actor's eye each frame.

import { G, PHASE, makeNoise } from './state.js';
import { input, moveAxes } from './input.js';
import { moveActor, horizontalSpeed } from './physics.js';
import { easeHeight } from './actor.js';
import {
  currentDef, currentInst, startReload, switchTo, throwGrenade, tryShoot, updateWeapon, viewDir,
} from './weapons.js';
import { sfx } from './audio.js';

const LOOK_SENS = 0.0021;
const RUN_SPEED = 5.55;
const WALK_SPEED = 2.75;
const CROUCH_SPEED = 2.0;

const aimDir = { x: 0, y: 0, z: 0 };

export function updatePlayer(actor, dt, canAct) {
  // Look — always allowed, even in the buy freeze, so the player can survey the yard.
  actor.yaw -= input.mouseDX * LOOK_SENS;
  actor.pitch -= input.mouseDY * LOOK_SENS;
  actor.pitch = Math.max(-1.45, Math.min(1.45, actor.pitch));

  if (!actor.alive || !canAct) {
    moveActor(actor, 0, 0, 0, dt, false);
    updateWeapon(actor, dt);
    return;
  }

  const frozen = G.phase === PHASE.BUY;
  const crouch = input.keys.has('ControlLeft') || input.keys.has('KeyC');
  easeHeight(actor, dt, crouch);

  const { f, r } = moveAxes();
  const walking = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const def = currentDef(actor);
  let maxSpeed = RUN_SPEED * (def ? def.speed : 1);
  if (walking) maxSpeed = Math.min(maxSpeed, WALK_SPEED);
  if (crouch) maxSpeed = Math.min(maxSpeed, CROUCH_SPEED);
  if (input.aiming && def && def.zoom) maxSpeed = Math.min(maxSpeed, 2.4);

  const sin = Math.sin(actor.yaw), cos = Math.cos(actor.yaw);
  let wishX = 0, wishZ = 0;
  if (!frozen && (f !== 0 || r !== 0)) {
    // Forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw)... in three.js yaw terms:
    wishX = -sin * f + cos * r;
    wishZ = -cos * f - sin * r;
    const l = Math.hypot(wishX, wishZ) || 1;
    wishX /= l;
    wishZ /= l;
  }
  if (!frozen && input.keys.has('Space') && actor.onGround) {
    actor.vel.y = 7.6;
    actor.onGround = false;
    sfx.jump();
  }
  moveActor(actor, wishX, wishZ, frozen ? 0 : maxSpeed, dt, false);

  // Footsteps: audible to bots (and the player) — walking and crouching are quiet.
  const speed = horizontalSpeed(actor);
  if (actor.onGround && speed > 0.6) {
    actor.stepAcc += speed * dt;
    const stride = walking || crouch ? 3.4 : 2.6;
    if (actor.stepAcc > stride) {
      actor.stepAcc = 0;
      sfx.footstep(0, !walking);
      if (!walking && !crouch) makeNoise(actor.pos.x, actor.pos.z, 11, actor.team, 'steps');
    }
    actor.bobPhase = (actor.bobPhase ?? 0) + dt * speed * 1.55;
  }

  updateWeapon(actor, dt);
  if (frozen) return;

  // Weapon switching.
  if (input.pressed.has('Digit1')) switchTo(actor, 'primary');
  if (input.pressed.has('Digit2')) switchTo(actor, 'sidearm');
  if (input.wheel !== 0) {
    switchTo(actor, actor.loadout.current === 'primary' ? 'sidearm' : 'primary');
  }
  if (input.pressed.has('KeyR')) startReload(actor);

  // Firing. Semi-automatic weapons need a fresh click per shot.
  viewDir(actor, aimDir);
  const inst = currentInst(actor);
  if (input.firing && inst) {
    if (def.auto || !actor.semiLatch) {
      tryShoot(actor, aimDir.x, aimDir.y, aimDir.z, G.time);
    }
    actor.semiLatch = true;
  } else {
    actor.semiLatch = false;
  }

  // Grenades on 4/5/6.
  actor.grenadeT -= dt;
  if (actor.grenadeT <= 0) {
    const kind = input.pressed.has('Digit4') ? 'frag'
      : input.pressed.has('Digit5') ? 'flash'
        : input.pressed.has('Digit6') ? 'smoke' : null;
    if (kind && actor.loadout.grenades[kind] > 0) {
      if (throwGrenade(actor, kind, aimDir.x, aimDir.y + 0.06, aimDir.z)) actor.grenadeT = 0.55;
    }
  }
}
