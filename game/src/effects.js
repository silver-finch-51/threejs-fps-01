// effects.js — transient visuals: tracers, impact sparks, hit puffs, muzzle flashes, grenade
// and smoke rendering, explosions. Everything is pooled and reused: a fixed set of meshes and
// one particle buffer are recycled, so a long firefight allocates nothing per frame.

import * as THREE from 'three';

const MAX_PARTICLES = 900;
const MAX_TRACERS = 40;
const MAX_MUZZLES = 10;
const MAX_CLOUDS = 8;
const MAX_SHELLS = 12;

let scene = null;
let particles = null;
let tracers = [];
let muzzles = [];
let clouds = [];
let shells = [];
let boomLight = null;
let boomT = 0;

const pPos = new Float32Array(MAX_PARTICLES * 3);
const pCol = new Float32Array(MAX_PARTICLES * 3);
const pVel = new Float32Array(MAX_PARTICLES * 3);
const pLife = new Float32Array(MAX_PARTICLES);
const pMaxLife = new Float32Array(MAX_PARTICLES);
const pGrav = new Float32Array(MAX_PARTICLES);
let pCursor = 0;

const tmpColor = new THREE.Color();

export function initEffects(s) {
  scene = s;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    pPos[i * 3 + 1] = -999;
    pLife[i] = 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.085, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  particles = new THREE.Points(geo, mat);
  particles.frustumCulled = false;
  scene.add(particles);

  const tracerGeo = new THREE.BoxGeometry(0.016, 0.016, 1);
  for (let i = 0; i < MAX_TRACERS; i++) {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, t: 0 });
  }

  const muzzleGeo = new THREE.PlaneGeometry(0.42, 0.42);
  for (let i = 0; i < MAX_MUZZLES; i++) {
    const m = new THREE.Mesh(muzzleGeo, new THREE.MeshBasicMaterial({
      color: 0xffc266, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    m.visible = false;
    scene.add(m);
    muzzles.push({ mesh: m, t: 0 });
  }

  const cloudGeo = new THREE.SphereGeometry(1, 18, 12);
  for (let i = 0; i < MAX_CLOUDS; i++) {
    const m = new THREE.Mesh(cloudGeo, new THREE.MeshStandardMaterial({
      color: 0x9aa0a3, transparent: true, opacity: 0, roughness: 1, depthWrite: false,
    }));
    m.visible = false;
    scene.add(m);
    clouds.push(m);
  }

  const shellGeo = new THREE.SphereGeometry(0.14, 10, 8);
  for (let i = 0; i < MAX_SHELLS; i++) {
    const m = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6 }));
    m.visible = false;
    scene.add(m);
    shells.push(m);
  }

  boomLight = new THREE.PointLight(0xff8c3a, 0, 26, 1.8);
  scene.add(boomLight);
}

function spawnParticle(x, y, z, vx, vy, vz, life, r, g, b, grav) {
  const i = pCursor;
  pCursor = (pCursor + 1) % MAX_PARTICLES;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b;
  pLife[i] = life;
  pMaxLife[i] = life;
  pGrav[i] = grav;
}

function burst(x, y, z, count, speed, life, hex, grav, up = 0) {
  tmpColor.setHex(hex);
  for (let n = 0; n < count; n++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * Math.PI - Math.PI / 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    spawnParticle(
      x, y, z,
      Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + up, Math.sin(a) * Math.cos(e) * s,
      life * (0.6 + Math.random() * 0.7),
      tmpColor.r, tmpColor.g, tmpColor.b, grav,
    );
  }
}

const tracerMid = new THREE.Vector3();
const tracerDir = new THREE.Vector3();
export function tracer(x1, y1, z1, x2, y2, z2) {
  const slot = tracers.find((t) => t.t <= 0) ?? tracers[0];
  const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  if (len < 0.5) return;
  tracerMid.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  tracerDir.set(x2 - x1, y2 - y1, z2 - z1);
  slot.mesh.position.copy(tracerMid);
  slot.mesh.lookAt(tracerMid.x + tracerDir.x, tracerMid.y + tracerDir.y, tracerMid.z + tracerDir.z);
  slot.mesh.scale.set(1, 1, len);
  slot.mesh.visible = true;
  slot.t = 0.07;
}

