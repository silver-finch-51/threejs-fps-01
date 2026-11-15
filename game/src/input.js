// input.js — keyboard and mouse state, plus pointer lock. The simulation reads the plain
// `keys` set and the accumulated mouse deltas once per fixed step; nothing here knows about
// the game itself. `pressed` holds keys that went down since the last step (edge triggers
// for reload, buy shortcuts, grenade throws).

export const input = {
  keys: new Set(),
  pressed: new Set(),
  mouseDX: 0,
  mouseDY: 0,
  firing: false,
  aiming: false, // right mouse held (DMR zoom)
  locked: false,
  wheel: 0,
};

export function initInput(canvas, onLockChange) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressed.add(e.code);
    if (['Space', 'Tab', 'KeyB'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.firing = false;
    input.aiming = false;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (!input.locked) return;
    if (e.button === 0) input.firing = true;
    if (e.button === 2) input.aiming = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
    if (e.button === 2) input.aiming = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => {
    input.wheel += Math.sign(e.deltaY);
  }, { passive: true });

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) {
      input.firing = false;
      input.aiming = false;
      input.keys.clear();
    }
    onLockChange(input.locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.mouseDX += e.movementX;
    input.mouseDY += e.movementY;
  });
}

export function lockPointer(canvas) {
  const p = canvas.requestPointerLock();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

// Called at the end of each fixed step: clears the per-step channels.
export function consumeStepInput() {
  input.mouseDX = 0;
  input.mouseDY = 0;
  input.wheel = 0;
  input.pressed.clear();
}

export function moveAxes() {
  const f = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
  const r = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
  return { f, r };
}
