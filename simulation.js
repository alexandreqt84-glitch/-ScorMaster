#!/usr/bin/env node
// Simulation de N parties (500 par défaut) pour contrôler les limites de points par manche.
// Usage :  node outils/simulation.js [nombre_de_parties]
// Les parties suivent les vraies règles (paquets, barèmes, nombre de cartes) mais avec des joueurs au hasard
// ou à stratégie simple : ce sont des simulations, pas des enregistrements de vraies parties.
// Écrit : outils/rapport-simulation.txt et server/public/cat-usuel.js (seuils « score inhabituel »).
const fs = require("fs"), path = require("path");
global.window = {};
const pub = path.join(__dirname, "..", "server", "public");
for (const f of ["cat-cartes.js", "cat-autres.js", "cat-plus.js", "cat-limites.js"]) require(path.join(pub, f));
const N = Number(process.argv[2]) || 500;

let seed = 20261109;
const rng = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = ri(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sum = a => a.reduce((x, y) => x + y, 0);
const geo = (mean, cap) => Math.min(cap, 1 + Math.floor(-Math.log(1 - rng()) * mean));   // nombre de cartes restantes en main
const R = {};
const rec = (id, v, np) => { (R[id] = R[id] || []).push([Math.abs(v), np || 0]); };

// ---------- Cartes ----------
function belote() {
  const T = { J: 20, 9: 14, A: 11, 10: 10, K: 4, Q: 3, 8: 0, 7: 0 }, Nt = { A: 11, 10: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 };
  for (let g = 0; g < N; g++) for (let d = 0; d < 12; d++) {
    const deck = []; for (let s = 0; s < 4; s++) for (const r of Object.keys(T)) deck.push(s === 0 ? T[r] : Nt[r]); shuffle(deck);
    const pts = [0, 0], tricks = [0, 0];
    for (let t = 0; t < 8; t++) { const w = rng() < .5 ? 0 : 1; tricks[w]++; pts[w] += sum(deck.slice(t * 4, t * 4 + 4)) + (t === 7 ? 10 : 0); }
    const bel = rng() < .125 ? (rng() < .5 ? 0 : 1) : -1;
    for (const k of [0, 1]) rec("belote", (tricks[k] === 8 ? 252 : pts[k]) + (bel === k ? 20 : 0), 4);
  }
}
function skyjo() {
  const deck0 = []; for (let v = -2; v <= 12; v++) for (let i = 0; i < (v === -2 ? 5 : v === 0 ? 15 : 10); i++) deck0.push(v);
  const score = grid => { let s = 0; for (let c = 0; c < 4; c++) { const col = grid.slice(c * 3, c * 3 + 3); if (col[0] === col[1] && col[1] === col[2]) continue; s += sum(col); } return s; };
  for (let g = 0; g < N; g++) {
    const np = ri(2, 8), tot = Array(np).fill(0);
    for (let r = 0; r < 12 && Math.max(...tot) < 100; r++) for (const strat of [false, true]) {
      const deck = shuffle(deck0.slice()); let p = 0;
      const grids = Array.from({ length: np }, () => { const gr = deck.slice(p, p + 12); p += 12; return gr; });
      if (strat) grids.forEach(gr => { for (let k = 0; k < 8; k++) { const c = deck[p++]; const m = gr.indexOf(Math.max(...gr)); if (c < gr[m]) gr[m] = c; } });
      const sc = grids.map(score), f = ri(0, np - 1);
      if (sc[f] > 0 && sc.some((x, i) => i !== f && x <= sc[f])) sc[f] *= 2;
      sc.forEach(x => rec(strat ? "skyjo" : "skyjo-brut", x, np));
      if (strat) sc.forEach((x, i) => tot[i] += x);
    }
  }
}
function uno() {
  const deck = []; for (let c = 0; c < 4; c++) { deck.push(0); for (let n = 1; n <= 9; n++) deck.push(n, n); for (let k = 0; k < 3; k++) deck.push(20, 20); } for (let i = 0; i < 8; i++) deck.push(50);
  for (let g = 0; g < N; g++) { const np = ri(2, 8); for (let r = 0; r < 6; r++) { const d = shuffle(deck.slice()); let p = 0, s = 0; for (let i = 0; i < np - 1; i++) { const k = geo(3.5, 25); s += sum(d.slice(p, p + k)); p += k; } rec("uno", s, np); } }
}
function phase10() {
  const deck = []; for (let n = 1; n <= 12; n++) for (let i = 0; i < 8; i++) deck.push(n <= 9 ? 5 : 10); for (let i = 0; i < 4; i++) deck.push(15); for (let i = 0; i < 8; i++) deck.push(25);
  for (let g = 0; g < N; g++) { const np = ri(2, 6); for (let r = 0; r < 10; r++) { const d = shuffle(deck.slice()); let p = 0; for (let i = 0; i < np - 1; i++) { const k = geo(3, 10); rec("phase10", sum(d.slice(p, p + k)), np); p += k; } } }
}
function spades() {
  for (let g = 0; g < N; g++) {
    const tot = [0, 0], sacs = [0, 0];
    for (let r = 0; r < 40 && Math.max(...tot) < 500; r++) {
      const ta = Array.from({ length: 13 }).filter(() => rng() < .5).length, T = [ta, 13 - ta];
      for (const k of [0, 1]) {
        let s = 0, B = 0;
        for (let j = 0; j < 2; j++) { const q = rng(); if (q < .01) s += rng() < .5 ? 200 : -200; else if (q < .09) s += rng() < .55 ? 100 : -100; else B += ri(1, 5); }
        if (B > 0) { if (T[k] >= B) { s += 10 * B + (T[k] - B); sacs[k] += T[k] - B; } else s -= 10 * B; }
        if (sacs[k] >= 10) { s -= 100; sacs[k] -= 10; }
        tot[k] += s; rec("spades", s, 4);
      }
    }
  }
}
function cribbage() {
  const card = (r, s) => ({ r, s });
  const score = (h4, st, isCrib) => {
    const cs = st ? h4.concat([st]) : h4, n = cs.length; let s = 0;
    for (let m = 1; m < (1 << n); m++) { const sub = []; for (let i = 0; i < n; i++) if (m >> i & 1) sub.push(cs[i]); if (sum(sub.map(c => Math.min(c.r, 10))) === 15) s += 2; if (sub.length === 2 && sub[0].r === sub[1].r) s += 2; }
    for (let len = n; len >= 3; len--) { let f = 0; for (let m = 1; m < (1 << n); m++) { const sub = []; for (let i = 0; i < n; i++) if (m >> i & 1) sub.push(cs[i].r); if (sub.length !== len) continue; sub.sort((a, b) => a - b); if (sub.every((x, i) => i === 0 || x === sub[i - 1] + 1)) f++; } if (f) { s += f * len; break; } }
    if (h4.every(c => c.s === h4[0].s)) { if (st && st.s === h4[0].s) s += 5; else if (!isCrib) s += 4; }
    if (st && h4.some(c => c.r === 11 && c.s === st.s)) s += 1;
    return s;
  };
  const best4 = six => { let b = null, bs = -1; for (let a = 0; a < 6; a++) for (let c = a + 1; c < 6; c++) { const keep = six.filter((_, i) => i !== a && i !== c), sc = score(keep, null, false); if (sc > bs) { bs = sc; b = [keep, [six[a], six[c]]]; } } return b; };
  for (let g = 0; g < N; g++) for (let d = 0; d < 8; d++) {
    const deck = []; for (let r = 1; r <= 13; r++) for (let s = 0; s < 4; s++) deck.push(card(r, s)); shuffle(deck);
    const [h1, x1] = best4(deck.slice(0, 6)), [h2, x2] = best4(deck.slice(6, 12)), st = deck[12], crib = x1.concat(x2);
    rec("cribbage", score(h1, st, false) + score(crib, st, true) + ri(0, 5) + ri(0, 5) + (st.r === 11 ? 2 : 0), 2);   // donneur
    rec("cribbage", score(h2, st, false) + ri(0, 5) + ri(0, 5), 2);                                                 // adversaire
  }
}
function sixQuiPrend() {
  const heads = n => n === 55 ? 7 : n % 11 === 0 ? 5 : n % 10 === 0 ? 3 : n % 5 === 0 ? 2 : 1;
  for (let g = 0; g < N; g++) for (let r = 0; r < 4; r++) {
    const np = ri(2, 10), deck = shuffle(Array.from({ length: 104 }, (_, i) => i + 1));
    const hands = Array.from({ length: np }, (_, i) => deck.slice(i * 10, i * 10 + 10));
    const rows = [[deck[np * 10]], [deck[np * 10 + 1]], [deck[np * 10 + 2]], [deck[np * 10 + 3]]], pts = Array(np).fill(0);
    for (let t = 0; t < 10; t++) {
      const plays = hands.map((h, i) => ({ i, c: h.splice(ri(0, h.length - 1), 1)[0] })).sort((a, b) => a.c - b.c);
      for (const { i, c } of plays) {
        let best = -1, bt = 0; rows.forEach((row, k) => { const tail = row[row.length - 1]; if (tail < c && tail > bt) { bt = tail; best = k; } });
        if (best < 0) { let k = 0, mh = Infinity; rows.forEach((row, j) => { const h = sum(row.map(heads)); if (h < mh) { mh = h; k = j; } }); pts[i] += mh; rows[k] = [c]; }
        else if (rows[best].length === 5) { pts[i] += sum(rows[best].map(heads)); rows[best] = [c]; } else rows[best].push(c);
      }
    }
    pts.forEach(x => rec("sixQuiPrend", x, np));
  }
}
function huitAmericain() {
  const v = []; for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) v.push(r === 1 ? 1 : r === 8 ? 50 : r <= 7 ? r : r === 9 ? 9 : 10);
  for (let g = 0; g < N; g++) { const np = ri(2, 6); for (let r = 0; r < 8; r++) { const d = shuffle(v.slice()); let p = 0, tot = 0; for (let i = 0; i < np - 1; i++) { const k = geo(4, 15), s = sum(d.slice(p, p + k)); p += k; tot += s; rec("huitAmericain", s, np); } rec("huitAmericain", tot, np); } }
}
function wizard() {
  for (let g = 0; g < N; g++) { const np = ri(3, 6), rounds = 60 / np; for (let r = 1; r <= rounds; r++) for (let i = 0; i < np; i++) {
    let t = 0; for (let k = 0; k < r; k++) if (rng() < 1 / np) t++;
    const bid = rng() < .35 ? t : Math.max(0, t + ri(-1, 1)); rec("wizard", bid === t ? 20 + 10 * t : 10 * Math.abs(bid - t), np); } }
}

