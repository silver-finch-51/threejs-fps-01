// physics.js — movement and ray queries against the map's solid boxes. Everything here is
// allocation-free in the hot path: results are written into caller-owned objects. Actors are
// vertical capsules approximated by a ground circle plus a height; bullets are rays tested
// against the same boxes the renderer draws, so cover works identically for eyes and guns.

import { SOLIDS } from './map.js';

const GRAVITY = 22;
const STEP_UP = 0.55; // tallest ledge an actor steps onto without jumping

// The highest standable surface under a point, for an actor whose feet were at feetY:
// a box top counts when it is no higher than a step above the feet.
export function groundYAt(x, z, feetY) {
  let ground = 0;
  for (const s of SOLIDS) {
    if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2) {
      if (s.h <= feetY + STEP_UP && s.h > ground) ground = s.h;
    }
  }
  return ground;
}

// Push a ground circle out of every solid that rises above step height at the actor's feet.
function pushOutOfSolids(actor) {
  const r = actor.radius;
  for (const s of SOLIDS) {
    if (s.h <= actor.pos.y + STEP_UP) continue; // can be stood on, not a wall
    const dx = actor.pos.x - s.x;
    const dz = actor.pos.z - s.z;
    const px = s.w / 2 + r - Math.abs(dx);
    if (px <= 0) continue;
    const pz = s.d / 2 + r - Math.abs(dz);
    if (pz <= 0) continue;
    if (px < pz) actor.pos.x = s.x + (dx >= 0 ? 1 : -1) * (s.w / 2 + r);
    else actor.pos.z = s.z + (dz >= 0 ? 1 : -1) * (s.d / 2 + r);
  }
}

// Advance one actor by dt. wishX/wishZ is the desired move direction (unit length or zero),
// maxSpeed in m/s. Ground movement eases toward the wish velocity (acceleration you can feel,
// stopping distance you can aim with); air control is weak. Sets actor.onGround.
export function moveActor(actor, wishX, wishZ, maxSpeed, dt, groundOnly) {
  const blend = actor.onGround ? 11 : 1.6;
  const k = Math.min(1, blend * dt);
  actor.vel.x += (wishX * maxSpeed - actor.vel.x) * k;
  actor.vel.z += (wishZ * maxSpeed - actor.vel.z) * k;

  actor.vel.y -= GRAVITY * dt;
  const prevFeet = actor.pos.y;
  actor.pos.x += actor.vel.x * dt;
  actor.pos.z += actor.vel.z * dt;
  actor.pos.y += actor.vel.y * dt;

  pushOutOfSolids(actor);
  if (groundOnly) {
    actor.pos.y = 0;
    actor.vel.y = 0;
    actor.onGround = true;
    return;
  }
  const ground = groundYAt(actor.pos.x, actor.pos.z, Math.max(prevFeet, actor.pos.y));
  if (actor.pos.y <= ground) {
    actor.pos.y = ground;
    actor.vel.y = 0;
    actor.onGround = true;
  } else {
    actor.onGround = actor.pos.y <= ground + 0.001;
  }
}

export function horizontalSpeed(actor) {
  return Math.hypot(actor.vel.x, actor.vel.z);
}

// Ray vs every solid box. Writes { dist, x, y, z } into out and returns true on a hit.
export function rayVsSolids(ox, oy, oz, dx, dy, dz, maxDist, out) {
  let best = maxDist;
  let hit = false;
  for (const s of SOLIDS) {
    const minX = s.x - s.w / 2, maxX = s.x + s.w / 2;
    const minZ = s.z - s.d / 2, maxZ = s.z + s.d / 2;
    let t0 = 0, t1 = best;
    // Slab test per axis; y box is [0, s.h].
    if (Math.abs(dx) < 1e-9) {
      if (ox < minX || ox > maxX) continue;
    } else {
      let ta = (minX - ox) / dx, tb = (maxX - ox) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dy) < 1e-9) {
      if (oy < 0 || oy > s.h) continue;
    } else {
      let ta = (0 - oy) / dy, tb = (s.h - oy) / dy;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) {
      if (oz < minZ || oz > maxZ) continue;
    } else {
      let ta = (minZ - oz) / dz, tb = (maxZ - oz) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (t0 < best && t0 >= 0) {
      best = t0;
      hit = true;
      out.dist = t0;
      out.x = ox + dx * t0;
      out.y = oy + dy * t0;
      out.z = oz + dz * t0;
    }
  }
  return hit;
}

// Ray vs one actor's hit volumes: a head sphere and a body capsule (as a vertical segment
// with radius). Returns 'head' | 'chest' | 'legs' and writes the distance into out, or null.
export function rayVsActor(ox, oy, oz, dx, dy, dz, actor, maxDist, out) {
  const feet = actor.pos.y;
  const height = actor.height;
  // Head sphere.
  const hx = actor.pos.x, hy = feet + height - 0.21, hz = actor.pos.z;
  const hr = 0.235;
  const ocx = hx - ox, ocy = hy - oy, ocz = hz - oz;
  const tca = ocx * dx + ocy * dy + ocz * dz;
  if (tca > 0 && tca < maxDist) {
    const d2 = ocx * ocx + ocy * ocy + ocz * ocz - tca * tca;
    if (d2 < hr * hr) {
      out.dist = tca - Math.sqrt(hr * hr - d2);
      out.part = 'head';
      return out.part;
    }
  }
  // Body: distance from the ray to the capsule segment (feet+0.28 .. feet+height-0.34).
  const y0 = feet + 0.28, y1 = feet + height - 0.34;
  const r = actor.radius + 0.04;
  // Closest points between ray (o + t d) and segment (x=actor.x, z=actor.z, y in [y0,y1]).
  // Solve in the ray's parameter by sampling the analytic closest approach on the segment axis.
  let bestT = -1;
  let bestD2 = r * r;
  // The segment is vertical: closest point pairs are found by minimising over t for the
  // clamped segment point; a few Newton steps from the unclamped solution are plenty.
  let t = ((actor.pos.x - ox) * dx + (actor.pos.z - oz) * dz) / Math.max(1e-6, dx * dx + dz * dz);
  for (let i = 0; i < 3; i++) {
    const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
    const cy = Math.min(y1, Math.max(y0, py));
    const ex = px - actor.pos.x, ey = py - cy, ez = pz - actor.pos.z;
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestT = t;
    }
    // Move t toward the point level with the clamped segment point.
    const denom = dx * dx + dy * dy + dz * dz;
    const tNext = ((actor.pos.x - ox) * dx + (cy - oy) * dy + (actor.pos.z - oz) * dz) / denom;
    if (Math.abs(tNext - t) < 1e-4) break;
    t = tNext;
  }
  if (bestT > 0 && bestT < maxDist) {
    const py = oy + dy * bestT;
    out.dist = bestT;
    out.part = py > feet + height * 0.62 ? 'chest' : 'legs';
    return out.part;
  }
  return null;
}

// Line of sight between two points: false when a solid blocks the straight line.
const losOut = { dist: 0, x: 0, y: 0, z: 0 };
export function lineOfSight(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-4) return true;
  const hit = rayVsSolids(ax, ay, az, dx / dist, dy / dist, dz / dist, dist, losOut);
  return !hit || losOut.dist >= dist - 0.05;
}
