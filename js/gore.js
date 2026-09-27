import * as THREE from 'three';
import { rand, pick, canvasTex } from './util.js';
import { goreTextures, goreMats } from './goretex.js';
import { heightAt, normalAt } from './world.js';
import { supportAt } from './structures.js';

let scene;
const MAXP = 3000;
let pMesh, pData = [], pHead = 0;
let mistPool = [], mistTex;
let decalPool = [], decalHead = 0, decalMats;
const MAXD = 450;
const gibs = [];
const fountains = [];
const pools = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export function groundAt(x, z, y = 1e9) {
  const s = supportAt(x, z, y, 0.3);
  return Math.max(heightAt(x, z), s);
}

export function initGore(sc) {
  scene = sc;
  pData = []; mistPool = []; decalPool = []; pHead = 0; decalHead = 0;
  const T = goreTextures();
  pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXP);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < MAXP; i++) {
    pData.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0, life: 0 });
    pMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    pMesh.setColorAt(i, col.setRGB(rand(0.35, 0.6), 0, 0));
  }
  scene.add(pMesh);

  mistTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(160,0,0,0.9)'); gr.addColorStop(0.5, 'rgba(120,0,0,0.5)'); gr.addColorStop(1, 'rgba(90,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  for (let i = 0; i < 80; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false }));
    s.visible = false; s.userData = { life: 0 };
    scene.add(s); mistPool.push(s);
  }

  const mk = (t) => new THREE.MeshPhongMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, shininess: 120, specular: 0x663333, alphaTest: 0.03 });
  decalMats = { splat: T.splat.map(mk), spray: T.spray.map(mk), pool: mk(T.pool), smear: mk(T.smear) };
  const dg = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < MAXD; i++) {
    const d = new THREE.Mesh(dg, decalMats.splat[0]);
    d.visible = false; d.renderOrder = 1;
    scene.add(d); decalPool.push(d);
  }
}

export function resetGore() {
  for (const p of pData) p.alive = false;
  for (const d of decalPool) d.visible = false;
  for (const g of gibs) scene.remove(g.obj);
  gibs.length = 0; fountains.length = 0; pools.length = 0;
}

function particle(p, v, s = 0.04, life = 3) {
  const d = pData[pHead];
  pHead = (pHead + 1) % MAXP;
  d.alive = true; d.p.copy(p); d.v.copy(v); d.s = s; d.life = life; d.splat = Math.random() < 0.25;
}

export function mist(p, size = 0.6, n = 1) {
  for (let k = 0; k < n; k++) {
    const s = mistPool.find(m => !m.visible);
    if (!s) return;
    s.visible = true;
    s.position.copy(p).add(_v.set(rand(-0.1, 0.1), rand(-0.1, 0.1), rand(-0.1, 0.1)));
    s.userData.life = 0.5; s.userData.size = size * rand(0.7, 1.3);
    s.userData.vel = new THREE.Vector3(rand(-0.4, 0.4), rand(0, 0.5), rand(-0.4, 0.4));
    s.scale.setScalar(size * 0.3);
  }
}

// decal on arbitrary surface
export function decal(p, n, size, kind = 'splat', dir = null) {
  const d = decalPool[decalHead];
  decalHead = (decalHead + 1) % MAXD;
  const m = decalMats[kind];
  d.material = Array.isArray(m) ? pick(m) : m;
  d.position.copy(p).addScaledVector(n, 0.03);
  d.lookAt(_v.copy(d.position).add(n));
  if (kind === 'spray' && Math.abs(n.y) < 0.7) {
    // keep drips pointing down on walls: align local -y with world down
    const down = new THREE.Vector3(0, -1, 0).projectOnPlane(n).normalize();
    const ly = new THREE.Vector3(0, -1, 0).applyQuaternion(d.quaternion);
    let a = Math.atan2(new THREE.Vector3().crossVectors(ly, down).dot(n), ly.dot(down));
    d.rotateZ(a);
  } else if (kind === 'smear' && dir) {
    const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(d.quaternion);
    const dd = dir.clone().projectOnPlane(n).normalize();
    d.rotateZ(Math.atan2(new THREE.Vector3().crossVectors(lx, dd).dot(n), lx.dot(dd)));
  } else d.rotateZ(rand(0, 6.28));
  d.scale.set(size, kind === 'smear' ? size * 0.3 : size, size);
  d.visible = true;
  return d;
}
export function groundSplat(x, z, size, yHint) {
  const y = groundAt(x, z, yHint ?? 1e9);
  const onTerrain = Math.abs(y - heightAt(x, z)) < 0.01;
  const n = onTerrain ? normalAt(x, z) : _up.clone();
  return decal(new THREE.Vector3(x, y, z), n, size, 'splat');
}
export function bloodPool(x, z, max, yHint) {
  const y = groundAt(x, z, yHint ?? 1e9);
  const onTerrain = Math.abs(y - heightAt(x, z)) < 0.01;
  const d = decal(new THREE.Vector3(x, y + 0.01, z), onTerrain ? normalAt(x, z) : _up.clone(), 0.2, 'pool');
  pools.push({ d, size: 0.2, max });
}

