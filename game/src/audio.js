// audio.js — every sound is synthesised with WebAudio: no audio files, no network. Short
// filtered noise bursts and oscillator blips stand in for gunfire, hits, footsteps, the
// charge's beeps and the round stingers. One shared context, created lazily on the first
// user gesture (browsers refuse audio before that). Sounds are positional only in volume:
// distant shots are quieter and duller, which is also a gameplay cue.

let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function noiseBuffer(seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

let sharedNoise = null;

// distance in metres from the listener; volume falls off and the filter closes with range.
function burst({ dur = 0.12, freq = 1800, q = 0.8, gain = 0.5, distance = 0, type = 'lowpass', sweepTo = null }) {
  if (!ctx || ctx.state !== 'running') return;
  if (!sharedNoise) sharedNoise = noiseBuffer(0.5);
  const t = ctx.currentTime;
  const att = 1 / (1 + distance * 0.09);
  if (att < 0.02) return;
  const src = ctx.createBufferSource();
  src.buffer = sharedNoise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = Math.max(220, freq * att + 160);
  if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain * att, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t, Math.random() * 0.2);
  src.stop(t + dur + 0.02);
}

function tone({ freq = 440, dur = 0.1, gain = 0.2, type = 'square', distance = 0, sweepTo = null }) {
  if (!ctx || ctx.state !== 'running') return;
  const att = 1 / (1 + distance * 0.09);
  if (att < 0.02) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (sweepTo !== null) osc.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain * att, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  shot(distance = 0, heavy = false) {
    burst({ dur: heavy ? 0.22 : 0.13, freq: heavy ? 1200 : 2100, gain: heavy ? 0.8 : 0.55, distance });
    tone({ freq: heavy ? 130 : 180, dur: 0.07, gain: 0.25, type: 'triangle', distance });
  },
  dryFire() {
    tone({ freq: 900, dur: 0.04, gain: 0.12, type: 'square' });
  },
  reload() {
    burst({ dur: 0.06, freq: 900, gain: 0.2 });
    setTimeout(() => burst({ dur: 0.05, freq: 1400, gain: 0.18 }), 130);
  },
  hit(kill = false) {
    tone({ freq: kill ? 1320 : 990, dur: kill ? 0.14 : 0.06, gain: 0.22, type: 'sine' });
  },
  hurt() {
    burst({ dur: 0.16, freq: 500, gain: 0.4, type: 'lowpass' });
  },
  headshotDing() {
    tone({ freq: 1760, dur: 0.09, gain: 0.18, type: 'sine' });
  },
  footstep(distance = 0, run = true) {
    burst({ dur: 0.05, freq: 480, gain: run ? 0.10 : 0.05, distance });
  },
  jump() {
    burst({ dur: 0.06, freq: 700, gain: 0.08 });
  },
  throwWhoosh() {
    burst({ dur: 0.18, freq: 900, gain: 0.15, type: 'bandpass', sweepTo: 300 });
  },
  explosion(distance = 0) {
    burst({ dur: 0.9, freq: 300, gain: 1.0, distance, sweepTo: 60 });
    tone({ freq: 70, dur: 0.7, gain: 0.5, type: 'sine', distance, sweepTo: 34 });
  },
  flashbang(distance = 0) {
    tone({ freq: 3400, dur: 0.5, gain: 0.16, type: 'sine', distance });
    burst({ dur: 0.1, freq: 4000, gain: 0.3, distance, type: 'highpass' });
  },
  beep(distance = 0, final = false) {
    tone({ freq: final ? 1560 : 1180, dur: final ? 0.16 : 0.07, gain: 0.16, type: 'square', distance });
  },
  plantDone(distance = 0) {
    tone({ freq: 880, dur: 0.09, gain: 0.2, type: 'square', distance });
    setTimeout(() => tone({ freq: 1320, dur: 0.12, gain: 0.2, type: 'square', distance }), 100);
  },
  buy() {
    tone({ freq: 1240, dur: 0.06, gain: 0.15, type: 'sine' });
  },
  denied() {
    tone({ freq: 220, dur: 0.1, gain: 0.15, type: 'square' });
  },
  roundWin() {
    tone({ freq: 660, dur: 0.12, gain: 0.2, type: 'triangle' });
    setTimeout(() => tone({ freq: 990, dur: 0.2, gain: 0.2, type: 'triangle' }), 110);
  },
  roundLose() {
    tone({ freq: 392, dur: 0.14, gain: 0.2, type: 'triangle' });
    setTimeout(() => tone({ freq: 262, dur: 0.24, gain: 0.2, type: 'triangle' }), 120);
  },
  click() {
    tone({ freq: 1500, dur: 0.03, gain: 0.1, type: 'sine' });
  },
};
