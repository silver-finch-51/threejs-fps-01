// world.js — everything three.js draws that is not an effect: the yard's geometry from map.js
// data, the sky and light, bot bodies, the player's viewmodel, and the charge. Textures are
// painted on canvases at boot (concrete, planks, container ribs, furnace glow, hazard
// stripes), so the game ships zero image files and still has its own art direction: dusk
// light, sand and charcoal, rust for Ember, teal for Ward.

import * as THREE from 'three';
import { SOLIDS, SITES } from './map.js';

export const PALETTE = {
  sky: 0x2e3a4a,
  fog: 0x8a7a5f,
  sand: 0xc2a06d,
  concrete: 0xb3a48d,
  charcoal: 0x3c4147,
  rust: 0xc25e2e,
  ember: 0xe06428,
  ward: 0x2e8f86,
  ink: 0x1d2126,
};

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, size, base, flecks, n = 2600) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = flecks[Math.floor(Math.random() * flecks.length)];
    ctx.globalAlpha = 0.05 + Math.random() * 0.12;
    const s = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  ctx.globalAlpha = 1;
}

let textures = null;
function makeTextures() {
  if (textures) return textures;
  const concrete = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#b3a48d', ['#9c8d74', '#c6b89e', '#8a7c64']);
    ctx.strokeStyle = 'rgba(70,60,45,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  });
  const ground = canvasTexture(512, (ctx, s) => {
    speckle(ctx, s, '#c2a06d', ['#a8895a', '#d4b57f', '#93784c'], 5200);
  }, 10);
  const planks = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#a97c50', ['#8f6539', '#c09368']);
    ctx.strokeStyle = 'rgba(60,40,20,0.55)';
    ctx.lineWidth = 3;
    for (let y = 0; y <= s; y += s / 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
    }
    ctx.strokeRect(6, 6, s - 12, s - 12);
  });
  const ribs = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#7d8894', ['#68737e', '#93a1ad']);
    ctx.fillStyle = 'rgba(40,46,52,0.4)';
    for (let x = 0; x < s; x += s / 8) ctx.fillRect(x, 0, 5, s);
  });
  const furnace = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#4a4643', ['#3a3733', '#5a554f']);
    ctx.fillStyle = '#ff7a26';
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(20 + Math.random() * (s - 60), 30 + i * 30, 26 + Math.random() * 30, 5);
    }
    ctx.globalAlpha = 1;
  });
  const hazard = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#26282c';
    for (let x = -s; x < s * 2; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, s); ctx.lineTo(x + 16, s); ctx.lineTo(x + 16 + s, 0); ctx.lineTo(x + s, 0);
      ctx.fill();
    }
  }, 3);
  textures = { concrete, ground, planks, ribs, furnace, hazard };
  return textures;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

function kindMaterial(kind, index) {
  const t = makeTextures();
  switch (kind) {
    case 'crate':
      return new THREE.MeshStandardMaterial({ map: t.planks, roughness: 0.85 });
    case 'container':
      return new THREE.MeshStandardMaterial({
        map: t.ribs, roughness: 0.6, metalness: 0.35,
        color: [0xd8dee2, 0xe0a58f, 0x9fc4bd][index % 3],
      });
    case 'furnace':
      return new THREE.MeshStandardMaterial({ map: t.furnace, roughness: 0.7, metalness: 0.4 });
    case 'barrier':
      return new THREE.MeshStandardMaterial({ map: t.hazard, roughness: 0.8 });
    default:
      return new THREE.MeshStandardMaterial({ map: t.concrete, roughness: 0.95 });
  }
}

let bombMesh = null;
let bombLightDot = null;

