import * as THREE from 'three';
import { toon, pick, rand } from './util.js';
import { goreTextures, goreMats } from './goretex.js';

export const meshOwner = new WeakMap();

const SKIN = [0xffd3b0, 0xf2b98c, 0xe0a57a, 0xc98a5c, 0x8d5a3a, 0xffe0c8];
const HAIR = [0x2a1a10, 0xe8c25a, 0xb8401a, 0x111111, 0x6a4020, 0x9a9a9a];

// Russian bootleg outfits: [shirt, pants, accent, hat, extra]
const OUTFITS = [
  { name: 'Gopnik', shirt: 0x1a1a22, pants: 0x1a1a22, accent: 0xffffff, stripes: true, hat: 'flatcap', hatColor: 0x3a3a3a, shoe: 0xf0f0f0 },
  { name: 'Gopnik Blue', shirt: 0x1f4fd0, pants: 0x1f4fd0, accent: 0xffffff, stripes: true, hat: null, shoe: 0x111111 },
  { name: 'Spetsnaz', shirt: 0x4a5a3a, pants: 0x3a4a2a, accent: 0x222222, hat: 'balaclava', hatColor: 0x151515, vest: 0x2a3322, shoe: 0x1a1a1a },
  { name: 'Babushka', shirt: 0x9a2a4a, pants: 0x6a2a3a, accent: 0xffd060, hat: 'scarf', hatColor: 0xe04060, shoe: 0x3a2a1a },
  { name: 'Cosmonaut', shirt: 0xeeeeee, pants: 0xdddddd, accent: 0xd52b1e, hat: 'helmet', hatColor: 0xf4f4f4, shoe: 0x888888 },
  { name: 'Ushanka', shirt: 0x5a4030, pants: 0x2a2a3a, accent: 0xd52b1e, hat: 'ushanka', hatColor: 0x6a5040, shoe: 0x221a14 },
  { name: 'Hockey', shirt: 0xd52b1e, pants: 0x1a1a44, accent: 0xffffff, hat: null, stripes: true, shoe: 0x111111 },
  { name: 'Worker', shirt: 0x2a5aa0, pants: 0x2a4a80, accent: 0xffc020, hat: 'hardhat', hatColor: 0xffc020, shoe: 0x3a2a1a },
  { name: 'Medved', shirt: 0x7a4a2a, pants: 0x6a3a1a, accent: 0x3a2010, hat: 'bear', hatColor: 0x7a4a2a, shoe: 0x3a2010 },
  { name: 'Matryoshka', shirt: 0xd02030, pants: 0xd02030, accent: 0xffd040, hat: 'scarf', hatColor: 0xffd040, shoe: 0x2a1a0a },
];
export const PLAYER_OUTFIT = { name: 'Comrade', shirt: 0xff7a1a, pants: 0x2a2a44, accent: 0xffd84a, stripes: true, hat: 'ushanka', hatColor: 0x4a3a2a, shoe: 0x111111 };

let outlineMat;
function outline() {
  if (outlineMat) return outlineMat;
  outlineMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vec3 n = normalize(normalMatrix*normal); mv.xyz += n*0.018*(1.0 - mv.z*0.02); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'void main(){ gl_FragColor = vec4(0.06,0.03,0.08,1.); }',
  });
  return outlineMat;
}

