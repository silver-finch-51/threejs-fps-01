// main.js — bootstrap and the frame loop. The simulation runs on a fixed 1/60 step from an
// accumulator (rounds, bots, the player, grenades), decoupled from rendering: each frame
// steps the sim as many times as the elapsed time demands, then draws the state — camera
// from the player's eye, bot meshes posed, effects advanced, HUD refreshed per step.
//
// With ?shot=<scene>&seed=N the game instead poses one deterministic frame for a screenshot
// (see shots.js) and flags window.__shotReady when it is on screen.

import * as THREE from 'three';
import { G, CFG, PHASE } from './state.js';
import { SPAWNS } from './map.js';
import { initInput, input, lockPointer, consumeStepInput } from './input.js';
import { initAudio, resumeAudio } from './audio.js';
import { initWorld, makeBotMesh, syncBotMesh, makeViewmodel, syncViewmodel, setBombVisual } from './world.js';
import { initEffects, updateEffects } from './effects.js';
import { createMatch, startMatch, updateRounds } from './rounds.js';
import { updatePlayer } from './player.js';
import { updateBot } from './bots.js';
import { updateGrenades, projectiles, smokes, currentDef } from './weapons.js';
import { initHud, updateHud, setMenuVisible, setMatchOverVisible } from './hud.js';
import { setupShotScene } from './shots.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const shotSeed = Number(params.get('seed') ?? '7') || 7;

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.08, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

initWorld(scene);
initEffects(scene);

let matchStarted = false;
let matchOverShown = false;

function beginMatch() {
  startMatch();
  matchStarted = true;
  matchOverShown = false;
  setMenuVisible(false);
  setMatchOverVisible(false);
  lockPointer(renderer.domElement);
}

initHud({
  onPlay: () => {
    initAudio();
    resumeAudio();
    if (!matchStarted) beginMatch();
    else {
      setMenuVisible(false);
      lockPointer(renderer.domElement);
    }
  },
  onRestart: () => {
    initAudio();
    resumeAudio();
    beginMatch();
  },
});

initInput(renderer.domElement, (locked) => {
  if (!locked && matchStarted && G.phase !== PHASE.MATCH_OVER && !shot) {
    setMenuVisible(true); // paused: pointer released mid-match
  }
});

// Create the match and give every bot its body. In shot mode the scene builder makes the
// match itself (with the shot's seed), so meshes are assigned after it runs.
if (shot) {
  setupShotScene(shot);
  setMenuVisible(false);
} else {
  createMatch((Date.now() % 90000) + 11);
  // Pose everyone at their spawns behind the menu.
  const counters = { ember: 0, ward: 0 };
  for (const a of G.actors) {
    const i = counters[a.team]++;
    const s = SPAWNS[a.team][i % SPAWNS[a.team].length];
    a.pos.set(s.x, 0, s.z);
    a.yaw = a.team === 'ember' ? 0 : Math.PI;
  }
}
for (const a of G.actors) {
  if (a.isPlayer) continue;
  a.view = makeBotMesh(a.team);
  scene.add(a.view.group);
}
const viewmodel = makeViewmodel();
viewmodel.root.scale.setScalar(0.9);
camera.add(viewmodel.root);
// A soft fill so the held weapon reads against the dusk instead of going black.
const gunFill = new THREE.PointLight(0xffe2b8, 1.1, 2.4, 1.8);
gunFill.position.set(0.3, -0.1, 0.25);
camera.add(gunFill);

window.__emberline = { G, beginMatch, createMatch };
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Simulation step ---------------------------------------------------------------

function step(dt) {
  G.time += dt;
  const canAct = G.phase === PHASE.BUY || G.phase === PHASE.LIVE || G.phase === PHASE.PLANTED;
  updatePlayer(G.player, dt, canAct);
  for (const a of G.actors) {
    if (!a.isPlayer) updateBot(a, dt);
  }
  updateRounds(dt);
  updateGrenades(dt);
  // Prune the noise channel in place: bots listen to the last 0.3 s of sound.
  let w = 0;
  for (let i = 0; i < G.noises.length; i++) {
    if (G.time - G.noises[i].t < 0.3) G.noises[w++] = G.noises[i];
  }
  G.noises.length = w;
  updateHud(dt);
  consumeStepInput();
}