export function initWorld(scene) {
  const t = makeTextures();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(0x9a8a6d, 55, 150);

  const hemi = new THREE.HemisphereLight(0xcfd8e6, 0x6b543a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a8, 2.6);
  sun.position.set(-38, 52, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x404850, 0.5));

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({ map: t.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Distant mesas for a horizon silhouette.
  const mesaMat = new THREE.MeshStandardMaterial({ color: 0x5d5648, roughness: 1 });
  const mesaData = [
    [-120, -60, 90, 16, 40], [110, -90, 120, 22, 50], [30, -140, 160, 14, 46],
    [-90, 90, 100, 12, 36], [120, 60, 80, 18, 30],
  ];
  for (const [x, z, w, h, d] of mesaData) {
    const m = new THREE.Mesh(boxGeo, mesaMat);
    m.position.set(x, h / 2 - 1, z);
    m.scale.set(w, h, d);
    scene.add(m);
  }

  // Solids → boxes, with a darker cap trim on walls for definition.
  const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.charcoal, roughness: 0.8 });
  SOLIDS.forEach((s, i) => {
    const mesh = new THREE.Mesh(boxGeo, kindMaterial(s.kind, i));
    mesh.position.set(s.x, s.h / 2, s.z);
    mesh.scale.set(s.w, s.h, s.d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (s.kind === 'wall' && s.h >= 3) {
      const trim = new THREE.Mesh(boxGeo, trimMat);
      trim.position.set(s.x, s.h + 0.09, s.z);
      trim.scale.set(s.w + 0.18, 0.18, s.d + 0.18);
      trim.castShadow = true;
      scene.add(trim);
    }
  });

  // Site decals: a painted ring and letter on the ground of each site.
  for (const site of Object.values(SITES)) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = site.id === 'A' ? '#e06428' : '#2e8f86';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 'bold 150px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(site.id, 128, 136);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(site.r * 2, site.r * 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.x, 0.03, site.z);
    scene.add(decal);
  }

  // The ember charge: a dark case with a glowing core dot.
  bombMesh = new THREE.Group();
  const caseMesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.5, metalness: 0.4 }));
  caseMesh.scale.set(0.52, 0.3, 0.36);
  caseMesh.position.y = 0.15;
  bombMesh.add(caseMesh);
  bombLightDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5a1f }),
  );
  bombLightDot.position.set(0, 0.33, 0);
  bombMesh.add(bombLightDot);
  bombMesh.visible = false;
  scene.add(bombMesh);
}

export function setBombVisual(x, z, visible, blinkOn) {
  if (!bombMesh) return;
  bombMesh.visible = visible;
  if (visible) {
    bombMesh.position.set(x, 0, z);
    bombLightDot.material.color.setHex(blinkOn ? 0xff5a1f : 0x571f08);
  }
}

// ---- Bot bodies ---------------------------------------------------------------

const teamMats = {
  ember: {
    torso: new THREE.MeshStandardMaterial({ color: PALETTE.ember, roughness: 0.8 }),
    limb: new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.9 }),
  },
  ward: {
    torso: new THREE.MeshStandardMaterial({ color: PALETTE.ward, roughness: 0.8 }),
    limb: new THREE.MeshStandardMaterial({ color: 0x2f3d3a, roughness: 0.9 }),
  },
};
const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a186, roughness: 0.7 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x5d6873, roughness: 0.45, metalness: 0.5 });

// Build a low-poly soldier: legs, torso, head with helmet, and a gun held forward. The
// group's origin is at the feet; parts are returned for the walk/death animation.
export function makeBotMesh(team) {
  const mats = teamMats[team];
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);

  const legGeo = new THREE.BoxGeometry(0.17, 0.82, 0.2);
  const legL = new THREE.Mesh(legGeo, mats.limb);
  legL.position.set(-0.13, 0.41, 0);
  const legR = new THREE.Mesh(legGeo, mats.limb);
  legR.position.set(0.13, 0.41, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.64, 0.3), mats.torso);
  torso.position.set(0, 1.14, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), skinMat);
  head.position.set(0, 1.62, 0);
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.38), mats.torso);
  helmet.position.set(0, 1.72, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.78), gunMat);
  gun.position.set(0.17, 1.32, -0.42);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.5), mats.limb);
  arm.position.set(0.17, 1.3, -0.14);
  for (const part of [legL, legR, torso, head, helmet, gun, arm]) {
    part.castShadow = true;
    inner.add(part);
  }
  return { group, inner, legL, legR, gun, torso };
}

// Pose a bot mesh from its actor state: position, facing, crouch, walk swing, death fall.
export function syncBotMesh(actor, dt) {
  const view = actor.view;
  if (!view) return;
  const { group, inner, legL, legR, gun } = view;
  group.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
  group.rotation.y = actor.yaw; // local -Z (the gun side) maps to the actor's view forward
  const speed = Math.hypot(actor.vel.x, actor.vel.z);
  if (!actor.alive) {
    actor.deathT = (actor.deathT ?? 0) + dt;
    const fall = Math.min(1, actor.deathT * 2.6);
    inner.rotation.x = -fall * Math.PI * 0.48;
    inner.position.y = actor.deathT > 3.4 ? Math.max(-1.7, -(actor.deathT - 3.4) * 0.5) : 0;
    group.visible = actor.deathT < 5.2;
    return;
  }
  inner.rotation.x = 0;
  inner.position.y = 0;
  group.visible = true;
  const crouchDrop = (1.8 - actor.height) * 0.55;
  inner.position.y = -crouchDrop;
  actor.walkCycle = (actor.walkCycle ?? 0) + dt * speed * 1.9;
  const swing = Math.min(1, speed / 4) * 0.55;
  legL.rotation.x = Math.sin(actor.walkCycle * 2) * swing;
  legR.rotation.x = -Math.sin(actor.walkCycle * 2) * swing;
  gun.position.z = -0.42 + (actor.kick ?? 0) * 0.09;
  gun.rotation.x = -(actor.kick ?? 0) * 0.14;
}