// Blood burst at an impact. dir = bullet direction
export function hitSpray(point, dir, power = 1) {
  const n = Math.floor(18 * power);
  for (let i = 0; i < n; i++) { // exit spray forward
    const v = dir.clone().multiplyScalar(rand(3, 9) * power).add(_v.set(rand(-2, 2), rand(-1, 3), rand(-2, 2)));
    particle(point, v, rand(0.02, 0.06) * (0.8 + power * 0.3), 3);
  }
  for (let i = 0; i < n / 2; i++) { // back-splash
    const v = dir.clone().multiplyScalar(-rand(1, 3)).add(_v.set(rand(-1.5, 1.5), rand(0, 2.5), rand(-1.5, 1.5)));
    particle(point, v, rand(0.02, 0.05), 3);
  }
  mist(point, 0.7 * power, Math.ceil(power * 2));
}

export function spurt(p, dir, amount = 6, speed = 4) {
  for (let i = 0; i < amount; i++) {
    const v = dir.clone().multiplyScalar(speed * rand(0.6, 1.2)).add(_v.set(rand(-0.6, 0.6), rand(-0.3, 0.6), rand(-0.6, 0.6)));
    particle(p, v, rand(0.025, 0.05), 3);
  }
}

export function gib(obj, vel, bleed = 3, radius = 0.15, spin = 8) {
  scene.add(obj);
  obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
  gibs.push({ obj, v: vel.clone(), w: new THREE.Vector3(rand(-spin, spin), rand(-spin, spin), rand(-spin, spin)), bleed, radius, life: 40, splatted: 0 });
  if (gibs.length > 160) { const g = gibs.shift(); scene.remove(g.obj); }
}

const chunkGeos = [new THREE.TetrahedronGeometry(0.1), new THREE.IcosahedronGeometry(0.08, 0), new THREE.DodecahedronGeometry(0.07)];
export function chunks(point, n, dir, power = 5, organs = false) {
  const M = goreMats();
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    const mat = r < 0.5 ? M.flesh : r < 0.75 ? M.rawFlesh : r < 0.88 ? M.bone : M.darkFlesh;
    const m = new THREE.Mesh(pick(chunkGeos), mat);
    m.scale.setScalar(rand(0.6, 1.8));
    m.position.copy(point).add(_v.set(rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.2, 0.2)));
    const v = dir.clone().multiplyScalar(power * rand(0.3, 1)).add(_v.set(rand(-3, 3), rand(1, 5), rand(-3, 3)));
    gib(m, v, rand(0.5, 2), 0.08, 12);
  }
  if (organs) {
    const parts = [organ('intestine'), organ('intestine'), organ('heart'), organ('liver'), organ('lung'), organ('stomach')];
    for (const o of parts) {
      o.position.copy(point);
      gib(o, dir.clone().multiplyScalar(power * rand(0.3, 0.8)).add(_v.set(rand(-2.5, 2.5), rand(2, 5), rand(-2.5, 2.5))), 3, 0.12, 6);
    }
  }
}