// ---------- Autres jeux ----------
function yams() {
  const avg = [2.1, 4.2, 6.3, 8.4, 10.5, 12.6, 13, 8, 10, 12, 12, 3, 22];
  const scoreOf = d => { const cnt = Array(7).fill(0); d.forEach(x => cnt[x]++); const s = sum(d), mx = Math.max(...cnt.slice(1)), set = new Set(d);
    const run = L => { let b = 0, c = 0; for (let x = 1; x <= 6; x++) { c = cnt[x] ? c + 1 : 0; b = Math.max(b, c); } return b >= L; };
    return [cnt[1], 2 * cnt[2], 3 * cnt[3], 4 * cnt[4], 5 * cnt[5], 6 * cnt[6], mx >= 3 ? s : 0, mx >= 4 ? s : 0, (mx === 3 && set.size === 2) ? 25 : 0, run(4) ? 30 : 0, run(5) ? 40 : 0, mx === 5 ? 50 : 0, s]; };
  for (let g = 0; g < N; g++) for (let f = 0; f < 3; f++) {
    const used = Array(13).fill(false); let total = 0, up = 0;
    for (let t = 0; t < 13; t++) {
      let d = Array.from({ length: 5 }, () => ri(1, 6));
      for (let k = 0; k < 2; k++) { const cnt = Array(7).fill(0); d.forEach(x => cnt[x]++); let face = 6; for (let x = 6; x >= 1; x--) if (cnt[x] > cnt[face]) face = x; d = d.map(x => x === face ? x : ri(1, 6)); }
      const sc = scoreOf(d); let bi = -1, bv = -1e9; for (let c = 0; c < 13; c++) if (!used[c] && sc[c] - avg[c] > bv) { bv = sc[c] - avg[c]; bi = c; }
      used[bi] = true; total += sc[bi]; if (bi < 6) up += sc[bi]; rec("yams-tour", sc[bi]);
    }
    rec("yams", total + (up >= 63 ? 35 : 0));
  }
}
function rummikub() {
  const deck = []; for (let k = 0; k < 8; k++) for (let n = 1; n <= 13; n++) deck.push(n); deck.push(30, 30);
  for (let g = 0; g < N; g++) { const np = ri(2, 4); for (let r = 0; r < 6; r++) { const d = shuffle(deck.slice()); let p = 0, tot = 0; for (let i = 0; i < np - 1; i++) { const k = geo(4, 14), s = sum(d.slice(p, p + k)); p += k; tot += s; rec("rummikub", s, np); } rec("rummikub", tot, np); } }
}
function dominos() {
  const tiles = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) tiles.push(a + b);
  for (let g = 0; g < N; g++) { const np = ri(2, 4); for (let r = 0; r < 6; r++) { const d = shuffle(tiles.slice()); let p = 0, tot = 0; for (let i = 0; i < np - 1; i++) { const k = geo(2.5, 7), s = sum(d.slice(p, p + k)); p += k; tot += s; } rec("dominos", tot, np); } }
}
function dixit() {
  for (let g = 0; g < N; g++) { const n = ri(3, 8); for (let r = 0; r < 12; r++) {
    const st = ri(0, n - 1), votes = Array(n).fill(0), voteOf = Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (i !== st) { let c; do { c = ri(0, n - 1); } while (c === i); voteOf[i] = c; votes[c]++; }
    const finders = votes[st], pts = Array(n).fill(0), all = finders === n - 1 || finders === 0;
    if (all) { for (let i = 0; i < n; i++) if (i !== st) pts[i] += 2; } else { pts[st] = 3; for (let i = 0; i < n; i++) if (voteOf[i] === st) pts[i] += 3; }
    for (let i = 0; i < n; i++) if (i !== st) pts[i] += votes[i];
    pts.forEach(x => rec("dixit", x, n)); } }
}
function rallySet(target, cap, p) { let a = 0, b = 0; for (;;) { if (rng() < p) a++; else b++; const hi = Math.max(a, b), lo = Math.min(a, b); if (cap && hi >= cap) return hi; if (hi >= target && hi - lo >= 2) return hi; } }
function raquettes() {
  for (let g = 0; g < N; g++) for (let s = 0; s < 3; s++) { const p = .38 + rng() * .24;
    rec("badminton", rallySet(21, 30, p)); rec("badminton11", rallySet(11, 0, p)); rec("ping-pong", rallySet(11, 0, p)); rec("volley", rallySet(25, 0, p));
    let a = 0, b = 0; for (;;) { if (rng() < p) a++; else b++; if ((a >= 6 || b >= 6) && Math.abs(a - b) >= 2) break; if (a === 7 || b === 7) break; if (a === 6 && b === 6) { rng() < .5 ? a++ : b++; break; } } rec("tennis", Math.max(a, b)); }
}
function cochon() {
  for (let g = 0; g < N; g++) { const hold = ri(10, 40); for (let t = 0; t < 30; t++) { let s = 0; for (;;) { const d = ri(1, 6); if (d === 1) { s = 0; break; } s += d; if (s >= hold) break; } rec("cochon", s); } }
}