// ---- Player viewmodel -----------------------------------------------------------

const viewmodelBuilders = {
  kestrel: (g) => pistolShape(g, 0.34),
  mule: (g) => pistolShape(g, 0.42),
  ripper: (g) => {
    box(g, 0.09, 0.13, 0.52, 0, 0, -0.3, gunMat);
    box(g, 0.05, 0.2, 0.07, 0, -0.15, -0.28, gunMat);
    box(g, 0.04, 0.04, 0.3, 0, 0.03, -0.62, gunMat);
  },
  breacher: (g) => {
    box(g, 0.11, 0.15, 0.62, 0, 0, -0.34, gunMat);
    box(g, 0.09, 0.09, 0.3, 0, -0.09, -0.4, teamMats.ember.limb);
  },
  longbow: (g) => {
    box(g, 0.08, 0.12, 0.66, 0, 0, -0.38, gunMat);
    box(g, 0.05, 0.22, 0.07, 0, -0.16, -0.3, gunMat);
    box(g, 0.045, 0.07, 0.16, 0, 0.11, -0.4, gunMat);
    box(g, 0.03, 0.03, 0.34, 0, 0.02, -0.78, gunMat);
  },
  aegis: (g) => {
    box(g, 0.08, 0.12, 0.8, 0, 0, -0.45, gunMat);
    box(g, 0.05, 0.2, 0.07, 0, -0.15, -0.34, gunMat);
    box(g, 0.06, 0.09, 0.24, 0, 0.12, -0.48, gunMat);
    box(g, 0.025, 0.025, 0.4, 0, 0.02, -0.95, gunMat);
  },
};

function pistolShape(g, len) {
  box(g, 0.07, 0.11, len, 0, 0.01, -0.2, gunMat);
  box(g, 0.06, 0.16, 0.08, 0, -0.1, -0.08, gunMat);
}

function box(parent, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// One group per weapon, toggled by visibility; hands are two simple boxes.
export function makeViewmodel() {
  const root = new THREE.Group();
  const hands = new THREE.Group();
  const handMat = teamMats.ember.limb;
  const h1 = box(hands, 0.09, 0.09, 0.22, 0.02, -0.13, -0.3, handMat);
  h1.rotation.x = 0.5;
  const h2 = box(hands, 0.09, 0.09, 0.2, 0.13, -0.1, -0.44, handMat);
  h2.rotation.x = 0.9;
  root.add(hands);
  const guns = {};
  for (const [id, build] of Object.entries(viewmodelBuilders)) {
    const g = new THREE.Group();
    build(g);
    g.visible = false;
    guns[id] = g;
    root.add(g);
  }
  root.position.set(0.21, -0.21, -0.12);
  return { root, guns, current: null, swayX: 0, swayY: 0 };
}

export function syncViewmodel(vm, actor, dt, lookDX, lookDY, bobPhase, bobAmount) {
  const inst = actor.loadout.current === 'primary' ? actor.loadout.primary : actor.loadout.sidearm;
  const id = inst ? inst.id : null;
  if (vm.current !== id) {
    if (vm.current && vm.guns[vm.current]) vm.guns[vm.current].visible = false;
    if (id && vm.guns[id]) vm.guns[id].visible = true;
    vm.current = id;
  }
  vm.swayX += ((-lookDX * 0.0016) - vm.swayX) * Math.min(1, dt * 10);
  vm.swayY += ((-lookDY * 0.0016) - vm.swayY) * Math.min(1, dt * 10);
  const kick = actor.kick ?? 0;
  const reloadDip = actor.loadout.reloadT > 0 ? Math.sin(Math.min(1, actor.loadout.reloadT) * Math.PI) * 0.4 : 0;
  const drawDip = actor.loadout.switchT > 0 ? actor.loadout.switchT * 1.4 : 0;
  vm.root.position.set(
    0.21 + vm.swayX + Math.sin(bobPhase) * 0.008 * bobAmount,
    -0.21 + vm.swayY + Math.abs(Math.cos(bobPhase)) * 0.011 * bobAmount - reloadDip * 0.14 - drawDip * 0.3,
    -0.12 + kick * 0.07,
  );
  vm.root.rotation.set(kick * 0.1 + reloadDip * 0.5 + drawDip * 0.6, vm.swayX * 1.4, 0);
}