export function organ(kind) {
  const M = goreMats();
  if (kind === 'intestine') {
    const pts = []; const L = rand(10, 18);
    for (let i = 0; i < L; i++) pts.push(new THREE.Vector3(Math.sin(i * 1.3) * 0.12, Math.cos(i * 0.9) * 0.08, i * 0.06));
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 50, 0.04, 6), pick([M.gut, M.gut2]));
  }
  if (kind === 'heart') { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), M.flesh); m.scale.set(1, 1.3, 0.9); return m; }
  if (kind === 'liver') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M.liver); m.scale.set(1.5, 0.6, 0.9); return m; }
  if (kind === 'lung') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M.rawFlesh); m.scale.set(0.8, 1.4, 0.6); return m; }
  if (kind === 'stomach') { const m = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.05, 6, 10, 4), M.gut2); return m; }
  if (kind === 'brain') { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), M.brain); m.scale.set(1, 0.75, 1.2); return m; }
  if (kind === 'eye') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M.eyeWhite));
    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M.eyeIris); ir.position.z = -0.045; g.add(ir);
    const nerve = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 5), M.flesh); nerve.rotation.x = Math.PI / 2; nerve.position.z = 0.09; g.add(nerve);
    return g;
  }
  if (kind === 'jaw') {
    const g = new THREE.Group();
    const j = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 5, 10, Math.PI), M.bone); j.rotation.x = Math.PI / 2; g.add(j);
    for (let i = 0; i < 7; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), M.eyeWhite); const a = i / 6 * Math.PI; t.position.set(Math.cos(a) * 0.13, 0.04, -Math.sin(a) * 0.13); g.add(t); }
    return g;
  }
  if (kind === 'skull') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6, 0, rand(1.5, 3), 0, rand(1, 2)), M.bone);
    m.material = M.bone; m.material.side = THREE.DoubleSide; return m;
  }
  return new THREE.Mesh(pick(chunkGeos), M.flesh);
}

export function fountain(obj, dur = 4, strength = 1) { fountains.push({ obj, t: dur, dur, strength }); }

// Head blows apart
export function headExplode(char, dir) {
  const head = char.parts.head;
  head.updateMatrixWorld(true);
  const p = new THREE.Vector3(0, 0.28, 0).applyMatrix4(head.matrixWorld);
  char.dismember('head');
  hitSpray(p, dir, 3);
  mist(p, 1.6, 5);
  for (let i = 0; i < 60; i++) particle(p, _v.set(rand(-5, 5), rand(1, 8), rand(-5, 5)).addScaledVector(dir, 5), rand(0.03, 0.08), 3);
  chunks(p, 14, dir, 7);
  const bits = ['brain', 'eye', 'eye', 'jaw', 'skull', 'skull', 'skull'];
  for (const b of bits) {
    const o = organ(b); o.position.copy(p);
    gib(o, dir.clone().multiplyScalar(rand(2, 7)).add(_v.set(rand(-3, 3), rand(2, 6), rand(-3, 3))), 2, 0.08, 10);
  }
  const st = char.stumps[char.stumps.length - 1];
  if (st) fountain(st.obj, 5, 1.5);
}

// Full body gib explosion (shotgun point blank / big falls)
export function explodeBody(char, dir, center) {
  char.root.updateMatrixWorld(true);
  const parts = ['head', 'armL', 'armR', 'legL', 'legR'];
  for (const part of parts) {
    const c = char.dismember(part);
    if (c) gib(c, dir.clone().multiplyScalar(rand(3, 8)).add(_v.set(rand(-4, 4), rand(3, 8), rand(-4, 4))), 4, 0.25, 10);
  }
  // torso too
  const t = char.parts.torso;
  t.updateMatrixWorld(true);
  const tc = t.clone(true);
  t.matrixWorld.decompose(tc.position, tc.quaternion, tc.scale);
  t.visible = false;
  gib(tc, dir.clone().multiplyScalar(4).add(_v.set(0, 4, 0)), 5, 0.35, 5);
  char.gibbed = true;
  hitSpray(center, dir, 4);
  mist(center, 2.2, 8);
  for (let i = 0; i < 160; i++) particle(center, _v.set(rand(-7, 7), rand(0, 10), rand(-7, 7)).addScaledVector(dir, 4), rand(0.03, 0.1), 3);
  chunks(center, 26, dir, 9, true);
  for (let i = 0; i < 6; i++) groundSplat(center.x + rand(-3, 3), center.z + rand(-3, 3), rand(1.5, 3.5), center.y + 1);
}

