import * as THREE from 'three';
import { toon, canvasTex, rand } from './util.js';

export const C = 4;   // cell size
export const H = 4;   // wall height

const hash = new Map();
const hk = (i, j) => i * 10000 + j;
const keys = new Set();
export const pieces = [];
export const pieceMeshes = [];
let scene;

function plankTex(base, line) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 4;
    for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let i = 0; i < 6; i++) { const y = Math.floor(Math.random() * 4) * 32; const x = Math.random() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
    g.lineWidth = 8; g.strokeRect(0, 0, w, h);
  });
}
function brickTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#e8e0d0'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) {
      g.fillStyle = `hsl(${10 + Math.random() * 8},${45 + Math.random() * 10}%,${42 + Math.random() * 8}%)`;
      g.fillRect(x * 32 + (y % 2) * 16 + 2, y * 16 + 2, 28, 12);
    }
  });
}
let mats;
function getMats() {
  if (mats) return mats;
  mats = {
    wood: toon(0xffffff, { map: plankTex('#c98a4b', '#7a4a20') }),
    brick: toon(0xffffff, { map: brickTex() }),
    roof: toon(0xffffff, { map: plankTex('#b83b3b', '#6a1a1a') }),
    ghost: new THREE.MeshBasicMaterial({ color: 0x4fb4ff, transparent: true, opacity: 0.35, depthWrite: false }),
    ghostBad: new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.3, depthWrite: false }),
  };
  return mats;
}
const geos = {
  wall0: new THREE.BoxGeometry(C, H, 0.3),
  wall1: new THREE.BoxGeometry(0.3, H, C),
  floor: new THREE.BoxGeometry(C, 0.25, C),
  ramp: new THREE.BoxGeometry(C, 0.25, C * Math.SQRT2 + 0.1),
};

export function initStructures(sc) {
  scene = sc;
  hash.clear(); keys.clear(); pieces.length = 0; pieceMeshes.length = 0;
  ghost = null; ghostType = null;
  getMats();
}

function pieceKey(type, ix, iz, y, dir) {
  const d = type === 'floor' ? 0 : dir;
  return `${type}|${ix}|${iz}|${Math.round(y * 10)}|${d}`;
}
function cellsOf(p) {
  if (p.type === 'wall') return p.dir === 0 ? [[p.ix, p.iz], [p.ix, p.iz - 1]] : [[p.ix, p.iz], [p.ix - 1, p.iz]];
  return [[p.ix, p.iz]];
}

function makeMesh(type, ix, iz, y, dir, mat) {
  let mesh;
  if (type === 'wall') {
    mesh = new THREE.Mesh(dir === 0 ? geos.wall0 : geos.wall1, mat);
    if (dir === 0) mesh.position.set(ix * C + C / 2, y + H / 2, iz * C);
    else mesh.position.set(ix * C, y + H / 2, iz * C + C / 2);
  } else if (type === 'floor') {
    mesh = new THREE.Mesh(geos.floor, mat);
    mesh.position.set(ix * C + C / 2, y - 0.125, iz * C + C / 2);
  } else {
    mesh = new THREE.Mesh(geos.ramp, mat);
    mesh.position.set(ix * C + C / 2, y + H / 2, iz * C + C / 2);
    // rising toward dir: 0:+x 1:+z 2:-x 3:-z
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][dir];
    mesh.rotation.x = Math.PI / 4;
  }
  return mesh;
}

export function hasPiece(type, ix, iz, y, dir) { return keys.has(pieceKey(type, ix, iz, y, dir)); }