export function muzzle(x, y, z, dx, dy, dz, heavy) {
  const slot = muzzles.find((m) => m.t <= 0) ?? muzzles[0];
  slot.mesh.position.set(x + dx * 0.1, y + dy * 0.1, z + dz * 0.1);
  slot.mesh.lookAt(x + dx * 2, y + dy * 2, z + dz * 2);
  slot.mesh.rotation.z = Math.random() * Math.PI;
  const s = heavy ? 1.5 : 1;
  slot.mesh.scale.set(s, s, s);
  slot.mesh.visible = true;
  slot.t = 0.045;
  burst(x, y, z, heavy ? 5 : 3, 1.6, 0.12, 0xffb85c, 0);
}

export function impact(x, y, z) {
  burst(x, y, z, 7, 2.4, 0.3, 0xd8c9a3, 5, 0.6);
}

export function bloodPuff(x, y, z, team) {
  burst(x, y, z, 8, 1.8, 0.32, team === 'ember' ? 0xff7a3c : 0x3fd9c0, 3, 0.2);
}

export function deathPuff(actor) {
  burst(actor.pos.x, actor.pos.y + 1, actor.pos.z, 22, 3, 0.55, actor.team === 'ember' ? 0xff7a3c : 0x3fd9c0, 4, 0.8);
}

export function explosionFx(x, y, z) {
  burst(x, y + 0.4, z, 46, 6.5, 0.7, 0xff9040, 2.5, 1.6);
  burst(x, y + 0.4, z, 24, 3.4, 1.0, 0x5a5348, 1.2, 2.2);
  boomLight.position.set(x, y + 1.6, z);
  boomLight.intensity = 260;
  boomT = 0.4;
}

export function flashPuff(x, y, z) {
  burst(x, y, z, 16, 3, 0.25, 0xffffff, 0);
  boomLight.position.set(x, y + 0.6, z);
  boomLight.intensity = 160;
  boomT = 0.18;
}

export function smokePuff(x, y, z) {
  burst(x, y + 0.3, z, 10, 1.2, 0.5, 0x8b9094, -0.4, 0.5);
}

export function bombExplosion(x, z) {
  burst(x, 1, z, 130, 11, 1.3, 0xff8033, 2, 3);
  burst(x, 1, z, 60, 6, 1.8, 0x66584a, 1, 4);
  boomLight.position.set(x, 3, z);
  boomLight.intensity = 900;
  boomT = 1.1;
}

// Sync the pooled cloud and grenade meshes with the live simulation lists, then advance
// every pooled effect. Called once per rendered frame.
export function updateEffects(dt, smokes, projectiles) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) {
      pPos[i * 3 + 1] = -999;
      continue;
    }
    pVel[i * 3 + 1] -= pGrav[i] * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.02) pPos[i * 3 + 1] = 0.02;
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;

  for (const t of tracers) {
    if (t.t <= 0) continue;
    t.t -= dt;
    t.mesh.material.opacity = Math.max(0, t.t / 0.07) * 0.85;
    if (t.t <= 0) t.mesh.visible = false;
  }
  for (const m of muzzles) {
    if (m.t <= 0) continue;
    m.t -= dt;
    m.mesh.material.opacity = Math.max(0, m.t / 0.045);
    if (m.t <= 0) m.mesh.visible = false;
  }
  if (boomT > 0) {
    boomT -= dt;
    if (boomT <= 0) boomLight.intensity = 0;
  }

  for (let i = 0; i < MAX_CLOUDS; i++) {
    const s = smokes[i];
    const mesh = clouds[i];
    if (!s) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.position.set(s.x, s.y, s.z);
    const grow = Math.min(1, (17 - s.t) < 1 ? (17 - s.t) : 1);
    const fade = Math.min(1, s.t / 2.5);
    mesh.scale.setScalar(s.r * (0.7 + 0.3 * grow));
    mesh.material.opacity = 0.52 * fade;
  }
  for (let i = 0; i < MAX_SHELLS; i++) {
    const p = projectiles[i];
    const mesh = shells[i];
    if (!p) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.position.set(p.x, p.y, p.z);
    mesh.material.color.setHex(p.kind === 'frag' ? 0x37402c : p.kind === 'flash' ? 0xb9c0c7 : 0x2b2f33);
  }
}
