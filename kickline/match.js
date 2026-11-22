'use strict';
/* ===== Kickline 27 — match: rules, AI, controls, camera, HUD, replays ===== */
const BR = .17, GRAV = 9.81, ROLL = 2.0, DRAG = .11, STEP = 1 / 60;
const HX = ENG.HX, HZ = ENG.HZ;
const DIFF = [ // Amateur .. Legendary (CPU team)
  { delay: .65, pass: 1.9, shot: 1.6, tackle: .55, speed: .92, press: .7 },
  { delay: .45, pass: 1.35, shot: 1.25, tackle: .8, speed: .97, press: .85 },
  { delay: .3, pass: 1.0, shot: 1.0, tackle: 1.0, speed: 1.0, press: 1 },
  { delay: .2, pass: .8, shot: .85, tackle: 1.15, speed: 1.04, press: 1.1 }];
const MATE = { delay: .32, pass: 1.0, shot: 1.0, tackle: .85, speed: 1.0, press: .9 };
const $ = id => document.getElementById(id);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

class Match {
  constructor(o) {
    this.o = o; this.time = 0; this.clock = (o.startMin || 0) * 60; this.half = this.clock >= 2700 ? 2 : 1;
    this.rate = 2700 / (o.halfSec || 180);
    this.state = 'dead'; this.events = []; this.camMode = o.cam || 0; this.paused = false; this.acc = 0;
    this.addH = 60 * (1 + Math.floor(Math.random() * 3)); this.addF = 60 * (2 + Math.floor(Math.random() * 4));
    const hk = kitFor(o.home, false), ak = kitFor(o.away, true, hk);
    this.teams = [this.makeTeam(o.home, 'home', 1, hk, '#c6f03a'), this.makeTeam(o.away, 'away', -1, ak, '#ff8a2a')];
    this.teams[0].opp = this.teams[1]; this.teams[1].opp = this.teams[0];
    this.all = this.teams[0].players.concat(this.teams[1].players);
    this.userTeam = o.user === 'home' ? this.teams[0] : o.user === 'away' ? this.teams[1] : null;
    this.pcMode = !!o.pcId;
    this.ctrl = null;
    if (this.userTeam) {
      this.ctrl = this.pcMode ? this.userTeam.players.find(p => p.d.id === o.pcId) : this.userTeam.players[9];
      if (this.pcMode && !this.ctrl) this.pcMode = false;
    }
    this.pc = { touches: 0, passes: 0, passOk: 0, shots: 0, sot: 0, goals: 0, assists: 0, tackles: 0, lost: 0, saves: 0 };
    this.ball = { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: null, lastTeam: null, pass: null, shot: null, cross: false, cdP: null, cdT: 0 };
    this.lastPass = null; this.possT = [0, 0]; this.switchT = 0;
    // referee
    this.ref = { x: 0, z: 8, vx: 0, vz: 0, model: ENG.makePlayerModel({ shirt: '#f2d21b', trim: '#111111', shorts: '#111111', socks: '#111111', pat: 'plain' }, { num: '', id: 3, skin: 1, hair: 0 }) };
    // ring under controlled player
    this.ring = new THREE.Mesh(ENG.ringGeo, new THREE.MeshBasicMaterial({ color: 0xf2b630, transparent: true, opacity: .95, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = .03; ENG.scene.add(this.ring);
    this.rec = []; this.replay = null;
    ENG.paintCrowd([o.home.c1, o.home.c2], [o.away.c1, o.away.c2]);
    ENG.setTimeOfDay(o.night);
    this.setupHUD();
    this.kickoff(this.half === 2 ? this.teams[1] : this.teams[0]);
    ENG.audio.crowd(.22);
  }
  makeTeam(club, side, dir, kit, gkCol) {
    const form = FORMATIONS[club.form] || FORMATIONS['4-3-3'];
    const xi = (this.o[side + 'XI'] || lineupPlayers(club));
    const gkKit = { shirt: gkCol, trim: '#111111', shorts: '#111111', socks: gkCol, pat: 'plain' };
    const t = { club, side, dir, kit, players: [], score: 0, st: { shots: 0, sot: 0, passes: 0, passOk: 0, tackles: 0, fouls: 0, corners: 0 }, form };
    xi.forEach((d, i) => {
      const sl = form[i];
      const p = { d, team: t, slot: { pos: sl[0], x: sl[1], z: sl[2] }, gk: sl[0] === 'GK', g: POS_GROUP[sl[0]], x: 0, z: 0, vx: 0, vz: 0, fx: dir, fz: 0,
        stam: 1, kcd: 0, stun: 0, slide: 0, kick: 0, tcd: 0, decT: 0, dx: dir, dz: 0, recv: 0, run: 0, rx: 0, rz: 0, dive: null, cele: false, idle: 0, hold: 0, speed: 0, i };
      p.model = ENG.makePlayerModel(kit, d, p.gk ? gkKit : null);
      t.players.push(p);
    });
    return t;
  }
  dispose() {
    this.all.forEach(p => ENG.disposeModel(p.model)); ENG.disposeModel(this.ref.model);
    ENG.scene.remove(this.ring); this.ring.material.dispose();
    $('hud').hidden = true; $('touch').hidden = true; ENG.audio.crowd(0);
  }
  // ---------- helpers ----------
  diffFor(t) { return this.userTeam && t !== this.userTeam ? DIFF[this.o.diff] : (this.userTeam ? MATE : DIFF[2]); }
  maxSpeed(p) { return (5.7 + p.d.att.pac * .034) * (.72 + .28 * p.stam) * this.diffFor(p.team).speed; }
  dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  goalX(t) { return t.dir * HX; } // attacking goal x
  ownGoalX(t) { return -t.dir * HX; }
  nearestOpp(p, max = 99) { let best = null, bd = max; for (const q of p.team.opp.players) { const d = this.dist(p, q); if (d < bd) { bd = d; best = q; } } return [best, bd]; }
  isUserCtrl(p) { return p === this.ctrl; }
  segDist(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; let t = ((px - ax) * dx + (pz - az) * dz) / L2; t = clamp(t, 0, 1); return Math.hypot(px - (ax + dx * t), pz - (az + dz * t)); }
  laneOpen(a, bx, bz, team) { let m = 99; for (const q of team.opp.players) { const d = this.segDist(q.x, q.z, a.x, a.z, bx, bz); if (d < m) m = d; } return m; }
  possTeam() { const b = this.ball; if (b.owner) return b.owner.team; return b.lastTeam; }
  minute() { return Math.floor(this.clock / 60) + 1; }
  // ---------- set pieces ----------
  placeFormation(t, kickoffSide) {
    for (const p of t.players) {
      let xn = clamp(p.slot.x + .02, .02, .47), zn = p.slot.z;
      let x = t.dir * (xn * 2 * HX - HX), z = zn * HZ * .88 * t.dir;
      if (!kickoffSide && Math.hypot(x, z) < 9.6) { const a = Math.atan2(z, x); x = Math.cos(a) * 9.8; z = Math.sin(a) * 9.8; }
      p.x = x; p.z = z; p.vx = p.vz = 0; p.fx = t.dir; p.fz = 0; p.slide = 0; p.stun = 0; p.dive = null; p.cele = false; p.recv = 0; p.run = 0;
    }
  }
  kickoff(t) {
    this.placeFormation(t, true); this.placeFormation(t.opp, false);
    const fw = t.players.filter(p => p.g === 'F' || p.slot.pos === 'CAM').sort((a, b) => Math.abs(a.slot.z) - Math.abs(b.slot.z));
    const k = fw[0] || t.players[10];
    k.x = -t.dir * .45; k.z = 0;
    if (fw[1]) { fw[1].x = -t.dir * .6; fw[1].z = 3; }
    Object.assign(this.ball, { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, owner: null, pass: null, shot: null, cross: false });
    this.setRestart('kickoff', t, 0, 0, k, 1.4);
    ENG.audio.whistle(1);
  }
  setRestart(type, team, x, z, taker, wait = 1.1) {
    const b = this.ball;
    b.owner = null; b.vx = b.vy = b.vz = 0; b.x = x; b.z = z; b.y = BR; b.pass = null; b.shot = null; b.cross = false;
    if (!taker) {
      const pool = type === 'goalkick' ? team.players.filter(p => p.gk) : team.players.filter(p => !p.gk);
      taker = pool.sort((a, c) => this.dist(a, b) - this.dist(c, b))[0];
    }
    const out = type === 'throw' ? .4 : type === 'corner' ? .5 : 0;
    taker.x = x + (type === 'throw' ? 0 : -team.dir * .6) + (x > 0 ? out : -out) * (type === 'corner' ? 1 : 0);
    taker.z = z + (type === 'throw' ? Math.sign(z) * .4 : 0); taker.vx = taker.vz = 0;
    const tx = (type === 'goalkick' ? team.dir * 30 : 0) - x, tz = -z; const L = Math.hypot(tx, tz) || 1; taker.fx = tx / L; taker.fz = tz / L;
    this.restart = { type, team, taker, t: wait };
    this.state = 'dead';
    // keep opponents away from the ball
    for (const q of team.opp.players) { const d = Math.hypot(q.x - x, q.z - z); if (d < 9.2 && type !== 'throw') { const a = Math.atan2(q.z - z, q.x - x); q.x = x + Math.cos(a) * 9.2; q.z = z + Math.sin(a) * 9.2; } }
    if (this.userTeam === team && !this.pcMode && taker && !taker.gk) this.setCtrl(taker);
    const names = { throw: 'Throw-in', corner: 'Corner', goalkick: 'Goal kick', free: 'Free kick', kickoff: '' };
    if (names[type]) this.tick(names[type] + ' · ' + team.club.abbr);
    if (type === 'corner') team.st.corners++;
  }
  setCtrl(p) { if (!p || this.pcMode) return; this.ctrl = p; this.switchT = 0; }
  // ---------- kicking ----------
  kickBall(p, vx, vy, vz, power) {
    const b = this.ball;
    b.owner = null; b.vx = vx; b.vy = vy; b.vz = vz; b.x = p.x + p.fx * .45; b.z = p.z + p.fz * .45; b.y = Math.max(BR, b.y);
    b.lastTouch = p; b.lastTeam = p.team; b.cdP = p; b.cdT = .3; b.shot = null; b.pass = null; b.cross = false;
    p.kick = .001; p.mustPass = false; this.mustPass = null;
    ENG.audio.kick(power);
  }
  passVel(d, ve = 5.5) { let v = 10; for (let i = 0; i < 4; i++) v = Math.sqrt(ve * ve + 2 * (ROLL + DRAG * v * .55) * d); return Math.min(v, 30); }
  doPass(p, mate, type = 'ground') {
    const b = this.ball, prof = this.diffFor(p.team);
    let tx = mate.x + mate.vx * .5, tz = mate.z + mate.vz * .5;
    if (type === 'through') { const gd = p.team.dir; tx = mate.x + gd * 7 + mate.vx * .3; tz = mate.z * .9 + mate.vz * .3; mate.run = 2.2; mate.rx = tx; mate.rz = tz; }
    tx = clamp(tx, -HX + 1, HX - 1); tz = clamp(tz, -HZ + 1, HZ - 1);
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
    const [, pd] = this.nearestOpp(p);
    let err = (.012 + (100 - p.d.att.pas) / 100 * .13) * (pd < 2 ? 1.5 : 1) * (this.isUserCtrl(p) ? 1 : prof.pass);
    const ang = Math.atan2(dz, dx) + gauss() * err;
    let v, vy = 0;
    if (type === 'lob') { const T = clamp(d / 19, .75, 2.1); v = d / T * 1.04; vy = GRAV * T / 2; }
    else v = this.passVel(d * (1 + gauss() * err * .8), (type === 'through' ? 9 : 8) + d * .08);
    this.kickBall(p, Math.cos(ang) * v, vy, Math.sin(ang) * v, .4);
    b.pass = { from: p, to: mate, t: this.time };
    b.cross = type === 'lob' && Math.abs(tx - this.goalX(p.team)) < 20;
    mate.recv = Math.min(2.5, d / v + .8);
    p.team.st.passes++;
    if (p === this.ctrl && this.pcMode) this.pc.passes++;
    if (this.userTeam === p.team && !this.pcMode && p === this.ctrl) this.setCtrl(mate);
  }
  doShot(p, power, aimZ) {
    const b = this.ball, t = p.team, prof = this.diffFor(t);
    const gx = this.goalX(t);
    const gk = t.opp.players.find(q => q.gk);
    let tz = aimZ !== null && aimZ !== undefined ? aimZ : (gk && gk.z > 0 ? -1 : 1) * rf(1.6, 3.1);
    tz = clamp(tz, -3.3, 3.3);
    const h = clamp(.25 + power * 1.55 + rf(-.2, .2), .2, 2.3);
    const dx = gx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    const v = clamp(14 + power * 16 + (p.d.att.sho - 60) * .09, 11, 35);
    const T = d / v; let vy = (h - BR + .5 * GRAV * T * T) / T;
    const [, pd] = this.nearestOpp(p);
    let sig = (.02 + (100 - p.d.att.sho) / 100 * .085 + (pd < 1.8 ? .035 : 0)) * (1 + Math.max(0, power - .82) * 4) * (this.isUserCtrl(p) ? 1 : prof.shot) * (d > 22 ? 1.3 : 1);
    const ang = Math.atan2(dz, dx) + gauss() * sig;
    vy += gauss() * sig * v * .55 + (power > .92 ? rf(0, 2.2) : 0);
    this.kickBall(p, Math.cos(ang) * v, vy, Math.sin(ang) * v, .9);
    b.shot = { by: p, team: t, t: this.time, power, onT: false };
    t.st.shots++;
    if (p === this.ctrl && this.pcMode) this.pc.shots++;
    // on target?
    const tt = (gx - b.x) / b.vx; const zc = b.z + b.vz * tt, yc = b.y + b.vy * tt - .5 * GRAV * tt * tt;
    if (Math.abs(zc) < 3.66 && yc < 2.44 && yc > 0) { t.st.sot++; b.shot.onT = true; if (p === this.ctrl && this.pcMode) this.pc.sot++; }
    ENG.crowdExcite = Math.max(ENG.crowdExcite, .35);
  }
  tackle(p, slide) {
    const b = this.ball, o = b.owner;
    if (slide) { p.slide = .85; const sp = this.maxSpeed(p) * 1.15; const L = Math.hypot(p.fx, p.fz) || 1; p.vx = p.fx / L * sp; p.vz = p.fz / L * sp; p.tcd = 1.2; }
    else p.tcd = .7;
    if (!o || o.team === p.team || o.hold > 0 || this.mustPass) return false;
    const d = this.dist(p, o), reach = slide ? 2.4 : 1.45;
    if (d > reach) return false;
    const prof = this.diffFor(p.team);
    let chance = (.42 + (p.d.att.def - o.d.att.dri) / 110 + (slide ? .12 : 0)) * prof.tackle;
    const behind = (p.x - o.x) * o.fx + (p.z - o.z) * o.fz < -.3;
    if (slide && behind && Math.random() < .45) { this.foul(p, o); return true; }
    if (!slide && behind) chance *= .7;
    if (Math.random() < clamp(chance, .08, .9)) {
      p.team.st.tackles++;
      if (p === this.ctrl && this.pcMode) this.pc.tackles++;
      if (o === this.ctrl && this.pcMode) this.pc.lost++;
      this.mustPass = null;
      if (!slide && Math.random() < .6) { b.owner = p; b.lastTouch = p; b.lastTeam = p.team; if (this.userTeam === p.team && !this.pcMode) this.setCtrl(p); }
      else { b.owner = null; const a = Math.atan2(p.fz, p.fx) + rf(-.9, .9); const s = rf(4, 9); b.vx = Math.cos(a) * s; b.vz = Math.sin(a) * s; b.vy = rf(0, 1.5); b.lastTouch = p; b.lastTeam = p.team; b.cdP = o; b.cdT = .45; }
      o.stun = .55;
      return true;
    }
    p.stun = slide ? 0 : .45;
    return false;
  }
  foul(p, victim) {
    p.team.st.fouls++;
    const card = Math.random() < .3 ? ' · Yellow card' : '';
    this.banner('Foul', shortName(p.d) + card, 1.4);
    ENG.audio.whistle(1);
    let x = victim.x, z = victim.z; const t = victim.team;
    // inside the box: move to the edge (no penalties in this build)
    if (Math.abs(x - this.goalX(t)) < 16.5 && Math.abs(z) < 20.16) x = this.goalX(t) - t.dir * 17;
    this.setRestart('free', t, x, z, victim, 1.3);
  }
  header(p) {
    const b = this.ball, t = p.team, gx = this.goalX(t);
    b.lastTouch = p; b.lastTeam = t; p.kick = .001;
    const inBox = Math.abs(p.x - gx) < 18 && Math.abs(p.z) < 20;
    if (inBox && (b.cross || b.pass)) {
      const tz = rf(-3, 3), dx = gx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), v = 13 + p.d.att.phy * .05;
      const a = Math.atan2(dz, dx) + gauss() * .12 * (this.isUserCtrl(p) ? 1 : this.diffFor(t).shot);
      b.vx = Math.cos(a) * v; b.vz = Math.sin(a) * v; b.vy = rf(-2, 1.5) + d * .05;
      b.shot = { by: p, team: t, t: this.time, power: .6, onT: false }; t.st.shots++;
      if (p === this.ctrl && this.pcMode) this.pc.shots++;
      const tt = (gx - b.x) / b.vx, zc = b.z + b.vz * tt; if (Math.abs(zc) < 3.66) { t.st.sot++; b.shot.onT = true; }
      this.tick('Header! ' + shortName(p.d));
    } else {
      const a = Math.atan2(rf(-.6, .6), t.dir) ; const v = rf(12, 18);
      b.vx = Math.cos(a) * v; b.vz = Math.sin(a) * v + b.vz * .3; b.vy = rf(4, 7); b.shot = null;
    }
    b.pass = null; b.cross = false; b.cdP = p; b.cdT = .3; ENG.audio.kick(.3);
  }
  // ---------- AI ----------
  spot(p) {
    const t = p.team, b = this.ball, dir = t.dir;
    const prog = (b.x * dir + HX) / (2 * HX);
    const att = this.possTeam() === t;
    let xn = p.slot.x + (prog - .45) * .52 + (att ? .07 : -.05);
    if (att && p.g === 'F') xn += .04;
    if (att && (p.slot.pos === 'LB' || p.slot.pos === 'RB') && prog > .5) xn += .07;
    if (!att && p.g === 'D') xn = Math.min(xn, prog - .04);
    xn = clamp(xn, .04, att ? .9 : .78);
    if (p.gk) xn = .015 + clamp(prog - .5, 0, .5) * .1;
    let z = p.slot.z * HZ * (att ? .95 : .72) * dir + b.z * (att ? .18 : .34);
    if (p.gk) z = clamp(b.z * .12, -2.5, 2.5);
    return { x: dir * (xn * 2 * HX - HX), z: clamp(z, -HZ + 1.5, HZ - 1.5) };
  }
  moveTo(p, tx, tz, urg, dt) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    let sp = this.maxSpeed(p) * urg; if (d < 2.5) sp *= d / 2.5;
    if (d < .15) { p.wx = 0; p.wz = 0; return; }
    p.wx = dx / d * sp; p.wz = dz / d * sp; p.sprint = urg > .9;
  }
  ballPath(n = 50, step = .06) { // predicted ball ground positions
    const b = this.ball, path = []; let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz;
    for (let i = 0; i < n; i++) {
      vy -= GRAV * step; x += vx * step; y += vy * step; z += vz * step;
      if (y < BR) { y = BR; vy = Math.abs(vy) > 1.5 ? -vy * .5 : 0; }
      if (y <= BR + .01) { const s = Math.hypot(vx, vz); if (s > 0) { const ns = Math.max(0, s - (ROLL + DRAG * s) * step); vx *= ns / s; vz *= ns / s; } }
      path.push({ x, y, z, t: (i + 1) * step });
    }
    return path;
  }
  intercept(p, path) {
    const sp = this.maxSpeed(p);
    for (const q of path) { if (q.y > 2.2 && !p.gk) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d / sp <= q.t + .1) return q; }
    return path[path.length - 1];
  }
  teamRoles(t, path) {
    // chaser for loose ball, presser + cover when defending
    const b = this.ball; let chase = null, ct = 1e9, press = null, pd = 1e9, cover = null, cd = 1e9;
    const own = this.ownGoalX(t);
    for (const p of t.players) {
      if (p.gk) continue;
      if (this.pcMode && p === this.ctrl) continue;
      if (!this.pcMode && p === this.ctrl) continue;
      const d = this.dist(p, b);
      if (!b.owner) { const q = this.intercept(p, path); const tt = Math.hypot(q.x - p.x, q.z - p.z) / this.maxSpeed(p) + q.t * .3; if (tt < ct) { ct = tt; chase = p; } }
      else if (b.owner.team !== t) { if (d < pd) { cover = press; cd = pd; pd = d; press = p; } else if (d < cd) { cd = d; cover = p; } }
    }
    // when user controls the team, AI presses less aggressively
    if (this.userTeam === t && !this.pcMode && b.owner && b.owner.team !== t && this.ctrl && this.dist(this.ctrl, b) < pd) { cover = press; press = null; }
    void own;
    t.chase = chase; t.press = press; t.cover = cover;
  }
  aiPlayer(p, dt, path) {
    const b = this.ball, t = p.team, prof = this.diffFor(t);
    p.sprint = false;
    if (b.owner === p) return this.aiOwner(p, dt);
    if (p.gk) return this.aiGK(p, dt);
    if (this.state === 'dead') { const s = this.spot(p); return this.moveTo(p, s.x, s.z, .7, dt); }
    if (p.recv > 0 && !b.owner && b.pass && b.pass.to === p) { const q = this.intercept(p, path); return this.moveTo(p, q.x, q.z, 1, dt); }
    if (p.run > 0) { p.run -= dt; return this.moveTo(p, p.rx, p.rz, 1, dt); }
    if (!b.owner) {
      if (t.chase === p) { const q = this.intercept(p, path); return this.moveTo(p, q.x, q.z, 1, dt); }
    } else if (b.owner.team !== t) {
      const o = b.owner, own = this.ownGoalX(t);
      if (t.press === p) {
        const L = Math.hypot(own - o.x, -o.z) || 1;
        const tx = o.x + (own - o.x) / L * .9 + o.vx * .25, tz = o.z + (-o.z) / L * .9 + o.vz * .25;
        this.moveTo(p, tx, tz, .95 * prof.press, dt);
        if (this.dist(p, o) < 1.35 && p.tcd <= 0 && Math.random() < dt * 3.5 * prof.tackle) this.tackle(p, Math.random() < .12);
        return;
      }
      if (t.cover === p) { const tx = lerp(o.x, own, .3), tz = lerp(o.z, 0, .3); return this.moveTo(p, tx, tz, .85, dt); }
      // mark nearest attacker in zone
    } else if (b.owner.team === t && b.owner !== p) {
      // supporting runs
      if ((p.g === 'F' || p.slot.pos === 'CAM' || ((p.slot.pos === 'LM' || p.slot.pos === 'RM') && Math.random() < .5)) && Math.random() < dt * .4) {
        const gx = this.goalX(t); const ahead = (b.owner.x - p.x) * t.dir < 6;
        if (ahead) { p.run = rf(1.2, 2.2); p.rx = clamp(p.x + t.dir * rf(8, 16), -HX + 3, HX - 3); p.rz = clamp(p.z * .7 + rf(-5, 5), -HZ + 3, HZ - 3); if (Math.abs(p.rx - gx) < 6) p.rx = gx - t.dir * 7; }
      }
    }
    const s = this.spot(p);
    const far = Math.hypot(s.x - p.x, s.z - p.z);
    this.moveTo(p, s.x, s.z, far > 12 ? .9 : .66, dt);
  }
  aiOwner(p, dt) {
    const t = p.team, b = this.ball, prof = this.diffFor(t), gx = this.goalX(t);
    if (p.gk) {
      p.wx = p.wz = 0; p.hold -= dt;
      if (p.hold > 0) return;
      const opts = t.players.filter(q => !q.gk).map(q => ({ q, s: this.laneOpen(p, q.x, q.z, t) * 2 + this.nearestOpp(q)[1] - this.dist(p, q) * .04 })).sort((a, c) => c.s - a.s);
      const o = opts[0]; if (o && o.s > 6 && Math.random() < .7) this.doPass(p, o.q, 'ground');
      else { const fw = t.players.filter(q => q.g === 'F' || q.g === 'M').sort((a, c) => (c.x - a.x) * t.dir - (0))[0]; this.doPass(p, fw || o.q, 'lob'); }
      return;
    }
    p.decT -= dt;
    const dG = Math.hypot(gx - p.x, p.z), [no, nd] = this.nearestOpp(p);
    const restart = !!this.mustPass;
    if (p.decT <= 0 || restart) {
      p.decT = prof.delay * rf(.7, 1.4);
      if (this.callFor && this.callFor.team === t && this.callFor !== p && this.laneOpen(p, this.callFor.x, this.callFor.z, t) > 1.2 && Math.random() < .8) { const m = this.callFor; this.callFor = null; return this.doPass(p, m, this.dist(p, m) > 28 ? 'lob' : 'ground'); }
      // shoot
      if (!restart && dG < 30 && Math.abs(p.z) < 22) {
        const lane = this.laneOpen(p, gx, 0, t);
        let ch = dG < 11 ? .9 : dG < 16 ? .6 : dG < 22 ? .32 : .12; if (lane < 1) ch *= .55;
        if (Math.random() < ch) return this.doShot(p, clamp(rf(.45, .85) + (dG - 15) * .015, .3, .9), null);
      }
      // options
      let best = null, bs = -1e9;
      const prog = (p.x * t.dir + HX) / (2 * HX);
      const wide = Math.abs(p.z) > 17 && prog > .74;
      for (const q of t.players) {
        if (q === p || q.gk) continue;
        const d = this.dist(p, q); if (d < 4 || d > 42) continue;
        const fwd = (q.x - p.x) * t.dir, lane = this.laneOpen(p, q.x, q.z, t), open = this.nearestOpp(q)[1];
        let s = fwd * .55 + Math.min(open, 8) * 1.1 + Math.min(lane, 5) * 1.8 - d * (d > 22 ? .3 : .12) - Math.hypot(gx - q.x, q.z) * .08;
        if (q.run > 0 && this.laneOpen(p, q.rx, q.rz, t) > 2.2) s += 7;
        if (lane < 1.6) s -= 10; else if (lane < 2.5) s -= 3;
        if (wide && Math.abs(q.x - gx) < 16 && Math.abs(q.z) < 12) s += 8;
        if (this.pcMode && q === this.ctrl && t === this.userTeam) s += 3;
        if (s > bs) { bs = s; best = q; }
      }
      if (best) {
        const lane = this.laneOpen(p, best.x, best.z, t);
        const inBox = Math.abs(best.x - gx) < 17 && Math.abs(best.z) < 14;
        if (restart) return this.doPass(p, best, this.mustPass === 'corner' || (this.dist(p, best) > 30) ? 'lob' : 'ground');
        if (wide && inBox && Math.random() < .55) return this.doPass(p, best, 'lob');
        if (nd < 2.6 && Math.random() < .7 && bs > -4) return this.doPass(p, best, lane < 1.2 && this.dist(p, best) > 14 ? 'lob' : 'ground');
        if (best.run > 0 && bs > 4 && Math.random() < .6) return this.doPass(p, best, 'through');
        if (bs > 6 && Math.random() < (prog > .66 ? .2 : .35)) return this.doPass(p, best, (best.x - p.x) * t.dir > 10 && best.g === 'F' && Math.random() < .4 ? 'through' : 'ground');
      }
      // dribble direction
      let dx = gx - p.x, dz = (Math.abs(p.z) > 10 && dG > 30 ? p.z * .9 : 0) - p.z; let L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      for (const q of t.opp.players) { const ex = p.x - q.x, ez = p.z - q.z, e = Math.hypot(ex, ez); if (e < 6 && (q.x - p.x) * t.dir > -1) { dx += ex / (e * e) * 3; dz += ez / (e * e) * 3; } }
      L = Math.hypot(dx, dz) || 1; p.dx = dx / L; p.dz = dz / L;
      if (Math.abs(p.z + p.dz * 3) > HZ - 2) p.dz *= -.3;
    }
    if (restart) { p.wx = p.wz = 0; return; }
    const free = nd > 5;
    const sp = this.maxSpeed(p) * (free ? .95 : .78);
    p.wx = p.dx * sp; p.wz = p.dz * sp; p.sprint = free;
    void no;
  }
  aiGK(p, dt) {
    const b = this.ball, t = p.team, own = this.ownGoalX(t);
    p.gkReady = true;
    if (p.dive) return;
    // incoming shot -> plan save
    if (b.shot && b.shot.team !== t && !b.owner && !b.shot.handled && b.vx * -t.dir > 0) {
      const tt = (own - b.x) / b.vx;
      if (tt > 0 && tt < 2.5) {
        b.shot.handled = true;
        const zc = b.z + b.vz * tt, yc = b.y + b.vy * tt - .5 * GRAV * tt * tt;
        if (Math.abs(zc) < 4.4 && yc < 3) {
          const need = Math.abs(zc - p.z), reach = (3.2 + p.d.att.def * .045) * tt + 1.1;
          let ps = clamp(.6 + (p.d.att.def - 72) * .022 - (b.shot.power - .6) * .5 - (Math.abs(zc) > 2.8 ? .18 : 0) - (yc > 1.9 ? .12 : 0), .12, .95);
          if (this.userTeam && t !== this.userTeam) ps *= [.8, .92, 1, 1.06][this.o.diff];
          const save = need <= reach && Math.random() < ps;
          p.dive = { t: 0, T: Math.max(.18, tt), z0: p.z, x0: p.x, zc: save ? zc : p.z + (zc - p.z) * rf(.4, .8), save, side: Math.sign(zc - p.z) * (t.dir), h: clamp(yc - .6, 0, 1.4) };
          if (need < .6) p.dive.side = 0;
          return;
        }
      }
    }
    // loose ball in box -> claim
    const inBox = Math.abs(b.x - own) < 16 && Math.abs(b.z) < 20;
    if (!b.owner && inBox) {
      const opp = t.opp.players.reduce((m, q) => Math.min(m, this.dist(q, b)), 99);
      if (this.dist(p, b) < opp + 1 || Math.hypot(b.vx, b.vz) < 6) { const q = this.intercept(p, this.ballPath(30)); return this.moveTo(p, q.x, q.z, 1, dt); }
    }
    // position on the line between ball and goal centre
    const dB = Math.hypot(b.x - own, b.z), k = clamp(dB * .1, .6, 5.5);
    const tx = own + t.dir * k * Math.abs(b.x - own) / (dB || 1), tz = clamp(b.z * k / (dB || 1), -3.2, 3.2);
    this.moveTo(p, tx, tz, .8, dt);
  }
  // ---------- user ----------
  camBasis() { const c = ENG.camera; const f = new THREE.Vector3(); c.getWorldDirection(f); f.y = 0; f.normalize(); return { fx: f.x, fz: f.z, rx: -f.z, rz: f.x }; }
  userControl(p, dt) {
    const I = ENG.input, b = this.ball, t = p.team;
    const cb = this.camBasis();
    let mx = cb.rx * I.ax + cb.fx * I.ay, mz = cb.rz * I.ax + cb.fz * I.ay;
    const mag = Math.hypot(mx, mz);
    const owner = b.owner === p;
    if (mag > .1) p.idle = 0; else p.idle += dt;
    if (this.mustPass && owner) { p.wx = p.wz = 0; if (mag > .1) { p.fx = mx / mag; p.fz = mz / mag; } }
    else if (mag > .1) { const sp = this.maxSpeed(p) * (I.held.sprint ? 1 : .74) * Math.min(1, mag * 1.2); p.wx = mx / mag * sp; p.wz = mz / mag * sp; p.sprint = I.held.sprint; }
    else if (!owner && b.pass && b.pass.to === p && !b.owner) { const q = this.intercept(p, this.path); this.moveTo(p, q.x, q.z, 1, dt); }
    else if (this.pcMode && p.idle > .8 && !owner) { this.aiPlayer(p, dt, this.path); }
    else if (p.gk && p.idle > .5 && !owner) { this.aiGK(p, dt); }
    else { p.wx = p.wz = 0; }
    if (this.state !== 'play' && !(this.state === 'dead' && owner)) return;
    const aimX = mag > .1 ? mx / mag : p.fx, aimZ = mag > .1 ? mz / mag : p.fz;
    if (owner) {
      if (I.pressed.pass || I.pressed.through || I.pressed.lob) {
        const type = I.pressed.through ? 'through' : I.pressed.lob ? 'lob' : 'ground';
        const m = this.pickMate(p, aimX, aimZ, type);
        if (m) this.doPass(p, m, type);
      }
      if (I.held.shoot && !this.mustPass) { this.charge = Math.min(1, (this.charge || 0) + dt * 1.1); }
      if (I.released.shoot && this.charge > 0 && !this.mustPass) {
        const side = mag > .3 ? (aimZ * (t.dir)) : 0; // lateral aim relative to goal
        const aim = Math.abs(side) > .3 ? Math.sign(mz) * rf(2.2, 3.2) : null;
        this.doShot(p, clamp(this.charge, .15, 1), aim); this.charge = 0;
      }
    } else {
      this.charge = 0;
      const opp = b.owner && b.owner.team !== t;
      if (opp) {
        if (I.held.pass && mag < .1) { const o = b.owner; this.moveTo(p, o.x - t.dir * .8 * 0 + (this.ownGoalX(t) - o.x) * .03, o.z * .97, .95, dt); }
        if (I.pressed.pass && p.tcd <= 0) this.tackle(p, false);
        if (I.pressed.shoot && p.tcd <= 0 && p.slide <= 0) this.tackle(p, true);
      } else if (b.owner && b.owner.team === t) {
        if (I.pressed.pass || I.pressed.through) { this.callFor = p; if (I.pressed.through) { p.run = 0; } this.tick('Calling for the ball'); }
      }
      if (I.pressed.switch && !this.pcMode) this.switchPlayer(true);
    }
  }
  pickMate(p, ax, az, type) {
    let best = null, bs = -1e9;
    for (const q of p.team.players) {
      if (q === p) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d < 2) continue;
      const cos = (dx * ax + dz * az) / d; if (cos < .35) continue;
      const lane = this.laneOpen(p, q.x, q.z, p.team);
      const s = cos * 14 - d * (type === 'lob' ? .03 : .12) + Math.min(lane, 3) * (type === 'lob' ? 0 : 1) - (q.gk ? 6 : 0);
      if (s > bs) { bs = s; best = q; }
    }
    return best;
  }
  switchPlayer(manual) {
    const t = this.userTeam, b = this.ball; let best = null, bd = 1e9;
    for (const p of t.players) { if (p.gk || p === this.ctrl) continue; const d = this.dist(p, b) + (manual ? 0 : 0); const ahead = (p.x - b.x) * t.dir < 0 ? 0 : 3; if (d + ahead < bd) { bd = d + ahead; best = p; } }
    if (best) this.setCtrl(best);
  }
  // ---------- main step ----------
  step(dt) {
    const b = this.ball;
    this.time += dt;
    if (this.state === 'play') {
      this.clock += dt * this.rate;
      const end1 = 2700 + this.addH, end2 = 5400 + this.addF;
      if (this.half === 1 && this.clock >= end1 && !(this.ball.shot)) return this.halfTime();
      if (this.half === 2 && this.clock >= end2 && !(this.ball.shot)) return this.fullTime();
      const pt = this.possTeam(); if (b.owner) this.possT[pt === this.teams[0] ? 0 : 1] += dt;
    }
    if (this.state === 'goal' || this.state === 'half' || this.state === 'end') return this.stepCelebration(dt);
    if (this.state === 'dead') {
      this.restart.t -= dt;
      if (this.restart.t <= 0) {
        const r = this.restart; b.owner = r.taker; b.lastTouch = r.taker; b.lastTeam = r.team;
        this.mustPass = r.type; r.taker.decT = r.type === 'kickoff' ? .3 : this.diffFor(r.team).delay + .3;
        if (r.taker.gk) r.taker.hold = .4;
        this.state = 'play';
      }
    }
    const path = this.path = this.ballPath();
    for (const t of this.teams) this.teamRoles(t, path);
    // auto switch
    if (this.userTeam && !this.pcMode) {
      this.switchT += dt;
      const t = this.userTeam;
      if (b.owner && b.owner.team === t && b.owner !== this.ctrl && !b.owner.gk) this.setCtrl(b.owner);
      else if ((!b.owner || b.owner.team !== t) && this.switchT > 1.0 && !(b.pass && b.pass.to === this.ctrl)) {
        let best = null, bd = 1e9; for (const p of t.players) { if (p.gk) continue; const d = this.dist(p, b); if (d < bd) { bd = d; best = p; } }
        if (best && best !== this.ctrl && this.dist(this.ctrl, b) > bd + 7) this.setCtrl(best);
      }
    }
    for (const p of this.all) {
      p.kcd -= dt; p.stun -= dt; p.tcd -= dt; p.recv -= dt;
      if (p.kick > 0) { p.kick += dt * 4; if (p.kick >= 1) p.kick = 0; }
      if (p.slide > 0) { p.slide -= dt; p.vx *= (1 - dt * 1.6); p.vz *= (1 - dt * 1.6); continue; }
      if (p.dive) { this.stepDive(p, dt); continue; }
      if (this.state === 'dead' && this.restart && p === this.restart.taker) { p.wx = p.wz = 0; }
      else if (p.stun > 0) { p.wx = p.vx * .5; p.wz = p.vz * .5; }
      else if (p === this.ctrl) this.userControl(p, dt);
      else this.aiPlayer(p, dt, path);
    }
    // integrate
    for (const p of this.all) {
      if (p.slide > 0 || p.dive) { p.x += p.vx * dt; p.z += p.vz * dt; continue; }
      const acc = (p.sprint ? 16 : 13) * dt, dvx = (p.wx || 0) - p.vx, dvz = (p.wz || 0) - p.vz, dv = Math.hypot(dvx, dvz);
      if (dv > acc) { p.vx += dvx / dv * acc; p.vz += dvz / dv * acc; } else { p.vx = p.wx || 0; p.vz = p.wz || 0; }
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.speed = Math.hypot(p.vx, p.vz);
      if (p.sprint && p.speed > 6) p.stam = Math.max(0, p.stam - dt * .018); else p.stam = Math.min(1, p.stam + dt * .006);
      // facing
      let tfx = p.fx, tfz = p.fz;
      if (p.speed > .4) { tfx = p.vx / p.speed; tfz = p.vz / p.speed; }
      else if (b.owner !== p && !this.mustPass) { const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1; tfx = dx / d; tfz = dz / d; }
      const tr = Math.min(1, dt * (b.owner === p ? 6 + p.d.att.dri * .07 : 10));
      p.fx += (tfx - p.fx) * tr; p.fz += (tfz - p.fz) * tr; const fl = Math.hypot(p.fx, p.fz) || 1; p.fx /= fl; p.fz /= fl;
      p.x = clamp(p.x, -HX - 4, HX + 4); p.z = clamp(p.z, -HZ - 3, HZ + 3);
    }
    // separation
    for (let i = 0; i < this.all.length; i++) for (let j = i + 1; j < this.all.length; j++) {
      const a = this.all[i], c = this.all[j], dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
      if (d < .75 && d > 0) { const push = (.75 - d) / 2; a.x -= dx / d * push; a.z -= dz / d * push; c.x += dx / d * push; c.z += dz / d * push; }
    }
    this.stepBall(dt);
    if (this.state === 'play') this.checkBounds();
    // referee follows play
    const r = this.ref, rtx = b.x * .85, rtz = clamp(b.z + 10, -HZ + 4, HZ - 4) * .6; const rdx = rtx - r.x, rdz = rtz - r.z, rd = Math.hypot(rdx, rdz);
    const rs = rd > 2 ? Math.min(7, rd * 1.2) : 0; r.vx = lerp(r.vx, rd ? rdx / rd * rs : 0, dt * 3); r.vz = lerp(r.vz, rd ? rdz / rd * rs : 0, dt * 3); r.x += r.vx * dt; r.z += r.vz * dt;
    // record for replay
    if (Math.round(this.time * 60) % 2 === 0) this.record();
  }
  stepDive(p, dt) {
    const dv = p.dive, b = this.ball; dv.t += dt;
    const k = clamp(dv.t / dv.T, 0, 1);
    p.z = lerp(dv.z0, dv.zc, Math.min(1, k * 1.15)); p.vx = 0; p.vz = 0;
    if (dv.save && !dv.done && Math.hypot(b.x - p.x, b.z - p.z) < 1.4 && !b.owner) {
      dv.done = true; const t = p.team;
      if (this.pcMode && p === this.ctrl) this.pc.saves++;
      const spd = Math.hypot(b.vx, b.vz);
      if (spd < 20 && Math.random() < .55) { b.owner = p; p.hold = 1.4; b.shot = null; b.lastTouch = p; b.lastTeam = t; this.tick('Saved! ' + shortName(p.d) + ' holds it'); }
      else { b.vx = t.dir * rf(4, 9); b.vz = Math.sign(b.z || 1) * rf(5, 11); b.vy = rf(2, 6); b.shot = null; b.lastTouch = p; b.lastTeam = t; b.cdP = p; b.cdT = .5; this.tick('Great save by ' + shortName(p.d)); }
      ENG.crowdExcite = Math.max(ENG.crowdExcite, .6); ENG.audio.roar(.5);
    }
    if (dv.t > dv.T + .9) { p.dive = null; p.stun = .3; }
  }
  stepBall(dt) {
    const b = this.ball;
    b.cdT -= dt; if (b.cdT <= 0) b.cdP = null;
    if (b.owner) {
      const o = b.owner;
      if (o.hold > 0 || o.gk && Math.abs(o.x - this.ownGoalX(o.team)) < 16) { b.x = o.x + o.fx * .35; b.z = o.z + o.fz * .35; b.y = 1.0; }
      else {
        const off = .5 + Math.min(.45, o.speed * .045);
        const tx = o.x + o.fx * off, tz = o.z + o.fz * off;
        b.x += (tx - b.x) * Math.min(1, dt * 16); b.z += (tz - b.z) * Math.min(1, dt * 16); b.y = BR;
      }
      b.vx = o.vx; b.vz = o.vz; b.vy = 0;
      this.spinBall(dt);
      return;
    }
    b.vy -= GRAV * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y < BR) { b.y = BR; if (b.vy < -1.6) { b.vy = -b.vy * .52; } else b.vy = 0; b.vx *= .985; b.vz *= .985; }
    const s = Math.hypot(b.vx, b.vz);
    if (b.y <= BR + .02 && s > 0) { const ns = Math.max(0, s - (ROLL + DRAG * s) * dt); b.vx *= ns / s; b.vz *= ns / s; }
    else { b.vx *= 1 - dt * .05; b.vz *= 1 - dt * .05; }
    this.goalFrame();
    this.spinBall(dt);
    if (this.state !== 'play' && this.state !== 'dead') return;
    // pickups
    let best = null, bd = 99;
    for (const p of this.all) {
      if (p === b.cdP || p.stun > 0 || p.dive) continue;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      const gkHands = p.gk && Math.abs(p.x - this.ownGoalX(p.team)) < 16.5 && Math.abs(p.z) < 20.2;
      const fast = Math.hypot(b.vx, b.vz) > 7, intended = b.pass && b.pass.to === p;
      const reach = p.slide > 0 ? 1.3 : gkHands ? 1.25 : intended ? 1.05 : fast ? .6 : .8, hmax = gkHands ? 2.6 : 1.0;
      if (d < reach && b.y < hmax && d < bd) {
        if (fast && !intended && !gkHands && p.slide <= 0 && Math.random() > .07 + p.d.att.def / 800) continue;
        best = p; bd = d;
      }
      else if (!gkHands && d < (b.pass && b.pass.to === p ? 1.0 : .75) && b.y >= 1.0 && b.y < 2.4 && !best && b.lastTouch !== p) {
        if (b.pass && b.pass.to === p) { if (b.y < 1.9 && !b.cross) { best = p; bd = d; continue; } return this.header(p); }
        if (Math.random() < .2) return this.header(p);
      }
    }
    if (best) this.gainBall(best);
  }
  gainBall(p) {
    const b = this.ball, sp = Math.hypot(b.vx, b.vz);
    if (p.slide > 0) { // poke away
      const a = Math.atan2(p.vz, p.vx) + rf(-.5, .5); b.vx = Math.cos(a) * 8; b.vz = Math.sin(a) * 8; b.vy = 1; b.lastTouch = p; b.lastTeam = p.team; b.cdP = p; b.cdT = .4; b.shot = null; b.pass = null; return;
    }
    if (!p.gk && sp > 17 && Math.random() > .45 + p.d.att.dri / 250) { b.vx *= -.25; b.vz = b.vz * .3 + rf(-3, 3); b.vy = rf(.5, 3); b.lastTouch = p; b.lastTeam = p.team; b.cdP = p; b.cdT = .35; b.shot = null; return; }
    const prevTeam = b.lastTeam;
    if (b.pass && b.pass.from.team === p.team && b.pass.from !== p) {
      p.team.st.passOk++; this.lastPass = { from: b.pass.from, t: this.time };
      if (this.pcMode && b.pass.from === this.ctrl) this.pc.passOk++;
    } else if (prevTeam !== p.team) this.lastPass = null;
    if (b.shot && b.shot.team !== p.team && p.gk && b.shot.onT) { this.tick('Saved by ' + shortName(p.d)); if (this.pcMode && p === this.ctrl) this.pc.saves++; }
    b.owner = p; b.lastTouch = p; b.lastTeam = p.team; b.pass = null; b.shot = null; b.cross = false; p.recv = 0; this.mustPass = null;
    if (p.gk && Math.abs(p.x - this.ownGoalX(p.team)) < 16.5) p.hold = rf(.9, 1.6);
    if (this.pcMode && p === this.ctrl) this.pc.touches++;
    if (this.callFor === p) this.callFor = null;
  }
  spinBall(dt) {
    const b = this.ball, m = ENG.ballMesh, s = Math.hypot(b.vx, b.vz);
    if (s > .05) { const ax = new THREE.Vector3(b.vz, 0, -b.vx).normalize(); m.rotateOnWorldAxis(ax, s * dt / BR); }
  }
  goalFrame() {
    const b = this.ball;
    for (const s of [-1, 1]) {
      const gx = s * HX;
      if (Math.abs(b.x - gx) > 2.6) continue;
      for (const pz of [-3.66, 3.66]) { // posts
        const dx = b.x - gx, dz = b.z - pz, d = Math.hypot(dx, dz);
        if (d < BR + .06 && b.y < 2.44) { const nx = dx / d, nz = dz / d, dot = b.vx * nx + b.vz * nz; if (dot < 0) { b.vx -= 1.7 * dot * nx; b.vz -= 1.7 * dot * nz; b.x = gx + nx * (BR + .07); b.z = pz + nz * (BR + .07); ENG.audio.kick(.8); this.tick('Off the post!'); ENG.crowdExcite = .7; } }
      }
      if (Math.abs(b.z) < 3.66 && Math.abs(b.x - gx) < BR + .06 && Math.abs(b.y - 2.44) < BR + .06) { // crossbar
        const dy = b.y - 2.44, dx = b.x - gx, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny;
        if (dot < 0) { b.vx -= 1.6 * dot * nx; b.vy -= 1.6 * dot * ny; ENG.audio.kick(.8); this.tick('Off the bar!'); ENG.crowdExcite = .7; }
      }
      // inside the net
      if (Math.abs(b.x) > HX && Math.abs(b.z) < 3.66 && b.y < 2.44 && Math.sign(b.x) === s) {
        if (Math.abs(b.x) > HX + 1.85) { b.x = s * (HX + 1.85); b.vx *= -.15; b.vz *= .4; this.netHit = { s, t: .4 }; }
        if (Math.abs(b.z) > 3.5) { b.z = Math.sign(b.z) * 3.5; b.vz *= -.2; }
        if (b.y > 2.3) { b.y = 2.3; b.vy *= -.2; }
      }
    }
  }
  checkBounds() {
    const b = this.ball; if (b.owner && b.owner.hold > 0) return;
    if (Math.abs(b.x) > HX + BR) {
      const s = Math.sign(b.x);
      const scorer = this.teams.find(t => t.dir === s), def = scorer.opp;
      if (Math.abs(b.z) < 3.66 - BR * .5 && b.y < 2.44) return this.goal(scorer);
      if (b.lastTeam === def) return this.setRestart('corner', scorer, s * (HX - .3), Math.sign(b.z) * (HZ - .3), null, 1.4);
      return this.setRestart('goalkick', def, s * (HX - 5.5), Math.sign(b.z) * 4, null, 1.4);
    }
    if (Math.abs(b.z) > HZ + BR) {
      const t = b.lastTeam ? b.lastTeam.opp : this.teams[0];
      return this.setRestart('throw', t, clamp(b.x, -HX + 1, HX - 1), Math.sign(b.z) * (HZ + .2), null, 1.0);
    }
  }
  goal(t) {
    const b = this.ball; t.score++;
    const sh = b.shot || {}; let scorer = sh.by || b.lastTouch;
    let own = false; if (!scorer || scorer.team !== t) { own = true; }
    const ev = { team: t.side, pid: own ? null : scorer.d.id, own, min: Math.min(this.minute(), this.half === 1 ? 45 : 90), aid: null, name: own ? 'Own goal' : pname(scorer.d) };
    if (!own && this.lastPass && this.lastPass.from.team === t && this.lastPass.from !== scorer && this.time - this.lastPass.t < 9) ev.aid = this.lastPass.from.d.id;
    if (this.pcMode && !own) { if (scorer === this.ctrl) this.pc.goals++; if (this.lastPass && ev.aid === this.ctrl.d.id) this.pc.assists++; }
    this.events.push(ev);
    this.state = 'goal'; this.goalT = 0; this.goalTeam = t; this.scorer = own ? null : scorer; this.goalFrameIdx = this.rec.length;
    ENG.audio.roar(1); ENG.crowdExcite = 1; ENG.audio.whistle(1);
    this.banner('Goal!', own ? 'Own goal · ' + t.club.name : (pname(scorer.d) + ' ' + ev.min + "'"), 3);
    this.updateScore();
  }
  stepCelebration(dt) {
    this.goalT = (this.goalT || 0) + dt;
    if (this.state === 'goal' && this.goalT < .8 && Math.round(this.time * 60) % 2 === 0) this.record();
    const b = this.ball;
    if (!b.owner) { b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; if (b.y < BR) { b.y = BR; b.vy = -b.vy * .4; } b.vx *= 1 - dt * 2; b.vz *= 1 - dt * 2; this.goalFrame(); }
    for (const p of this.all) {
      p.dive = null; p.slide = 0;
      if (this.state === 'goal' && p.team === this.goalTeam && this.scorer) {
        if (p === this.scorer) { p.cele = true; const cx = this.goalX(p.team) * .92, cz = Math.sign(p.z || 1) * HZ * .85; this.moveTo(p, cx, cz, .9, dt); }
        else this.moveTo(p, this.scorer.x - p.team.dir * 1.5 + (p.i % 3 - 1), this.scorer.z + (p.i % 4 - 1.5), .9, dt);
      } else { const s = this.spot(p); this.moveTo(p, s.x, s.z, .3, dt); }
      const acc = 12 * dt, dvx = (p.wx || 0) - p.vx, dvz = (p.wz || 0) - p.vz, dv = Math.hypot(dvx, dvz);
      if (dv > acc) { p.vx += dvx / dv * acc; p.vz += dvz / dv * acc; } else { p.vx = p.wx || 0; p.vz = p.wz || 0; }
      p.x += p.vx * dt; p.z += p.vz * dt; p.speed = Math.hypot(p.vx, p.vz); if (p.speed > .4) { p.fx = p.vx / p.speed; p.fz = p.vz / p.speed; }
    }
    if (this.state === 'goal' && this.goalT > 3.4) {
      this.all.forEach(p => p.cele = false);
      if (this.o.replays !== false && this.rec.length > 40) this.startReplay(); else this.afterGoal();
    }
    if (this.state === 'half' && this.goalT > 3) { this.half = 2; this.clock = 2700; this.banner('', '', 0); this.kickoff(this.teams[1]); }
    if (this.state === 'end' && this.goalT > 3 && !this.ended) { this.ended = true; this.finish(); }
  }
  afterGoal() { this.replay = null; this.kickoff(this.goalTeam.opp); }
  halfTime() { this.state = 'half'; this.goalT = 0; this.scorer = null; this.goalTeam = null; ENG.audio.whistle(2, true); this.banner('Half time', this.scoreLine(), 3); }
  fullTime() { this.state = 'end'; this.goalT = 0; this.scorer = null; this.goalTeam = null; ENG.audio.whistle(3, true); this.banner('Full time', this.scoreLine(), 3); }
  scoreLine() { return this.teams[0].club.abbr + ' ' + this.teams[0].score + ' – ' + this.teams[1].score + ' ' + this.teams[1].club.abbr; }
  // ---------- replay ----------
  record() {
    const f = new Float32Array(3 + this.all.length * 5 + 2), b = this.ball;
    f[0] = b.x; f[1] = b.y; f[2] = b.z;
    this.all.forEach((p, i) => { const k = 3 + i * 5; f[k] = p.x; f[k + 1] = p.z; f[k + 2] = Math.atan2(p.fx, p.fz); f[k + 3] = p.speed; f[k + 4] = p.kick; });
    f[f.length - 2] = this.ref.x; f[f.length - 1] = this.ref.z;
    this.rec.push(f); if (this.rec.length > 300) this.rec.shift();
  }
  startReplay() {
    const end = this.rec.length, start = Math.max(0, this.goalFrameIdx - 150);
    this.replay = { frames: this.rec.slice(start, end), i: 0, sp: .55 };
    this.state = 'replay'; this.banner('', '', 0); this.tick('Replay — press any button to skip', 4);
    $('replayTag') && ($('replayTag').hidden = false);
  }
  stepReplay(dt) {
    const r = this.replay; r.i += dt * 30 * r.sp;
    const I = ENG.input; if (I.pressed.pass || I.pressed.shoot || I.pressed.pause || I.pressed.through) r.i = 1e9;
    if (r.i >= r.frames.length - 1) { this.rec = []; this.afterGoal(); return; }
    const f0 = r.frames[Math.floor(r.i)], f1 = r.frames[Math.min(r.frames.length - 1, Math.floor(r.i) + 1)], k = r.i % 1;
    const L = (j) => lerp(f0[j], f1[j], k);
    const b = this.ball; b.x = L(0); b.y = L(1); b.z = L(2);
    this.all.forEach((p, i) => { const j = 3 + i * 5; p.x = L(j); p.z = L(j + 1); p.ry = f0[j + 2]; p.speed = L(j + 3); p.kick = f0[j + 4]; p.fx = Math.sin(p.ry); p.fz = Math.cos(p.ry); p.dive = null; p.slide = 0; });
    this.ref.x = f0[f0.length - 2]; this.ref.z = f0[f0.length - 1];
    ENG.ballMesh.rotation.x += dt * 8;
  }
  // ---------- end ----------
  finish() {
    const [h, a] = this.teams;
    const tot = (this.possT[0] + this.possT[1]) || 1;
    const res = { hg: h.score, ag: a.score, events: this.events, stats: [h.st, a.st], poss: [Math.round(this.possT[0] / tot * 100), Math.round(this.possT[1] / tot * 100)] };
    if (this.pcMode) res.pc = this.pcRating();
    this.dispose(); ENG.onFrame = null; ENG.menuCam = true;
    this.o.onEnd(res);
  }
  pcRating() {
    const s = this.pc, t = this.userTeam, won = t.score > t.opp.score, lost = t.score < t.opp.score;
    let r = 6.0 + s.goals * 1.0 + s.assists * .6 + s.passOk * .05 + s.tackles * .2 + s.sot * .15 + s.saves * .35 - s.lost * .05 + (won ? .4 : lost ? -.3 : 0) + s.touches * .01;
    if (this.ctrl.gk) r += (t.opp.score === 0 ? .8 : -t.opp.score * .35);
    return Object.assign({}, s, { rating: clamp(Math.round(r * 10) / 10, 3, 10) });
  }
  simRest() { // quit early: simulate the remaining minutes
    const left = Math.max(0, (5400 - this.clock) / 5400);
    const r = simMatch(this.o.home, this.o.away);
    const scale = ev => Math.random() < left;
    r.events.filter(scale).forEach(ev => { const side = ev.club === this.o.home.id ? 'home' : 'away'; (side === 'home' ? this.teams[0] : this.teams[1]).score++; this.events.push({ team: side, pid: ev.pid, aid: ev.aid, min: Math.max(this.minute(), ev.min), name: '' }); });
    this.finish();
  }
  // ---------- frame ----------
  frame(dt) {
    const I = ENG.input;
    if (I.pressed.pause && this.state !== 'replay') { this.togglePause(); }
    if (I.pressed.cam) this.cycleCam();
    if (this.paused) { this.updateCamera(dt); return; }
    if (this.state === 'replay') { this.stepReplay(dt); }
    else { this.acc += dt; let n = 0; while (this.acc >= STEP && n < 5) { this.step(STEP); this.acc -= STEP; n++; } if (n === 5) this.acc = 0; }
    this.render(dt);
    this.updateCamera(dt);
    this.updateHUD();
  }
  render(dt) {
    for (const p of this.all) {
      const m = p.model; m.root.position.set(p.x, 0, p.z);
      m.root.rotation.y = this.state === 'replay' ? p.ry : Math.atan2(p.fx, p.fz);
      let dv = 0, dh = 0, dT = 0;
      if (p.dive) { dT = clamp(p.dive.t / Math.max(.15, p.dive.T * .7), 0, 1); dv = p.dive.side === 0 ? 0 : (p.dive.zc > p.dive.z0 ? 1 : -1) * p.team.dir * -1; dh = p.dive.h; }
      ENG.animate(m, { speed: p.speed, kick: p.kick, slide: p.slide, dive: dv, diveT: dT, diveH: dh * .6 + .2, celebrate: p.cele, gkReady: p.gk && !this.ball.owner }, dt);
    }
    const r = this.ref; r.model.root.position.set(r.x, 0, r.z); const rs = Math.hypot(r.vx, r.vz); if (rs > .3) r.model.root.rotation.y = Math.atan2(r.vx, r.vz); ENG.animate(r.model, { speed: this.state === 'replay' ? 2 : rs }, dt);
    const b = this.ball; ENG.ballMesh.position.set(b.x, b.y, b.z);
    if (this.ctrl && this.state !== 'replay') { this.ring.visible = true; this.ring.position.x = this.ctrl.x; this.ring.position.z = this.ctrl.z; this.ring.rotation.z += dt * 2; }
    else this.ring.visible = false;
    if (this.netHit) { this.netHit.t -= dt; const n = ENG.goalNets[this.netHit.s > 0 ? 1 : 0]; n.position.x = this.netHit.s * (2.0 + Math.max(0, this.netHit.t) * 1.0); if (this.netHit.t <= 0) this.netHit = null; }
    // crowd noise follows danger
    const danger = 1 - Math.min(1, Math.min(Math.abs(b.x - HX), Math.abs(b.x + HX)) / 30);
    if (this.state === 'play' && Math.random() < .02) ENG.audio.crowd(.16 + danger * .2);
    if (danger > .6 && this.state === 'play') ENG.crowdExcite = Math.max(ENG.crowdExcite, (danger - .6) * .6);
  }
  cycleCam() { this.camMode = (this.camMode + 1) % 3; this.tick(['Broadcast camera', 'Tele camera', 'Pro camera'][this.camMode], 1.2); }
  updateCamera(dt) {
    const c = ENG.camera, b = this.ball;
    if (!this.camT) { this.camT = new THREE.Vector3(b.x, 0, b.z); this.camP = new THREE.Vector3(0, 21, 40); }
    let px, py, pz, lx, ly, lz, k = Math.min(1, dt * 2.6);
    if (this.state === 'replay') {
      const s = Math.sign(this.goalTeam ? this.goalTeam.dir : 1);
      px = s * (HX - 14); py = 6; pz = b.z * .4 + 16; lx = b.x; ly = 1; lz = b.z; k = Math.min(1, dt * 3);
    } else if (this.state === 'goal' && this.scorer) {
      const s = this.scorer; px = s.x - this.goalTeam.dir * 9; py = 4.5; pz = s.z + (s.z > 0 ? -9 : 9) * .6 + 6; lx = s.x; ly = 1.4; lz = s.z; k = Math.min(1, dt * 1.6);
    } else if (this.camMode === 2 && this.userTeam) {
      const d = this.userTeam.dir, foc = this.ctrl && this.pcMode ? this.ctrl : b;
      px = foc.x - d * 17; py = 9; pz = foc.z * .85; lx = foc.x + d * 8; ly = 0; lz = foc.z * .9;
    } else {
      const tele = this.camMode === 1;
      const fx = this.pcMode && this.ctrl ? lerp(b.x, this.ctrl.x, .35) : b.x, fz = this.pcMode && this.ctrl ? lerp(b.z, this.ctrl.z, .35) : b.z;
      const narrow = c.aspect < 1;
      px = clamp(fx * (tele ? .95 : .88), -44, 44); py = (tele ? 14.5 : 21) + (narrow ? 16 : 0); pz = (tele ? 28 + fz * .2 : 40) - (narrow ? 8 : 0);
      lx = clamp(fx * .97, -50, 50); ly = 0; lz = fz * (tele ? .65 : .5) - (tele ? 1 : 3);
    }
    this.camP.lerp(new THREE.Vector3(px, py, pz), k); this.camT.lerp(new THREE.Vector3(lx, ly, lz), Math.min(1, k * 1.6));
    c.position.copy(this.camP); c.lookAt(this.camT);
  }
  togglePause() { this.paused = !this.paused; if (this.paused) UI.pauseMenu(this); else UI.closeModal(); }
  // ---------- HUD ----------
  setupHUD() {
    $('hud').hidden = false; $('touch').hidden = !ENG.input.isTouch(); $('keys').hidden = ENG.input.isTouch();
    const [h, a] = this.teams;
    $('sbH').querySelector('span').textContent = h.club.abbr; $('sbH').querySelector('i').style.background = h.kit.shirt;
    $('sbA').querySelector('span').textContent = a.club.abbr; $('sbA').querySelector('i').style.background = a.kit.shirt;
    $('bCam').onclick = () => this.cycleCam(); $('bPause').onclick = () => this.togglePause();
    this.updateScore(); this.rctx = $('radar').getContext('2d');
  }
  updateScore() { $('sbHG').textContent = this.teams[0].score; $('sbAG').textContent = this.teams[1].score; }
  banner(big, small, dur = 2) {
    const el = $('banner'); el.innerHTML = big ? big + (small ? '<small>' + small + '</small>' : '') : ''; el.classList.toggle('on', !!big);
    clearTimeout(this.bT); if (big && dur) this.bT = setTimeout(() => el.classList.remove('on'), dur * 1000);
  }
  tick(msg, dur = 2) { const el = $('ticker'); el.textContent = msg; el.classList.add('on'); clearTimeout(this.tT); this.tT = setTimeout(() => el.classList.remove('on'), dur * 1000); }
  updateHUD() {
    const sec = Math.floor(this.clock), m = Math.floor(sec / 60), s = sec % 60;
    const capM = this.half === 1 ? 45 : 90;
    $('sbClock').textContent = (m >= capM ? capM : m) + ':' + String(m >= capM ? 0 : s).padStart(2, '0');
    const add = $('sbAdd'); const over = m >= capM; add.hidden = !over; if (over) add.textContent = '+' + (Math.floor((sec - capM * 60) / 60) + 1);
    // name + power over controlled player
    const pn = $('pname'), pw = $('power');
    if (this.ctrl && this.state !== 'replay') {
      const v = new THREE.Vector3(this.ctrl.x, 2.35, this.ctrl.z).project(ENG.camera);
      const x = (v.x * .5 + .5) * innerWidth, y = (-v.y * .5 + .5) * innerHeight;
      pn.hidden = false; pn.textContent = (this.ctrl.d.num ? this.ctrl.d.num + ' ' : '') + shortName(this.ctrl.d) + (this.ctrl.stam < .35 ? ' ·  tired' : '');
      pn.style.transform = `translate(${x - pn.offsetWidth / 2}px,${y - 20}px)`;
      pw.hidden = !(this.charge > 0); if (this.charge > 0) { pw.style.transform = `translate(${x - 35}px,${y - 34}px)`; pw.firstChild.style.width = (this.charge * 100) + '%'; }
    } else { pn.hidden = true; pw.hidden = true; }
    // radar
    const g = this.rctx, W = 420, H = 272; g.clearRect(0, 0, W, H);
    g.strokeStyle = '#ffffff66'; g.lineWidth = 2; g.strokeRect(6, 6, W - 12, H - 12); g.beginPath(); g.moveTo(W / 2, 6); g.lineTo(W / 2, H - 6); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, 22, 0, 7); g.stroke(); g.strokeRect(6, H / 2 - 52, 42, 104); g.strokeRect(W - 48, H / 2 - 52, 42, 104);
    const X = x => 6 + (x + HX) / (2 * HX) * (W - 12), Z = z => 6 + (z + HZ) / (2 * HZ) * (H - 12);
    for (const t of this.teams) { g.fillStyle = t.kit.shirt; for (const p of t.players) { g.beginPath(); g.arc(X(p.x), Z(p.z), p === this.ctrl ? 9 : 7, 0, 7); g.fill(); if (p === this.ctrl) { g.strokeStyle = '#f2b630'; g.lineWidth = 3; g.stroke(); } else { g.strokeStyle = '#0008'; g.lineWidth = 1.5; g.stroke(); } } }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(this.ball.x), Z(this.ball.z), 5, 0, 7); g.fill();
  }
}

let CUR = null;
function startMatch(o) {
  ENG.audio.init();
  UI.hideAll();
  if (CUR) { try { CUR.dispose(); } catch (e) { } }
  ENG.menuCam = false;
  const m = CUR = new Match(o);
  ENG.onFrame = dt => m.frame(dt);
  return m;
}
