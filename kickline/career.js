'use strict';
/* ===== Kickline 27 — career: seasons, fixtures, transfers, board, player career, cup ===== */
const WEEKS = 18;
const CAREER = {
  s: null, idx: {},
  reindex() { this.idx = {}; for (const c of this.s.clubs) this.idx[c.id] = c; this.pidx = {}; for (const c of this.s.clubs) for (const p of c.squad) this.pidx[p.id] = p; },
  club(id) { return this.idx[id]; },
  player(id) { return this.pidx[id]; },
  league(id) { return this.s.leagues.find(l => l.id === id); },
  leagueClubs(id) { return this.league(id).clubs.map(c => this.club(c)); },
  user() { return this.club(this.s.userClub); },
  // ---------- persistence ----------
  key(kind) { return kind === 'pc' ? 'kickline27_pc' : 'kickline27_mgr'; },
  save() { try { localStorage.setItem(this.key(this.s.kind), JSON.stringify(this.s)); return true; } catch (e) { return false; } },
  hasSave(kind) { try { return !!localStorage.getItem(this.key(kind)); } catch (e) { return false; } },
  load(kind) { try { const raw = localStorage.getItem(this.key(kind)); if (!raw) return false; this.s = JSON.parse(raw); PID = this.s.nextPid || 99999; this.reindex(); return true; } catch (e) { return false; } },
  wipe(kind) { try { localStorage.removeItem(this.key(kind)); } catch (e) { } },
  // ---------- new games ----------
  newWorld(kind) {
    const w = buildWorld(2027);
    this.s = { kind, season: 2027, week: 0, leagues: w.leagues, clubs: w.clubs, nextPid: w.nextPid, inbox: [], history: [], fixtures: {}, results: {}, userClub: null };
    this.reindex();
  },
  newManager(clubId) {
    this.newWorld('mgr'); this.s.userClub = clubId; const c = this.user();
    this.s.budget = c.budget; this.startSeason();
    this.mail(`Welcome to ${c.name}. The board expects you to ${this.objText()}. Your transfer budget is ${fmtMoney(this.s.budget)}.`);
    this.mail('The transfer window is open until matchweek 4, and again in weeks 9–10.');
  },
  newPlayer(opts, clubId) {
    if (!this.s || this.s.kind !== 'pc' || this.s.userClub) this.newWorld('pc');
    PID = this.s.nextPid;
    const p = makePlayer(opts.nat, opts.pos, 61, 17);
    p.fn = opts.fn; p.ln = opts.ln; p.num = opts.num; p.pot = ri(88, 93); p.age = 17; p.xp = 0; p.axp = {}; p.me = true;
    p.ovr = calcOvr(p); p.val = playerValue(p);
    this.s.nextPid = PID;
    this.s.pc = { pid: p.id, trained: false, totals: { apps: 0, g: 0, a: 0 }, ratings: [] };
    this.joinClub(p, clubId);
    this.s.userClub = clubId;
    this.startSeason();
    this.mail(`${pname(p)} signs for ${this.user().name}. Earn your place: good match ratings and training raise your overall.`);
  },
  pcOffers(n = 3) { // starting clubs for a 17-year-old
    if (!this.s || this.s.kind !== 'pc') this.newWorld('pc');
    const pool = this.s.clubs.filter(c => c.rep < 76).sort(() => Math.random() - .5);
    return pool.slice(0, n);
  },
  joinClub(p, clubId) {
    const old = p.club != null ? this.club(p.club) : null;
    if (old) { old.squad = old.squad.filter(q => q.id !== p.id); old.xi = null; }
    const c = this.club(clubId); p.club = clubId;
    if (c.squad.some(q => q.num === p.num)) { const q = c.squad.find(q => q.num === p.num); q.num = 40 + ri(0, 50); }
    c.squad.push(p); c.xi = null; this.reindex();
  },
  me() { return this.s.pc ? this.player(this.s.pc.pid) : null; },
  // ---------- season ----------
  startSeason() {
    const s = this.s; s.week = 0; s.fixtures = {}; s.results = {}; s.youthDone = false; if (s.pc) s.pc.trained = false;
    for (const L of s.leagues) {
      s.fixtures[L.id] = roundRobin(shuffle(L.clubs.slice()));
      s.results[L.id] = [];
      for (const id of L.clubs) { const c = this.club(id); c.st = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }; for (const p of c.squad) { p.g = 0; p.a = 0; p.apps = 0; p.rt = 0; } }
    }
    if (s.kind === 'mgr') s.objective = this.expectedPos();
  },
  expectedPos() {
    const u = this.user(); const ranked = this.leagueClubs(u.league).map(c => ({ c, s: teamStrength(c).ovr })).sort((a, b) => b.s - a.s);
    const r = ranked.findIndex(x => x.c === u) + 1; return Math.max(1, Math.min(9, r === 1 ? 1 : r));
  },
  objText() { const n = this.s.objective; return n === 1 ? 'win the league' : n <= 4 ? `finish in the top ${n}` : `finish ${ordinal(n)} or higher`; },
  windowOpen() { const w = this.s.week; return w < 4 || (w >= 8 && w < 10); },
  table(lid) {
    return this.leagueClubs(lid).slice().sort((a, b) => b.st.pts - a.st.pts || (b.st.gf - b.st.ga) - (a.st.gf - a.st.ga) || b.st.gf - a.st.gf || a.name.localeCompare(b.name));
  },
  position(clubId) { const c = this.club(clubId); return this.table(c.league).indexOf(c) + 1; },
  userFixture() {
    const u = this.user(); if (this.s.week >= WEEKS) return null;
    const f = this.s.fixtures[u.league][this.s.week].find(m => m[0] === u.id || m[1] === u.id);
    return f ? { home: this.club(f[0]), away: this.club(f[1]), userSide: f[0] === u.id ? 'home' : 'away' } : null;
  },
  applyResult(lid, h, a, r) {
    const H = h.st, A = a.st; H.p++; A.p++; H.gf += r.hg; H.ga += r.ag; A.gf += r.ag; A.ga += r.hg;
    if (r.hg > r.ag) { H.w++; A.l++; H.pts += 3; H.form.push('W'); A.form.push('L'); }
    else if (r.hg < r.ag) { A.w++; H.l++; A.pts += 3; H.form.push('L'); A.form.push('W'); }
    else { H.d++; A.d++; H.pts++; A.pts++; H.form.push('D'); A.form.push('D'); }
    H.form = H.form.slice(-5); A.form = A.form.slice(-5);
    for (const [c, side] of [[h, 'home'], [a, 'away']]) {
      const xi = lineupPlayers(c);
      for (const p of xi) { if (!p) continue; p.apps++; const pc = r.pcRating && p.me; p.rt += pc ? r.pcRating : clamp(6.4 + gauss() * .6 + (side === 'home' ? (r.hg - r.ag) : (r.ag - r.hg)) * .15, 5, 8.6); }
      if (r.pcSub && r.pcSub.club === c.id) { const p = this.player(r.pcSub.pid); if (p && !xi.includes(p)) { p.apps++; p.rt += r.pcRating; } }
    }
    for (const ev of r.events) {
      const sc = ev.pid && this.player(ev.pid); if (sc) { sc.g++; sc.cg = (sc.cg || 0) + 1; if (!r.pcRating || !sc.me) sc.rt += .9; }
      const as = ev.aid && this.player(ev.aid); if (as) { as.a++; as.ca = (as.ca || 0) + 1; if (!r.pcRating || !as.me) as.rt += .4; }
    }
    this.s.results[lid][this.s.week] = this.s.results[lid][this.s.week] || [];
    this.s.results[lid][this.s.week].push({ h: h.id, a: a.id, hg: r.hg, ag: r.ag, ev: r.events.map(e => ({ c: e.club || (e.team === 'home' ? h.id : a.id), n: e.pid ? shortName(this.player(e.pid) || { ln: '?' }) : 'OG', m: e.min })) });
  },
  // userRes: result object from a played match (hg, ag, events with team/pid/aid). null = simulate.
  playWeek(userRes) {
    const s = this.s, u = this.user(), out = { userResult: null };
    for (const L of s.leagues) {
      for (const [hid, aid] of s.fixtures[L.id][s.week]) {
        const h = this.club(hid), a = this.club(aid);
        let r;
        if ((hid === u.id || aid === u.id) && userRes) {
          r = { hg: userRes.hg, ag: userRes.ag, events: userRes.events.map(e => ({ club: e.team === 'home' ? hid : aid, pid: e.pid, aid: e.aid, min: e.min })), pcRating: userRes.pc ? userRes.pc.rating : null, pcSub: userRes.pcSub };
        } else r = simMatch(h, a);
        if (hid === u.id || aid === u.id) {
          if (!userRes && s.kind === 'pc') { // simulated pc match: give a rating
            const me = this.me(); const inXI = lineupPlayers(u).includes(me);
            if (!inXI && me.pos !== 'GK' && Math.random() < .6) { r.pcRating = clamp(Math.round((6.2 + gauss() * .4) * 10) / 10, 5, 8); r.pcSub = { club: u.id, pid: me.id }; }
            else if (inXI) { const myG = r.events.filter(e => e.pid === me.id).length, myA = r.events.filter(e => e.aid === me.id).length; r.pcRating = clamp(Math.round((6.3 + (me.ovr - teamStrength(u).ovr) * .06 + myG * .9 + myA * .5 + gauss() * .5) * 10) / 10, 4.5, 10); }
          }
          out.userResult = { home: h, away: a, hg: r.hg, ag: r.ag };
          if (s.kind === 'mgr' && hid === u.id) s.budget += +(0.3 + u.rep * .012).toFixed(2);
          out.pcRating = r.pcRating;
        }
        this.applyResult(L.id, h, a, r);
      }
    }
    if (s.kind === 'mgr') this.mgrWeekly(out); else this.pcWeekly(out);
    s.week++;
    if (s.week >= WEEKS) out.seasonOver = true;
    return out;
  },
  mail(text, action) { this.s.inbox.unshift({ w: this.s.week, season: this.s.season, text, action: action || null, read: false }); this.s.inbox = this.s.inbox.slice(0, 40); },
  mgrWeekly(out) {
    const s = this.s, u = this.user();
    if (out.userResult) { const r = out.userResult; const us = r.home === u ? r.hg : r.ag, them = r.home === u ? r.ag : r.hg; const opp = r.home === u ? r.away : r.home; this.mail(`${us > them ? 'Win' : us < them ? 'Defeat' : 'Draw'}: ${u.abbr} ${us}–${them} ${opp.abbr}. You are ${ordinal(this.position(u.id))} in the ${this.league(u.league).name}.`); }
    if (this.windowOpen() && Math.random() < .35) {
      const cands = u.squad.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 12);
      const p = pick(cands), buyers = s.clubs.filter(c => c.id !== u.id && c.rep > u.rep - 4);
      if (p && buyers.length) { const b = pick(buyers); const amt = +(p.val * rf(.95, 1.35)).toFixed(2); this.mail(`${b.name} bid ${fmtMoney(amt)} for ${pname(p)} (${p.pos}, ${p.ovr}).`, { type: 'bid', pid: p.id, club: b.id, amt }); }
    }
    if (s.week === 3) this.mail('The transfer window closes after this matchweek.');
    if (s.week === 7) this.mail('The mid-season transfer window opens next week.');
  },
  pcWeekly(out) {
    const s = this.s, me = this.me(), u = this.user();
    s.pc.trained = false;
    if (out.pcRating) {
      s.pc.ratings.push(out.pcRating); s.pc.totals.apps++;
      me.xp = (me.xp || 0) + Math.max(0, (out.pcRating - 5.6)) * 15;
      while (me.xp >= 100 && me.ovr < me.pot) { me.xp -= 100; bumpAttrs(me, 1); this.mail(`Your form is paying off: overall up to ${me.ovr}.`); }
      const r = out.userResult, us = r.home === u ? r.hg : r.ag, them = r.home === u ? r.ag : r.hg;
      this.mail(`${us > them ? 'Win' : us < them ? 'Loss' : 'Draw'} ${us}–${them}. Your match rating: ${out.pcRating.toFixed(1)}.`);
    } else if (out.userResult) this.mail('You were an unused substitute this week. Train hard and keep your rating up to win a starting spot.');
    s.pc.totals.g = me.cg || 0; s.pc.totals.a = me.ca || 0;
    if (s.week === 8 || s.week === 16) this.pcTransferInterest();
  },
  avgRating(p) { return p.apps ? p.rt / p.apps : 0; },
  pcTransferInterest() {
    const me = this.me(), u = this.user(), avg = this.avgRating(me);
    if (me.apps < 3 || avg < 6.9) return;
    const bigger = this.s.clubs.filter(c => c.id !== u.id && c.rep > u.rep + 1 && c.rep < me.ovr + 10).sort(() => Math.random() - .5).slice(0, avg > 7.6 ? 2 : 1);
    for (const c of bigger) this.mail(`${c.name} (${this.league(c.league).name}) want to sign you. Average rating ${avg.toFixed(2)} has scouts talking.`, { type: 'pcoffer', club: c.id });
  },
  train(attr) {
    const me = this.me(); if (this.s.pc.trained) return null;
    this.s.pc.trained = true; me.axp = me.axp || {};
    const gain = me.age < 21 ? rf(30, 48) : me.age < 27 ? rf(22, 36) : rf(10, 20);
    me.axp[attr] = (me.axp[attr] || 0) + gain;
    let up = 0; while (me.axp[attr] >= 100) { me.axp[attr] -= 100; me.att[attr] = clamp(me.att[attr] + 1, 20, 99); up++; }
    const before = me.ovr; me.ovr = Math.min(me.pot, calcOvr(me)); me.val = playerValue(me);
    return { gain: Math.round(gain), up, ovrUp: me.ovr - before };
  },
  pcMatchSetup() {
    // returns {startMin, xiOverride, playing}
    const u = this.user(), me = this.me(), xi = lineupPlayers(u);
    if (xi.includes(me)) return { startMin: 0, xi: null, playing: true, starter: true };
    if (me.pos === 'GK') return { playing: false };
    const form = FORMATIONS[u.form];
    let bestI = -1, bs = 1e9;
    xi.forEach((p, i) => { if (form[i][0] === 'GK') return; const fit = fitPen(form[i][0], me.pos); const s = fit * 3 + p.ovr; if (s < bs) { bs = s; bestI = i; } });
    const x2 = xi.slice(); x2[bestI] = me;
    return { startMin: 64, xi: x2, playing: true, starter: false };
  },
  // ---------- transfers ----------
  marketList(f) {
    const u = this.user(); let list = [];
    for (const c of this.s.clubs) { if (c.id === u.id) continue; if (f.league && c.league !== f.league) continue; for (const p of c.squad) { if (f.pos && POS_GROUP[p.pos] !== f.pos && p.pos !== f.pos) continue; if (p.val > f.max) continue; if (p.ovr < (f.minOvr || 0)) continue; list.push(p); } }
    return list.sort((a, b) => b.ovr - a.ovr).slice(0, 80);
  },
  bid(pid, amt) {
    const s = this.s, u = this.user(), p = this.player(pid), c = this.club(p.club);
    if (!this.windowOpen()) return { ok: false, msg: 'The transfer window is closed.' };
    if (amt > s.budget) return { ok: false, msg: 'That is more than your transfer budget.' };
    if (u.squad.length >= 28) return { ok: false, msg: 'Your squad is full (28). Sell someone first.' };
    if (p.ovr > teamStrength(u).ovr + 9 && Math.random() < .7) return { ok: false, msg: `${pname(p)} wants to play for a bigger club.` };
    const key = c.squad.slice().sort((a, b) => b.ovr - a.ovr).indexOf(p) < 3 ? 1.3 : 1;
    const need = p.val * key * rf(.95, 1.15);
    if (amt < need) return { ok: false, msg: `${c.name} rejected ${fmtMoney(amt)}. They want more.`, counter: +(need * 1.02).toFixed(2) };
    s.budget = +(s.budget - amt).toFixed(2); c.budget += amt;
    c.squad = c.squad.filter(q => q.id !== p.id); c.xi = null; p.club = u.id;
    while (u.squad.some(q => q.num === p.num)) p.num = ri(2, 99);
    u.squad.push(p); u.xi = null; this.reindex();
    // replace the seller's player with a youngster so squads stay full
    if (c.squad.length < 18) { const y = makePlayer(this.league(c.league).nat, p.pos, c.rep - 8, ri(17, 20)); y.club = c.id; y.num = ri(30, 60); c.squad.push(y); this.s.nextPid = PID; this.reindex(); }
    this.mail(`Done deal: ${pname(p)} joins from ${c.name} for ${fmtMoney(amt)}.`);
    return { ok: true, msg: `${pname(p)} signs for ${fmtMoney(amt)}.` };
  },
  sell(pid, clubId, amt) {
    const u = this.user(), p = this.player(pid), c = this.club(clubId);
    if (u.squad.length <= 16) return { ok: false, msg: 'You need at least 16 players.' };
    u.squad = u.squad.filter(q => q.id !== pid); u.xi = null; p.club = c.id; c.squad.push(p); c.xi = null;
    this.s.budget = +(this.s.budget + amt).toFixed(2); this.reindex();
    return { ok: true, msg: `${pname(p)} sold to ${c.name} for ${fmtMoney(amt)}.` };
  },
  quickSellOffer(pid) { const p = this.player(pid), u = this.user(); const buyers = this.s.clubs.filter(c => c.id !== u.id && Math.abs(c.rep - p.ovr) < 9); const c = pick(buyers.length ? buyers : this.s.clubs.filter(c => c.id !== u.id)); return { club: c, amt: +(p.val * rf(.78, 1.02)).toFixed(2) }; },
  youthProspects() {
    const u = this.user(), nat = this.league(u.league).nat; PID = this.s.nextPid;
    const list = [0, 1, 2].map(() => { const pos = pick(['ST', 'CAM', 'CM', 'CB', 'LW', 'RW', 'LB', 'GK', 'CDM']); const p = makePlayer(Math.random() < .8 ? nat : pick(Object.keys(NAMES)), pos, ri(50, 62), 16); p.pot = ri(72, 92); p.val = playerValue(p); return p; });
    this.s.nextPid = PID; return list;
  },
  signYouth(p) { const u = this.user(); p.club = u.id; while (u.squad.some(q => q.num === p.num) || !p.num) p.num = ri(30, 70); u.squad.push(p); u.xi = null; this.s.youthDone = true; this.reindex(); this.mail(`Academy graduate ${pname(p)} (${p.pos}, pot. ${p.pot}) joins the first team.`); },
  // ---------- season end ----------
  endSeason() {
    const s = this.s, u = this.user(), sum = { champions: [], pos: this.position(u.id), league: this.league(u.league).name };
    for (const L of s.leagues) {
      const t = this.table(L.id); sum.champions.push({ league: L.name, club: t[0] });
      const scorers = this.leagueClubs(L.id).flatMap(c => c.squad).sort((a, b) => b.g - a.g);
      if (L.id === u.league) sum.boot = scorers[0];
      t.forEach((c, i) => { c.rep = clamp(c.rep + (4.5 - i) * .25, 60, 90); });
    }
    if (s.kind === 'mgr') {
      const prize = Math.round(((11 - sum.pos) * 2.2 + (sum.pos === 1 ? 12 : 0)) * 10) / 10;
      s.budget = +(s.budget + prize).toFixed(2); sum.prize = prize; sum.objective = s.objective; sum.met = sum.pos <= s.objective;
      sum.sacked = sum.pos > s.objective + 3;
      s.history.push({ season: s.season, club: u.name, pos: sum.pos, pts: u.st.pts, champ: sum.pos === 1 });
    } else {
      const me = this.me();
      sum.me = { apps: me.apps, g: me.g, a: me.a, avg: this.avgRating(me) };
      s.history.push({ season: s.season, club: u.name, apps: me.apps, g: me.g, a: me.a, avg: +this.avgRating(me).toFixed(2), ovr: me.ovr, champ: sum.pos === 1 });
      if (me.apps >= 5 && this.avgRating(me) >= 6.9) this.pcTransferInterest();
    }
    // ageing, growth, retirement, youth intake
    PID = s.nextPid;
    for (const c of s.clubs) {
      for (const p of c.squad.slice()) {
        p.age++;
        let d = 0;
        if (p.me) { d = p.age <= 30 ? 0 : p.age <= 32 ? -1 : -2; }
        else if (p.age <= 21) d = ri(1, 5); else if (p.age <= 25) d = ri(0, 3); else if (p.age <= 29) d = ri(-1, 1); else if (p.age <= 32) d = ri(-3, 0); else d = ri(-5, -1);
        if (d > 0) d = Math.min(d, Math.max(0, p.pot - p.ovr));
        if (d) bumpAttrs(p, d);
        if (!p.me && (p.age >= 36 || (p.age >= 33 && Math.random() < .3))) { c.squad = c.squad.filter(q => q !== p); if (c.id === u.id && s.kind === 'mgr') this.mail(`${pname(p)} has retired at ${p.age}.`); }
      }
      while (c.squad.length < 20) {
        const need = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'ST', 'LW', 'RW', 'CDM', 'CAM'].find(pos => c.squad.filter(q => q.pos === pos).length < (pos === 'CB' || pos === 'CM' || pos === 'GK' ? 2 : 1)) || pick(SQUAD_POS);
        const y = makePlayer(Math.random() < .75 ? this.league(c.league).nat : pick(Object.keys(NAMES)), need, c.rep - ri(4, 12), ri(17, 21)); y.club = c.id;
        y.num = ri(2, 60); while (c.squad.some(q => q.num === y.num)) y.num = ri(2, 99);
        c.squad.push(y);
      }
      c.xi = null; c.budget = Math.round(c.squad.reduce((a, p) => a + p.val, 0) * .12 * 10) / 10;
    }
    s.nextPid = PID;
    s.season++;
    this.reindex();
    this.startSeason();
    if (s.kind === 'mgr' && !sum.sacked) this.mail(`New season ${s.season}/${String(s.season + 1).slice(2)}. The board expects you to ${this.objText()}.`);
    return sum;
  },
  jobOffers() { const u = this.user(); return this.s.clubs.filter(c => c.id !== u.id && c.rep < u.rep - 1).sort(() => Math.random() - .5).slice(0, 3); },
  takeJob(id) { this.s.userClub = id; this.s.budget = this.club(id).budget; this.s.objective = this.expectedPos(); this.mail(`You are the new manager of ${this.club(id).name}. The board expects you to ${this.objText()}.`); }
};
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