function lathe(pts, seg = 14) { return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg); }
const V = (x, y) => [x, y];
const G = {
  pelvis: new THREE.SphereGeometry(0.27, 14, 10).scale(1.05, 0.62, 0.78).translate(0, 0.03, 0),
  thigh: lathe([V(0.001, 0.02), V(0.12, 0), V(0.155, -0.06), V(0.14, -0.3), V(0.115, -0.48), V(0.001, -0.52)], 10),
  kneecap: new THREE.SphereGeometry(0.115, 10, 8),
  shin: lathe([V(0.001, 0.02), V(0.11, 0), V(0.125, -0.12), V(0.095, -0.4), V(0.001, -0.44)], 10),
  boot: new THREE.CapsuleGeometry(0.115, 0.2, 4, 10).rotateX(Math.PI / 2).scale(1, 0.75, 1).translate(0, -0.49, -0.07),
  sole: new THREE.BoxGeometry(0.22, 0.05, 0.42).translate(0, -0.56, -0.07),
  torso: lathe([V(0.001, -0.02), V(0.25, 0), V(0.28, 0.18), V(0.335, 0.46), V(0.33, 0.6), V(0.24, 0.72), V(0.1, 0.76), V(0.001, 0.77)], 16).scale(1.1, 1, 0.68),
  neck: new THREE.CylinderGeometry(0.09, 0.1, 0.16, 8).translate(0, 0.08, 0),
  head: new THREE.SphereGeometry(0.3, 18, 14).scale(1, 1.05, 0.96).translate(0, 0.27, 0),
  jaw: new THREE.SphereGeometry(0.25, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5).scale(1, 0.7, 0.95).translate(0, 0.2, -0.02),
  nose: new THREE.SphereGeometry(0.055, 8, 6).scale(0.9, 1, 1.1),
  ear: new THREE.SphereGeometry(0.07, 8, 6).scale(0.5, 1, 0.8),
  eye: new THREE.SphereGeometry(0.06, 10, 8).scale(1, 1.15, 0.6),
  pupil: new THREE.SphereGeometry(0.03, 8, 6),
  brow: new THREE.BoxGeometry(0.12, 0.028, 0.03),
  mouth: new THREE.CapsuleGeometry(0.016, 0.08, 2, 6).rotateZ(Math.PI / 2),
  hair: new THREE.SphereGeometry(0.315, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.46).translate(0, 0.3, 0.02),
  shoulder: new THREE.SphereGeometry(0.115, 10, 8),
  upper: lathe([V(0.001, 0.02), V(0.1, 0), V(0.1, -0.2), V(0.085, -0.36), V(0.001, -0.38)], 9),
  elbow: new THREE.SphereGeometry(0.085, 8, 6),
  fore: lathe([V(0.001, 0.02), V(0.085, 0), V(0.088, -0.12), V(0.066, -0.32), V(0.001, -0.34)], 9),
  hand: new THREE.SphereGeometry(0.085, 10, 8).scale(0.85, 1.1, 1.05).translate(0, -0.06, 0),
  thumb: new THREE.CapsuleGeometry(0.026, 0.05, 2, 6).rotateZ(0.6).translate(0.05, -0.04, -0.04),
  stripe: new THREE.BoxGeometry(0.025, 0.46, 0.025),
  backpack: new THREE.BoxGeometry(0.36, 0.42, 0.18).translate(0, 0.38, 0.24),
  bottle: new THREE.CylinderGeometry(0.055, 0.06, 0.28, 8).translate(0.2, 0.46, 0.28),
  vest: lathe([V(0.001, 0.1), V(0.3, 0.12), V(0.35, 0.4), V(0.34, 0.58), V(0.001, 0.6)], 12).scale(1.12, 1, 0.74),
  woundPlane: new THREE.PlaneGeometry(1, 1),
  // hats
  flatcap: new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.4).scale(1.03, 0.75, 1.1).translate(0, 0.38, 0),
  brim: new THREE.CylinderGeometry(0.2, 0.22, 0.03, 12, 1, false, -Math.PI / 2, Math.PI).translate(0, 0.43, -0.2),
  ushanka: new THREE.CylinderGeometry(0.3, 0.33, 0.24, 14).translate(0, 0.5, 0),
  flap: new THREE.BoxGeometry(0.1, 0.26, 0.2),
  helmet: new THREE.SphereGeometry(0.4, 16, 12).translate(0, 0.27, 0),
  visor: new THREE.SphereGeometry(0.405, 14, 10, -Math.PI * 0.8, Math.PI * 0.6, Math.PI * 0.3, Math.PI * 0.35).translate(0, 0.27, 0),
  hardhat: new THREE.SphereGeometry(0.33, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).translate(0, 0.36, 0),
  hardbrim: new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16).translate(0, 0.37, 0),
  bearEar: new THREE.SphereGeometry(0.09, 8, 6).scale(1, 1, 0.5),
  knot: new THREE.SphereGeometry(0.08, 8, 6),
};

const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
const BONES = ['hipsY', 'hipsX', 'spineX', 'spineZ', 'chestX', 'chestY', 'headX', 'headY',
  'shLX', 'shLY', 'shLZ', 'shRX', 'shRY', 'shRZ', 'elL', 'elR', 'legLX', 'legLZ', 'legRX', 'legRZ', 'knL', 'knR', 'handRX', 'handRZ', 'handLX'];

