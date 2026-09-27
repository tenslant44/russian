import * as THREE from 'three';
import { G } from './state.js';
import { Combatant, castRay, botName } from './combat.js';
import { tryBuild } from './player.js';
import { loot, removeLoot } from './weapons.js';
import { rand, pick } from './util.js';
import { ISLAND_R } from './world.js';

const _v = new THREE.Vector3();
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class Bot extends Combatant {
  constructor(i, landing, team = i + 1) {
    super(botName(i), false, undefined, team);
    this.dropAt = rand(0.08, 0.92);
    this.landing = landing;
    this.goal = landing.clone();
    this.target = null;
    this.thinkT = rand(0, 0.3);
    this.strafe = 1; this.strafeT = 0;
    this.reaction = 0;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.buildCd = 0;
    this.skill = rand(0.6, 1.25);
    this.jumpCd = 0;
    this.seenT = -10;
    this.followOff = new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6));
  }

  hasGun() { return this.slots.some(s => s && s.def.kind === 'gun'); }
  bestGun(dist) {
    let best = -1, score = -1;
    this.slots.forEach((s, i) => {
      if (!s || s.def.kind !== 'gun') return;
      let sc = s.def.dmg * s.def.pellets / s.def.rate;
      if (s.id === 'shotgun') sc *= dist < 10 ? 2.5 : 0.1;
      if (s.id === 'sniper') sc *= dist > 60 ? 4 : 0.4;
      if (s.id === 'smg') sc *= dist < 25 ? 1.3 : 0.6;
      if (s.ammo <= 0 && s !== this.item) sc *= 0.5;
      sc *= 1 + s.rarity * 0.1;
      if (sc > score) { score = sc; best = i; }
    });
    return best;
  }

  canSee(t) {
    const eye = this.pos.clone().add(_v.set(0, 2, 0));
    const aim = t.pos.clone().add(_v.set(0, 1.5, 0)).sub(eye);
    const d = aim.length();
    const h = castRay(eye, aim.normalize(), d + 1, this, false);
    return h.type === 'char' && h.target === t;
  }

  think() {
    // pick target
    let best = null;
    const range = this.slots.some(s => s?.id === 'sniper') ? 200 : 110;
    if (this.lastAttacker?.alive && this.lastAttacker.team !== this.team && G.time - this.lastHurt < 4) best = this.lastAttacker;
    else {
      const cands = [];
      for (const c of G.combatants) {
        if (c === this || !c.alive || c.state !== 'ground' || c.team === this.team) continue;
        const d = c.pos.distanceTo(this.pos);
        if (d < range) cands.push([d, c]);
      }
      cands.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < Math.min(3, cands.length); i++) if (this.canSee(cands[i][1])) { best = cands[i][1]; break; }
    }
    if (best !== this.target) this.reaction = rand(0.35, 0.8) / this.skill;
    this.target = best;
    if (best) this.seenT = G.time;
    // goal when no target
    const S = G.storm;
    const inside = (p, cx, cz, r) => Math.hypot(p.x - cx, p.z - cz) < r;
    const L = this.leader;
    if (!this.target && L && L.alive && L.state === 'ground' && L.pos.distanceTo(this.pos) > 14 && (!S || inside(L.pos, S.x, S.z, S.r))) {
      this.goal.copy(L.pos).add(this.followOff);
    } else if (!this.target) {
      if (S && !inside(this.pos, S.nextX, S.nextZ, S.nextR * 0.9)) {
        this.goal.set(S.nextX + rand(-1, 1) * S.nextR * 0.4, 0, S.nextZ + rand(-1, 1) * S.nextR * 0.4);
      } else {
        // loot hunting
        let bl = null, bld = this.hasGun() ? 25 : 70;
        for (const l of loot) {
          const d = l.obj.position.distanceTo(this.pos);
          if (d < bld && (l.item.def.kind === 'gun' || this.slots.includes(null))) { bl = l; bld = d; }
        }
        if (bl) this.goal.copy(bl.obj.position);
        else if (this.goal.distanceTo(this.pos) < 4 || Math.random() < 0.02) {
          const cx = S ? S.nextX : 0, cz = S ? S.nextZ : 0, r = S ? S.nextR * 0.8 : ISLAND_R * 0.7;
          const a = rand(0, 6.28), rr = Math.sqrt(Math.random()) * r;
          this.goal.set(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr);
        }
      }
    }
  }

  hurt(info) {
    if (info.attacker && info.attacker !== this) this.lastAttacker = info.attacker;
    super.hurt(info);
    if (this.alive && info.attacker && !info.fall && !info.storm && this.buildCd <= 0 && this.wood >= 10 && Math.random() < 0.55 && this.state === 'ground') {
      // panic-build a wall toward attacker (classic)
      const a = info.attacker.pos;
      const saveYaw = this.yaw, savePitch = this.pitch;
      this.yaw = Math.atan2(-(a.x - this.pos.x), -(a.z - this.pos.z));
      this.pitch = 0;
      tryBuild(this, 'wall');
      if (Math.random() < 0.4) tryBuild(this, 'ramp');
      this.yaw = saveYaw; this.pitch = savePitch;
      this.buildCd = rand(2.5, 6);
    }
  }

  update(dt, bus) {
    if (!this.alive) { this.tick(dt); return; }
    if (this.state === 'bus') {
      this.pos.copy(bus.pos);
      const L = this.leader;
      const go = L ? L.state !== 'bus' && (this.dropDelay = (this.dropDelay ?? rand(0.2, 0.9)) - dt) <= 0 : bus.progress > this.dropAt;
      if (go || bus.progress > 0.97) { this.state = 'sky'; this.vel.set(0, -5, 0); this.char.root.visible = true; this.pos.x += rand(-3, 3); this.pos.z += rand(-3, 3); }
      return;
    }
    this.buildCd -= dt; this.jumpCd -= dt;
    this.thinkT -= dt;
    if (this.thinkT <= 0 && this.state === 'ground') { this.thinkT = rand(0.25, 0.45); this.think(); }

    const wish = new THREE.Vector3();
    let jump = false, sprint = false;
    if (this.state !== 'ground') {
      if (this.leader && this.leader.alive && this.leader.state !== 'bus') this.landing.copy(this.leader.pos).add(this.followOff);
      const to = this.landing.clone().sub(this.pos).setY(0);
      if (to.length() > 3) wish.copy(to.normalize());
      this.yaw = Math.atan2(-wish.x, -wish.z) || this.yaw;
      this.physics(dt, wish, this.state === 'sky' && this.pos.y < 110, false);
      this.tick(dt);
      return;
    }

    const t = this.target;
    if (t && t.alive) {
      const to = t.pos.clone().sub(this.pos);
      const dist = to.length();
      const gi = this.bestGun(dist);
      if (gi >= 0 && gi !== this.sel && G.time > this.fireT - 0.2 && this.reloadT <= 0) this.equip(gi);
      if (gi < 0 && this.sel !== 0) this.equip(0);
      const it = this.item;
      // face target
      const wantYaw = Math.atan2(-to.x, -to.z);
      const eye = this.pos.clone().add(_v.set(0, 2, 0));
      const aimPt = t.pos.clone().add(_v.set(0, Math.random() < 0.18 * this.skill ? 2.1 : 1.4, 0));
      const ad = aimPt.clone().sub(eye);
      const wantPitch = Math.atan2(ad.y, Math.hypot(ad.x, ad.z));
      this.yaw += angDiff(this.yaw, wantYaw) * Math.min(1, dt * 7 * this.skill);
      this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 7);
      // movement: keep preferred range and strafe
      const pref = it.id === 'shotgun' || it.id === 'pickaxe' ? 3 : it.id === 'smg' ? 12 : it.id === 'sniper' ? 70 : 25;
      const fwd = to.clone().setY(0).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = pick([-1, 1, 0.5, -0.5, 0]); this.strafeT = rand(0.6, 1.8); this.wantCrouch = it.id !== 'shotgun' && it.id !== 'pickaxe' && dist > 18 && Math.random() < 0.35; }
      if (dist > pref + 4) wish.add(fwd); else if (dist < pref - 3) wish.sub(fwd);
      wish.addScaledVector(right, this.strafe * (it.id === 'sniper' ? 0.2 : 1));
      if (wish.lengthSq() > 0) wish.normalize();
      sprint = dist > pref + 15;
      if (this.jumpCd <= 0 && Math.random() < 0.02) { jump = true; this.jumpCd = 1.5; }
      // shoot
      this.reaction -= dt;
      if (this.reaction <= 0 && Math.abs(angDiff(this.yaw, wantYaw)) < 0.25) {
        if (it.def.kind === 'gun' && it.ammo <= 0) this.startReload();
        else if (it.def.kind === 'gun' || dist < 3) {
          const err = (it.id === 'sniper' ? 0.9 : 0.5) / this.skill * (1 + dist / 60);
          const a = aimPt.clone().add(_v.set(rand(-err, err), rand(-err, err) * 0.8, rand(-err, err))).sub(eye).normalize();
          if (this.tryFire(eye, a) && it.id === 'sniper') this.fireT += rand(0.5, 1.5);
          if (it.def.auto) this.fireT += rand(0, 0.08);
        }
      }
      if (G.time - this.seenT > 3) this.target = null;
    } else {
      this.target = null;
      // heal when calm
      const heal = this.slots.findIndex(s => s && (s.id === 'medkit' && this.hp < 60 || s.id === 'vodka' && this.shield < 60));
      if (heal >= 0 && G.time - this.lastHurt > 4) {
        this.wantCrouch = true;
        if (this.sel !== heal) this.equip(heal);
        if (this.useT <= 0) this.useT = this.item.def.use;
      } else {
        this.wantCrouch = false;
        if (this.useT <= 0 && this.item?.def.kind === 'heal') this.equip(0);
        const gi = this.bestGun(30); if (gi >= 0 && this.sel !== gi && this.useT <= 0) this.equip(gi);
        if (this.item?.def.kind === 'gun' && this.item.ammo < this.item.def.mag * 0.5) this.startReload();
        const to = this.goal.clone().sub(this.pos).setY(0);
        if (to.length() > 1.2) {
          wish.copy(to.normalize());
          this.yaw += angDiff(this.yaw, Math.atan2(-wish.x, -wish.z)) * Math.min(1, dt * 5);
          this.pitch *= 0.9;
        }
        sprint = true;
      }
      // pick up loot we're standing on
      for (const l of loot) if (l.obj.position.distanceTo(this.pos) < 2.2 && (l.item.def.kind !== 'gun' || this.wantsGun(l.item))) {
        if (this.slots.includes(null) || l.item.def.kind === 'heal' && this.slots.some(s => s?.id === l.item.id)) { this.give(l.item); removeLoot(l); break; }
      }
    }
    // stuck handling
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      if (wish.lengthSq() > 0 && this.pos.distanceTo(this.lastPos) < 1.2) {
        jump = true;
        if (Math.random() < 0.4) { const a = rand(0, 6.28); this.goal.set(this.pos.x + Math.cos(a) * 30, 0, this.pos.z + Math.sin(a) * 30); }
      }
      this.lastPos.copy(this.pos); this.stuckT = 0;
    }
    this.physics(dt, wish, jump, sprint);
    this.tick(dt);
  }

  wantsGun(item) { return !this.slots.some(s => s && s.id === item.id && s.rarity >= item.rarity); }
}
