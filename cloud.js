// Comptes joueurs (Supabase) : connexion par pseudo + mot de passe, sauvegarde en ligne par compte, classement général.
// Sans configuration (config.js vide) : l'appli reste 100 % locale.
const Cloud = {
  SK: "sm_session", UK: "sm_uid", board: null, boardT: 0, boardErr: "", _pp: null, _last: "", msg: "",
  cfg() { const c = window.SM_CLOUD || {}; return c.url && c.key ? { url: c.url.replace(/\/+$/, ""), key: c.key } : null; },
  enabled() { return !!Cloud.cfg(); },
  session() { try { return JSON.parse(localStorage.getItem(Cloud.SK)); } catch (e) { return null; } },
  active() { return Cloud.enabled() && !!Cloud.session(); },
  pseudo() { const s = Cloud.session(); return s && s.pseudo || ""; },
  mail() { const s = Cloud.session(); return s && s.email && !/@scoremaster\.app$/i.test(s.email) ? s.email : ""; },
  isMail: x => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x || ""),
  slug: p => Core.norm(p).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  email: p => Cloud.slug(p) + "@scoremaster.app",
  _hid() { try { return new Set(JSON.parse(localStorage.getItem("sm_hidden")) || []); } catch (e) { return new Set(); } },
  _hide(ids) { const h = Cloud._hid(); ids.forEach(i => h.add(i)); try { localStorage.setItem("sm_hidden", JSON.stringify([...h])); } catch (e) {} },
  _store(d, pseudo) {
    const prev = Cloud.session() || {};
    const s = { access: d.access_token, refresh: d.refresh_token, exp: Date.now() + (d.expires_in || 3600) * 1000 - 60000, uid: (d.user && d.user.id) || prev.uid, email: (d.user && d.user.email) || prev.email || "",
      pseudo: pseudo || (d.user && d.user.user_metadata && d.user.user_metadata.pseudo) || prev.pseudo || "" };
    try { localStorage.setItem(Cloud.SK, JSON.stringify(s)); } catch (e) {} return s;
  },
  async _auth(path, body) {
    const c = Cloud.cfg(), r = await fetch(c.url + "/auth/v1/" + path, { method: "POST", headers: { "Content-Type": "application/json", apikey: c.key }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.msg || d.error_description || d.message || d.error || ("Erreur " + r.status));
    return d;
  },
  async token() {
    let s = Cloud.session(); if (!s) throw new Error("non connecté");
    if (Date.now() < s.exp) return s.access;
    try { const d = await Cloud._auth("token?grant_type=refresh_token", { refresh_token: s.refresh }); return Cloud._store(d).access; }
    catch (e) { if (navigator.onLine !== false && /invalid|expired|not found|Erreur 4/i.test(e.message)) { /* session périmée */ } throw e; }
  },
  async rest(method, path, body, extra) {
    const c = Cloud.cfg(), t = await Cloud.token(), ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(c.url + "/rest/v1/" + path, { method, signal: ctl.signal, headers: { "Content-Type": "application/json", apikey: c.key, Authorization: "Bearer " + t, ...(extra || {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.text().catch(() => "")) || r.status);
      const tx = await r.text(); return tx ? JSON.parse(tx) : null;
    } finally { clearTimeout(to); }
  },
  async rpc(fn, body) {
    const c = Cloud.cfg(), r = await fetch(c.url + "/rest/v1/rpc/" + fn, { method: "POST", headers: { "Content-Type": "application/json", apikey: c.key }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(r.status); return r.json();
  },
  // ----- compte -----
  _wipeLocal() {
    ["sm_parties", "sm_parties_pending", "sm_hidden", Core.SK, Core.SK + "_d", "sm_current_cartes", "sm_current_autres", Core.KEY].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    Core.store = null; Core.dirty = {}; Core.hist = null; Core.histT = 0;
  },
  async _after(d, pseudo) {
    const s = Cloud._store(d, pseudo), last = localStorage.getItem(Cloud.UK);
    if (last && last !== s.uid) Cloud._wipeLocal();            // autre compte sur ce téléphone : on repart propre
    else { Core._load(); Object.keys(Core.store).forEach(k => Core.dirty[k] = 1); Core._save(); Core._spq(Core._lp().filter(p => !p._shared).map(p => p.id)); }   // données locales rattachées au compte
    try { localStorage.setItem(Cloud.UK, s.uid); } catch (e) {}
    if (!Core.me().nom) Core.setMe({ ...Core.me(), nom: s.pseudo });
    await Core.sync(); await Core.list(); Cloud.pushProfile(true); return s;
  },
  async signup(email, pseudo, pw) {
    email = (email || "").trim().toLowerCase(); pseudo = (pseudo || "").trim();
    if (!Cloud.isMail(email)) throw new Error("Entre une adresse e-mail valide.");
    if (pseudo.length < 2 || pseudo.length > 20) throw new Error("Le nom d'utilisateur doit faire 2 à 20 caractères.");
    if (!Cloud.slug(pseudo)) throw new Error("Le nom d'utilisateur doit contenir des lettres ou des chiffres.");
    if ((pw || "").length < 6) throw new Error("Le mot de passe doit faire au moins 6 caractères.");
    try { if ((await Cloud.rpc("pseudo_libre", { p_slug: Cloud.slug(pseudo) })) === false) throw new Error("Ce nom d'utilisateur est déjà pris."); }
    catch (e) { if (/déjà pris/.test(e.message)) throw e; /* fonction absente / hors ligne : le serveur tranchera */ }
    let d; try { d = await Cloud._auth("signup", { email, password: pw, data: { pseudo, slug: Cloud.slug(pseudo) } }); }
    catch (e) { throw new Error(/already|registered|exists/i.test(e.message) ? "Cet e-mail a déjà un compte : connecte-toi." : /database error/i.test(e.message) ? "Ce nom d'utilisateur est déjà pris." : e.message); }
    if (d.user && d.user.identities && !d.user.identities.length && !d.access_token) throw new Error("Cet e-mail a déjà un compte : connecte-toi.");
    if (!d.access_token) return { confirm: true, email };   // confirmation par e-mail activée dans Supabase
    return Cloud._after(d, pseudo);
  },
  // identifiant = e-mail, ou (anciens comptes) simple pseudo
  async login(id, pw) {
    id = (id || "").trim(); if (!id || !pw) throw new Error("E-mail (ou pseudo) et mot de passe requis.");
    const email = id.includes("@") ? id.toLowerCase() : Cloud.email(id);
    let d; try { d = await Cloud._auth("token?grant_type=password", { email, password: pw }); }
    catch (e) { throw new Error(/invalid|credentials/i.test(e.message) ? "E-mail ou mot de passe incorrect." : /not confirmed/i.test(e.message) ? "Confirme d'abord ton e-mail (clique sur le lien reçu)." : e.message); }
    return Cloud._after(d, null);
  },
  async forgot(id) {
    id = (id || "").trim(); if (!Cloud.isMail(id)) throw new Error("Entre l'adresse e-mail de ton compte.");
    await Cloud._auth("recover", { email: id.toLowerCase() }); return true;
  },
  // retour d'un lien reçu par e-mail (confirmation d'inscription ou nouveau mot de passe)
  recov: null,
  async _user(access) {
    const c = Cloud.cfg(), r = await fetch(c.url + "/auth/v1/user", { headers: { apikey: c.key, Authorization: "Bearer " + access } });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.msg || d.message || "Lien expiré ou déjà utilisé.");
    return d;
  },
  async newPassword(pw) {
    if ((pw || "").length < 6) throw new Error("Le mot de passe doit faire au moins 6 caractères.");
    const c = Cloud.cfg(), t = Cloud.recov; if (!t) throw new Error("Lien expiré : refais « Mot de passe oublié ».");
    const r = await fetch(c.url + "/auth/v1/user", { method: "PUT", headers: { "Content-Type": "application/json", apikey: c.key, Authorization: "Bearer " + t.access }, body: JSON.stringify({ password: pw }) });
    const u = await r.json().catch(() => ({})); if (!r.ok) throw new Error(u.msg || u.message || "Lien expiré : refais « Mot de passe oublié ».");
    Cloud.recov = null; return Cloud._after({ access_token: t.access, refresh_token: t.refresh, expires_in: t.exp, user: u }, null);
  },
  captureHash() {
    const h = location.hash || ""; if (!/access_token=/.test(h)) return;
    const q = new URLSearchParams(h.replace(/^#\/?/, "")), access = q.get("access_token"), refresh = q.get("refresh_token"), type = q.get("type"), exp = Number(q.get("expires_in")) || 3600;
    history.replaceState(null, "", location.pathname + location.search + "#/compte");
    if (!access || !Cloud.enabled()) return;
    if (type === "recovery") { Cloud.recov = { access, refresh, exp }; return; }
    Cloud.msg = "⏳ Confirmation de ton e-mail…";
    Cloud._user(access).then(u => Cloud._after({ access_token: access, refresh_token: refresh, expires_in: exp, user: u }, null))
      .then(() => { Cloud.msg = ""; }).catch(e => { Cloud.msg = "❌ " + e.message; })
      .then(() => { if (typeof S !== "undefined") { S.hist = Core.hist; S.force = true; } if (typeof draw === "function") draw(); });
  },
  logout() { try { localStorage.removeItem(Cloud.SK); } catch (e) {} Cloud._wipeLocal(); try { localStorage.removeItem(Cloud.UK); } catch (e) {} },
  // ----- passerelle utilisée par Core (mêmes chemins que l'ancien serveur) -----
  async call(url, method, bodyText) {
    const uid = Cloud.session().uid, body = bodyText ? JSON.parse(bodyText) : null;
    if (url === "api/parties") {
      if (method === "GET") {   // mes parties + celles où mon pseudo figure parmi les joueurs (le serveur filtre)
        const rows = await Cloud.rest("GET", "parties?select=owner,data&order=updated_at.desc&limit=5000"), hid = Cloud._hid();
        return rows.filter(r => r.owner === uid || !hid.has(r.data.id)).map(r => r.owner === uid ? r.data : { ...r.data, _shared: true });
      }
      if (method === "POST") {
        const players = [...new Set((body.joueurs || []).map(n => Cloud.slug(typeof n === "string" ? n : (n && n.nom) || "")).filter(Boolean))];
        const { _shared, ...clean } = body;
        await Cloud.rest("POST", "parties?on_conflict=owner,id", { owner: uid, id: body.id, data: clean, players, updated_at: new Date().toISOString() }, { Prefer: "resolution=merge-duplicates,return=minimal" }); return { ok: true };
      }
      if (method === "DELETE") {
        const rows = await Cloud.rest("GET", "parties?select=owner,data&limit=5000"); Cloud._hide(rows.filter(r => r.owner !== uid).map(r => r.data.id));
        await Cloud.rest("DELETE", "parties?owner=eq." + uid, undefined, { Prefer: "return=minimal" }); return { ok: true };
      }
    }
    const m = url.match(/^api\/parties\/(.+)$/);
    if (m && method === "DELETE") { const id = decodeURIComponent(m[1]); Cloud._hide([id]); await Cloud.rest("DELETE", "parties?owner=eq." + uid + "&id=eq." + encodeURIComponent(id), undefined, { Prefer: "return=minimal" }); return { ok: true }; }
    if (url === "api/settings") {
      const rows = await Cloud.rest("GET", "reglages?select=entries&user_id=eq." + uid), cur = (rows && rows[0] && rows[0].entries) || {};
      if (method === "GET") return { entries: cur };
      const inc = (body && body.entries) || {}; let ch = false;
      Object.keys(inc).forEach(k => { const e = inc[k]; if (e && typeof e.t === "number" && (!cur[k] || e.t > cur[k].t)) { cur[k] = { v: e.v, t: e.t }; ch = true; } });
      if (ch) await Cloud.rest("POST", "reglages?on_conflict=user_id", { user_id: uid, entries: cur, updated_at: new Date().toISOString() }, { Prefer: "resolution=merge-duplicates,return=minimal" });
      return { entries: cur };
    }
    throw new Error("route inconnue");
  },
  // ----- classement général -----
  _mine() {
    const me = Core.me(), nom = me.nom || Cloud.pseudo(), k = Core.norm(nom), out = {};
    ["cartes", "autres"].forEach(m => { const r = Core.stats(Core.hist || [], m).find(x => Core.norm(x.nom) === k); if (r) out[m] = { pg: r.pg, jouees: r.jouees, victoires: r.victoires, defaites: r.defaites, egalites: r.egalites, taux: r.taux, serie: r.serie, niveau: r.niveau }; });
    return out;
  },
  pushProfile(now) {
    if (!Cloud.active() || !Core.hist) return; clearTimeout(Cloud._pp);
    const go = async () => {
      try {
        const s = Cloud.session(), me = Core.me(), stats = Cloud._mine(), sig = JSON.stringify([stats, me.emoji, s.pseudo]);
        if (sig === Cloud._last) return;
        await Cloud.rest("POST", "profiles?on_conflict=user_id", { user_id: s.uid, pseudo: s.pseudo, avatar: me.emoji || "🎲", stats, updated_at: new Date().toISOString() }, { Prefer: "resolution=merge-duplicates,return=minimal" });
        Cloud._last = sig;
      } catch (e) { /* hors ligne : réessayé plus tard */ }
    };
    if (now) return go(); Cloud._pp = setTimeout(go, 1500);
  },
  async loadBoard() {
    Cloud.boardT = Date.now();
    try { Cloud.board = await Cloud.rest("GET", "profiles?select=user_id,pseudo,avatar,stats,updated_at&limit=500"); Cloud.boardErr = ""; }
    catch (e) { Cloud.boardErr = "Impossible de charger le classement (hors ligne ?)."; }
  }
};
Cloud.captureHash();