// ---------- Jeux vidéo (modèles statistiques) ----------
function fifa() { const pois = l => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L); return k - 1; }; for (let g = 0; g < N * 2; g++) { rec("fifa", pois(.8 + rng() * 1.6)); rec("fifa", pois(.8 + rng() * 1.6)); } }
function smash() {
  for (let g = 0; g < N * 2; g++) { const np = ri(2, 4), st = Array(np).fill(3), ko = Array(np).fill(0); let alive = [...Array(np).keys()];
    while (alive.length > 1) { const v = alive[ri(0, alive.length - 1)]; let a; do { a = alive[ri(0, alive.length - 1)]; } while (a === v); if (rng() < .15) ko[v]--; else ko[a]++; if (--st[v] === 0) alive = alive.filter(x => x !== v); }
    ko.forEach(x => rec("smash", x, np)); }
}

[belote, skyjo, uno, phase10, spades, cribbage, sixQuiPrend, huitAmericain, wizard, yams, rummikub, dominos, dixit, raquettes, cochon, fifa, smash].forEach(f => f());

// ---------- Comparaison avec les limites ----------
const ALIAS = { "skyjo-brut": ["skyjo", ""], badminton11: ["badminton", "Sets en 11"], "yams-tour": [null] };
const limOf = (id, np) => { const [gid, v] = ALIAS[id] || [id, ""]; if (!gid) return 0; const f = window.LIM[gid]; return f === undefined ? 0 : typeof f === "function" ? f({ v: v || "", np: np || 3 }) : f; };
const STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 3000, 4000, 5000];
const nice = x => STEPS.find(s => s >= x) || Math.ceil(x);
const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
const lines = [`Simulation de ${N} parties par jeu (joueurs au hasard ou à stratégie simple, vraies règles)`, "", "jeu".padEnd(15) + "manches".padStart(8) + "moyenne".padStart(9) + "p99,9".padStart(8) + "max".padStart(8) + "limite".padStart(8) + "  verdict"];
const usuel = {}; const viol = [];
for (const id of Object.keys(R).sort()) {
  const rows = R[id], vals = rows.map(r => r[0]).sort((a, b) => a - b), mx = vals[vals.length - 1], p999 = pct(vals, .999), mean = sum(vals) / vals.length;
  const over = rows.filter(r => { const L = limOf(id, r[1]); return L && r[0] > L; });
  const L = limOf(id, 0) ? Math.max(...rows.map(r => limOf(id, r[1]))) : 0;
  let verdict = L ? (over.length ? "❌ DÉPASSÉE ×" + over.length : mx >= .6 * L ? "✅ serrée" : "✅ large") : "— aucune";
  if (over.length) viol.push(id);
  const u = nice(Math.max(mx, p999) * 1.3);
  if (id !== "skyjo-brut" && id !== "yams-tour" && !over.length && (!L || u < .6 * L)) { usuel[id] = u; verdict += "  → seuil inhabituel " + u; }
  lines.push(id.padEnd(15) + String(vals.length).padStart(8) + mean.toFixed(1).padStart(9) + String(p999).padStart(8) + String(mx).padStart(8) + String(L || "—").padStart(8) + "  " + verdict);
}
const sk = R["skyjo-brut"] ? Math.max(...R["skyjo-brut"].map(r => r[0])) : 0;
if (usuel.skyjo && sk) { const u = nice(Math.max(sk, 1) * 1.3); if (u > usuel.skyjo) usuel.skyjo = u; }   // grilles au hasard : cas le plus défavorable
if (usuel["badminton11"]) { usuel.badminton = "({ v }) => /11/.test(v) ? " + usuel.badminton11 + " : 0"; delete usuel.badminton11; }
if (usuel["yams-tour"]) delete usuel["yams-tour"];
fs.writeFileSync(path.join(__dirname, "rapport-simulation.txt"), lines.join("\n") + "\n");
const body = Object.entries(usuel).map(([k, v]) => `  ${/^[a-z]+$/i.test(k) ? k : JSON.stringify(k)}: ${v}`).join(",\n");
fs.writeFileSync(path.join(pub, "cat-usuel.js"), `// Seuil « score inhabituel » par manche, calculé par outils/simulation.js (${N} parties par jeu).\n// Au-dessus : l'appli demande confirmation avant de valider (sans bloquer). Plus bas que la limite, qui elle bloque.\n// Non généré à la main : relance « node outils/simulation.js » pour le recalculer.\nwindow.USUEL = {\n${body}\n};\n`);
console.log(lines.join("\n")); console.log("\nlimites dépassées :", viol.length ? viol.join(", ") : "aucune");
