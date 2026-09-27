import * as THREE from 'three';
import { G } from './state.js';
import { Combatant } from './combat.js';
import { computePlacement, hasPiece, addPiece, showGhost, pieceMeshes } from './structures.js';
import { heightAt, circlesNear } from './world.js';
import { loot, removeLoot, weaponModel } from './weapons.js';
import { PLAYER_OUTFIT } from './character.js';
import { play } from './audio.js';
import { toon, rand } from './util.js';

export function tryBuild(c, type, aim) {
  if (c.wood < 10) return false;
  const pl = computePlacement(type, c.pos, c.yaw, c.pitch, aim);
  if (hasPiece(pl.type, pl.ix, pl.iz, pl.y, pl.dir)) return false;
  addPiece(pl.type, pl.ix, pl.iz, pl.y, pl.dir, 'wood', 150);
  c.wood -= 10;
  play('build', { pos: c.isPlayer ? null : c.pos, vol: 0.6 });
  return true;
}

const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));

// First-person arms + gun, drawn in its own pass so it never clips into walls
class ViewModel {
  constructor(player) {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x6a5a4a, 1.3));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6); sun.position.set(1, 2, 1); this.scene.add(sun);
    this.root = new THREE.Group(); this.scene.add(this.root);
    const M = player.char ? player.char.mats : null;
    const sleeve = toon(M ? M.shirt.color.getHex() : 0xff7a1a), skin = toon(0xffd3b0), accent = toon(0xffd84a);
    const arm = (s) => {
      const g = new THREE.Group();
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.5, 10).rotateX(Math.PI / 2).translate(0, 0, 0.25), sleeve);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.04, 10).rotateX(Math.PI / 2).translate(0, 0, 0.02), accent);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8).scale(0.9, 0.8, 1.2), skin);
      g.add(fore, cuff, hand);
      return g;
    };
    this.armR = arm(1); this.armL = arm(-1);
    this.root.add(this.armR, this.armL);
    this.gunHolder = new THREE.Group(); this.root.add(this.gunHolder);
    this.cur = null;
    this.t = 0; this.swayX = 0; this.swayY = 0; this.kick = 0; this.bobW = 0; this.ads = 0; this.low = 0;
    this.melee = 0;
  }
  setWeapon(it) {
    const id = it ? it.id + it.rarity : null;
    if (id === this.cur) return;
    this.cur = id;
    this.gunHolder.clear();
    if (it) { const m = weaponModel(it.id, it.rarity); m.traverse(o => { if (o.isMesh) o.castShadow = false; }); this.gunHolder.add(m); this.kind = it.def.kind; this.id = it.id; }
  }
  update(dt, P) {
    const it = P.item;
    this.setWeapon(it);
    const moving = P.grounded ? Math.min(1, P.speedNow / 7) : 0;
    this.bobW = damp(this.bobW, moving, 8, dt);
    this.t += dt * (4 + P.speedNow * 1.2);
    const sprint = P.grounded && P.speedNow > 7.6 && this.kind === 'gun' && P.reloadT <= 0;
    this.low = damp(this.low, sprint ? 1 : 0, 10, dt);
    this.ads = damp(this.ads, P.aiming ? 1 : 0, 16, dt);
    this.swayX = damp(this.swayX, 0, 8, dt); this.swayY = damp(this.swayY, 0, 8, dt);
    this.kick = damp(this.kick, 0, 16, dt);
    this.melee = Math.max(0, this.melee - dt * 2.6);
    const bob = this.bobW * (1 - this.ads * 0.8);
    const bx = Math.sin(this.t) * 0.022 * bob, by = -Math.abs(Math.cos(this.t)) * 0.02 * bob;
    const sw = P.switchT;
    const rl = P.reloadT > 0 ? 1 - P.reloadT / it.def.reload : -1;
    const landDip = P.landT * 0.08;
    // base hip position
    let x = 0.2 * (1 - this.ads), y = -0.2 + 0.08 * this.ads, z = -0.45 + 0.08 * this.ads;
    let rx = 0, ry = 0, rz = 0;
    x += bx + this.swayX; y += by + this.swayY - landDip - sw * 0.35 + (P.crouch ? -0.01 : 0);
    z += this.kick * 0.09;
    rx += this.kick * 0.12 - sw * 0.6;
    // sprint: gun canted down and to the side
    x += this.low * 0.05; y -= this.low * 0.06; rx -= this.low * 0.5; ry += this.low * 0.7; rz += this.low * 0.2;
    if (rl >= 0) { const k = Math.sin(rl * Math.PI); rz += k * 0.7; rx += k * 0.35; y -= k * 0.08; }
    if (this.kind === 'melee') {
      const m = this.melee, s = m > 0.6 ? (1 - m) / 0.4 : m / 0.6;
      rx += -0.3 + (m > 0.6 ? s * 0.8 : -s * 1.6); ry += 0.3 - s * 0.6; x += 0.05; y += 0.05 + s * 0.05; z -= s * 0.15;
    }
    if (this.kind === 'heal' && P.useT > 0) { y += 0.12; x -= 0.12; rx += 0.9; z += 0.15; }
    const g = this.gunHolder;
    g.position.set(x, y, z);
    g.rotation.set(rx, ry, rz);
    // arms follow the gun
    g.updateMatrix();
    const grip = new THREE.Vector3(0, -0.02, 0.06).applyMatrix4(g.matrix);
    const fore = new THREE.Vector3(0, 0.0, this.id === 'pickaxe' ? 0.02 : -0.42).applyMatrix4(g.matrix);
    this.armR.position.copy(grip); this.armR.quaternion.copy(g.quaternion); this.armR.rotateY(-0.25); this.armR.rotateX(-0.25);
    if (this.kind === 'gun') {
      const lp = rl >= 0 ? fore.clone().lerp(new THREE.Vector3(-0.1, -0.4, -0.3), Math.sin(Math.min(1, rl * 2) * Math.PI)) : fore;
      this.armL.position.copy(lp); this.armL.quaternion.copy(g.quaternion); this.armL.rotateY(0.6); this.armL.rotateX(-0.2);
      this.armL.visible = true;
    } else this.armL.visible = false;
    this.root.visible = !(P.aiming && it?.def.zoom);
  }
}

