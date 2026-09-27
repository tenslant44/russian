import * as THREE from 'three';
import { fbm, noise2, toon, rand, clamp } from './util.js';

export const ISLAND_R = 300;
export const MAP = 760;

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function heightAt(x, z) {
  const d = Math.hypot(x, z) / ISLAND_R;
  let h = 7 + fbm(x / 140, z / 140, 4) * 26 + noise2(x / 35, z / 35) * 3;
  // a mountain
  const md = Math.hypot(x - 110, z + 90) / 70;
  h += Math.max(0, 1 - md) ** 2 * 45;
  h = h * (1 - smooth(0.72, 1.0, d)) + 1.2 * (1 - smooth(0.9, 1.0, d));
  h -= smooth(0.95, 1.2, d) * 10;
  return h;
}
export function normalAt(x, z) {
  const e = 0.5;
  return new THREE.Vector3(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}

// Circle colliders on a spatial hash (trees, rocks)
const CG = 8;
const circleGrid = new Map();
const ckey = (i, j) => i * 10000 + j;
export function addCircle(c) {
  const i = Math.floor(c.x / CG), j = Math.floor(c.z / CG);
  const k = ckey(i, j);
  if (!circleGrid.has(k)) circleGrid.set(k, []);
  circleGrid.get(k).push(c);
}
export function circlesNear(x, z) {
  const out = [];
  const i0 = Math.floor(x / CG), j0 = Math.floor(z / CG);
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
    const a = circleGrid.get(ckey(i, j));
    if (a) for (const c of a) if (c.alive) out.push(c);
  }
  return out;
}

export const world = { trees: [], treeTrunks: null, treeLeaves: null, rocks: null, raycastables: [], terrain: null, water: null };

export function createWorld(scene) {
  circleGrid.clear();
  world.trees = []; world.raycastables = [];

  // Sky dome
  const skyGeo = new THREE.SphereGeometry(1500, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2f7fe8) }, bot: { value: new THREE.Color(0xbfe6ff) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vp; void main(){ float t = clamp(vp.y*1.6+0.1,0.,1.); gl_FragColor = vec4(mix(bot, top, t),1.); }'
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  world.sky = sky;

  // Terrain
  const seg = 190;
  const geo = new THREE.PlaneGeometry(MAP, MAP, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = normalAt(x, z);
    const v = noise2(x / 12, z / 12) * 0.5 + 0.5;
    if (h < 2.2) c.setRGB(0.93, 0.83, 0.55);
    else if (n.y < 0.78 || h > 42) c.setRGB(0.55 + v * 0.1, 0.52 + v * 0.1, 0.5 + v * 0.1);
    else c.setRGB(0.32 + v * 0.12, 0.72 + v * 0.1, 0.25 + v * 0.05);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
  terrain.receiveShadow = true;
  terrain.userData.type = 'terrain';
  scene.add(terrain);
  world.terrain = terrain;

  // Water
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshToonMaterial({ color: 0x2aa8e0, transparent: true, opacity: 0.85, gradientMap: null }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  scene.add(water);
  world.water = water;

  // Trees
  const N = 420;
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 4, 7).translate(0, 2, 0);
  const leafGeo = new THREE.IcosahedronGeometry(2.4, 1).translate(0, 5.2, 0);
  const lp = leafGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) { // lumpy cartoon canopy
    const x = lp.getX(i), y = lp.getY(i), z = lp.getZ(i);
    const k = 1 + noise2(x * 1.3 + 3, z * 1.3 + y) * 0.35;
    lp.setXYZ(i, x * k, 5.2 + (y - 5.2) * k * 0.9, z * k);
  }
  leafGeo.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x8a5a2b), N);
  const leaves = new THREE.InstancedMesh(leafGeo, toon(0xffffff), N);
  trunks.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = leaves.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let placed = 0, tries = 0;
  while (placed < N && tries < 8000) {
    tries++;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * ISLAND_R * 0.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 3 || normalAt(x, z).y < 0.8) continue;
    if (noise2(x / 60 + 9, z / 60) < -0.05 && Math.random() < 0.7) continue; // clumps
    const sc = rand(0.8, 1.4);
    const t = { x, z, y: h - 0.2, r: 0.6 * sc, scale: sc, hp: 150, alive: true, id: placed, kind: 'tree', rot: rand(0, 6.28) };
    world.trees.push(t);
    addCircle(t);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
    m.compose(p.set(x, t.y, z), q, s.set(sc, sc, sc));
    trunks.setMatrixAt(placed, m);
    leaves.setMatrixAt(placed, m);
    leaves.setColorAt(placed, new THREE.Color().setHSL(0.27 + rand(-0.04, 0.05), 0.65, rand(0.32, 0.45)));
    placed++;
  }
  trunks.count = leaves.count = placed;
  trunks.userData.type = leaves.userData.type = 'tree';
  scene.add(trunks, leaves);
  world.treeTrunks = trunks; world.treeLeaves = leaves;
  world.raycastables.push(trunks, leaves);

  // Rocks
  const RN = 90;
  const rockGeo = new THREE.DodecahedronGeometry(1.5, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, toon(0x9a9aa6), RN);
  rocks.castShadow = rocks.receiveShadow = true;
  for (let i = 0; i < RN; i++) {
    let x, z, h;
    do { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * ISLAND_R * 0.9; x = Math.cos(a) * r; z = Math.sin(a) * r; h = heightAt(x, z); } while (h < 2);
    const sc = rand(0.6, 2.2);
    q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3)));
    m.compose(p.set(x, h, z), q, s.set(sc * rand(0.9, 1.5), sc, sc * rand(0.9, 1.5)));
    rocks.setMatrixAt(i, m);
    addCircle({ x, z, r: 1.4 * sc, alive: true, kind: 'rock', top: h + sc * 1.3 });
  }
  rocks.userData.type = 'rock';
  scene.add(rocks);
  world.rocks = rocks;
  world.raycastables.push(rocks);

  // Cartoon clouds
  const cloudMat = toon(0xffffff);
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(8, 16), 1), cloudMat);
      b.position.set(rand(-20, 20), rand(-3, 4), rand(-8, 8));
      g.add(b);
    }
    g.position.set(rand(-600, 600), rand(170, 230), rand(-600, 600));
    scene.add(g);
  }
  return world;
}

export function damageTree(id, amount) {
  const t = world.trees[id];
  if (!t || !t.alive) return null;
  t.hp -= amount;
  if (t.hp <= 0) {
    t.alive = false;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    world.treeTrunks.setMatrixAt(id, m);
    world.treeLeaves.setMatrixAt(id, m);
    world.treeTrunks.instanceMatrix.needsUpdate = true;
    world.treeLeaves.instanceMatrix.needsUpdate = true;
  }
  return t;
}

// Find spots suitable for houses
export function findHouseSpots(n) {
  const spots = [];
  let tries = 0;
  while (spots.length < n && tries < 20000) {
    tries++;
    const a = Math.random() * 6.28, r = rand(20, ISLAND_R * 0.8);
    const x = Math.round(Math.cos(a) * r / 4) * 4, z = Math.round(Math.sin(a) * r / 4) * 4;
    const hs = [heightAt(x, z), heightAt(x + 8, z), heightAt(x, z + 8), heightAt(x + 8, z + 8)];
    const mn = Math.min(...hs), mx = Math.max(...hs);
    if (mn < 3 || mx - mn > 1.1) continue;
    if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 30)) continue;
    spots.push({ x, z, y: mx });
  }
  return spots;
}
