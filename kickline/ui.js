'use strict';
/* ===== Kickline 27 — UI: menus, career hub, transfers, results ===== */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UI = {
  settings: { halfMin: 3, diff: 1, night: true, replays: true, cam: 0 },
  backTo: 's-main', tab: 'home', lgTab: null, sel: null, mkt: { pos: '', league: '', max: 60 },
  init() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('kickline27_settings') || '{}')); } catch (e) { }
    ENG.setTimeOfDay(this.settings.night);
    $('mKick').onclick = () => { ENG.audio.init(); this.kickoffSelect(); };
    $('mMgr').onclick = () => { ENG.audio.init(); this.managerStart(); };
    $('mPC').onclick = () => { ENG.audio.init(); this.playerStart(); };
    $('mCup').onclick = () => { ENG.audio.init(); this.cupSelect(); };
    $('mSet').onclick = () => this.settingsModal();
    document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => this.show(this.backTo));
    $('hubSave').onclick = () => { this.toast(CAREER.save() ? 'Career saved on this device.' : 'Could not save: browser storage is blocked.'); };
    $('hubQuit').onclick = () => { CAREER.save(); this.show('s-main'); this.refreshMain(); };
    $('cupQuit').onclick = () => { CUP.s = null; this.show('s-main'); };
    const nat = $('pcNat'); Object.entries(NATS).forEach(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v; nat.appendChild(o); });
    $('pcGo').onclick = () => this.playerOffers();
    $('modal').addEventListener('click', e => { if (e.target.id === 'modal' && !this.modalLocked) this.closeModal(); });
    this.refreshMain();
    this.show('s-main');
  },
  saveSettings() { try { localStorage.setItem('kickline27_settings', JSON.stringify(this.settings)); } catch (e) { } },
  world() { return this.kw || (this.kw = buildWorld(2027)); },
  show(id) { document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id); this.cur = id; if (id === 's-main' || id === 's-select' || id === 's-create') ENG.menuCam = true; },
  hideAll() { document.querySelectorAll('.screen').forEach(s => s.hidden = true); this.closeModal(); },
  refreshMain() {
    const m = CAREER.hasSave('mgr'), p = CAREER.hasSave('pc');
    $('mMgr').querySelector('small').textContent = m ? 'Saved career found. Continue or start again.' : 'Pick a club. Transfers, tactics, board, seasons.';
    $('mPC').querySelector('small').textContent = p ? 'Saved player found. Continue or create a new one.' : 'Create a player at 17 and play only as them.';
  },
  // ---------- modal ----------
  modal(html, buttons = [{ t: 'OK' }], locked = false) {
    this.modalLocked = locked;
    const box = $('mbox'); box.innerHTML = html + '<div class="row" style="justify-content:flex-end" id="mBtns"></div>';
    const row = $('mBtns');
    buttons.forEach(b => { const el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.textContent = b.t; el.onclick = () => { if (!b.keep) this.closeModal(); b.fn && b.fn(); }; row.appendChild(el); });
    $('modal').hidden = false;
    const f = row.querySelector('.pri') || row.querySelector('button'); f && f.focus();
  },
  closeModal() { $('modal').hidden = true; this.modalLocked = false; },
  toast(msg) { this.modal('<p>' + esc(msg) + '</p>'); },
  settingsModal() {
    const s = this.settings;
    const opt = (id, vals, cur) => `<select id="${id}">${vals.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    this.modal(`<h2>Settings</h2>
      <div class="kv" style="align-items:center">
      <span><label for="setHalf">Half length</label></span>${opt('setHalf', [[2, '2 minutes'], [3, '3 minutes'], [5, '5 minutes'], [8, '8 minutes']], s.halfMin)}
      <span><label for="setDiff">Difficulty</label></span>${opt('setDiff', [[0, 'Amateur'], [1, 'Professional'], [2, 'World Class'], [3, 'Legendary']], s.diff)}
      <span><label for="setTime">Kick-off time</label></span>${opt('setTime', [[1, 'Night, floodlights'], [0, 'Afternoon sun']], s.night ? 1 : 0)}
      <span><label for="setRep">Goal replays</label></span>${opt('setRep', [[1, 'On'], [0, 'Off']], s.replays ? 1 : 0)}
      <span><label for="setCam">Camera</label></span>${opt('setCam', [[0, 'Broadcast'], [1, 'Tele'], [2, 'Pro (behind)']], s.cam)}
      </div><p class="note">Controls: WASD or arrows move, Shift sprint, J pass or tackle, K hold to shoot or slide tackle, L through ball, I lob or cross, Q switch player, C camera, Esc pause. Gamepads: A pass, B shoot, Y through, X lob, LB switch, RT sprint.</p>`,
      [{ t: 'Save', cls: 'pri', fn: () => { s.halfMin = +$('setHalf').value; s.diff = +$('setDiff').value; s.night = $('setTime').value === '1'; s.replays = $('setRep').value === '1'; s.cam = +$('setCam').value; ENG.setTimeOfDay(s.night); this.saveSettings(); } }, { t: 'Cancel' }]);
  },
  matchOpts(o) { const s = this.settings; return Object.assign({ halfSec: s.halfMin * 60, diff: s.diff, night: s.night, replays: s.replays, cam: s.cam }, o); },
  // ---------- club picker ----------
  picker(el, world, st, label, onChange) {
    const render = () => {
      const lg = world.leagues[st.l], c = world.clubs.find(x => x.id === lg.clubs[st.c]), ts = teamStrength(c);
      el.innerHTML = `<div class="lbl">${label}</div>
        <div class="ltabs" style="justify-content:center">${world.leagues.map((L, i) => `<button class="${i === st.l ? 'on' : ''}" data-l="${i}">${L.name}</button>`).join('')}</div>
        <div class="arrows"><button class="arrow" data-d="-1" aria-label="Previous club">‹</button><img class="crest lg" src="${crestURL(c)}" alt=""><button class="arrow" data-d="1" aria-label="Next club">›</button></div>
        <div class="nm">${esc(c.name)}</div><div class="stars" aria-label="${starRating(ts.ovr)} stars">${starStr(ts.ovr)}</div>
        <div class="ratings"><div><span class="lbl">ATT</span><b>${Math.round(ts.att)}</b></div><div><span class="lbl">MID</span><b>${Math.round(ts.mid)}</b></div><div><span class="lbl">DEF</span><b>${Math.round(ts.def)}</b></div><div><span class="lbl">OVR</span><b>${Math.round(ts.ovr)}</b></div></div>
        <div class="lbl">${esc(lg.name)} · ${c.form}</div>`;
      el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { st.l = +b.dataset.l; st.c = 0; render(); });
      el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const n = world.leagues[st.l].clubs.length; st.c = (st.c + +b.dataset.d + n) % n; render(); });
      st.club = c; onChange && onChange(c);
    };
    el.classList.add('panel', 'picker'); render();
  },
  kickoffSelect() {
    const w = this.world(); this.backTo = 's-main';
    $('selTitle').textContent = 'Kick-Off';
    const g = $('selGrid'); g.innerHTML = '<div id="pkH"></div><div id="pkA"></div>';
    const h = { l: 0, c: 0 }, a = { l: 0, c: 1 };
    this.picker($('pkH'), w, h, 'Home'); this.picker($('pkA'), w, a, 'Away');
    let side = 'home';
    const acts = $('selActions');
    const drawActs = () => {
      acts.innerHTML = `<span class="lbl">You control</span><div class="ltabs">${[['home', 'Home'], ['away', 'Away'], ['none', 'Watch CPU v CPU']].map(([k, l]) => `<button class="${side === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div><button class="btn sm" id="selSet">Settings</button><button class="btn pri" id="selGo">Kick off</button>`;
      acts.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { side = b.dataset.s; drawActs(); });
      $('selSet').onclick = () => this.settingsModal();
      $('selGo').onclick = () => {
        if (h.club === a.club) return this.toast('Pick two different clubs.');
        startMatch(this.matchOpts({ home: h.club, away: a.club, user: side === 'none' ? null : side, onEnd: res => this.result(h.club, a.club, res, () => { this.show('s-select'); }) }));
      };
    };
    drawActs(); this.show('s-select');
  },
  // ---------- result ----------
  result(home, away, res, cont, extraHTML) {
    this.show('s-result');
    $('resScore').innerHTML = `<img class="crest lg" src="${crestURL(home)}" alt=""><span>${res.hg}</span><span style="color:var(--muted)">–</span><span>${res.ag}</span><img class="crest lg" src="${crestURL(away)}" alt="">`;
    const sc = side => res.events.filter(e => e.team === side).map(e => `${esc(e.name || (e.pid && (CAREER.pidx && CAREER.pidx[e.pid]) ? pname(CAREER.pidx[e.pid]) : 'Goal'))} ${e.min}'`).join('<br>') || '<span style="color:var(--muted)">—</span>';
    const [H, A] = res.stats || [{}, {}];
    const row = (l, a, b, pct) => { const t = (a + b) || 1; return `<div class="stat-row"><b>${a}${pct ? '%' : ''}</b><div class="mid">${l}<div class="dual"><i style="width:${a / t * 100}%"></i><i style="width:${b / t * 100}%"></i></div></div><b style="text-align:right">${b}${pct ? '%' : ''}</b></div>`; };
    $('resStats').innerHTML = `<div class="grid2" style="gap:8px"><div><h3>${esc(home.name)}</h3><div class="note" style="font-size:14px;color:var(--chalk)">${sc('home')}</div></div><div style="text-align:right"><h3>${esc(away.name)}</h3><div class="note" style="font-size:14px;color:var(--chalk)">${sc('away')}</div></div></div>` +
      (res.poss ? row('Possession', res.poss[0], res.poss[1], true) : '') +
      (H.shots !== undefined ? row('Shots', H.shots, A.shots) + row('On target', H.sot, A.sot) + row('Passes', H.passes, A.passes) + row('Pass accuracy', Math.round(H.passOk / (H.passes || 1) * 100), Math.round(A.passOk / (A.passes || 1) * 100), true) + row('Tackles won', H.tackles, A.tackles) + row('Corners', H.corners, A.corners) + row('Fouls', H.fouls, A.fouls) : '');
    const ex = $('resExtra');
    if (res.pc) {
      const p = res.pc; ex.hidden = false;
      ex.innerHTML = `<div class="row" style="justify-content:space-between"><div><div class="lbl">Your match rating</div><div style="font:800 48px var(--f-disp);color:${p.rating >= 7.5 ? 'var(--amber)' : p.rating >= 6.5 ? 'var(--pitch)' : 'var(--chalk)'}">${p.rating.toFixed(1)}</div></div>
        <div class="kv"><span>Goals</span><b>${p.goals}</b><span>Assists</span><b>${p.assists}</b><span>Shots (on target)</span><b>${p.shots} (${p.sot})</b><span>Passes completed</span><b>${p.passOk}/${p.passes}</b><span>Tackles won</span><b>${p.tackles}</b>${p.saves ? `<span>Saves</span><b>${p.saves}</b>` : ''}</div></div>`;
    } else if (extraHTML) { ex.hidden = false; ex.innerHTML = extraHTML; } else ex.hidden = true;
    $('resGo').onclick = cont;
  },
  pauseMenu(m) {
    const career = !!m.o.career;
    this.modal(`<h2>Paused</h2><p>${esc(m.scoreLine())} · ${m.minute()}'</p>
      <p class="note">WASD/arrows move · Shift sprint · J pass (hold to press, tap to tackle) · K hold to shoot, tap to slide · L through ball · I lob/cross · Q switch · C camera${m.pcMode ? ' · J/L when a teammate has the ball calls for a pass' : ''}</p>`,
      [{ t: 'Resume', cls: 'pri', fn: () => { m.paused = false; } },
      { t: 'Camera', keep: true, fn: () => m.cycleCam() },
      { t: career || m.o.cup ? 'Simulate the rest' : 'Quit match', cls: 'danger', fn: () => { m.paused = false; if (career || m.o.cup) m.simRest(); else { m.dispose(); ENG.onFrame = null; ENG.menuCam = true; CUR = null; this.show('s-select'); } } }], true);
  },
  // ---------- manager career ----------
  managerStart() {
    if (CAREER.hasSave('mgr')) {
      return this.modal('<h2>Manager Career</h2><p>You have a saved career on this device.</p>', [
        { t: 'Continue', cls: 'pri', fn: () => { if (CAREER.load('mgr')) this.openHub('home'); else this.toast('That save could not be read.'); } },
        { t: 'New career', cls: 'danger', fn: () => this.modal('<p>Start again? Your saved manager career will be replaced when you next save.</p>', [{ t: 'Start new', cls: 'pri', fn: () => this.managerPick() }, { t: 'Cancel' }]) }]);
    }
    this.managerPick();
  },
  managerPick() {
    const w = this.world(); this.backTo = 's-main';
    $('selTitle').textContent = 'Choose your club';
    const g = $('selGrid'); g.innerHTML = '<div id="pkM"></div><div class="panel" id="pkInfo"></div>';
    const st = { l: 0, c: 4 };
    this.picker($('pkM'), w, st, 'Manager Career', c => {
      const top = c.squad.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 5);
      $('pkInfo').innerHTML = `<h3>Club overview</h3><div class="kv" style="margin:10px 0"><span>League</span><b>${esc(w.leagues.find(l => l.id === c.league).name)}</b><span>Transfer budget</span><b>${fmtMoney(c.budget)}</b><span>Squad size</span><b>${c.squad.length}</b></div><div class="lbl">Best players</div>
        <table>${top.map(p => `<tr><td><span class="ovr" style="background:${ovrColor(p.ovr)}">${p.ovr}</span></td><td><span class="pos ${POS_GROUP[p.pos]}">${p.pos}</span></td><td>${esc(pname(p))}</td><td class="num">${p.age}</td></tr>`).join('')}</table>`;
    });
    $('selActions').innerHTML = '<button class="btn pri" id="selGo">Start career</button>';
    $('selGo').onclick = () => { const id = st.club.id; CAREER.newManager(id); CAREER.save(); this.openHub('home'); };
    this.show('s-select');
  },
  // ---------- player career ----------
  playerStart() {
    if (CAREER.hasSave('pc')) {
      return this.modal('<h2>Player Career</h2><p>You have a saved player on this device.</p>', [
        { t: 'Continue', cls: 'pri', fn: () => { if (CAREER.load('pc')) this.openHub('home'); else this.toast('That save could not be read.'); } },
        { t: 'New player', cls: 'danger', fn: () => { this.backTo = 's-main'; this.show('s-create'); } }]);
    }
    this.backTo = 's-main'; this.show('s-create');
  },
  playerOffers() {
    const fn = $('pcFirst').value.trim() || 'Leo', ln = $('pcLast').value.trim() || 'Varga', pos = $('pcPos').value, nat = $('pcNat').value, num = clamp(parseInt($('pcNum').value, 10) || 10, 1, 99);
    CAREER.s = null; const offers = CAREER.pcOffers(3);
    this.modal(`<h2>Three clubs want you</h2><p>Pick where ${esc(fn)} ${esc(ln)} starts. Smaller clubs give more minutes.</p>
      <div style="display:flex;flex-direction:column;gap:8px">${offers.map(c => `<button class="tile" style="min-height:0;flex-direction:row;align-items:center;gap:12px;justify-content:flex-start" data-c="${c.id}"><img class="crest" src="${crestURL(c)}" alt=""><span><b style="font-size:20px">${esc(c.name)}</b><br><small>${esc(CAREER.league(c.league).name)} · ${starStr(teamStrength(c).ovr)}</small></span></button>`).join('')}</div>`, [{ t: 'Cancel' }]);
    $('mbox').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { this.closeModal(); CAREER.newPlayer({ fn, ln, pos, nat, num }, b.dataset.c); CAREER.save(); this.openHub('home'); });
  },
  // ---------- hub ----------
  openHub(tab) {
    this.tab = tab || this.tab; const s = CAREER.s, u = CAREER.user();
    this.show('s-hub'); ENG.menuCam = true;
    $('hubCrest').src = crestURL(u);
    if (s.kind === 'pc') { const me = CAREER.me(); $('hubTitle').textContent = pname(me); $('hubSub').textContent = `${me.pos} · ${u.name} · Season ${s.season}/${String(s.season + 1).slice(2)} · Week ${Math.min(s.week + 1, WEEKS)} of ${WEEKS}`; }
    else { $('hubTitle').textContent = u.name; $('hubSub').textContent = `${CAREER.league(u.league).name} · Season ${s.season}/${String(s.season + 1).slice(2)} · Week ${Math.min(s.week + 1, WEEKS)} of ${WEEKS}`; }
    const tabs = s.kind === 'pc' ? [['home', 'Home'], ['train', 'Training'], ['league', 'League'], ['fixtures', 'Fixtures'], ['inbox', 'Inbox'], ['career', 'Career']]
      : [['home', 'Home'], ['squad', 'Squad'], ['transfers', 'Transfers'], ['league', 'League'], ['fixtures', 'Fixtures'], ['inbox', 'Inbox'], ['career', 'History']];
    const unread = s.inbox.filter(m => m.action && !m.done).length;
    $('hubTabs').innerHTML = tabs.map(([k, l]) => `<button class="${this.tab === k ? 'on' : ''}" data-t="${k}">${l}${k === 'inbox' && unread ? ` (${unread})` : ''}</button>`).join('');
    $('hubTabs').querySelectorAll('button').forEach(b => b.onclick = () => this.openHub(b.dataset.t));
    const body = $('hubBody');
    const fn = { home: s.kind === 'pc' ? this.pcHome : this.mgrHome, squad: this.squadTab, transfers: this.transferTab, league: this.leagueTab, fixtures: this.fixturesTab, inbox: this.inboxTab, career: this.careerTab, train: this.trainTab }[this.tab];
    body.innerHTML = ''; fn.call(this, body);
  },
  nextMatchPanel() {
    const f = CAREER.userFixture();
    if (!f) return `<div class="panel"><h3>Season complete</h3><button class="btn pri" id="endSeason" style="margin-top:12px">See the season review</button></div>`;
    const s = CAREER.s;
    let status = '';
    if (s.kind === 'pc') { const set = CAREER.pcMatchSetup(); status = `<p class="note" style="text-align:center">${set.playing ? (set.starter ? 'You are in the starting XI.' : 'You start on the bench and come on around 64\'.') : 'You are not in the matchday squad this week.'}</p>`; }
    return `<div class="panel"><div class="row" style="justify-content:space-between"><h3>Next match</h3><span class="lbl">Matchweek ${s.week + 1} / ${WEEKS}</span></div>
      <div class="fixture"><div class="side"><img class="crest lg" src="${crestURL(f.home)}" alt=""><b>${esc(f.home.name)}</b><span class="lbl">${ordinal(CAREER.position(f.home.id))}</span></div><div class="vs">VS</div><div class="side"><img class="crest lg" src="${crestURL(f.away)}" alt=""><b>${esc(f.away.name)}</b><span class="lbl">${ordinal(CAREER.position(f.away.id))}</span></div></div>
      ${status}<div class="row" style="justify-content:center"><button class="btn pri" id="playM">Play match</button><button class="btn" id="simM">Simulate</button>${s.kind === 'mgr' ? '<button class="btn sm" id="simAll">Sim to season end</button>' : ''}</div></div>`;
  },
  bindNext(body) {
    const p = body.querySelector('#playM'), sm = body.querySelector('#simM'), sa = body.querySelector('#simAll'), es = body.querySelector('#endSeason');
    if (p) p.onclick = () => this.playCareerMatch();
    if (sm) sm.onclick = () => this.simCareerMatch();
    if (sa) sa.onclick = () => this.modal('<p>Simulate every remaining match this season?</p>', [{ t: 'Simulate', cls: 'pri', fn: () => { while (CAREER.s.week < WEEKS) CAREER.playWeek(null); CAREER.save(); this.seasonReview(); } }, { t: 'Cancel' }]);
    if (es) es.onclick = () => this.seasonReview();
  },
  miniTable(lid, hl) {
    const t = CAREER.table(lid), i = t.findIndex(c => c.id === hl);
    const rows = t.map((c, k) => ({ c, k })).filter(({ k }) => k < 4 || Math.abs(k - i) <= 1);
    return `<table><thead><tr><th>#</th><th>Club</th><th class="num">P</th><th class="num">GD</th><th class="num">Pts</th></tr></thead><tbody>${rows.map(({ c, k }) => `<tr class="${c.id === hl ? 'me' : ''}"><td>${k + 1}</td><td><div class="cell-team"><img class="crest sm" src="${crestURL(c)}" alt="">${esc(c.name)}</div></td><td class="num">${c.st.p}</td><td class="num">${c.st.gf - c.st.ga}</td><td class="num"><b>${c.st.pts}</b></td></tr>`).join('')}</tbody></table>`;
  },
  mgrHome(body) {
    const s = CAREER.s, u = CAREER.user(), pos = CAREER.position(u.id);
    body.innerHTML = `<div class="grid2">${this.nextMatchPanel()}
      <div class="panel"><h3>Club</h3><div class="kv" style="margin-top:10px"><span>League position</span><b>${ordinal(pos)} · ${u.st.pts} pts</b><span>Board objective</span><b>${esc(CAREER.objText().replace(/^./, c => c.toUpperCase()))} <span class="pill ${pos <= s.objective ? 'open' : 'shut'}">${pos <= s.objective ? 'on track' : 'behind'}</span></b>
      <span>Transfer budget</span><b>${fmtMoney(s.budget)}</b><span>Transfer window</span><b><span class="pill ${CAREER.windowOpen() ? 'open' : 'shut'}">${CAREER.windowOpen() ? 'Open' : 'Closed'}</span></b><span>Form</span><b>${u.st.form.join(' ') || '—'}</b><span>Team rating</span><b>${Math.round(teamStrength(u).ovr)} · ${u.form}</b></div>
      <div class="row" style="margin-top:12px"><button class="btn sm" id="youth" ${s.youthDone ? 'disabled' : ''}>Youth academy</button><button class="btn sm" id="goSquad">Edit lineup</button></div></div></div>
      <div class="grid2"><div class="panel"><h3>${esc(CAREER.league(u.league).name)}</h3><div class="tbl" style="margin-top:8px">${this.miniTable(u.league, u.id)}</div></div>
      <div class="panel"><h3>Inbox</h3><div class="mail" style="margin-top:8px">${s.inbox.slice(0, 5).map(m => `<div class="${m.read ? 'old' : ''}">${esc(m.text)}</div>`).join('')}</div></div></div>`;
    this.bindNext(body);
    body.querySelector('#goSquad').onclick = () => this.openHub('squad');
    body.querySelector('#youth').onclick = () => this.youthModal();
  },
  youthModal() {
    const list = CAREER.youthProspects();
    this.modal(`<h2>Youth academy</h2><p>Your scouts found three 16-year-olds. Sign one per season.</p><table><thead><tr><th>Player</th><th>Pos</th><th class="num">OVR</th><th class="num">Pot.</th><th></th></tr></thead><tbody>${list.map((p, i) => `<tr><td>${esc(pname(p))}<br><span class="note">${NATS[p.nat]}</span></td><td><span class="pos ${POS_GROUP[p.pos]}">${p.pos}</span></td><td class="num">${p.ovr}</td><td class="num">${p.pot - ri(0, 3)}–${Math.min(95, p.pot + ri(1, 4))}</td><td><button class="btn sm" data-y="${i}">Sign</button></td></tr>`).join('')}</tbody></table>`, [{ t: 'Not now' }]);
    $('mbox').querySelectorAll('[data-y]').forEach(b => b.onclick = () => { CAREER.signYouth(list[+b.dataset.y]); this.closeModal(); this.openHub('home'); });
  },
  squadTab(body) {
    const u = CAREER.user(); lineupPlayers(u); const form = FORMATIONS[u.form];
    const xi = u.xi.map(id => CAREER.player(id)), subs = u.squad.filter(p => !u.xi.includes(p.id)).sort((a, b) => b.ovr - a.ovr);
    const rowP = (p, slot, key) => { const eff = slot ? p.ovr - fitPen(slot, p.pos) : p.ovr; return `<tr class="click ${this.sel === key ? 'sel' : ''}" data-k="${key}"><td>${slot ? `<span class="pos ${POS_GROUP[slot]}">${slot}</span>` : '<span class="lbl">Sub</span>'}</td><td>${esc(pname(p))}</td><td><span class="pos ${POS_GROUP[p.pos]}">${p.pos}</span></td><td class="num"><span class="ovr" style="background:${ovrColor(eff)}">${eff}</span></td><td class="num">${p.age}</td><td class="num">${p.apps}</td><td class="num">${p.g}</td><td class="num">${p.apps ? (p.rt / p.apps).toFixed(1) : '—'}</td><td class="num">${fmtMoney(p.val)}</td></tr>`; };
    body.innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><div class="row"><label class="lbl" for="formSel">Formation</label><select id="formSel">${Object.keys(FORMATIONS).map(f => `<option ${f === u.form ? 'selected' : ''}>${f}</option>`).join('')}</select><button class="btn sm" id="autoXI">Auto-pick best XI</button></div><span class="note">Tap a player, then tap another to swap them.</span></div>
      <div class="tbl" style="margin-top:10px"><table><thead><tr><th>Slot</th><th>Name</th><th>Pos</th><th class="num">OVR</th><th class="num">Age</th><th class="num">Apps</th><th class="num">Gls</th><th class="num">Avg</th><th class="num">Value</th></tr></thead><tbody>
      ${xi.map((p, i) => rowP(p, form[i][0], 'x' + i)).join('')}<tr><td colspan="9" class="lbl" style="padding-top:14px">Substitutes &amp; reserves</td></tr>${subs.map(p => rowP(p, null, 's' + p.id)).join('')}</tbody></table></div></div>`;
    body.querySelector('#formSel').onchange = e => { u.form = e.target.value; autoLineup(u); this.openHub('squad'); };
    body.querySelector('#autoXI').onclick = () => { autoLineup(u); this.openHub('squad'); };
    body.querySelectorAll('tr[data-k]').forEach(tr => tr.onclick = () => {
      const k = tr.dataset.k;
      if (!this.sel) { this.sel = k; return this.openHub('squad'); }
      if (this.sel === k) { this.sel = null; return this.openHub('squad'); }
      const a = this.sel, b = k; this.sel = null;
      const val = key => key[0] === 'x' ? u.xi[+key.slice(1)] : +key.slice(1);
      const va = val(a), vb = val(b);
      if (a[0] === 'x' && b[0] === 'x') { u.xi[+a.slice(1)] = vb; u.xi[+b.slice(1)] = va; }
      else if (a[0] === 'x') u.xi[+a.slice(1)] = vb; else if (b[0] === 'x') u.xi[+b.slice(1)] = va;
      this.openHub('squad');
    });
  },
  transferTab(body) {
    const s = CAREER.s, u = CAREER.user(), f = this.mkt;
    const list = CAREER.marketList({ pos: f.pos, league: f.league, max: f.max });
    const scout = p => { const spread = p.age < 24 ? 3 : 1; return p.pot - spread + '–' + Math.min(95, p.pot + spread); };
    body.innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><div class="row"><span class="pill ${CAREER.windowOpen() ? 'open' : 'shut'}">Window ${CAREER.windowOpen() ? 'open' : 'closed'}</span><b>Budget ${fmtMoney(s.budget)}</b></div>
      <div class="row"><select id="fPos" aria-label="Position"><option value="">All positions</option>${['GK', 'D', 'M', 'F', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'].map(p => `<option value="${p}" ${f.pos === p ? 'selected' : ''}>${{ D: 'Defenders', M: 'Midfielders', F: 'Forwards' }[p] || p}</option>`).join('')}</select>
      <select id="fLg" aria-label="League"><option value="">All leagues</option>${s.leagues.map(l => `<option value="${l.id}" ${f.league === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      <select id="fMax" aria-label="Max value">${[2, 5, 10, 20, 40, 60, 100, 250].map(v => `<option value="${v}" ${f.max === v ? 'selected' : ''}>Up to ${fmtMoney(v)}</option>`).join('')}</select></div></div>
      <div class="tbl" style="margin-top:10px;max-height:460px;overflow:auto"><table><thead><tr><th>Name</th><th>Club</th><th>Pos</th><th class="num">OVR</th><th class="num">Pot.</th><th class="num">Age</th><th class="num">Value</th><th></th></tr></thead><tbody>
      ${list.map(p => { const c = CAREER.club(p.club); return `<tr><td>${esc(pname(p))}</td><td><div class="cell-team"><img class="crest sm" src="${crestURL(c)}" alt="">${esc(c.abbr)}</div></td><td><span class="pos ${POS_GROUP[p.pos]}">${p.pos}</span></td><td class="num"><span class="ovr" style="background:${ovrColor(p.ovr)}">${p.ovr}</span></td><td class="num">${scout(p)}</td><td class="num">${p.age}</td><td class="num">${fmtMoney(p.val)}</td><td><button class="btn sm" data-b="${p.id}">Bid</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="note">No players match these filters.</td></tr>'}</tbody></table></div></div>
      <div class="panel"><h3>Sell players</h3><div class="tbl" style="margin-top:8px;max-height:320px;overflow:auto"><table><tbody>${u.squad.slice().sort((a, b) => b.ovr - a.ovr).map(p => `<tr><td><span class="pos ${POS_GROUP[p.pos]}">${p.pos}</span></td><td>${esc(pname(p))}</td><td class="num">${p.ovr}</td><td class="num">${p.age}</td><td class="num">${fmtMoney(p.val)}</td><td><button class="btn sm" data-s="${p.id}">Find buyer</button></td></tr>`).join('')}</tbody></table></div></div>`;
    body.querySelector('#fPos').onchange = e => { f.pos = e.target.value; this.openHub('transfers'); };
    body.querySelector('#fLg').onchange = e => { f.league = e.target.value; this.openHub('transfers'); };
    body.querySelector('#fMax').onchange = e => { f.max = +e.target.value; this.openHub('transfers'); };
    body.querySelectorAll('[data-b]').forEach(b => b.onclick = () => this.bidModal(+b.dataset.b));
    body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      if (!CAREER.windowOpen()) return this.toast('The transfer window is closed.');
      const o = CAREER.quickSellOffer(+b.dataset.s), p = CAREER.player(+b.dataset.s);
      this.modal(`<h2>Offer received</h2><p>${esc(o.club.name)} offer ${fmtMoney(o.amt)} for ${esc(pname(p))} (value ${fmtMoney(p.val)}).</p>`, [{ t: 'Accept', cls: 'pri', fn: () => { const r = CAREER.sell(p.id, o.club.id, o.amt); this.toast(r.msg); this.openHub('transfers'); } }, { t: 'Reject' }]);
    });
  },
  bidModal(pid) {
    const p = CAREER.player(pid), c = CAREER.club(p.club); let amt = +(p.val).toFixed(2);
    const draw = (note = '') => {
      this.modal(`<h2>Bid for ${esc(pname(p))}</h2><p>${p.pos} · ${p.ovr} OVR · age ${p.age} · ${esc(c.name)} · value ${fmtMoney(p.val)}</p>
        <div class="row" style="justify-content:center"><button class="btn" id="bm">−</button><b style="font:800 32px var(--f-disp);min-width:130px;text-align:center">${fmtMoney(amt)}</b><button class="btn" id="bp">+</button></div><p class="note" style="text-align:center">Budget ${fmtMoney(CAREER.s.budget)}</p>${note ? `<p style="color:var(--amber2)">${esc(note)}</p>` : ''}`,
        [{ t: 'Submit offer', cls: 'pri', keep: true, fn: () => { const r = CAREER.bid(pid, amt); if (r.ok) { this.closeModal(); this.toast(r.msg); this.openHub('transfers'); } else { if (r.counter) amt = Math.max(amt, r.counter); draw(r.msg + (r.counter ? ` Try ${fmtMoney(r.counter)}.` : '')); } } }, { t: 'Cancel' }]);
      $('bm').onclick = () => { amt = Math.max(.05, +(amt - p.val * .05).toFixed(2)); draw(note); };
      $('bp').onclick = () => { amt = +(amt + p.val * .05).toFixed(2); draw(note); };
    };
    draw();
  },
  leagueTab(body) {
    const s = CAREER.s, u = CAREER.user(); const lid = this.lgTab || u.league;
    const t = CAREER.table(lid);
    const scorers = CAREER.leagueClubs(lid).flatMap(c => c.squad).filter(p => p.g > 0).sort((a, b) => b.g - a.g || b.a - a.a).slice(0, 10);
    body.innerHTML = `<div class="ltabs">${s.leagues.map(l => `<button class="${l.id === lid ? 'on' : ''}" data-l="${l.id}">${esc(l.name)}</button>`).join('')}</div>
      <div class="grid2" style="grid-template-columns:3fr 2fr"><div class="panel tbl"><table><thead><tr><th>#</th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF</th><th class="num">GA</th><th class="num">GD</th><th class="num">Pts</th><th>Form</th></tr></thead><tbody>
      ${t.map((c, i) => `<tr class="${c.id === u.id ? 'me' : ''} ${i < 4 ? 'zone-cl' : i >= 8 ? 'zone-rel' : ''}"><td>${i + 1}</td><td><div class="cell-team"><img class="crest sm" src="${crestURL(c)}" alt="">${esc(c.name)}</div></td><td class="num">${c.st.p}</td><td class="num">${c.st.w}</td><td class="num">${c.st.d}</td><td class="num">${c.st.l}</td><td class="num">${c.st.gf}</td><td class="num">${c.st.ga}</td><td class="num">${c.st.gf - c.st.ga}</td><td class="num"><b>${c.st.pts}</b></td><td>${c.st.form.join('')}</td></tr>`).join('')}</tbody></table>
      <p class="note">Blue: top four. Red: bottom two (no relegation in this build).</p></div>
      <div class="panel tbl"><h3>Top scorers</h3><table style="margin-top:8px"><tbody>${scorers.map((p, i) => `<tr class="${p.club === u.id ? 'me' : ''}"><td>${i + 1}</td><td>${esc(pname(p))}</td><td>${esc(CAREER.club(p.club).abbr)}</td><td class="num"><b>${p.g}</b></td><td class="num note">${p.a} ast</td></tr>`).join('') || '<tr><td class="note">No goals yet.</td></tr>'}</tbody></table></div></div>`;
    body.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { this.lgTab = b.dataset.l; this.openHub('league'); });
  },
  fixturesTab(body) {
    const s = CAREER.s, u = CAREER.user();
    const rows = s.fixtures[u.league].map((rd, w) => {
      const f = rd.find(m => m[0] === u.id || m[1] === u.id); const h = CAREER.club(f[0]), a = CAREER.club(f[1]);
      const r = (s.results[u.league][w] || []).find(x => x.h === f[0]);
      let res = w === s.week ? '<span class="pill open">Next</span>' : '<span class="note">—</span>';
      if (r) { const us = h.id === u.id ? r.hg : r.ag, them = h.id === u.id ? r.ag : r.hg; res = `<b>${r.hg}–${r.ag}</b> <span class="pill" style="background:${us > them ? '#2f9e5f' : us < them ? '#e5484d88' : '#ffffff22'}">${us > them ? 'W' : us < them ? 'L' : 'D'}</span>`; }
      return `<tr class="${w === s.week ? 'me' : ''}"><td>${w + 1}</td><td><div class="cell-team"><img class="crest sm" src="${crestURL(h)}" alt="">${esc(h.name)}</div></td><td>${res}</td><td><div class="cell-team"><img class="crest sm" src="${crestURL(a)}" alt="">${esc(a.name)}</div></td><td class="note">${r ? esc(r.ev.map(e => e.n + ' ' + e.m + "'").join(', ')) : ''}</td></tr>`;
    });
    body.innerHTML = `<div class="panel tbl"><table><thead><tr><th>Wk</th><th>Home</th><th>Result</th><th>Away</th><th>Scorers</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  },
  inboxTab(body) {
    const s = CAREER.s;
    body.innerHTML = `<div class="panel"><div class="mail" style="max-height:none">${s.inbox.map((m, i) => `<div class="${m.done || (!m.action && m.read) ? 'old' : ''}"><span class="lbl">${m.season} · Week ${m.w + 1}</span><br>${esc(m.text)}${m.action && !m.done ? `<div class="row" style="margin-top:8px"><button class="btn sm pri" data-a="${i}">Accept</button><button class="btn sm" data-r="${i}">Decline</button></div>` : ''}</div>`).join('') || '<div>No messages.</div>'}</div></div>`;
    s.inbox.forEach(m => m.read = true);
    body.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const m = s.inbox[+b.dataset.a]; m.done = true; const a = m.action;
      if (a.type === 'bid') { if (!CAREER.player(a.pid) || CAREER.player(a.pid).club !== s.userClub) return this.toast('That player has already left.'); if (!CAREER.windowOpen()) return this.toast('The window has closed, so the bid lapsed.'); const r = CAREER.sell(a.pid, a.club, a.amt); this.toast(r.msg); }
      if (a.type === 'pcoffer') { const me = CAREER.me(); CAREER.joinClub(me, a.club); s.userClub = a.club; CAREER.mail(`You have joined ${CAREER.club(a.club).name}.`); s.inbox.forEach(x => { if (x.action && x.action.type === 'pcoffer') x.done = true; }); this.toast(`Welcome to ${CAREER.club(a.club).name}.`); }
      this.openHub('inbox');
    });
    body.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { s.inbox[+b.dataset.r].done = true; this.openHub('inbox'); });
  },
  careerTab(body) {
    const s = CAREER.s;
    if (s.kind === 'pc') {
      const me = CAREER.me();
      body.innerHTML = `<div class="panel tbl"><h3>Career history</h3><table style="margin-top:8px"><thead><tr><th>Season</th><th>Club</th><th class="num">Apps</th><th class="num">Goals</th><th class="num">Assists</th><th class="num">Avg</th><th class="num">OVR</th></tr></thead><tbody>${s.history.map(h => `<tr><td>${h.season}</td><td>${esc(h.club)} ${h.champ ? '🏆' : ''}</td><td class="num">${h.apps}</td><td class="num">${h.g}</td><td class="num">${h.a}</td><td class="num">${h.avg.toFixed(2)}</td><td class="num">${h.ovr}</td></tr>`).join('') || '<tr><td colspan="7" class="note">Finish a season to see it here.</td></tr>'}</tbody></table>
        <div class="kv" style="margin-top:14px"><span>Career goals</span><b>${me.cg || 0}</b><span>Career assists</span><b>${me.ca || 0}</b><span>Market value</span><b>${fmtMoney(me.val)}</b></div></div>`;
    } else {
      body.innerHTML = `<div class="panel tbl"><h3>Manager history</h3><table style="margin-top:8px"><thead><tr><th>Season</th><th>Club</th><th class="num">Finish</th><th class="num">Pts</th></tr></thead><tbody>${s.history.map(h => `<tr><td>${h.season}</td><td>${esc(h.club)} ${h.champ ? '🏆' : ''}</td><td class="num">${ordinal(h.pos)}</td><td class="num">${h.pts}</td></tr>`).join('') || '<tr><td colspan="4" class="note">Finish a season to see it here.</td></tr>'}</tbody></table></div>`;
    }
  },
  pcHome(body) {
    const s = CAREER.s, me = CAREER.me(), u = CAREER.user();
    const avg = CAREER.avgRating(me);
    body.innerHTML = `<div class="grid3" style="grid-template-columns:auto 1fr 1fr"><div class="card"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="o">${me.ovr}</div><div class="p">${me.pos}</div></div><img class="crest" src="${crestURL(u)}" alt=""></div>
      <div class="n">${esc(me.ln)}</div><div class="at">${ATTR.map((k, i) => `<span>${me.att[k]} ${ATTR_LBL[i]}</span>`).join('')}</div></div>
      <div class="panel"><h3>This season</h3><div class="kv" style="margin-top:10px"><span>Appearances</span><b>${me.apps}</b><span>Goals</span><b>${me.g}</b><span>Assists</span><b>${me.a}</b><span>Avg rating</span><b>${me.apps ? avg.toFixed(2) : '—'}</b><span>Age</span><b>${me.age}</b><span>Potential</span><b>${me.pot - 2}–${Math.min(95, me.pot + 2)}</b><span>Value</span><b>${fmtMoney(me.val)}</b></div>
      <div class="lbl" style="margin-top:12px">Progress to next overall point</div><div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, me.xp || 0)}%"></i></div></div>
      ${this.nextMatchPanel()}</div>
      <div class="grid2"><div class="panel"><h3>${esc(CAREER.league(u.league).name)}</h3><div class="tbl" style="margin-top:8px">${this.miniTable(u.league, u.id)}</div></div>
      <div class="panel"><h3>Inbox</h3><div class="mail" style="margin-top:8px">${s.inbox.slice(0, 5).map(m => `<div class="${m.read ? 'old' : ''}">${esc(m.text)}</div>`).join('')}</div>${s.pc.trained ? '' : '<button class="btn sm" style="margin-top:10px" id="goTrain">Train this week</button>'}</div></div>`;
    this.bindNext(body);
    const gt = body.querySelector('#goTrain'); if (gt) gt.onclick = () => this.openHub('train');
  },
  trainTab(body) {
    const s = CAREER.s, me = CAREER.me(); me.axp = me.axp || {};
    const drills = { pac: 'Sprint ladders', sho: 'Finishing drill', pas: 'Rondo passing', dri: 'Cone dribbling', def: 'Tackling & positioning', phy: 'Gym & stamina' };
    body.innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><h3>Weekly training</h3><span class="pill ${s.pc.trained ? 'shut' : 'open'}">${s.pc.trained ? 'Done this week' : '1 session available'}</span></div>
      <p class="note">One session per matchweek. Younger players learn faster. Each attribute point you gain also moves your overall, depending on your position.</p>
      <div class="bars" style="margin-top:12px">${ATTR.map((k, i) => `<span><b>${ATTR_LBL[i]}</b> ${me.att[k]}</span><div class="bar"><i style="width:${Math.min(100, me.axp[k] || 0)}%"></i></div><button class="btn sm" data-tr="${k}" ${s.pc.trained ? 'disabled' : ''}>${drills[k]}</button>`).join('')}</div></div>`;
    body.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => { const r = CAREER.train(b.dataset.tr); if (r) this.toast(`Session complete: +${r.gain}% progress${r.up ? `, ${ATTR_LBL[ATTR.indexOf(b.dataset.tr)]} +${r.up}` : ''}${r.ovrUp > 0 ? `, overall +${r.ovrUp}` : ''}.`); this.openHub('train'); });
  },
  // ---------- playing career matches ----------
  playCareerMatch() {
    const s = CAREER.s, f = CAREER.userFixture(); if (!f) return;
    let extra = {};
    if (s.kind === 'pc') {
      const set = CAREER.pcMatchSetup();
      if (!set.playing) return this.modal('<p>You are not in the squad this week. The match will be simulated.</p>', [{ t: 'Simulate', cls: 'pri', fn: () => this.simCareerMatch() }, { t: 'Cancel' }]);
      extra = { pcId: CAREER.me().id, startMin: set.startMin };
      if (set.xi) extra[f.userSide + 'XI'] = set.xi;
      if (!set.starter) extra.pcSubFlag = true;
    }
    const opts = this.matchOpts(Object.assign({ home: f.home, away: f.away, user: f.userSide, career: true, onEnd: res => {
      if (extra.pcSubFlag) res.pcSub = { club: CAREER.user().id, pid: CAREER.me().id };
      const out = CAREER.playWeek(res); CAREER.save();
      this.result(f.home, f.away, res, () => out.seasonOver ? this.seasonReview() : this.openHub('home'));
    } }, extra));
    if (s.kind === 'pc' && extra.startMin) this.modal(`<p>You start on the bench. You come on at ${extra.startMin}'. Make it count.</p>`, [{ t: 'Warm up', cls: 'pri', fn: () => startMatch(opts) }], true);
    else startMatch(opts);
  },
  simCareerMatch() {
    const f = CAREER.userFixture(); if (!f) return;
    const out = CAREER.playWeek(null); CAREER.save();
    const r = out.userResult;
    const res = (CAREER.s.results[f.home.league][CAREER.s.week - 1] || []).find(x => x.h === f.home.id);
    const evs = res ? res.ev : [];
    const sc = id => evs.filter(e => e.c === id).map(e => `${esc(e.n)} ${e.m}'`).join('<br>') || '—';
    this.modal(`<div class="lbl" style="text-align:center">Simulated result</div><div class="bigscore" style="font-size:48px"><img class="crest" src="${crestURL(r.home)}" alt="">${r.hg} – ${r.ag}<img class="crest" src="${crestURL(r.away)}" alt=""></div>
      <div class="grid2" style="gap:8px"><div class="note" style="color:var(--chalk)">${sc(r.home.id)}</div><div class="note" style="text-align:right;color:var(--chalk)">${sc(r.away.id)}</div></div>${out.pcRating ? `<p>Your rating: <b>${out.pcRating.toFixed(1)}</b></p>` : ''}`,
      [{ t: 'Continue', cls: 'pri', fn: () => out.seasonOver ? this.seasonReview() : this.openHub('home') }]);
  },
  seasonReview() {
    const sum = CAREER.endSeason(); CAREER.save();
    const champs = sum.champions.map(c => `<tr><td>${esc(c.league)}</td><td><div class="cell-team"><img class="crest sm" src="${crestURL(c.club)}" alt="">${esc(c.club.name)}</div></td></tr>`).join('');
    let mine = '';
    if (CAREER.s.kind === 'mgr') mine = `<p>You finished <b>${ordinal(sum.pos)}</b> in the ${esc(sum.league)}. Target was ${ordinal(sum.objective)} or better: <b>${sum.met ? 'objective met' : 'objective missed'}</b>. Prize money: ${fmtMoney(sum.prize)}.</p>`;
    else mine = `<p>Your season: ${sum.me.apps} apps, ${sum.me.g} goals, ${sum.me.a} assists, average rating ${sum.me.avg ? sum.me.avg.toFixed(2) : '—'}. Club finished ${ordinal(sum.pos)}.</p>`;
    this.modal(`<h2>Season review</h2>${mine}${sum.boot ? `<p class="note">Golden boot: ${esc(pname(sum.boot))} (${sum.boot.g} goals)</p>` : ''}<div class="lbl">Champions</div><table>${champs}</table>`,
      [{ t: 'Next season', cls: 'pri', fn: () => { if (sum.sacked) this.sackedModal(); else { CAREER.save(); this.openHub('home'); } } }], true);
  },
  sackedModal() {
    const offers = CAREER.jobOffers();
    this.modal(`<h2>You have been sacked</h2><p>The board expected far better. Three clubs have offered you a job.</p><div style="display:flex;flex-direction:column;gap:8px">${offers.map(c => `<button class="tile" style="min-height:0;flex-direction:row;align-items:center;gap:12px;justify-content:flex-start" data-c="${c.id}"><img class="crest" src="${crestURL(c)}" alt=""><span><b style="font-size:20px">${esc(c.name)}</b><br><small>${esc(CAREER.league(c.league).name)}</small></span></button>`).join('')}</div>`, [], true);
    $('mbox').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { this.closeModal(); CAREER.takeJob(b.dataset.c); CAREER.save(); this.openHub('home'); });
  },
  // ---------- cup ----------
  cupSelect() {
    const w = this.world(); this.backTo = 's-main';
    $('selTitle').textContent = 'Tournament: pick your club';
    const g = $('selGrid'); g.innerHTML = '<div id="pkC"></div><div class="panel"><h3>Kickline Cup</h3><p class="note" style="margin-top:8px;font-size:14px">Eight clubs from across all nine leagues. Quarter-finals, semi-finals and a final. Single matches; a draw goes to a penalty shootout.</p></div>';
    const st = { l: 0, c: 0 }; this.picker($('pkC'), w, st, 'Your club');
    $('selActions').innerHTML = '<button class="btn pri" id="selGo">Enter the cup</button>';
    $('selGo').onclick = () => { CUP.start(st.club, w); this.cupScreen(); };
    this.show('s-select');
  },
  cupScreen() {
    const s = CUP.s; this.show('s-cup');
    const cols = [];
    for (let r = 0; r < 3; r++) {
      const ids = s.rounds[r], res = s.results[r];
      let html = `<div class="rd"><div class="lbl">${CUP.roundNames[r]}</div>`;
      if (ids) for (let i = 0; i < ids.length; i += 2) {
        const h = CUP.club(ids[i]), a = CUP.club(ids[i + 1]), x = res && res[i / 2];
        html += `<div class="tie"><div class="${x && x.w === h.id ? 'w' : ''}"><span>${esc(h.name)}</span><span>${x ? x.hg : ''}</span></div><div class="${x && x.w === a.id ? 'w' : ''}"><span>${esc(a.name)}</span><span>${x ? x.ag : ''}</span></div>${x && x.pens ? `<div class="note">Pens ${x.pens[0]}–${x.pens[1]}</div>` : ''}</div>`;
      } else html += '<div class="tie note">To be decided</div>';
      cols.push(html + '</div>');
    }
    cols.push(`<div class="rd"><div class="lbl">Winner</div>${s.winner ? `<div class="tie" style="text-align:center"><img class="crest lg" src="${crestURL(CUP.club(s.winner))}" alt=""><div style="justify-content:center"><b>${esc(CUP.club(s.winner).name)}</b></div></div>` : '<div class="tie note">—</div>'}</div>`);
    $('cupBracket').innerHTML = cols.join('');
    const a = $('cupActions');
    if (s.done || s.out) { a.innerHTML = `<p>${s.winner === s.user ? 'You won the Kickline Cup!' : s.out ? 'Knocked out.' : ''}</p><button class="btn pri" id="cupAgain">Back to menu</button>`; $('cupAgain').onclick = () => { CUP.s = null; this.show('s-main'); }; return; }
    const t = CUP.userTie();
    a.innerHTML = `<b>${CUP.roundNames[CUP.currentRound()]}: ${esc(t.home.name)} v ${esc(t.away.name)}</b><button class="btn pri" id="cupPlay">Play</button><button class="btn" id="cupSim">Simulate</button>`;
    const after = (res) => { const ut = CUP.playRound(res); return ut; };
    $('cupPlay').onclick = () => startMatch(this.matchOpts({ home: t.home, away: t.away, user: t.side, cup: true, onEnd: res => {
      const ut = after(res); const pens = ut.pens ? `<p style="text-align:center">Level after 90 minutes. ${esc(CUP.club(ut.w).name)} win ${Math.max(...ut.pens)}–${Math.min(...ut.pens)} on penalties.</p>` : '';
      this.result(t.home, t.away, res, () => this.cupScreen(), pens);
    } }));
    $('cupSim').onclick = () => { after(null); this.cupScreen(); };
  }
};
window.addEventListener('load', () => UI.init());
if (document.readyState === 'complete') UI.init();