export class Player extends Combatant {
  constructor(team = 0) {
    super('YOU', true, { outfit: PLAYER_OUTFIT, skin: 0xffd3b0, hair: 0x2a1a10 }, team);
    this.keys = {};
    this.mouse = false; this.rmb = false;
    this.buildMode = false; this.buildType = 'wall';
    this.buildT = 0;
    this.camDist = 3.8;
    this.nearLoot = null;
    this.fp = false;
    this.kickP = 0; this.kickY = 0;
    this.camY = null; this.dip = 0; this.dipV = 0;
    this.fovBoost = 0;
    this.vm = new ViewModel(this);
    this.bindInput();
  }

  bindInput() {
    const k = this.keys;
    this._kd = (e) => {
      if (e.repeat) return;
      k[e.code] = true;
      if (!this.alive) return;
      if (e.code === 'Space' && this.state === 'bus') this.jumpFromBus = true;
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5) - 1;
        if (n >= 0 && n < 5) { this.buildMode = false; if (n !== this.sel) this.equip(n); }
      }
      if (e.code === 'KeyQ') this.buildMode = !this.buildMode;
      if (e.code === 'KeyZ') { this.buildMode = true; this.buildType = 'wall'; }
      if (e.code === 'KeyX') { this.buildMode = true; this.buildType = 'floor'; }
      if (e.code === 'KeyC') {
        if (this.buildMode) this.buildType = 'ramp';
        else this.wantCrouch = !this.wantCrouch;
      }
      if (e.code === 'KeyV') this.fp = !this.fp;
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyE' && this.nearLoot) this.pickup(this.nearLoot);
      if (e.code === 'ShiftLeft') this.wantCrouch = false;
    };
    this._ku = (e) => { k[e.code] = false; };
    this._md = (e) => {
      if (document.pointerLockElement !== document.body) return;
      if (e.button === 0) this.mouse = true;
      if (e.button === 2) this.rmb = true;
    };
    this._mu = (e) => { if (e.button === 0) this.mouse = false; if (e.button === 2) this.rmb = false; };
    this._mm = (e) => {
      if (document.pointerLockElement !== document.body) return;
      const s = this.aiming && this.item?.def.zoom ? 0.0006 : this.aiming ? 0.0016 : 0.0022;
      this.yaw -= e.movementX * s;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - e.movementY * s));
      this.vm.swayX = Math.max(-0.05, Math.min(0.05, this.vm.swayX - e.movementX * 0.00012));
      this.vm.swayY = Math.max(-0.05, Math.min(0.05, this.vm.swayY + e.movementY * 0.00012));
    };
    this._wh = (e) => {
      if (!this.alive || this.buildMode) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      for (let i = 1; i <= 5; i++) { const n = (this.sel + dir * i + 10) % 5; if (this.slots[n]) { this.equip(n); break; } }
    };
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku);
    addEventListener('mousedown', this._md); addEventListener('mouseup', this._mu);
    addEventListener('mousemove', this._mm); addEventListener('wheel', this._wh);
    addEventListener('contextmenu', this._cm = (e) => e.preventDefault());
  }
  dispose() {
    removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku);
    removeEventListener('mousedown', this._md); removeEventListener('mouseup', this._mu);
    removeEventListener('mousemove', this._mm); removeEventListener('wheel', this._wh);
    removeEventListener('contextmenu', this._cm);
  }

  pickup(l) {
    if (this.give(l.item)) { removeLoot(l); play('build', { vol: 0.3, rate: 1.6 }); }
  }

  recoil(it) {
    const [up, side] = it.def.recoil || [0.01, 0.005];
    const m = (this.aiming ? 0.7 : 1) * (this.crouch ? 0.75 : 1);
    this.kickP += up * m;                    // visual/aim kick that recovers
    this.pitch = Math.min(1.35, this.pitch + up * 0.35 * m); // part of it stays (climb)
    this.yaw += rand(-side, side) * m;
    this.vm.kick = Math.min(1.2, this.vm.kick + (it.def.kick || 0.5));
    this.shake = Math.max(this.shake || 0, it.id === 'shotgun' || it.id === 'sniper' ? 0.16 : 0.05);
  }

  camBasis() {
    const cam = G.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const head = this.pos.clone().add(new THREE.Vector3(0, this.crouch ? 1.45 : 2.0, 0));
    const t = head.clone().sub(cam.position).dot(dir);
    const eye = cam.position.clone().addScaledVector(dir, Math.max(0, t));
    return { eye, dir };
  }
  aimPoint() {
    const { eye, dir } = this.camBasis();
    const rc = new THREE.Raycaster(eye, dir, 0, 9);
    const h = rc.intersectObjects(pieceMeshes, false)[0];
    if (h) return h.point;
    for (let t = 0.5; t < 9; t += 0.5) { const p = eye.clone().addScaledVector(dir, t); if (p.y < heightAt(p.x, p.z)) return p; }
    return null;
  }

  update(dt) {
    const k = this.keys;
    this.aiming = this.rmb && !this.buildMode && this.item?.def.kind === 'gun' && this.reloadT <= 0 && this.switchT < 0.5 && this.state === 'ground';
    if (this.alive && this.state !== 'bus') {
      const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const wish = new THREE.Vector3();
      if (k.KeyW) wish.add(f); if (k.KeyS) wish.sub(f);
      if (k.KeyD) wish.add(r); if (k.KeyA) wish.sub(r);
      if (wish.lengthSq() > 0) wish.normalize();
      if (this.aiming) wish.multiplyScalar(0.62);
      const sprint = k.ShiftLeft && !this.aiming && k.KeyW && !k.KeyS && this.useT <= 0;
      if (sprint && this.reloadT <= 0 && this.item?.def.kind === 'gun') this.fireT = Math.max(this.fireT, G.time + 0.12);
      this.physics(dt, wish, k.Space, sprint);
      if (this.jumped) { this.jumped = false; this.wantCrouch = false; }

      if (this.buildMode) {
        const aim = this.aimPoint();
        const pl = computePlacement(this.buildType, this.pos, this.yaw, this.pitch, aim);
        const ok = this.wood >= 10 && !hasPiece(pl.type, pl.ix, pl.iz, pl.y, pl.dir);
        showGhost(pl, ok, dt);
        this.buildT -= dt;
        if (this.mouse && this.buildT <= 0 && this.state === 'ground') { if (tryBuild(this, this.buildType, aim)) this.buildT = 0.1; }
      } else {
        showGhost(null);
        if (this.mouse && this.state === 'ground') {
          const { eye, dir } = this.camBasis();
          const it = this.item;
          const fired = this.tryFire(eye, dir);
          if (fired && it && it.def.kind === 'gun') {
            this.recoil(it);
            if (!it.def.auto) this.mouse = false;
          }
          if (fired && it?.def.kind === 'melee') this.vm.melee = 1;
        }
      }
      this.nearLoot = null;
      let bd = 2.8;
      const pp = this.pos.clone(); pp.y += 0.6;
      for (const l of loot) { const d = l.obj.position.distanceTo(pp); if (d < bd) { bd = d; this.nearLoot = l; } }
    } else showGhost(null);
    this.tick(dt);
  }

  updateCamera(dt) {
    const cam = G.camera;
    const scoped = this.aiming && this.item?.def.zoom;
    const zoom = this.aiming ? (scoped ? 0.28 : 0.75) : 1;
    const sprinting = this.grounded && this.speedNow > 7.6;
    this.fovBoost = damp(this.fovBoost, sprinting ? 7 : 0, 6, dt);
    const fov = 74 * zoom + this.fovBoost * zoom;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 16, dt); cam.updateProjectionMatrix(); }
    // recoil recovery
    this.kickP = damp(this.kickP, 0, 9, dt);
    // landing dip spring
    this.dipV += (-this.dip * 180 - this.dipV * 18) * dt; this.dip += this.dipV * dt;
    const alive = this.alive;
    const body = alive ? this.pos : (this.lives <= 0 && this.spectate?.alive ? this.spectate.pos : this.corpse ? this.corpse.pos : this.pos);
    const eyeH = this.crouch ? 1.45 : 2.0;
    // smooth vertical follow (stairs/ramps) without lag on jumps
    const targetY = body.y;
    if (this.camY === null || Math.abs(this.camY - targetY) > 3) this.camY = targetY;
    this.camY = damp(this.camY, targetY, this.grounded ? 22 : 40, dt);
    this.eyeH = damp(this.eyeH ?? eyeH, eyeH, 12, dt);
    const firstPerson = (this.fp || scoped) && alive && this.state === 'ground';
    let head, dist, side;
    if (this.state === 'bus' && alive) { head = this.pos.clone().add(new THREE.Vector3(0, 3, 0)); dist = 16; side = 0; }
    else if ((this.state === 'sky' || this.state === 'glide') && alive) { head = this.pos.clone().add(new THREE.Vector3(0, 1.8, 0)); dist = 7; side = 0; }
    else { head = new THREE.Vector3(body.x, this.camY + this.eyeH + this.dip, body.z); dist = this.aiming ? 2.1 : this.crouch ? 3.2 : 3.8; side = this.aiming ? 0.7 : 0.85; }
    if (!alive) { dist = 6.5; side = 0; head.y = body.y + 1.5; }
    if (firstPerson) { dist = 0; side = 0; }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch + this.kickP, this.yaw + this.kickY, 0, 'YXZ'));
    if (firstPerson) {
      // head bob
      const bobT = G.time * (6 + this.speedNow);
      const b = this.grounded ? Math.min(1, this.speedNow / 7) * (this.aiming ? 0.2 : 1) : 0;
      cam.position.set(head.x, head.y + Math.abs(Math.sin(bobT)) * 0.05 * b - 0.05, head.z);
      cam.position.addScaledVector(new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 0.12);
      cam.quaternion.copy(q);
      cam.rotateZ(Math.sin(bobT * 0.5) * 0.006 * b);
      this.camDist = 0;
    } else {
      const back = new THREE.Vector3(side, 0.25, dist).applyQuaternion(q);
      const d = back.length();
      const dir = back.clone().normalize();
      const rc = new THREE.Raycaster(head, dir, 0, d + 0.3);
      const hits = rc.intersectObjects(pieceMeshes, false);
      let far = d;
      if (hits.length) far = Math.max(0.4, hits[0].distance - 0.3);
      for (let t = 0.3; t < far; t += 0.3) {
        const p = head.clone().addScaledVector(dir, t);
        let blocked = p.y < heightAt(p.x, p.z) + 0.3;
        if (!blocked) for (const c of circlesNear(p.x, p.z)) {
          const top = c.kind === 'tree' ? c.y + 4.2 * c.scale : c.top;
          if (p.y < top && Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.35) { blocked = true; break; }
        }
        if (blocked) { far = Math.max(0.4, t - 0.35); break; }
      }
      // pull in instantly, ease back out
      this.camDist = far < this.camDist ? far : damp(this.camDist, far, 7, dt);
      cam.position.copy(head).addScaledVector(dir, this.camDist);
      cam.quaternion.copy(q);
    }
    if (this.shake > 0) {
      this.shake -= dt;
      const s = this.shake * this.shake * 2;
      cam.rotateX((Math.random() - 0.5) * s * 0.3);
      cam.rotateY((Math.random() - 0.5) * s * 0.3);
    }
    if (this.char) this.char.root.visible = !firstPerson && this.state !== 'bus';
    this.firstPerson = firstPerson;
    this.scoped = scoped && alive;
  }

  land(impact) { this.dipV -= Math.min(6, impact * 0.25); }
}
export { ViewModel };