export function updateGore(dt) {
  const g = 22;
  // particles
  for (let i = 0; i < MAXP; i++) {
    const d = pData[i];
    if (!d.alive) continue;
    d.life -= dt;
    d.v.y -= g * dt;
    d.p.addScaledVector(d.v, dt);
    if (d.life <= 0) { d.alive = false; pMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
    const gy = heightAt(d.p.x, d.p.z);
    let hitY = null;
    if (d.p.y <= gy) hitY = gy;
    else if (d.v.y < 0) { const s = supportAt(d.p.x, d.p.z, d.p.y, 0); if (s > -Infinity && d.p.y <= s + 0.02 && d.p.y > s - 0.5) hitY = s; }
    if (hitY !== null) {
      d.alive = false;
      pMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      if (d.splat) {
        const n = hitY === gy ? normalAt(d.p.x, d.p.z) : _up;
        decal(_v.set(d.p.x, hitY, d.p.z).clone(), n, rand(0.2, 0.7) * (d.s / 0.04), 'splat');
      }
      continue;
    }
    const sp = d.v.length();
    _q.setFromUnitVectors(_up, _v.copy(d.v).divideScalar(sp || 1));
    _s.set(d.s, d.s * (1 + Math.min(3, sp * 0.15)), d.s);
    _m.compose(d.p, _q, _s);
    pMesh.setMatrixAt(i, _m);
  }
  pMesh.instanceMatrix.needsUpdate = true;

  for (const s of mistPool) {
    if (!s.visible) continue;
    const u = s.userData;
    u.life -= dt;
    if (u.life <= 0) { s.visible = false; continue; }
    s.position.addScaledVector(u.vel, dt);
    const k = 1 - u.life / 0.5;
    s.scale.setScalar(u.size * (0.3 + k));
    s.material.opacity = 1 - k;
  }

  // gibs
  for (let i = gibs.length - 1; i >= 0; i--) {
    const b = gibs[i];
    b.life -= dt;
    if (b.life <= 0) { scene.remove(b.obj); gibs.splice(i, 1); continue; }
    if (b.rest) continue;
    b.v.y -= g * dt;
    b.obj.position.addScaledVector(b.v, dt);
    b.obj.rotation.x += b.w.x * dt; b.obj.rotation.y += b.w.y * dt; b.obj.rotation.z += b.w.z * dt;
    const P = b.obj.position;
    const gy = groundAt(P.x, P.z, P.y + 0.3) + b.radius * 0.5;
    const sp = b.v.length();
    if (b.bleed > 0 && sp > 1) {
      b.bleed -= dt;
      if (Math.random() < 0.6) particle(P, _v.set(rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5)), rand(0.02, 0.04), 2);
    }
    if (P.y < gy) {
      P.y = gy;
      if (sp > 1.5 && b.radius > 0.1 && Math.random() < 0.5) {
        const hv = new THREE.Vector3(b.v.x, 0, b.v.z);
        if (hv.lengthSq() > 0.5) decal(new THREE.Vector3(P.x, gy - b.radius * 0.5, P.z), _up.clone(), rand(0.8, 1.6), 'smear', hv);
      }
      if (sp > 3 && b.splatted < 3) { b.splatted++; groundSplat(P.x, P.z, rand(0.5, 1.3) * (b.radius * 5 + 0.5), P.y + 0.3); }
      b.v.y = Math.abs(b.v.y) * 0.3;
      b.v.x *= 0.6; b.v.z *= 0.6; b.w.multiplyScalar(0.6);
      if (sp < 0.8) { b.rest = true; }
    }
  }

  // stump fountains (pulsing like a heartbeat)
  for (let i = fountains.length - 1; i >= 0; i--) {
    const f = fountains[i];
    f.t -= dt;
    if (f.t <= 0 || !f.obj.parent) { fountains.splice(i, 1); continue; }
    const pulse = Math.max(0, Math.sin(f.t * 9)) * (f.t / f.dur);
    if (pulse < 0.2) continue;
    f.obj.updateMatrixWorld();
    const p = new THREE.Vector3().setFromMatrixPosition(f.obj.matrixWorld);
    const dir = new THREE.Vector3(0, 1, 0).transformDirection(f.obj.matrixWorld);
    const n = Math.ceil(4 * pulse * f.strength);
    for (let k = 0; k < n; k++) particle(p, dir.clone().multiplyScalar(rand(2, 5) * pulse * f.strength).add(_v.set(rand(-0.6, 0.6), rand(0, 0.8), rand(-0.6, 0.6))), rand(0.025, 0.05), 3);
  }

  for (let i = pools.length - 1; i >= 0; i--) {
    const p = pools[i];
    p.size += dt * 0.35;
    p.d.scale.setScalar(p.size);
    if (p.size >= p.max) pools.splice(i, 1);
  }
}

// slow drips from wounds
export function drip(p) { particle(p, _v.set(rand(-0.15, 0.15), rand(-0.5, 0), rand(-0.15, 0.15)), rand(0.018, 0.03), 3); }
// arterial jet: a strong pulsed stream along dir
export function artery(p, dir, strength = 1) {
  for (let i = 0; i < 10 * strength; i++) particle(p, dir.clone().multiplyScalar(rand(4, 7) * strength).add(_v.set(rand(-0.3, 0.3), rand(-0.2, 0.3), rand(-0.3, 0.3))), rand(0.02, 0.045), 3);
}
