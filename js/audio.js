// Tiny sound manager using WebAudio buffers for overlapping, positional-ish volume
let ctx, master;
const buffers = {};
const NAMES = ['ar', 'shotgun', 'flesh', 'crunch', 'build', 'pickaxe', 'scream'];

export async function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
  await Promise.all(NAMES.map(async n => {
    try {
      const r = await fetch(`sfx/${n}.wav`);
      if (!r.ok) return;
      buffers[n] = await ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { /* missing sound is fine */ }
  }));
}

let listener = null;
export function setListener(pos) { listener = pos; }

export function play(name, { vol = 1, pos = null, rate = 1, maxDur = 0 } = {}) {
  if (!ctx || !buffers[name]) return;
  let v = vol;
  if (pos && listener) {
    const d = pos.distanceTo(listener);
    v *= 1 / (1 + d * 0.04);
    if (v < 0.02) return;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
  const g = ctx.createGain(); g.gain.value = v;
  src.connect(g); g.connect(master);
  src.start();
  if (maxDur) { g.gain.setValueAtTime(v, ctx.currentTime + maxDur * 0.7); g.gain.linearRampToValueAtTime(0, ctx.currentTime + maxDur); src.stop(ctx.currentTime + maxDur); }
}
