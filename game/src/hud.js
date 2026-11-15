// hud.js — every DOM element over the canvas: health and armour, money, ammunition, the
// round clock and score, killfeed, announcements, the buy menu, the scoreboard, and the
// menu / match-over overlays. It only reads state (plus the buy menu's own open flag) and
// writes text and styles; the simulation never waits on it.

import { G, CFG, PHASE, TEAM } from './state.js';
import { WEAPONS, CATALOG, currentDef, currentInst } from './weapons.js';
import { bombHint, tryBuy } from './rounds.js';
import { input } from './input.js';

const el = {};
let buyOpen = false;
let buyRowsBuilt = false;
let scoreSignature = '';

export function initHud({ onPlay, onRestart }) {
  for (const id of [
    'hud', 'crosshair', 'hitmarker', 'health-fill', 'health-num', 'armor-fill', 'money',
    'ammo-mag', 'ammo-reserve', 'weapon-name', 'grenade-counts', 'timer', 'score-line',
    'round-label', 'feed', 'banner', 'banner-title', 'banner-sub', 'buy-menu', 'buy-rows',
    'buy-money', 'bomb-hint', 'bomb-hint-text', 'bomb-hint-fill', 'vignette', 'flash',
    'scoreboard', 'score-rows', 'menu-overlay', 'match-overlay', 'match-title', 'match-sub',
    'scope', 'carrier-tag',
  ]) {
    el[id] = document.getElementById(id);
  }
  document.getElementById('play').addEventListener('click', onPlay);
  document.getElementById('play-again').addEventListener('click', onRestart);
}

export function setMenuVisible(v) {
  el['menu-overlay'].hidden = !v;
}

// Used by the screenshot scenes to pose the buy phase with its menu open.
export function forceBuyOpen(v) {
  buyOpen = v;
}

