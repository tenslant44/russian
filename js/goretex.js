import * as THREE from 'three';
import { canvasTex, rand, toon } from './util.js';

function blob(g, cx, cy, r, n = 14, jag = 0.35) {
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2;
    const rr = r * (1 - jag / 2 + Math.random() * jag);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.fill();
}
const bloodCol = (a = 1, l = 0) => `rgba(${(70 + l + rand(0, 35)) | 0},${rand(0, 6) | 0},${rand(2, 8) | 0},${a})`;

// Entry wound: bruised skin, torn cloth, raw ring, dark puncture, oozing streak
function woundTex(big) {
  return canvasTex(128, 128, (g, w) => {
    const c = w / 2;
    // bruising halo
    let gr = g.createRadialGradient(c, c, 4, c, c, big ? 62 : 50);
    gr.addColorStop(0, 'rgba(60,10,30,0.8)'); gr.addColorStop(0.6, 'rgba(80,20,40,0.35)'); gr.addColorStop(1, 'rgba(80,20,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    // blood soak
    g.fillStyle = bloodCol(0.9, -20); blob(g, c, c, big ? 50 : 36, 22, 0.55);
    // ooze streak running down
    for (let i = 0; i < (big ? 4 : 2); i++) {
      const x = c + rand(-12, 12);
      g.fillStyle = bloodCol(0.95, -10); g.fillRect(x - 3, c, rand(4, 7), rand(30, 60));
      blob(g, x, c + rand(30, 60), 4, 8);
    }
    // torn edge / raw flesh
    g.fillStyle = '#7a1414'; blob(g, c, c, big ? 36 : 22, 18, 0.7);
    g.fillStyle = '#b8383a'; blob(g, c, c, big ? 29 : 16, 16, 0.6);
    for (let i = 0; i < (big ? 18 : 8); i++) { g.fillStyle = Math.random() < 0.4 ? '#e8c070' : Math.random() < 0.5 ? '#d86a6a' : '#5a0808'; blob(g, c + rand(-1, 1) * (big ? 26 : 14), c + rand(-1, 1) * (big ? 26 : 14), rand(1.5, big ? 5 : 3.5), 6); }
    // puncture cavity
    gr = g.createRadialGradient(c, c, 0, c, c, big ? 22 : 11);
    gr.addColorStop(0, '#050000'); gr.addColorStop(0.55, '#260000'); gr.addColorStop(1, 'rgba(90,0,0,0)');
    g.fillStyle = gr; blob(g, c, c, big ? 22 : 11, 12, 0.35);
    if (big) { g.fillStyle = '#efe6cf'; for (let i = 0; i < 5; i++) { g.save(); g.translate(c + rand(-14, 14), c + rand(-14, 14)); g.rotate(rand(0, 6)); g.fillRect(-1.5, -7, 3, rand(8, 15)); g.restore(); } }
    // wet specular
    g.fillStyle = 'rgba(255,230,230,0.45)'; blob(g, c - 6, c - 8, 2.5, 6); blob(g, c + 10, c + 4, 1.5, 5);
  });
}
// Exit wound: bigger, blown-outward, ragged tissue
function exitTex() {
  return canvasTex(128, 128, (g, w) => {
    const c = w / 2;
    g.fillStyle = bloodCol(0.85, -20); blob(g, c, c, 58, 26, 0.8);
    for (let i = 0; i < 20; i++) { const a = rand(0, 6.28), d = rand(30, 60); g.fillStyle = bloodCol(0.9); blob(g, c + Math.cos(a) * d, c + Math.sin(a) * d, rand(2, 6), 6); }
    g.fillStyle = '#8a1a1a'; blob(g, c, c, 38, 20, 0.9);
    g.fillStyle = '#c94a4a'; blob(g, c, c, 30, 18, 0.8);
    for (let i = 0; i < 22; i++) { g.fillStyle = ['#f0d080', '#e07878', '#6a0a0a', '#f2ead8'][i % 4]; blob(g, c + rand(-26, 26), c + rand(-26, 26), rand(2, 6), 6); }
    const gr = g.createRadialGradient(c, c, 0, c, c, 22);
    gr.addColorStop(0, '#0a0000'); gr.addColorStop(0.7, '#3a0000'); gr.addColorStop(1, 'rgba(90,0,0,0)');
    g.fillStyle = gr; blob(g, c, c, 22, 12, 0.5);
    g.fillStyle = 'rgba(255,230,230,0.4)'; blob(g, c - 10, c - 6, 3, 6);
  });
}

// Ground / wall splat: dense core, satellite droplets, directional streaks, wet sheen
function splatTex() {
  return canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const ang = rand(0, 6.28);
    // streaks (elongated in impact direction)
    for (let i = 0; i < 22; i++) {
      const a = ang + rand(-0.9, 0.9), d = rand(40, 125);
      g.strokeStyle = bloodCol(rand(0.7, 1), -10); g.lineWidth = rand(1.5, 6) * (1 - d / 170); g.lineCap = 'round';
      g.beginPath(); g.moveTo(c + Math.cos(a) * 20, c + Math.sin(a) * 20); g.lineTo(c + Math.cos(a) * d, c + Math.sin(a) * d); g.stroke();
      g.fillStyle = bloodCol(1); blob(g, c + Math.cos(a) * d, c + Math.sin(a) * d, Math.max(1.5, rand(2, 6) * (1 - d / 170)), 7);
    }
    // satellite drops everywhere
    for (let i = 0; i < 40; i++) { const a = rand(0, 6.28), d = rand(45, 120); g.fillStyle = bloodCol(rand(0.7, 1)); blob(g, c + Math.cos(a) * d, c + Math.sin(a) * d, rand(1, 4.5), 7); }
    // core
    g.fillStyle = bloodCol(1, -15); blob(g, c, c, rand(45, 62), 24, 0.55);
    const gr = g.createRadialGradient(c, c, 0, c, c, 55);
    gr.addColorStop(0, 'rgba(20,0,0,0.75)'); gr.addColorStop(1, 'rgba(40,0,0,0)');
    g.fillStyle = gr; blob(g, c, c, 50, 20, 0.5);
    // clot flecks
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(25,0,0,0.8)'; blob(g, c + rand(-30, 30), c + rand(-30, 30), rand(2, 6), 6); }
    // wet highlight rim
    g.strokeStyle = 'rgba(255,200,200,0.18)'; g.lineWidth = 3;
    g.beginPath(); g.arc(c - 6, c - 6, 34, 3.6, 4.8); g.stroke();
  });
}
function sprayTex() { // exit-wound spatter on walls, running drips
  return canvasTex(256, 256, (g, w) => {
    for (let i = 0; i < 140; i++) {
      const a = rand(-0.6, 0.6) - Math.PI / 2, d = Math.pow(Math.random(), 0.6) * 125;
      g.fillStyle = bloodCol(rand(0.6, 1));
      blob(g, 128 + Math.cos(a) * d * 0.9 + rand(-25, 25), 185 + Math.sin(a) * d * 1.3, rand(1, 8) * (1 - d / 170), 7);
    }
    g.fillStyle = bloodCol(1, -15); blob(g, 128, 185, 24, 14, 0.7);
    for (let i = 0; i < 10; i++) {
      const x = 128 + rand(-50, 50), y = rand(90, 200), L = rand(25, 60);
      g.fillStyle = bloodCol(0.95, -10); g.fillRect(x, y, rand(1.5, 4), L); blob(g, x + 1.5, y + L, rand(2.5, 4), 6);
    }
    for (let i = 0; i < 4; i++) { g.fillStyle = '#f0d0b8'; blob(g, 128 + rand(-30, 30), 185 + rand(-30, 20), rand(1, 2.5), 5); } // tissue bits
  });
}
function poolTex() {
  return canvasTex(256, 256, (g, w) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 118);
    gr.addColorStop(0, '#2a0000'); gr.addColorStop(0.7, '#4a0003'); gr.addColorStop(1, '#5e0206');
    g.fillStyle = gr; blob(g, 128, 128, 105, 36, 0.3);
    for (let i = 0; i < 6; i++) { g.fillStyle = '#520004'; const a = rand(0, 6.28); blob(g, 128 + Math.cos(a) * 95, 128 + Math.sin(a) * 95, rand(10, 22), 10); }
    g.fillStyle = 'rgba(255,190,190,0.14)'; blob(g, 95, 90, 28, 12, 0.5);
    g.fillStyle = 'rgba(255,220,220,0.25)'; blob(g, 88, 84, 8, 8);
  });
}
function smearTex() {
  return canvasTex(256, 64, (g, w, h) => {
    for (let i = 0; i < 30; i++) { g.strokeStyle = bloodCol(rand(0.3, 0.8), -10); g.lineWidth = rand(1, 5); const y = rand(10, 54); g.beginPath(); g.moveTo(rand(0, 40), y); g.lineTo(rand(160, 250), y + rand(-4, 4)); g.stroke(); }
    g.fillStyle = bloodCol(0.9); blob(g, 30, 32, 20, 12, 0.5);
  });
}