/* ---------- cup (not saved) ---------- */
const CUP = {
  s: null,
  start(userClub, world) {
    const pool = world.clubs.filter(c => c.id !== userClub.id).sort((a, b) => b.rep - a.rep).slice(0, 24).sort(() => Math.random() - .5).slice(0, 7);
    const teams = shuffle([userClub, ...pool]);
    this.s = { user: userClub.id, rounds: [teams.map(c => c.id)], results: [], world, done: false, winner: null };
  },
  club(id) { return this.s.world.clubs.find(c => c.id === id); },
  roundNames: ['Quarter-finals', 'Semi-finals', 'Final'],
  currentRound() { return this.s.results.length; },
  userTie() { const r = this.s.rounds[this.currentRound()]; for (let i = 0; i < r.length; i += 2) if (r[i] === this.s.user || r[i + 1] === this.s.user) return { home: this.club(r[i]), away: this.club(r[i + 1]), side: r[i] === this.s.user ? 'home' : 'away' }; return null; },
  playRound(userRes) {
    const ri_ = this.currentRound(), r = this.s.rounds[ri_], res = [], next = [];
    for (let i = 0; i < r.length; i += 2) {
      const h = this.club(r[i]), a = this.club(r[i + 1]);
      let hg, ag;
      if ((h.id === this.s.user || a.id === this.s.user) && userRes) { hg = userRes.hg; ag = userRes.ag; } else { const m = simMatch(h, a); hg = m.hg; ag = m.ag; }
      let pens = null; if (hg === ag) pens = penaltyShootout(h, a);
      const w = hg > ag || (pens && pens[0] > pens[1]) ? h : a;
      res.push({ h: h.id, a: a.id, hg, ag, pens, w: w.id }); next.push(w.id);
    }
    this.s.results.push(res);
    if (next.length === 1) { this.s.done = true; this.s.winner = next[0]; } else this.s.rounds.push(next);
    const ut = res.find(x => x.h === this.s.user || x.a === this.s.user);
    if (ut && ut.w !== this.s.user) this.s.out = true;
    return ut;
  }
};
