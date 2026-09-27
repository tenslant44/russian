import * as THREE from 'three';
import { rand, canvasTex } from './util.js';

let scene;
const tracers = [], flashes = [], puffs = [];
let puffTex;

export function initFx(sc) {
  scene = sc;
  tracers.length = 0; flashes.length = 0; puffs.length = 0;
  const tg = new THREE.CylinderGeometry(0.015, 0.015, 1, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  for (let i = 0; i < 60; i++) {
    const t = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true }));
    t.visible = false; scene.add(t); tracers.push(t);
  }
  const fm = new THREE.SpriteMaterial({
    map: canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,60,0.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  for (let i = 0; i < 30; i++) { const s = new THREE.Sprite(fm); s.visible = false; scene.add(s); flashes.push(s); }
  puffTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  for (let i = 0; i < 60; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
    s.visible = false; scene.add(s); puffs.push(s);
  }
}

export function tracer(from, to) {
  const t = tracers.find(x => !x.visible); if (!t) return;
  t.position.copy(from);
  t.lookAt(to);
  t.scale.set(1, 1, from.distanceTo(to));
  t.visible = true; t.userData.life = 0.06; t.material.opacity = 0.9;
}
export function muzzleFlash(p) {
  const s = flashes.find(x => !x.visible); if (!s) return;
  s.position.copy(p); s.scale.setScalar(rand(0.5, 0.8)); s.visible = true; s.userData.life = 0.05;
}
export function puff(p, color = 0xd8c8a8, size = 0.8) {
  const s = puffs.find(x => !x.visible); if (!s) return;
  s.position.copy(p); s.material.color.setHex(color); s.visible = true;
  s.userData = { life: 0.5, size, vel: new THREE.Vector3(rand(-0.5, 0.5), rand(0.3, 1), rand(-0.5, 0.5)) };
}
export function updateFx(dt) {
  for (const t of tracers) if (t.visible) { t.userData.life -= dt; t.material.opacity = t.userData.life / 0.06; if (t.userData.life <= 0) t.visible = false; }
  for (const s of flashes) if (s.visible) { s.userData.life -= dt; if (s.userData.life <= 0) s.visible = false; }
  for (const s of puffs) if (s.visible) {
    const u = s.userData; u.life -= dt;
    if (u.life <= 0) { s.visible = false; continue; }
    s.position.addScaledVector(u.vel, dt);
    const k = 1 - u.life / 0.5;
    s.scale.setScalar(u.size * (0.4 + k));
    s.material.opacity = (1 - k) * 0.8;
  }
}