export function addPiece(type, ix, iz, y, dir, matName = 'wood', hp = 150) {
  const key = pieceKey(type, ix, iz, y, dir);
  if (keys.has(key)) return null;
  const mat = getMats()[matName];
  const mesh = makeMesh(type, ix, iz, y, dir, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const p = { type, ix, iz, y, dir, key, hp, maxHp: hp, mesh, alive: true, matName, grow: type === 'floor' || matName !== 'wood' ? 1 : 0 };
  mesh.userData.type = 'piece';
  mesh.userData.piece = p;
  if (matName === 'wood' && hp === 150) { mesh.scale.setScalar(0.01); p.grow = 0; p.hp = 40; p.building = true; }
  scene.add(mesh);
  pieceMeshes.push(mesh);
  pieces.push(p);
  keys.add(key);
  for (const [i, j] of cellsOf(p)) {
    const k = hk(i, j);
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push(p);
  }
  return p;
}

export function updateStructures(dt) {
  for (const p of pieces) {
    if (p.building) { p.hp = Math.min(p.maxHp, p.hp + dt * 55); if (p.hp >= p.maxHp) p.building = false; }
    if (p.grow < 1) {
      p.grow = Math.min(1, p.grow + dt * 5);
      const g = p.grow, s = g < 1 ? 1 + Math.sin(g * Math.PI) * 0.08 - Math.pow(1 - g, 3) : 1;
      p.mesh.scale.setScalar(Math.max(0.01, s));
    }
    if (p.flash > 0) {
      p.flash -= dt;
      const k = Math.max(0, p.flash) * 20;
      p.mesh.position.x = p.baseX + Math.sin(k * 7) * 0.03 * k;
    }
  }
}

export function removePiece(p) {
  if (!p.alive) return;
  p.alive = false;
  scene.remove(p.mesh);
  keys.delete(p.key);
  const i = pieceMeshes.indexOf(p.mesh); if (i >= 0) pieceMeshes.splice(i, 1);
  const j = pieces.indexOf(p); if (j >= 0) pieces.splice(j, 1);
  for (const [a, b] of cellsOf(p)) {
    const arr = hash.get(hk(a, b));
    if (arr) { const k = arr.indexOf(p); if (k >= 0) arr.splice(k, 1); }
  }
}

export function damagePiece(p, amt) {
  if (!p.alive) return false;
  p.hp -= amt;
  if (p.baseX === undefined) p.baseX = p.mesh.position.x;
  p.flash = 0.15;
  if (p.hp <= 0) { removePiece(p); return true; }
  return false;
}

function near(x, z) {
  const out = new Set();
  const i0 = Math.floor(x / C), j0 = Math.floor(z / C);
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
    const a = hash.get(hk(i, j)); if (a) for (const p of a) out.add(p);
  }
  return out;
}

function boxOf(p) {
  if (p.type === 'wall') {
    if (p.dir === 0) return { x0: p.ix * C, x1: p.ix * C + C, z0: p.iz * C - 0.15, z1: p.iz * C + 0.15, y0: p.y, y1: p.y + H };
    return { x0: p.ix * C - 0.15, x1: p.ix * C + 0.15, z0: p.iz * C, z1: p.iz * C + C, y0: p.y, y1: p.y + H };
  }
  if (p.type === 'floor') return { x0: p.ix * C, x1: p.ix * C + C, z0: p.iz * C, z1: p.iz * C + C, y0: p.y - 0.25, y1: p.y };
  return null;
}

function rampHeight(p, x, z) {
  const lx = (x - p.ix * C) / C, lz = (z - p.iz * C) / C;
  if (lx < 0 || lx > 1 || lz < 0 || lz > 1) return null;
  const t = [lx, lz, 1 - lx, 1 - lz][p.dir];
  return p.y + t * H;
}

// Push a vertical cylinder (feet pos) out of walls / floors horizontally
export function resolveCircle(pos, r, height) {
  let hit = false;
  for (const p of near(pos.x, pos.z)) {
    const b = boxOf(p); if (!b) continue;
    if (b.y1 <= pos.y + 0.55 || b.y0 >= pos.y + height) continue;
    const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
    const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x += dx / d * (r - d); pos.z += dz / d * (r - d);
      } else {
        // inside: push out along smallest axis
        const opts = [[b.x0 - r - pos.x, 0], [b.x1 + r - pos.x, 0], [0, b.z0 - r - pos.z], [0, b.z1 + r - pos.z]];
        opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
        pos.x += opts[0][0]; pos.z += opts[0][1];
      }
      hit = true;
    }
  }
  return hit;
}

// Highest structure surface under (x,z) reachable from feet y
export function supportAt(x, z, feet, stepUp = 0.6) {
  let best = -Infinity;
  for (const p of near(x, z)) {
    if (p.type === 'floor') {
      if (x >= p.ix * C && x <= p.ix * C + C && z >= p.iz * C && z <= p.iz * C + C && p.y <= feet + stepUp && p.y > best) best = p.y;
    } else if (p.type === 'ramp') {
      const h = rampHeight(p, x, z);
      if (h !== null && h <= feet + stepUp + 0.6 && h > best) best = h;
    }
  }
  return best;
}
export function ceilingAt(x, z, feet, height) {
  let best = Infinity;
  for (const p of near(x, z)) {
    if (p.type !== 'floor') continue;
    if (x >= p.ix * C && x <= p.ix * C + C && z >= p.iz * C && z <= p.iz * C + C) {
      const bot = p.y - 0.25;
      if (bot >= feet + 0.8 && bot < best) best = bot;
    }
  }
  return best;
}

