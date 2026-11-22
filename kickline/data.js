'use strict';
/* ===== Kickline 27 — data: leagues, clubs, players, formations, sim ===== */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let R = Math.random;
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const rf = (a, b) => a + R() * (b - a);
const pick = a => a[Math.floor(R() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const NAMES = {
  en: { f: 'Jack Harry Oliver George Charlie Alfie Jacob Mason Callum Reece Tom Luke Kieran Owen Declan Ryan Ben Joe Liam Elliot Marcus Jordan Kyle Aaron Nathan'.split(' '), l: 'Walker Hughes Barrett Collins Fenwick Ashworth Pritchard Holloway Doyle Marsh Sutton Kendall Rowe Thornton Blake Carver Ellison Gray Haynes Lowe Mercer Norris Penn Quinn Royle Shaw Tierney Wade'.split(' ') },
  es: { f: 'Pablo Diego Álvaro Iker Sergio Javi Marcos Adrián Rubén Hugo Raúl Dani Mario Unai Gonzalo Carlos Álex Íñigo Nico Rodri'.split(' '), l: 'García Moreno Navarro Iglesias Castillo Ortega Romero Delgado Vidal Herrera Serrano Cabrera Fuentes Blanco Morales Lozano Pastor Reyes Soler Bravo Gil Campos'.split(' ') },
  it: { f: 'Luca Marco Matteo Lorenzo Andrea Federico Giorgio Davide Simone Alessandro Nicolò Riccardo Tommaso Gianluca Fabio Pietro Stefano Ciro'.split(' '), l: 'Rossi Bianchi Ferrara Esposito Romano Colombo Ricci Marino Greco Bruno Gallo Conti Mancini Costa Fontana Rinaldi Caruso Moretti Barbieri Lombardi'.split(' ') },
  de: { f: 'Lukas Leon Jonas Felix Maximilian Niklas Tim Julian Florian Jan Kai Tobias Moritz Paul Marvin Timo Dennis Elias'.split(' '), l: 'Müller Schmidt Wagner Becker Hoffmann Schulz Koch Richter Klein Wolf Neumann Schwarz Braun Krüger Hartmann Lange Werner Vogel Brandt Keller'.split(' ') },
  fr: { f: 'Hugo Lucas Théo Antoine Mathis Kylian Ousmane Nathan Enzo Jules Yanis Rayan Bastien Clément Moussa Adrien Benoît Florian'.split(' '), l: 'Martin Bernard Dubois Laurent Lefèvre Moreau Girard Rousseau Fontaine Chevalier Mercier Blanc Garnier Faure Diallo Camara Traoré Lemaire Perrin Roux'.split(' ') },
  nl: { f: 'Daan Sem Luuk Milan Thijs Jesse Bram Ruben Lars Stijn Joey Kevin Wout Bas Tijn Jurriën'.split(' '), l: 'de Jong Jansen de Vries van Dijk Bakker Visser Smit Meijer de Boer Mulder Bos Vos Peters Hendriks van Leeuwen Dekker Brouwer Kok'.split(' ') },
  pt: { f: 'João Rui Diogo Tiago Gonçalo Rafael Bruno Nuno Pedro André Vitinha Francisco Rúben Bernardo Fábio Hélder'.split(' '), l: 'Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Sousa Fernandes Gomes Lopes Marques Alves Ribeiro Pinto Carvalho Teixeira'.split(' ') },
  ar: { f: 'Lautaro Julián Enzo Thiago Facundo Matías Nahuel Agustín Gonzalo Franco Lisandro Joaquín Ezequiel Valentín Leandro Santiago'.split(' '), l: 'González Rodríguez Fernández López Martínez Sosa Acosta Benítez Medina Romero Gutiérrez Domínguez Ríos Figueroa Correa Paredes Vega Molina'.split(' ') },
  us: { f: 'Tyler Brandon Josh Cody Chris Landon Austin Cole Hunter Wyatt Jalen Mason Dylan Gavin Trent Malik DeAndre'.split(' '), l: 'Johnson Miller Davis Wilson Anderson Taylor Thomas Moore Jackson White Harris Clark Lewis Robinson Young Allen King Wright'.split(' ') },
  br: { f: 'Gabriel Lucas Matheus Vinícius Rodrygo Thiago Bruno Éder Rafinha Caio Igor Douglas Wesley Danilo'.split(' '), l: 'Souza Lima Barbosa Rocha Dias Nascimento Moraes Cardoso Monteiro Freitas Mendes Vieira Araújo Cunha'.split(' ') },
  ng: { f: 'Victor Samuel Ademola Kelechi Wilfred Taiwo Chidi Emeka Femi Tunde'.split(' '), l: 'Okafor Adeyemi Eze Nwosu Balogun Okonkwo Iwobi Onyeka Adebayo Uche'.split(' ') }
};
const NATS = { en: 'England', es: 'Spain', it: 'Italy', de: 'Germany', fr: 'France', nl: 'Netherlands', pt: 'Portugal', ar: 'Argentina', us: 'USA', br: 'Brazil', ng: 'Nigeria' };

// [name, abbr, primary, secondary, pattern]
const LEAGUE_DEFS = [
  { id: 'ENG', name: 'Albion Premier', nat: 'en', base: 79, clubs: [
    ['Northbridge City', 'NBC', '#6cabdd', '#ffffff', 'plain'], ['Ravensmoor United', 'RAV', '#c8102e', '#111111', 'plain'], ['Kingsport Rovers', 'KPR', '#034694', '#ffffff', 'plain'],
    ['Ashford Athletic', 'ASH', '#ef0107', '#ffffff', 'sleeves'], ['Blackwater Town', 'BLK', '#1d1d1d', '#e8c547', 'stripes'], ['Harrowgate FC', 'HAR', '#132257', '#ffffff', 'plain'],
    ['Thornbury Wanderers', 'THW', '#fdb913', '#231f20', 'plain'], ['Westcliff Albion', 'WCA', '#7a263a', '#95bfe5', 'sleeves'], ['Ironvale United', 'IRV', '#f78f1e', '#000000', 'plain'], ['Saxonford City', 'SXC', '#00a650', '#ffffff', 'hoops']] },
  { id: 'ESP', name: 'Liga Solar', nat: 'es', base: 78, clubs: [
    ['Real Valdoro', 'RVD', '#f4f4f4', '#d4af37', 'plain'], ['Atlético Montenar', 'ATM', '#cb3524', '#ffffff', 'stripes'], ['CD Puerto Azul', 'PAZ', '#1f4fa3', '#ffffff', 'plain'],
    ['Sporting Alcázar', 'ALC', '#e9c46a', '#7a1f1f', 'plain'], ['Deportivo Sierra', 'DSI', '#2a9d8f', '#ffffff', 'halves'], ['Racing Calvera', 'RCA', '#0b6e4f', '#ffffff', 'stripes'],
    ['UD Toreno', 'TOR', '#d62828', '#fcbf49', 'plain'], ['Unión Brava', 'UNB', '#5e2b97', '#ffd166', 'sash'], ['CF Marisol', 'MAR', '#00b4d8', '#03045e', 'plain'], ['Club Lumbre', 'LUM', '#f77f00', '#1d1d1d', 'plain']] },
  { id: 'ITA', name: 'Serie Aurea', nat: 'it', base: 78, clubs: [
    ['AC Vellano', 'VEL', '#c8102e', '#111111', 'stripes'], ['Inter Castellara', 'INC', '#0050a0', '#111111', 'stripes'], ['Fortezza 1906', 'FOR', '#151515', '#ffffff', 'stripes'],
    ['AS Lumina', 'ASL', '#8e1f2f', '#f0b323', 'plain'], ['Aquila Romagna', 'AQR', '#6cace4', '#ffffff', 'plain'], ['US Montalto', 'MON', '#4b2e83', '#ffffff', 'plain'],
    ['Virtus Brescello', 'VIR', '#1b5e20', '#ffffff', 'halves'], ['Calcio Varenna', 'VAR', '#ffcd00', '#0033a0', 'plain'], ['Sporting Ferraro', 'FER', '#e4572e', '#ffffff', 'sash'], ['FC Torreverde', 'TRV', '#2e7d32', '#f2f2f2', 'hoops']] },
  { id: 'GER', name: 'Kaiser Liga', nat: 'de', base: 77, clubs: [
    ['FC Steinburg', 'STB', '#dc052d', '#ffffff', 'plain'], ['Borussia Waldheim', 'BOW', '#fde100', '#111111', 'plain'], ['SV Rheinau', 'RHE', '#005ca9', '#ffffff', 'plain'],
    ['Eintracht Falkenau', 'EFA', '#e1000f', '#111111', 'halves'], ['VfB Lindenfeld', 'VLI', '#f4f4f4', '#e32219', 'sash'], ['TSV Hohenwald', 'HOH', '#00843d', '#ffffff', 'plain'],
    ['Fortuna Mühlbach', 'FMB', '#d50032', '#ffffff', 'stripes'], ['Union Eisenthal', 'UNE', '#b00020', '#f1c40f', 'plain'], ['SC Bergstadt', 'BSC', '#1d3c84', '#ffffff', 'hoops'], ['Dynamo Kaltenfeld', 'DKF', '#0a4595', '#c5c5c5', 'plain']] },
  { id: 'FRA', name: 'Ligue Étoile', nat: 'fr', base: 76, clubs: [
    ['Étoile Saint-Lys', 'ESL', '#004170', '#da291c', 'sash'], ['Olympique Marsac', 'OMA', '#2faee0', '#ffffff', 'plain'], ['AS Belvoir', 'ASB', '#e30613', '#ffffff', 'plain'],
    ['Stade Rivoire', 'SRI', '#151515', '#c8102e', 'stripes'], ['Racing Clairmont', 'RCL', '#fdd406', '#00447c', 'plain'], ['US Montaigne', 'USM', '#00a651', '#ffffff', 'plain'],
    ['SC Aubervault', 'SCA', '#7b2d8e', '#ffffff', 'halves'], ['FC Lumière', 'FCL', '#f39200', '#2b2b2b', 'plain'], ['Mistral FC', 'MIS', '#4fb3e8', '#102a43', 'hoops'], ['Union Vauclerc', 'UVA', '#9b1b30', '#e5c07b', 'plain']] },
  { id: 'NED', name: 'Lowlands Liga', nat: 'nl', base: 73, clubs: [
    ['FC Dijkstad', 'DIJ', '#d2122e', '#ffffff', 'halves'], ['SC Veenhaven', 'VEE', '#ee7203', '#ffffff', 'plain'], ['Sparta Molendam', 'SPM', '#c8102e', '#ffffff', 'stripes'],
    ['Hollandia Windmeer', 'HOW', '#003da5', '#ffffff', 'plain'], ['FC Grachtwijk', 'GRA', '#6a1b9a', '#ffffff', 'plain'], ['VV Zeedorp', 'ZEE', '#00a3e0', '#ffffff', 'stripes'],
    ["Tulpenstad '08", 'TUL', '#e91e63', '#1a1a1a', 'plain'], ['Polder United', 'POL', '#2e7d32', '#fdd835', 'hoops'], ['FC Kanaal', 'KAN', '#1a237e', '#ffeb3b', 'plain'], ['Duinwijk SV', 'DUI', '#ffb300', '#111111', 'sash']] },
  { id: 'POR', name: 'Liga Atlântica', nat: 'pt', base: 74, clubs: [
    ['Sporting Lusitano', 'SLU', '#008057', '#ffffff', 'hoops'], ['SL Marinha', 'SLM', '#e31b23', '#ffffff', 'plain'], ['FC Alvorada', 'ALV', '#0033a0', '#ffffff', 'stripes'],
    ['Vitória das Ondas', 'VDO', '#151515', '#ffffff', 'stripes'], ['Académica Serrana', 'ACS', '#3d3d3d', '#ffcc00', 'plain'], ['CD Farolim', 'FAR', '#f9a825', '#0d47a1', 'plain'],
    ['Estrela do Mar', 'EDM', '#c2185b', '#ffffff', 'sash'], ['União Ribeira', 'URB', '#0277bd', '#ffeb3b', 'halves'], ['GD Coral', 'GDC', '#ff7043', '#263238', 'plain'], ['Os Navegantes', 'NAV', '#283593', '#e53935', 'hoops']] },
  { id: 'ARG', name: 'Primera Pampa', nat: 'ar', base: 73, clubs: [
    ['CA Pampero', 'PAM', '#1e5fc4', '#ffd600', 'hoops'], ['Deportivo Gaucho', 'GAU', '#f4f4f4', '#d32f2f', 'sash'], ['Club Cóndor', 'CON', '#151515', '#ffffff', 'stripes'],
    ['Atlético Patagonia', 'PAT', '#00897b', '#ffffff', 'plain'], ['Unión Andina', 'UAN', '#c62828', '#ffffff', 'stripes'], ['Ferro Austral', 'FEA', '#2e7d32', '#ffffff', 'plain'],
    ['Juventud Rioplatense', 'JRP', '#6ec6ff', '#ffffff', 'stripes'], ['Sportivo Tango', 'STA', '#8e24aa', '#ffeb3b', 'plain'], ['Defensores del Puerto', 'DDP', '#f57c00', '#212121', 'halves'], ['Estrella Pampeana', 'EPA', '#fdd835', '#1565c0', 'plain']] },
  { id: 'USA', name: 'Lone Star League', nat: 'us', base: 71, clubs: [
    ['Cascadia FC', 'CAS', '#2e7d32', '#90caf9', 'plain'], ['Bayside SC', 'BAY', '#0d47a1', '#ffca28', 'sash'], ['Desert Sun FC', 'DSF', '#ff6f00', '#4e342e', 'plain'],
    ['Atlantic United', 'ATU', '#b71c1c', '#ffffff', 'hoops'], ['Metro Rail FC', 'MRF', '#37474f', '#ff5252', 'plain'], ['Prairie Fire', 'PFI', '#d84315', '#fff3e0', 'plain'],
    ['Gulf Coast Mariners', 'GCM', '#006064', '#ffab40', 'stripes'], ['Rocky Peak SC', 'RPK', '#4527a0', '#e0e0e0', 'plain'], ['Harbor City', 'HAC', '#01579b', '#e1f5fe', 'halves'], ['Twin Pines FC', 'TPF', '#1b5e20', '#f9a825', 'sleeves']] }
];

const POS_GROUP = { GK: 'GK', CB: 'D', LB: 'D', RB: 'D', CDM: 'M', CM: 'M', CAM: 'M', LM: 'M', RM: 'M', LW: 'F', RW: 'F', ST: 'F' };
const ATTR = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
const ATTR_LBL = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
const PROFILE = {
  GK: [[-25, -35, -15, -25, 3, -5], [0, 0, .1, 0, .8, .1]],
  CB: [[-8, -30, -12, -15, 3, 5], [.1, 0, .1, 0, .55, .25]],
  LB: [[5, -25, -3, -5, 0, -2], [.25, 0, .2, .1, .35, .1]],
  RB: [[5, -25, -3, -5, 0, -2], [.25, 0, .2, .1, .35, .1]],
  CDM: [[-8, -12, 0, -6, 3, 4], [.05, .05, .3, .1, .3, .2]],
  CM: [[-4, -6, 4, 1, -8, -2], [.1, .1, .4, .2, .1, .1]],
  CAM: [[0, 0, 2, 2, -30, -12], [.1, .2, .3, .35, 0, .05]],
  LM: [[3, -3, -2, 3, -30, -10], [.3, .2, .15, .3, 0, .05]],
  RM: [[3, -3, -2, 3, -30, -10], [.3, .2, .15, .3, 0, .05]],
  LW: [[3, -3, -2, 3, -30, -10], [.3, .2, .15, .3, 0, .05]],
  RW: [[3, -3, -2, 3, -30, -10], [.3, .2, .15, .3, 0, .05]],
  ST: [[1, 2, -8, -1, -35, 0], [.2, .45, .05, .2, 0, .1]]
};
const SQUAD_POS = ['GK', 'GK', 'LB', 'CB', 'CB', 'RB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LM', 'RM', 'CM', 'LW', 'RW', 'ST', 'ST'];

function calcOvr(p) { const w = PROFILE[p.pos][1]; let s = 0; ATTR.forEach((k, i) => s += p.att[k] * w[i]); return Math.round(s); }
function playerValue(p) {
  const af = p.age <= 21 ? 1.5 : p.age <= 24 ? 1.25 : p.age <= 28 ? 1 : p.age <= 31 ? .65 : .35;
  const potB = 1 + Math.max(0, p.pot - p.ovr) * .02 * (p.age < 25 ? 1 : 0);
  return Math.max(.05, +(0.1 * Math.pow(1.2, p.ovr - 50) * af * potB).toFixed(2));
}
let PID = 1;
function makePlayer(nat, pos, target, age) {
  const nm = NAMES[nat] || NAMES.en;
  const p = { id: PID++, fn: pick(nm.f), ln: pick(nm.l), nat, pos, age, att: {}, num: 0, club: null,
    skin: ri(0, 4), hair: ri(0, 4), g: 0, a: 0, apps: 0, rt: 0, cg: 0, ca: 0 };
  const off = PROFILE[pos][0];
  ATTR.forEach((k, i) => p.att[k] = clamp(Math.round(target + off[i] + rf(-4, 4)), 20, 99));
  p.ovr = calcOvr(p);
  const youth = Math.max(0, 27 - age);
  p.pot = clamp(p.ovr + Math.round(youth * rf(0.6, 2.4)), p.ovr, 95);
  p.val = playerValue(p);
  return p;
}
function pname(p) { return p.fn + ' ' + p.ln; }
function shortName(p) { return p.ln; }
function bumpAttrs(p, d) { // spread a change in overall across attributes, weighted
  const w = PROFILE[p.pos][1];
  for (let s = 0; s < Math.abs(d) * 3; s++) {
    let r = R(), i = 0; for (; i < 6; i++) { r -= w[i]; if (r <= 0) break; }
    i = Math.min(i, 5); p.att[ATTR[i]] = clamp(p.att[ATTR[i]] + Math.sign(d), 20, 99);
    if ((d > 0 && calcOvr(p) >= p.ovr + d) || (d < 0 && calcOvr(p) <= p.ovr + d)) break;
  }
  p.ovr = calcOvr(p); p.val = playerValue(p);
}

const FORMATIONS = {
  '4-3-3': [['GK', .02, 0], ['LB', .22, -.75], ['CB', .17, -.27], ['CB', .17, .27], ['RB', .22, .75], ['CM', .38, -.42], ['CDM', .31, 0], ['CM', .38, .42], ['LW', .58, -.72], ['ST', .63, 0], ['RW', .58, .72]],
  '4-4-2': [['GK', .02, 0], ['LB', .22, -.75], ['CB', .17, -.27], ['CB', .17, .27], ['RB', .22, .75], ['LM', .42, -.75], ['CM', .37, -.24], ['CM', .37, .24], ['RM', .42, .75], ['ST', .61, -.22], ['ST', .61, .22]],
  '4-2-3-1': [['GK', .02, 0], ['LB', .22, -.75], ['CB', .17, -.27], ['CB', .17, .27], ['RB', .22, .75], ['CDM', .31, -.25], ['CDM', .31, .25], ['LW', .5, -.7], ['CAM', .49, 0], ['RW', .5, .7], ['ST', .63, 0]],
  '3-5-2': [['GK', .02, 0], ['CB', .18, -.45], ['CB', .16, 0], ['CB', .18, .45], ['LM', .4, -.85], ['CDM', .31, 0], ['CM', .4, -.32], ['CM', .4, .32], ['RM', .4, .85], ['ST', .61, -.22], ['ST', .61, .22]],
  '4-1-2-1-2': [['GK', .02, 0], ['LB', .22, -.75], ['CB', .17, -.27], ['CB', .17, .27], ['RB', .22, .75], ['CDM', .3, 0], ['CM', .39, -.4], ['CM', .39, .4], ['CAM', .5, 0], ['ST', .62, -.2], ['ST', .62, .2]]
};
const FIT = { // slot -> list of positions with penalty
  GK: { GK: 0 }, CB: { CB: 0, CDM: 4, LB: 4, RB: 4 }, LB: { LB: 0, RB: 3, LM: 5, CB: 5, LW: 8 }, RB: { RB: 0, LB: 3, RM: 5, CB: 5, RW: 8 },
  CDM: { CDM: 0, CM: 2, CB: 5, CAM: 6 }, CM: { CM: 0, CDM: 2, CAM: 2, LM: 5, RM: 5 }, CAM: { CAM: 0, CM: 2, ST: 4, LW: 4, RW: 4 },
  LM: { LM: 0, LW: 1, RM: 3, RW: 4, CM: 5, LB: 6 }, RM: { RM: 0, RW: 1, LM: 3, LW: 4, CM: 5, RB: 6 },
  LW: { LW: 0, LM: 1, RW: 2, RM: 4, ST: 4, CAM: 4 }, RW: { RW: 0, RM: 1, LW: 2, LM: 4, ST: 4, CAM: 4 }, ST: { ST: 0, CAM: 4, LW: 4, RW: 4 }
};
function fitPen(slot, pos) { const f = FIT[slot]; if (pos === 'GK' || slot === 'GK') return pos === slot ? 0 : 45; return f[pos] !== undefined ? f[pos] : 12; }
function autoLineup(club) {
  const form = FORMATIONS[club.form] || FORMATIONS['4-3-3'];
  const avail = club.squad.filter(p => !p.inj);
  const used = new Set(), xi = [];
  // fill scarcest slots first: GK, then by order
  const order = form.map((s, i) => i).sort((a, b) => (form[a][0] === 'GK' ? -1 : 0) - (form[b][0] === 'GK' ? -1 : 0));
  for (const i of order) {
    let best = null, bs = -1e9;
    for (const p of avail) { if (used.has(p.id)) continue; const s = p.ovr - fitPen(form[i][0], p.pos); if (s > bs) { bs = s; best = p; } }
    xi[i] = best ? best.id : null; if (best) used.add(best.id);
  }
  club.xi = xi;
  return xi;
}
function lineupPlayers(club) {
  if (!club.xi || club.xi.length !== 11 || club.xi.some(id => !club.squad.find(p => p.id === id))) autoLineup(club);
  return club.xi.map(id => club.squad.find(p => p.id === id));
}
function teamStrength(club) {
  const xi = lineupPlayers(club), form = FORMATIONS[club.form] || FORMATIONS['4-3-3'];
  let s = 0, att = 0, mid = 0, def = 0, na = 0, nm = 0, nd = 0;
  xi.forEach((p, i) => {
    const v = p.ovr - fitPen(form[i][0], p.pos); s += v; const g = POS_GROUP[form[i][0]];
    if (g === 'F') { att += v; na++; } else if (g === 'M') { mid += v; nm++; } else { def += v; nd++; }
  });
  return { ovr: s / 11, att: na ? att / na : s / 11, mid: nm ? mid / nm : s / 11, def: nd ? def / nd : s / 11 };
}
function starRating(ovr) { return clamp(Math.round((ovr - 60) / 4) / 2 + 0.5, 0.5, 5); }
function starStr(ovr) { const s = starRating(ovr); return '★'.repeat(Math.floor(s)) + (s % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(s)); }

function buildWorld(seed) {
  R = mulberry(seed || 2027); PID = 1;
  const leagues = [], clubs = [];
  LEAGUE_DEFS.forEach((L, li) => {
    const lg = { id: L.id, name: L.name, nat: L.nat, clubs: [] };
    L.clubs.forEach((c, ci) => {
      const tier = L.base + 7 - ci * 1.45 + rf(-1, 1); // first-listed = strongest
      const club = { id: L.id + ci, name: c[0], abbr: c[1], c1: c[2], c2: c[3], pat: c[4], league: L.id, form: pick(['4-3-3', '4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '4-1-2-1-2']), squad: [], xi: null,
        st: { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }, rep: tier };
      const nums = shuffle([...Array(40)].map((_, i) => i + 2)).filter(n => n !== 1);
      SQUAD_POS.forEach((pos, k) => {
        const foreign = R() < (L.id === 'USA' || L.id === 'POR' ? .3 : .22);
        const nat = foreign ? pick(Object.keys(NAMES)) : L.nat;
        const starter = k < 2 ? k === 0 : !([7, 8, 15].includes(k));
        const age = ri(18, 34);
        const p = makePlayer(nat, pos, tier + (starter ? rf(-1, 3) : rf(-8, -2)) - (age < 21 ? 4 : 0), age);
        p.club = club.id; p.num = pos === 'GK' && k === 0 ? 1 : nums.pop();
        club.squad.push(p);
      });
      club.budget = Math.round(club.squad.reduce((s, p) => s + p.val, 0) * .12 * 10) / 10;
      autoLineup(club);
      clubs.push(club); lg.clubs.push(club.id);
    });
    leagues.push(lg);
  });
  R = Math.random;
  return { leagues, clubs, nextPid: PID };
}

// ===== crest / kit art =====
const crestCache = {};
function crestURL(club) {
  if (crestCache[club.id]) return crestCache[club.id];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const shield = () => { g.beginPath(); g.moveTo(14, 12); g.lineTo(114, 12); g.lineTo(114, 60); g.quadraticCurveTo(112, 102, 64, 120); g.quadraticCurveTo(16, 102, 14, 60); g.closePath(); };
  shield(); g.fillStyle = club.c1; g.fill();
  g.save(); shield(); g.clip(); g.fillStyle = club.c2;
  const h = (club.id.charCodeAt(3) || 0) % 5;
  if (h === 0) { for (let x = 24; x < 120; x += 26) g.fillRect(x, 0, 12, 128); }
  else if (h === 1) g.fillRect(64, 0, 64, 128);
  else if (h === 2) { g.beginPath(); g.moveTo(0, 30); g.lineTo(30, 0); g.lineTo(128, 98); g.lineTo(98, 128); g.fill(); }
  else if (h === 3) { g.fillRect(0, 44, 128, 26); }
  else { g.beginPath(); g.arc(64, 62, 30, 0, 7); g.fill(); }
  g.restore();
  shield(); g.lineWidth = 7; g.strokeStyle = '#0b1f2b'; g.stroke(); g.lineWidth = 2.5; g.strokeStyle = '#f2d27a'; g.stroke();
  g.font = '800 34px "Saira Condensed",Impact,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#0b1f2b'; g.strokeText(club.abbr, 64, 64); g.fillStyle = '#fff'; g.fillText(club.abbr, 64, 64);
  return crestCache[club.id] = c.toDataURL();
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function colorDist(a, b) { const x = hexToRgb(a), y = hexToRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
function kitFor(club, away, other) {
  let k = away ? { shirt: club.c2, trim: club.c1, shorts: club.c1, socks: club.c2 } : { shirt: club.c1, trim: club.c2, shorts: colorDist(club.c1, '#ffffff') < 60 ? '#1b1b1b' : club.c2, socks: club.c1 };
  if (club.pat !== 'plain' && !away) k.shorts = '#f4f4f4';
  if (other && colorDist(k.shirt, other.shirt) < 140) {
    const alt = colorDist(other.shirt, '#ffffff') > 200 ? '#f4f4f4' : '#181818';
    k = { shirt: alt, trim: club.c1, shorts: alt, socks: alt };
  }
  k.pat = away ? 'plain' : club.pat;
  return k;
}

// ===== sim =====
function poisson(l) { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; }
const SCORE_W = { ST: 5, LW: 3.4, RW: 3.4, CAM: 2.8, LM: 1.8, RM: 1.8, CM: 1.3, CDM: .6, LB: .5, RB: .5, CB: .45, GK: 0 };
function weightedPick(list, wf) { let tot = 0; const w = list.map(x => { const v = Math.max(0, wf(x)); tot += v; return v; }); let r = R() * tot; for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; } return list[list.length - 1]; }
function simMatch(home, away, opts = {}) {
  const sh = teamStrength(home), sa = teamStrength(away);
  const dh = (sh.att * .5 + sh.mid * .3 + sh.ovr * .2) - (sa.def * .6 + sa.mid * .4) + 1.6;
  const da = (sa.att * .5 + sa.mid * .3 + sa.ovr * .2) - (sh.def * .6 + sh.mid * .4);
  const hg = poisson(1.35 * Math.exp(dh * .075)), ag = poisson(1.12 * Math.exp(da * .075));
  const events = [];
  const add = (club, n) => {
    const xi = lineupPlayers(club).filter(Boolean);
    for (let i = 0; i < n; i++) {
      const s = weightedPick(xi, p => SCORE_W[p.pos] * Math.pow(p.att.sho / 70, 3));
      const a = R() < .75 ? weightedPick(xi.filter(p => p !== s), p => (p.pos === 'GK' ? .05 : 1) * Math.pow(p.att.pas / 70, 3)) : null;
      events.push({ club: club.id, pid: s.id, aid: a ? a.id : null, min: ri(1, 90) });
    }
  };
  add(home, hg); add(away, ag);
  events.sort((a, b) => a.min - b.min);
  return { hg, ag, events };
}
function penaltyShootout(home, away) {
  let h = 0, a = 0; const sh = teamStrength(home).att, sa = teamStrength(away).att;
  for (let i = 0; i < 5; i++) { if (R() < .72 + (sh - 75) * .004) h++; if (R() < .72 + (sa - 75) * .004) a++; }
  while (h === a) { if (R() < .72) h++; if (R() < .72) a++; }
  return [h, a];
}
function roundRobin(ids) { // double round robin, circle method
  const n = ids.length, arr = ids.slice(), rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const m = [];
    for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; m.push(r % 2 === 0 ? [a, b] : [b, a]); }
    rounds.push(m); arr.splice(1, 0, arr.pop());
  }
  return rounds.concat(rounds.map(m => m.map(([a, b]) => [b, a])));
}
function fmtMoney(m) { return m >= 1 ? '€' + m.toFixed(m >= 100 ? 0 : 1) + 'M' : '€' + Math.round(m * 1000) + 'K'; }
function ovrColor(o) { return o >= 85 ? '#f2b630' : o >= 78 ? '#c8d84a' : o >= 70 ? '#8ef0a8' : o >= 62 ? '#bcd0d8' : '#8a9aa3'; }