// ---- Rendering -----------------------------------------------------------------------

let prevYaw = 0;
let prevPitch = 0;

function poseCamera(dt) {
  const p = G.player;
  if (!p) return;
  if (G.phase === PHASE.MENU && !shot) {
    // A slow orbit over the yard behind the menu.
    const t = performance.now() * 0.00004;
    camera.position.set(Math.sin(t) * 34, 17, Math.cos(t) * 34);
    camera.lookAt(0, 0, -6);
    camera.fov = 60;
    camera.updateProjectionMatrix();
    viewmodel.root.visible = false;
    return;
  }
  viewmodel.root.visible = p.alive;
  const eyeY = p.pos.y + p.height - 0.14 - (p.alive ? 0 : Math.min(0.9, (p.deathT ?? 0) * 0.5));
  G.shake = Math.max(0, G.shake - dt * 1.7);
  const shX = (Math.random() - 0.5) * G.shake * 0.05;
  const shY = (Math.random() - 0.5) * G.shake * 0.05;
  camera.position.set(p.pos.x + shX, eyeY + shY, p.pos.z);
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch + (p.kick ?? 0) * 0.045;
  camera.rotation.z = p.alive ? 0 : Math.min(0.55, (p.deathT ?? 0) * 0.5);

  const def = currentDef(p);
  const wantFov = input.aiming && def && def.zoom && p.alive ? 36 : 78;
  if (Math.abs(camera.fov - wantFov) > 0.05) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 11);
    camera.updateProjectionMatrix();
  }

  const lookDX = (p.yaw - prevYaw) * 60;
  const lookDY = (p.pitch - prevPitch) * 60;
  prevYaw = p.yaw;
  prevPitch = p.pitch;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  syncViewmodel(viewmodel, p, dt, lookDX, lookDY, p.bobPhase ?? 0, p.onGround ? Math.min(1, speed / 5) : 0);
}

function poseBomb() {
  const bomb = G.bomb;
  if (!bomb) {
    setBombVisual(0, 0, false, false);
    return;
  }
  if (bomb.state === 'carried' && bomb.carrier) {
    setBombVisual(bomb.carrier.pos.x, bomb.carrier.pos.z, true, true);
  } else if ((bomb.state === 'dropped' || bomb.state === 'planted') && bomb.pos) {
    const blink = bomb.state === 'dropped' ? true : (G.time * 2.2) % 1 < 0.62;
    setBombVisual(bomb.pos.x, bomb.pos.z, true, blink);
  } else {
    setBombVisual(0, 0, false, false);
  }
}

// ---- Frame loops -----------------------------------------------------------------------

let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (shot) {
    // Posed scene: no simulation, just draw it (meshes, effects, HUD) until captured.
    for (const a of G.actors) if (!a.isPlayer) syncBotMesh(a, dt);
    poseCamera(dt);
    poseBomb();
    updateEffects(dt, smokes, projectiles);
    updateHud(0.016);
    renderer.render(scene, camera);
    return;
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= CFG.simDt && steps < 5) {
    step(CFG.simDt);
    accumulator -= CFG.simDt;
    steps += 1;
  }
  if (steps === 5) accumulator = 0;

  if (G.phase === PHASE.MATCH_OVER && !matchOverShown) {
    matchOverShown = true;
    if (document.pointerLockElement) document.exitPointerLock();
    setMatchOverVisible(true);
  }

  for (const a of G.actors) if (!a.isPlayer) syncBotMesh(a, dt);
  poseCamera(dt);
  poseBomb();
  updateEffects(dt, smokes, projectiles);
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
if (shot) {
  setTimeout(() => {
    window.__shotReady = true;
  }, 1400);
}