export class Character {
  constructor(opts = {}) {
    const O = opts.outfit || pick(OUTFITS);
    const skin = opts.skin ?? pick(SKIN);
    const hair = opts.hair ?? pick(HAIR);
    this.outfit = O;
    this.mats = {
      skin: toon(skin), shirt: toon(O.shirt), pants: toon(O.pants), accent: toon(O.accent),
      hair: toon(hair), shoe: toon(O.shoe ?? 0x222222), eye: toon(0xffffff), pupil: toon(0x111111),
      hat: toon(O.hatColor ?? 0x333333), dark: toon(0x2a1010), glove: toon(0x2a2a2a), vest: toon(O.vest ?? 0x333333),
    };
    this.baseColors = {};
    for (const k in this.mats) this.baseColors[k] = this.mats[k].color.clone();
    this.root = new THREE.Group();
    this.hitMeshes = [];
    this.outlines = [];
    this.parts = {};
    this.wounds = [];
    this.missing = {};
    this.bloodiness = 0;

    const add = (parent, geo, mat, part, ol = true, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      if (part) { m.userData.part = part; meshOwner.set(m, this); this.hitMeshes.push(m); }
      if (ol) { const o = new THREE.Mesh(geo, outline()); m.add(o); this.outlines.push(o); }
      parent.add(m);
      return m;
    };
    const M = this.mats;

    this.body = new THREE.Group(); this.root.add(this.body);
    this.hips = new THREE.Group(); this.hips.position.y = 1.0; this.body.add(this.hips);
    add(this.hips, G.pelvis, M.pants, 'torso');
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const leg = new THREE.Group(); leg.position.set(0.15 * s, 0, 0);
      add(leg, G.thigh, M.pants, 'leg' + side);
      if (O.stripes) { const st = add(leg, G.stripe, M.accent, null, false, false); st.position.set(0.14 * s, -0.25, 0); }
      const knee = new THREE.Group(); knee.position.y = -0.5; leg.add(knee);
      add(knee, G.kneecap, M.pants, 'leg' + side, false, false);
      add(knee, G.shin, M.pants, 'leg' + side);
      add(knee, G.boot, M.shoe, 'leg' + side);
      add(knee, G.sole, M.dark, null, false, false);
      this.hips.add(leg);
      this.parts['leg' + side] = leg; this.parts['knee' + side] = knee;
    }
    const spine = new THREE.Group(); spine.position.y = 0.05; this.hips.add(spine);
    const chest = new THREE.Group(); chest.position.y = 0.3; spine.add(chest);
    this.parts.torso = spine; this.parts.spine = spine; this.parts.chest = chest;
    this.torsoMesh = add(spine, G.torso, M.shirt, 'torso');
    this.torsoMesh.position.y = -0.02;
    if (O.vest) add(spine, G.vest, M.vest, 'torso', false);
    if (O.stripes) for (const s of [-1, 1]) { const st = add(spine, G.stripe, M.accent, null, false, false); st.position.set(0.12 * s, 0.4, -0.215); st.scale.y = 0.7; }
    add(spine, G.backpack, M.vest.color.getHex() === 0x333333 ? toon(0x4a3a2a) : M.vest, 'torso', true);
    add(spine, G.bottle, new THREE.MeshToonMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.75 }), null, false, false);

    const neck = new THREE.Group(); neck.position.y = 0.42; chest.add(neck);
    add(neck, G.neck, M.skin, 'head', false);
    const head = new THREE.Group(); head.position.y = 0.12; neck.add(head);
    this.parts.head = head; this.parts.neck = neck;
    this.headMesh = add(head, G.head, O.hat === 'balaclava' ? M.hat : M.skin, 'head');
    add(head, G.jaw, O.hat === 'balaclava' ? M.hat : M.skin, 'head', false);
    const nose = add(head, G.nose, M.skin, 'head', false, false); nose.position.set(0, 0.25, -0.29);
    for (const s of [-1, 1]) {
      const ear = add(head, G.ear, M.skin, 'head', false, false); ear.position.set(0.29 * s, 0.26, 0.02);
      const e = add(head, G.eye, M.eye, 'head', false, false); e.position.set(0.11 * s, 0.32, -0.255);
      const p = new THREE.Mesh(G.pupil, M.pupil); p.position.set(0, -0.005, -0.04); e.add(p);
      const b = new THREE.Mesh(G.brow, M.hair); b.position.set(0.11 * s, 0.41, -0.265); b.rotation.z = -0.18 * s; head.add(b);
      this['brow' + (s < 0 ? 'L' : 'R')] = b;
    }
    this.mouth = new THREE.Mesh(G.mouth, M.dark); this.mouth.position.set(0, 0.14, -0.27); head.add(this.mouth);
    this.buildHat(head, O, M);

    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const sh = new THREE.Group(); sh.position.set(0.39 * s, 0.34, 0);
      add(sh, G.shoulder, M.shirt, 'arm' + side, false);
      add(sh, G.upper, M.shirt, 'arm' + side);
      if (O.stripes) { const st = add(sh, G.stripe, M.accent, null, false, false); st.position.set(0.095 * s, -0.18, 0); st.scale.y = 0.75; }
      const el = new THREE.Group(); el.position.y = -0.36; sh.add(el);
      add(el, G.elbow, M.shirt, 'arm' + side, false, false);
      add(el, G.fore, M.shirt, 'arm' + side);
      const hand = new THREE.Group(); hand.position.y = -0.33; el.add(hand);
      add(hand, G.hand, O.hat === 'balaclava' ? M.glove : M.skin, 'arm' + side, false, false);
      add(hand, G.thumb, O.hat === 'balaclava' ? M.glove : M.skin, null, false, false).position.x *= s;
      chest.add(sh);
      this.parts['arm' + side] = sh; this.parts['elbow' + side] = el; this.parts['hand' + side] = hand;
    }
    this.hand = new THREE.Group(); this.hand.position.set(0, -0.08, 0); this.hand.rotation.x = -Math.PI / 2;
    this.parts.handR.add(this.hand);

    // pose state
    this.pose = {}; for (const b of BONES) this.pose[b] = 0;
    this.pose.hipsY = 1.0;
    this.cycle = 0; this.walkW = 0;
    this.kick = 0; this.meleeT = 0;
    this.react = { x: 0, z: 0, vx: 0, vz: 0, head: 0, hv: 0 };
    this.weaponModel = null;
    this.detail = true;
    this.blinkT = rand(1, 4);
  }

  buildHat(head, O, M) {
    const h = O.hat;
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.userData.part = 'head'; meshOwner.set(m, this); this.hitMeshes.push(m); m.castShadow = true; head.add(m); return m; };
    if (!h || h === 'flatcap' || h === 'hardhat') add(G.hair, M.hair);
    if (h === 'flatcap') { add(G.flatcap, M.hat); add(G.brim, M.hat); }
    else if (h === 'ushanka') {
      add(G.ushanka, M.hat); add(G.hair, M.hat).scale.setScalar(1.04);
      for (const s of [-1, 1]) { const f = add(G.flap, M.hat, 0.3 * s, 0.24, 0.02); f.rotation.z = 0.15 * s; }
      const star = add(new THREE.OctahedronGeometry(0.05, 0), M.accent, 0, 0.46, -0.31); star.scale.z = 0.3;
    } else if (h === 'balaclava') { /* whole head colored */ }
    else if (h === 'scarf') {
      const sc = add(G.hair, M.hat); sc.scale.set(1.08, 1.25, 1.08); sc.position.y = -0.1;
      add(G.knot, M.hat, 0, 0.08, -0.22);
    } else if (h === 'helmet') {
      const hm = add(G.helmet, M.hat); hm.material = new THREE.MeshToonMaterial({ color: 0xf4f4f4, transparent: true, opacity: 0.35 });
      add(G.visor, M.accent);
    } else if (h === 'hardhat') { add(G.hardhat, M.hat); add(G.hardbrim, M.hat); }
    else if (h === 'bear') {
      add(G.hair, M.hat).scale.setScalar(1.05);
      for (const s of [-1, 1]) add(G.bearEar, M.hat, 0.2 * s, 0.56, 0);
    }
  }

  setDetail(near) {
    if (near === this.detail) return;
    this.detail = near;
    for (const o of this.outlines) o.visible = near;
  }

  setWeapon(model) {
    if (this.weaponModel) this.hand.remove(this.weaponModel);
    this.weaponModel = model;
    if (model) this.hand.add(model);
  }

  fire(strength = 1) { this.kick = Math.min(1.5, this.kick + strength); }
  melee() { this.meleeT = 1; }
  flinch(dir, part, amt = 1) {
    // dir: world direction of bullet; convert to local
    const local = dir.clone().applyQuaternion(this.root.quaternion.clone().invert());
    const k = Math.min(2.5, amt);
    this.react.vx += local.z * 9 * k;
    this.react.vz += -local.x * 9 * k;
    if (part === 'head') this.react.hv += 14 * k * (local.z > 0 ? 1 : -1);
  }

  // st: {speed, grounded, vy, pitch, crouch, sprint, gliding, sky, holding, aiming, reload, switchT, useT, useFrac, landT, fwdVel, sideVel}
  animate(dt, st) {
    const P = this.pose, T = {};
    const pitch = st.pitch;
    const moving = st.grounded ? Math.min(1, st.speed / 6) : 0;
    this.walkW = damp(this.walkW, moving, 10, dt);
    const rate = st.sprint ? 1.25 : st.crouch ? 0.85 : 1;
    this.cycle += dt * (st.speed * 1.35 * rate + 0.001);
    const c = this.cycle, w = this.walkW;
    const brokenL = this.missing.brokenL, brokenR = this.missing.brokenR;
    const crouch = st.crouch ? 1 : 0;

    // ---- lower body
    const stride = (st.sprint ? 0.95 : st.crouch ? 0.55 : 0.75) * w;
    const back = st.fwdVel < -0.5 ? -1 : 1;
    T.hipsY = 1.0 - crouch * 0.36 - (brokenL || brokenR ? 0.1 : 0) + Math.abs(Math.cos(c)) * 0.07 * w * (1 - crouch * 0.5) - st.landT * 0.28;
    T.hipsX = crouch * 0.12 + (st.sprint ? 0.12 : 0) * w;
    T.legLX = Math.sin(c) * stride * back + crouch * 1.05 + st.landT * 0.6;
    T.legRX = -Math.sin(c) * stride * back + crouch * 1.05 + st.landT * 0.6;
    T.knL = Math.max(0, -Math.sin(c + 0.6)) * 1.25 * w + crouch * 1.75 + st.landT * 1.1 + 0.05;
    T.knR = Math.max(0, Math.sin(c + 0.6)) * 1.25 * w + crouch * 1.75 + st.landT * 1.1 + 0.05;
    T.legLZ = -0.04 - st.sideVel * 0.02 * w; T.legRZ = 0.04 - st.sideVel * 0.02 * w;
    T.spineX = -(crouch * 0.28 + (st.sprint ? 0.22 : 0.05) * w) + st.landT * -0.25;
    T.spineZ = 0;
    T.chestY = Math.sin(c) * 0.12 * w * (st.holding === 'gun' ? 0.3 : 1);
    if (!st.grounded && !st.gliding && !st.sky) {
      const up = st.vy > 1 ? 1 : 0;
      T.legLX = up ? 1.1 : 0.35; T.legRX = up ? 0.2 : -0.15;
      T.knL = up ? 1.5 : 0.5; T.knR = up ? 0.6 : 0.35;
      T.hipsY = 1.0 - crouch * 0.2;
      T.spineX = up ? -0.15 : 0.05;
    }
    if (st.gliding) { T.legLX = 0.25; T.legRX = -0.15; T.knL = 0.5; T.knR = 0.7; T.hipsY = 1; T.spineX = 0.1; }
    if (st.sky) { const f = Math.sin(this.cycle * 0.2 + performance.now() * 0.004); T.legLX = 0.4 + f * 0.15; T.legRX = 0.25 - f * 0.15; T.knL = 0.9; T.knR = 0.6; T.hipsY = 1; T.spineX = -0.3; }
    if (brokenL) { T.knL = Math.min(T.knL, 0) - 1.2; }
    if (brokenR) { T.knR = Math.min(T.knR, 0) - 1.2; }

    // ---- upper body
    T.headX = pitch * 0.45 - T.spineX * 0.6; T.headY = -T.chestY;
    T.chestX = pitch * 0.35;
    T.handRX = 0; T.handRZ = 0; T.handLX = 0;
    const sw = st.switchT || 0; // 1 = fully lowered
    const armSwing = Math.sin(c) * 0.9 * w;
    if (st.gliding || st.sky) {
      const f = st.sky ? Math.sin(performance.now() * 0.006) * 0.2 : 0;
      T.shLX = st.sky ? 0.2 : Math.PI - 0.1; T.shLY = 0; T.shLZ = st.sky ? -1.3 + f : -0.35;
      T.shRX = st.sky ? 0.2 : Math.PI - 0.1; T.shRY = 0; T.shRZ = st.sky ? 1.3 - f : 0.35;
      T.elL = st.sky ? 0.4 : 0.3; T.elR = st.sky ? 0.4 : 0.3;
      T.chestX = 0; T.headX = st.sky ? 0.6 : -0.2;
    } else if (st.holding === 'gun') {
      const low = st.sprint ? 1 : 0;
      const ap = pitch * 0.65; // chest takes the rest
      const aimX = Math.PI / 2 + ap;
      T.shRX = aimX * (1 - low) + 0.5 * low; T.shRY = 0.25 * low; T.shRZ = 0.05 + 0.2 * low;
      T.elR = st.aiming ? 0.15 : 0.35 + low * 0.9;
      T.shLX = aimX * (1 - low) + 0.9 * low + 0.1; T.shLY = -0.35 * (1 - low); T.shLZ = -0.55 * (1 - low) - 0.2 * low;
      T.elL = 0.75 + low * 0.5;
      T.handRX = low * 0.4;
      if (st.reload >= 0) {
        // reload: tilt gun, left hand down to mag and back
        const r = st.reload, k = Math.sin(r * Math.PI);
        T.handRZ = 0.7 * k; T.handRX = -0.35 * k;
        const dip = Math.sin(Math.min(1, r * 2) * Math.PI);
        T.shLX = aimX - 0.9 * dip; T.shLZ = -0.3 - 0.2 * dip; T.elL = 1.3 * dip + 0.6;
        T.chestX += -0.12 * k;
      }
      T.shRX -= sw * 1.2; T.shLX -= sw * 1.3; T.elR += sw * 0.5;
    } else if (st.holding === 'melee') {
      const m = this.meleeT;
      const s = m > 0.6 ? (1 - m) / 0.4 : m / 0.6; // windup then strike
      T.shRX = 0.8 + (m > 0.6 ? s * 1.8 : s * 2.2) + pitch * 0.5; T.shRY = 0; T.shRZ = -0.1 - s * 0.3;
      T.elR = 0.5 + s * 0.3; T.handRX = -0.3 + s * 0.4;
      T.shLX = -armSwing * 0.7 + 0.3; T.shLY = 0; T.shLZ = -0.2; T.elL = 0.4;
      T.chestY += m > 0 ? (m > 0.6 ? -0.4 * s : 0.5 * s) : 0;
      T.shRX -= sw * 1.2;
    } else if (st.holding === 'heal') {
      const u = st.useFrac || 0;
      const drink = st.useT > 0 ? 1 : 0;
      T.shRX = 0.5 + drink * (1.9 + Math.sin(u * 20) * 0.08); T.shRY = 0; T.shRZ = drink * -0.5;
      T.elR = 0.8 + drink * 1.3; T.handRX = drink * 0.8;
      T.shLX = -armSwing * 0.6; T.shLY = 0; T.shLZ = -0.15; T.elL = 0.3;
      T.headX -= drink * 0.35;
    } else {
      T.shLX = -armSwing * 0.8; T.shLY = 0; T.shLZ = -0.12; T.shRX = armSwing * 0.8; T.shRY = 0; T.shRZ = 0.12;
      T.elL = 0.25 + w * 0.3; T.elR = 0.25 + w * 0.3;
    }
    if (!st.grounded && !st.gliding && !st.sky && st.holding === 'none') { T.shLZ = -1.0; T.shRZ = 1.0; }

    // blend
    const rr = st.landT > 0.2 ? 25 : 14;
    for (const b of BONES) P[b] = damp(P[b], T[b] ?? 0, b.startsWith('sh') || b.startsWith('el') || b.startsWith('hand') ? 18 : rr, dt);

    // hit reaction springs
    const R = this.react;
    R.vx += (-R.x * 120 - R.vx * 14) * dt; R.x += R.vx * dt;
    R.vz += (-R.z * 120 - R.vz * 14) * dt; R.z += R.vz * dt;
    R.hv += (-R.head * 140 - R.hv * 12) * dt; R.head += R.hv * dt;
    this.kick = damp(this.kick, 0, 14, dt);
    this.meleeT = Math.max(0, this.meleeT - dt * 2.6);

    // apply
    const Pa = this.parts;
    this.hips.position.y = P.hipsY;
    this.hips.rotation.x = P.hipsX * 0.5;
    Pa.spine.rotation.set(P.spineX + R.x * 0.6, 0, P.spineZ + R.z * 0.6);
    Pa.chest.rotation.set(P.chestX + R.x * 0.5 - this.kick * 0.06, P.chestY, R.z * 0.4);
    Pa.head.rotation.set(P.headX + R.head * 0.8 - this.kick * 0.04, P.headY, R.z * 0.3);
    Pa.legL.rotation.set(P.legLX, 0, P.legLZ);
    Pa.legR.rotation.set(P.legRX, 0, P.legRZ);
    Pa.kneeL.rotation.x = -P.knL; Pa.kneeR.rotation.x = -P.knR;
    Pa.kneeL.rotation.z = brokenL ? 0.5 : 0; Pa.kneeR.rotation.z = brokenR ? -0.5 : 0;
    // compensate feet: when legs swing back and knee bends, fine
    const k = this.kick;
    Pa.armL.rotation.set(P.shLX + k * 0.12, P.shLY, P.shLZ);
    Pa.armR.rotation.set(P.shRX + k * 0.18, P.shRY, P.shRZ);
    Pa.elbowL.rotation.x = P.elL; Pa.elbowR.rotation.x = P.elR + k * 0.1;
    this.hand.rotation.set(-Math.PI / 2 + P.handRX - k * 0.05 - P.elR - k * 0.1, 0, P.handRZ);
    // correct forearm bend so gun keeps pointing along the upper arm aim
    // blink
    this.blinkT -= dt;
    const eyesY = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = rand(2, 5);
    for (const o of Pa.head.children) if (o.geometry === G.eye) o.scale.y = eyesY;
  }

  // Death pose blending (e: 0..1)
  animateDead(dt, e) {
    const Pa = this.parts;
    this.hips.position.y = damp(this.hips.position.y, 0.95 - e * 0.1, 10, dt);
    Pa.armL.rotation.set(e * 2.6, 0, -e * 0.9);
    Pa.armR.rotation.set(e * 2.3, 0.3, e * 1.0);
    Pa.elbowL.rotation.x = 0.3 * e; Pa.elbowR.rotation.x = 0.9 * e;
    Pa.legL.rotation.set(e * 0.25, 0, -0.15 * e); Pa.legR.rotation.set(-e * 0.1, 0, 0.2 * e);
    Pa.kneeL.rotation.x = -0.3 * e; Pa.kneeR.rotation.x = -0.8 * e;
    Pa.head.rotation.set(e * 0.4, e * 0.7, 0.2 * e);
    Pa.spine.rotation.set(0, 0, 0); Pa.chest.rotation.set(e * 0.1, 0, 0);
    for (const o of Pa.head.children) if (o.geometry === G.eye) o.scale.y = 0.15;
    this.brokenPose();
  }
  brokenPose() {
    if (this.missing.brokenL) { this.parts.kneeL.rotation.x = 1.3; this.parts.kneeL.rotation.z = 0.5; }
    if (this.missing.brokenR) { this.parts.kneeR.rotation.x = 1.3; this.parts.kneeR.rotation.z = -0.5; }
  }

  // Attach a wound decal to a hit mesh at a world point
  addWound(mesh, point, normal, size = 0.16, big = false, exit = false) {
    const T = goreTextures();
    const tex = exit ? pick(T.exit) : big ? pick(T.woundBig) : pick(T.wound);
    const mat = new THREE.MeshPhongMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, shininess: 90, specular: 0x552222, alphaTest: 0.02 });
    const d = new THREE.Mesh(G.woundPlane, mat);
    mesh.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const lp = point.clone().applyMatrix4(inv);
    const ln = normal.clone().transformDirection(inv);
    d.position.copy(lp).addScaledVector(ln, 0.01);
    d.lookAt(lp.clone().add(ln));
    d.rotation.z = rand(0, 6.28);
    d.scale.setScalar(size * rand(0.85, 1.25));
    d.renderOrder = 2;
    mesh.add(d);
    d.userData.bleed = big ? 14 : 8;
    this.wounds.push(d);
    if (this.wounds.length > 36) { const o = this.wounds.shift(); o.parent && o.parent.remove(o); o.material.dispose(); }
    return d;
  }

  soak(amount) {
    this.bloodiness = Math.min(0.8, this.bloodiness + amount);
    const red = new THREE.Color(0x4a0306);
    for (const k of ['shirt', 'pants', 'skin', 'accent', 'vest', 'glove']) this.mats[k].color.copy(this.baseColors[k]).lerp(red, this.bloodiness * (k === 'skin' ? 0.55 : 0.9));
  }

  // layered gore cap: skin ring, fat, muscle, bone with marrow
  static cap(r) {
    const M = goreMats();
    const g = new THREE.Group();
    const skin = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, r * 0.18, 12, 1, true), M.skinRing);
    g.add(skin);
    const fat = new THREE.Mesh(new THREE.CircleGeometry(r, 14).rotateX(-Math.PI / 2), M.fat); fat.position.y = r * 0.08; g.add(fat);
    const mus = new THREE.Mesh(new THREE.SphereGeometry(r * 0.88, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.muscle); mus.scale.y = 0.35; mus.position.y = r * 0.08; g.add(mus);
    for (let i = 0; i < 6; i++) {
      const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(r * rand(0.2, 0.4)), i % 3 ? M.flesh : M.darkFlesh);
      const a = rand(0, 6.28), d = rand(0.3, 0.8) * r;
      sh.position.set(Math.cos(a) * d, r * rand(0.1, 0.35), Math.sin(a) * d); sh.rotation.set(rand(0, 3), rand(0, 3), 0);
      g.add(sh);
    }
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.26, r * 0.32, r * 1.3, 8).translate(0, r * 0.55, 0), M.bone); g.add(bone);
    const marrow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.17, 8).rotateX(-Math.PI / 2), M.marrow); marrow.position.y = r * 1.21; g.add(marrow);
    const tendon = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.06, r * 0.04, r * 1.4, 4).translate(0, r * 0.6, 0), M.tendon);
    tendon.position.x = r * 0.45; tendon.rotation.z = -0.4; g.add(tendon);
    const vein = tendon.clone(); vein.material = M.vein; vein.position.x = -r * 0.5; vein.rotation.z = 0.5; g.add(vein);
    return g;
  }

  // Hide a limb, attach a gory stump. Returns the detached group (world transform) for gibbing.
  dismember(part) {
    if (this.missing[part]) return null;
    const g = this.parts[part];
    if (!g) return null;
    this.missing[part] = true;
    g.updateMatrixWorld(true);
    const clone = g.clone(true);
    g.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    clone.traverse(o => { if (o.material === outlineMat) o.visible = true; });
    g.visible = false;
    for (const m of this.hitMeshes) { let p = m; while (p) { if (p === g) { m.userData.gone = true; break; } p = p.parent; } }
    const r = part === 'head' ? 0.1 : part.startsWith('leg') ? 0.14 : 0.1;
    // cap on the severed limb end
    const lc = Character.cap(r);
    if (part === 'head') { lc.rotation.x = Math.PI; lc.position.y = -0.08; }
    clone.add(lc);
    // stump on the body
    const stump = Character.cap(r);
    stump.position.copy(g.position);
    if (part.startsWith('arm')) stump.rotation.z = part === 'armL' ? Math.PI / 2 : -Math.PI / 2;
    else if (part.startsWith('leg')) stump.rotation.x = Math.PI;
    g.parent.add(stump);
    this.stumps = this.stumps || [];
    this.stumps.push({ part, obj: stump });
    return clone;
  }

  // Break a leg: shattered tibia jutting through the shin
  breakLeg(side) {
    if (this.missing['broken' + side] || this.missing['leg' + side]) return;
    this.missing['broken' + side] = true;
    const M = goreMats();
    const knee = this.parts['knee' + side];
    const bone = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.042, 0.3, 6).translate(0, 0.15, 0), M.bone);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4).translate(0, 0.36, 0), M.bone);
    tip.rotation.z = 0.2;
    const hole = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 6), M.muscle); hole.scale.set(1, 0.4, 1);
    const fat = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 5, 10), M.fat); fat.rotation.x = Math.PI / 2;
    bone.add(shaft, tip, hole, fat);
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.03), M.bone); s.position.set(rand(-0.05, 0.05), rand(0.05, 0.2), rand(-0.05, 0.05)); bone.add(s); }
    bone.position.set(0, -0.14, -0.1);
    bone.rotation.x = -1.1;
    knee.add(bone);
    this.boneOut = this.boneOut || [];
    this.boneOut.push(bone);
  }

  // Open the torso: cavity, ribs, lungs, guts spilling out
  openTorso() {
    if (this.missing.gutted) return;
    this.missing.gutted = true;
    const M = goreMats();
    const g = new THREE.Group();
    const cav = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.cavity);
    cav.rotation.x = Math.PI / 2; cav.scale.set(1, 0.45, 1.35);
    g.add(cav);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), M.muscle); rim.scale.set(1, 1.35, 1); g.add(rim);
    const fatRim = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.02, 5, 16), M.fat); fatRim.scale.set(1, 1.3, 1); g.add(fatRim);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.016, 5, 10, Math.PI * 0.75), M.bone);
      rib.position.set(0, 0.17 - i * 0.065, -0.02);
      rib.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 0.12);
      if (i === 1) rib.rotation.z += 0.5; // broken rib
      g.add(rib);
    }
    const lung = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), M.lung); lung.scale.set(0.8, 1.3, 0.6); lung.position.set(-0.08, 0.1, 0.02); g.add(lung);
    const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 1), M.muscle); heart.position.set(0.04, 0.08, -0.02); g.add(heart);
    this.heart = heart;
    const pts = [];
    for (let i = 0; i < 40; i++) { const a = i * 0.9; pts.push(new THREE.Vector3(Math.cos(a) * 0.1 * (1 - i / 60), -0.06 - i * 0.004, Math.sin(a) * 0.05 - 0.05)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.033, 6), M.gut));
    const hang = [];
    for (let i = 0; i < 16; i++) hang.push(new THREE.Vector3(Math.sin(i * 0.8) * 0.05, -0.1 - i * 0.05, -0.12 - Math.sin(i * 0.4) * 0.05));
    this.dangle = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hang), 40, 0.034, 6), M.gut2);
    g.add(this.dangle);
    const liver = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M.liver); liver.scale.set(1.4, 0.7, 0.8); liver.position.set(0.08, 0.02, -0.06); g.add(liver);
    g.position.set(0, 0.32, -0.19);
    this.parts.spine.add(g);
    this.guts = g;
  }

  crackSkull() {
    if (this.missing.skull || this.missing.head) return;
    this.missing.skull = true;
    const M = goreMats();
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 2), M.brain);
    b.scale.set(1, 0.6, 1.1);
    b.position.set(0.09, 0.5, -0.04);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 5, 12), M.muscle); ring.rotation.x = Math.PI / 2; ring.position.copy(b.position);
    const bone = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 4, 12, 4.5), M.bone); bone.rotation.x = Math.PI / 2; bone.position.copy(b.position);
    this.parts.head.add(b, ring, bone);
  }

  // world positions of bleeding wounds (for drips)
  bleedPoints(dt, out) {
    for (const w of this.wounds) {
      if (!w.userData.bleed || !w.parent || !w.parent.visible) continue;
      w.userData.bleed -= dt;
      if (Math.random() < dt * 2.5) { w.updateMatrixWorld(); out.push(new THREE.Vector3().setFromMatrixPosition(w.matrixWorld)); }
    }
  }

  update(dt) {
    if (this.dangle) this.dangle.rotation.x = Math.sin(this.cycle * 0.7) * 0.25;
    if (this.heart && !this.dead) this.heart.scale.setScalar(1 + Math.max(0, Math.sin(performance.now() * 0.012)) * 0.25);
  }
}