let T;
export function goreTextures() {
  if (T) return T;
  T = {
    wound: [woundTex(false), woundTex(false), woundTex(false)],
    woundBig: [woundTex(true), woundTex(true)],
    exit: [exitTex(), exitTex()],
    splat: [splatTex(), splatTex(), splatTex(), splatTex(), splatTex()],
    spray: [sprayTex(), sprayTex(), sprayTex()],
    pool: poolTex(),
    smear: smearTex(),
  };
  return T;
}

// wet-looking organic materials (phong for specular sheen)
const wet = (c, sh = 60) => new THREE.MeshPhongMaterial({ color: c, shininess: sh, specular: 0x442222 });
let M;
export function goreMats() {
  if (M) return M;
  M = {
    flesh: wet(0x8a1a1e),
    rawFlesh: wet(0xc04a50),
    darkFlesh: wet(0x3a0406, 30),
    muscle: wet(0x9a2024, 80),
    fat: wet(0xe8c878, 40),
    skinRing: wet(0xd89a80, 20),
    bone: wet(0xeee4c8, 25),
    marrow: wet(0x7a1010, 50),
    tendon: wet(0xf0e0d0, 60),
    vein: wet(0x3a2a6a, 60),
    cavity: wet(0x2a0204, 90),
    lung: wet(0xd98088, 50),
    gut: wet(0xd88080, 90),
    gut2: wet(0xb85868, 90),
    brain: wet(0xe8a0a8, 70),
    liver: wet(0x4a0c10, 100),
    blood: new THREE.MeshBasicMaterial({ color: 0x6a0000 }),
    eyeWhite: wet(0xffffff, 100),
    eyeIris: wet(0x2a6ad0, 100),
  };
  M.bone.side = THREE.DoubleSide;
  return M;
}

export function drawScreenSplat(g, x, y, r) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 1.2);
  gr.addColorStop(0, `rgba(60,0,0,${rand(0.7, 0.9)})`); gr.addColorStop(1, `rgba(110,0,0,${rand(0.5, 0.7)})`);
  g.fillStyle = gr;
  blob(g, x, y, r, 20, 0.6);
  for (let i = 0; i < 16; i++) {
    const a = rand(0, 6.28), d = rand(r, r * 2.6);
    g.fillStyle = bloodCol(rand(0.5, 0.85), 30);
    blob(g, x + Math.cos(a) * d, y + Math.sin(a) * d, rand(2, r / 5), 7);
  }
  g.fillStyle = 'rgba(255,200,200,0.15)'; blob(g, x - r * 0.3, y - r * 0.3, r * 0.2, 8);
}