export function setMatchOverVisible(v) {
  el['match-overlay'].hidden = !v;
  if (v) {
    el['match-title'].textContent = G.winner === TEAM.EMBER ? 'EMBER TAKES THE YARD' : 'WARD HOLDS THE YARD';
    el['match-sub'].textContent = `Final score ${G.score.ember} — ${G.score.ward} · You: ${G.player.kills} kills, ${G.player.deaths} deaths`;
  }
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildBuyRows() {
  el['buy-rows'].innerHTML = '';
  for (const row of CATALOG) {
    const div = document.createElement('div');
    div.className = 'buy-row';
    div.dataset.id = row.id;
    div.innerHTML = `<span class="buy-key">${row.key.replace('Digit', '')}</span><span class="buy-label">${row.label}</span><span class="buy-price">$${row.price}</span>`;
    el['buy-rows'].appendChild(div);
  }
  buyRowsBuilt = true;
}

function ownedLabel(p, id) {
  const lo = p.loadout;
  if (id === 'vest') return p.armor >= 100 ? 'owned' : null;
  if (id === 'vesthelm') return p.helmet ? 'owned' : null;
  if (id === 'frag' || id === 'flash' || id === 'smoke') return lo.grenades[id] > 0 ? 'owned' : null;
  const def = WEAPONS[id];
  const inst = def.kind === 'primary' ? lo.primary : lo.sidearm;
  return inst && inst.id === id ? 'owned' : null;
}

function updateBuyMenu() {
  const p = G.player;
  const inBuy = G.phase === PHASE.BUY;
  if (input.pressed.has('KeyB') && inBuy) buyOpen = !buyOpen;
  if (!inBuy) buyOpen = false;
  el['buy-menu'].hidden = !buyOpen;
  if (!buyOpen) return;
  if (!buyRowsBuilt) buildBuyRows();
  el['buy-money'].textContent = `$${p.money}`;
  for (const row of el['buy-rows'].children) {
    const cat = CATALOG.find((c) => c.id === row.dataset.id);
    const owned = ownedLabel(p, cat.id);
    row.classList.toggle('cant', !owned && p.money < cat.price);
    row.classList.toggle('owned', !!owned);
  }
  for (const cat of CATALOG) {
    if (input.pressed.has(cat.key)) tryBuy(cat.id);
  }
}

function buildScoreRows() {
  // Rebuild only when a displayed number actually changed.
  const signature = G.actors.map((a) => `${a.kills}/${a.deaths}/${a.money}/${a.alive ? 1 : 0}`).join('|');
  if (signature === scoreSignature) return;
  scoreSignature = signature;
  el['score-rows'].innerHTML = '';
  const sorted = [...G.actors].sort((a, b) => b.kills - a.kills);
  for (const a of sorted) {
    const tr = document.createElement('tr');
    tr.className = a.team === TEAM.EMBER ? 'team-ember' : 'team-ward';
    if (a.isPlayer) tr.classList.add('me');
    tr.innerHTML = `<td>${a.name}${a.alive ? '' : ' ✝'}</td><td>${a.team === TEAM.EMBER ? 'Ember' : 'Ward'}</td><td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td>`;
    el['score-rows'].appendChild(tr);
  }
}

export function updateHud(dt) {
  const p = G.player;
  if (!p) return;
  const inGame = G.phase !== PHASE.MENU;

  // Centre announcements: show the newest message, fading with its timer.
  for (let i = G.messages.length - 1; i >= 0; i--) {
    G.messages[i].t -= dt;
    if (G.messages[i].t <= 0) G.messages.splice(i, 1);
  }
  const msg = G.messages[G.messages.length - 1];
  el.banner.style.opacity = msg ? Math.min(1, msg.t) : 0;
  if (msg) {
    el['banner-title'].textContent = msg.text;
    el['banner-sub'].textContent = msg.sub;
  }

  // Killfeed.
  for (let i = G.feed.length - 1; i >= 0; i--) {
    G.feed[i].t -= dt;
    if (G.feed[i].t <= 0) G.feed.splice(i, 1);
  }
  el.feed.innerHTML = G.feed.map((f) => `<div>${f.text}</div>`).join('');

  el.hud.style.visibility = inGame ? 'visible' : 'hidden';
  if (!inGame) return;

  // Clock and score.
  const phaseName = {
    [PHASE.BUY]: 'BUY',
    [PHASE.LIVE]: 'LIVE',
    [PHASE.PLANTED]: 'PLANTED',
    [PHASE.ROUND_OVER]: 'ROUND OVER',
    [PHASE.MATCH_OVER]: 'FULL TIME',
  }[G.phase] ?? '';
  el.timer.textContent = G.phase === PHASE.BUY || G.phase === PHASE.LIVE || G.phase === PHASE.PLANTED
    ? fmtTime(G.phaseT) : '—';
  el.timer.classList.toggle('urgent', G.phase === PHASE.PLANTED || (G.phase === PHASE.LIVE && G.phaseT < 11));
  el['score-line'].innerHTML = `<b class="ember">${G.score.ember}</b> · ${phaseName} · <b class="ward">${G.score.ward}</b>`;
  el['round-label'].textContent = `Round ${Math.max(1, G.round)} of ${CFG.maxRounds} — first to ${CFG.roundsToWin}`;

  // Player vitals.
  el['health-fill'].style.width = `${Math.max(0, p.health)}%`;
  el['health-num'].textContent = Math.ceil(p.health);
  el['armor-fill'].style.width = `${Math.max(0, p.armor)}%`;
  el.money.textContent = `$${p.money}`;
  el.vignette.style.opacity = String(
    Math.max(
      G.time - p.lastHitT < 0.35 ? 0.55 : 0,
      p.health < 35 && p.alive ? 0.3 + 0.12 * Math.sin(G.time * 5) : 0,
    ),
  );
  el.flash.style.opacity = String(Math.min(1, (G.flashT ?? 0) / 1.6));
  G.flashT = Math.max(0, (G.flashT ?? 0) - dt * 0.8);

  // Weapon readout.
  const inst = currentInst(p);
  const def = currentDef(p);
  if (inst && def) {
    el['ammo-mag'].textContent = inst.mag;
    el['ammo-reserve'].textContent = `/ ${inst.reserve}`;
    el['weapon-name'].textContent = def.name + (p.loadout.reloadT > 0 ? ' — reloading' : '');
    el['ammo-mag'].classList.toggle('low', inst.mag <= Math.max(2, def.mag * 0.25));
  }
  el['grenade-counts'].textContent =
    `Shard ×${p.loadout.grenades.frag} · Blink ×${p.loadout.grenades.flash} · Veil ×${p.loadout.grenades.smoke}`;
  el['carrier-tag'].style.visibility = G.bomb && G.bomb.state === 'carried' && G.bomb.carrier === p ? 'visible' : 'hidden';

  // Crosshair spread grows with the same bloom the gun uses; hitmarker flashes on hits.
  const spreadPx = 5 + (def ? (def.spreadStand + (p.loadout.recoilHeat ?? 0) * 6) * 3 : 0)
    + Math.hypot(p.vel.x, p.vel.z) * 1.6;
  el.crosshair.style.setProperty('--spread', `${spreadPx.toFixed(1)}px`);
  el.crosshair.style.opacity = p.alive ? 1 : 0;
  G.hitmarkT = Math.max(0, (G.hitmarkT ?? 0) - dt);
  el.hitmarker.classList.toggle('on', (G.hitmarkT ?? 0) > 0);
  el.hitmarker.classList.toggle('kill', !!G.hitmarkKill && (G.hitmarkT ?? 0) > 0);

  // Bomb hint / channel progress.
  const hint = bombHint();
  el['bomb-hint'].style.opacity = hint ? 1 : 0;
  if (hint) {
    el['bomb-hint-text'].textContent = hint.text;
    el['bomb-hint-fill'].style.width = `${Math.round(hint.progress * 100)}%`;
  }

  // Scope overlay while aiming the DMR.
  el.scope.style.opacity = input.aiming && def && def.zoom && p.alive ? 1 : 0;

  updateBuyMenu();

  // Scoreboard on Tab.
  const showScore = input.keys.has('Tab');
  el.scoreboard.hidden = !showScore;
  if (showScore) buildScoreRows();
}