// ---- Building placement (preview + commit)
let ghost = null, ghostType = null;
export function computePlacement(type, pos, yaw, pitch, aim = null) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let base = Math.floor((pos.y + 1) / H) * H;
  if (type === 'wall') {
    if (pitch > 0.75) base += H;
    const ix = Math.floor(pos.x / C), iz = Math.floor(pos.z / C);
    if (Math.abs(fx) > Math.abs(fz)) return { type, ix: fx > 0 ? ix + 1 : ix, iz, y: base, dir: 1 };
    return { type, ix, iz: fz > 0 ? iz + 1 : iz, y: base, dir: 0 };
  }
  let tx, tz;
  if (pitch < -0.6) { tx = pos.x; tz = pos.z; }
  else if (aim && type === 'floor' && aim.distanceTo(pos) < 7) { tx = aim.x - fx * 0.1; tz = aim.z - fz * 0.1; }
  else { tx = pos.x + fx * 2.8; tz = pos.z + fz * 2.8; }
  const ix = Math.floor(tx / C), iz = Math.floor(tz / C);
  if (type === 'floor') return { type, ix, iz, y: pitch > 0.35 ? base + H : base, dir: 0 };
  let dir;
  if (Math.abs(fx) > Math.abs(fz)) dir = fx > 0 ? 0 : 2; else dir = fz > 0 ? 1 : 3;
  return { type, ix, iz, y: pitch > 0.9 ? base + H : base, dir };
}

const _gp = new THREE.Vector3(), _gq = new THREE.Quaternion();
export function showGhost(pl, ok, dt = 0.016) {
  const m = getMats();
  if (!pl) { if (ghost) ghost.visible = false; return; }
  const k = pl.type + pl.dir;
  const ref = makeMesh(pl.type, pl.ix, pl.iz, pl.y, pl.dir, m.ghost);
  let snap = false;
  if (!ghost || ghostType !== k) {
    if (ghost) scene.remove(ghost);
    ghost = makeMesh(pl.type, pl.ix, pl.iz, pl.y, pl.dir, m.ghost);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry), new THREE.LineBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.9 }));
    ghost.add(edges);
    ghostType = k;
    scene.add(ghost);
    snap = true;
  }
  if (!ghost.visible) snap = true;
  const t = snap ? 1 : 1 - Math.exp(-30 * dt);
  ghost.position.lerp(ref.position, t);
  ref.updateMatrix();
  ghost.quaternion.slerp(ref.quaternion, t);
  ghost.material = ok ? m.ghost : m.ghostBad;
  ghost.children[0].material.color.setHex(ok ? 0xbfe6ff : 0xff8080);
  ghost.visible = true;
}

// ---- Houses
export function buildHouse(x0, z0, y, floors = 1) {
  const ix = Math.floor(x0 / C), iz = Math.floor(z0 / C);
  const W = 3, D = 3;
  const door = Math.floor(rand(0, 4));
  for (let f = 0; f < floors; f++) {
    const yy = y + f * H;
    for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) addPiece('floor', ix + i, iz + j, yy, 0, 'wood', 300);
    for (let i = 0; i < W; i++) {
      if (!(f === 0 && door === 0 && i === 1)) addPiece('wall', ix + i, iz, yy, 0, 'brick', 400);
      if (!(f === 0 && door === 1 && i === 1)) addPiece('wall', ix + i, iz + D, yy, 0, 'brick', 400);
    }
    for (let j = 0; j < D; j++) {
      if (!(f === 0 && door === 2 && j === 1)) addPiece('wall', ix, iz + j, yy, 1, 'brick', 400);
      if (!(f === 0 && door === 3 && j === 1)) addPiece('wall', ix + W, iz + j, yy, 1, 'brick', 400);
    }
  }
  // interior ramp to upper floor
  if (floors > 1) {
    addPiece('ramp', ix + 2, iz + 0, y, 1, 'wood', 300);
    removeAt('floor', ix + 2, iz + 0, y + H);
  }
  const top = y + floors * H;
  for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) addPiece('floor', ix + i, iz + j, top, 0, 'roof', 300);
  // foundation
  const found = new THREE.Mesh(new THREE.BoxGeometry(W * C + 0.4, 6, D * C + 0.4), toon(0x8d8a85));
  found.position.set(ix * C + W * C / 2, y - 3.26, iz * C + D * C / 2);
  found.receiveShadow = true;
  scene.add(found);
  return { x0: ix * C, z0: iz * C, x1: (ix + W) * C, z1: (iz + D) * C, y, floors };
}
function removeAt(type, ix, iz, y) {
  const k = pieceKey(type, ix, iz, y, 0);
  const p = pieces.find(q => q.key === k);
  if (p) removePiece(p);
}
