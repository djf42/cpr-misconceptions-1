/* =================================================================
   Data layer shared by all three pages.
   LIVE mode  — Firebase configured in config.js.
   DEMO mode  — no Firebase; everything is kept in this browser only.

   Firestore layout
     boards/{period}/players/{uid}   best score per player, period = "all" or "m-YYYY-MM"
                                     { name, role, score, correct, total, timeMs, updatedAt }
     attempts/{autoId}               every finished game, no names (admin-only read)
                                     { uid, period, role, score, correct, total, timeMs,
                                       answers:[{q, r, c, ms, to}], source, v, createdAt }
   ================================================================= */
(function () {
  const C = window.APP_CONFIG || {};
  const NQ = (window.QUESTIONS || []).length;

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const pad = n => String(n).padStart(2, "0");
  function periodKey(d) { d = d || new Date(); return "m-" + d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1); }
  function periodLabel(key) {
    if (key === "all") return "All time";
    const m = /^m-(\d{4})-(\d{2})$/.exec(key); if (!m) return key;
    return new Date(Date.UTC(+m[1], +m[2] - 1, 1)).toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  }

  // ---------- Firebase setup ----------
  let db = null, auth = null;
  if (C.firebase && window.firebase) {
    try {
      firebase.initializeApp(C.firebase);
      db = firebase.firestore();
      auth = firebase.auth ? firebase.auth() : null;
    } catch (e) { console.error("Firebase init failed:", e); db = null; auth = null; }
  }
  const live = !!(db && auth);

  // ---------- player identity ----------
  function demoUid() {
    let id = LS.get("cprchal:demoUid", null);
    if (!id) { id = "demo-" + Math.random().toString(36).slice(2, 10); LS.set("cprchal:demoUid", id); }
    return id;
  }
  async function playerUid() {
    if (!live) return demoUid();
    if (auth.currentUser) return auth.currentUser.uid;
    const cred = await auth.signInAnonymously();
    return cred.user.uid;
  }

  // ---------- leaderboards ----------
  const sortBoard = rows => rows.sort((a, b) => (b.score - a.score) || (a.timeMs - b.timeMs));

  async function getBoard(period, limit) {
    limit = limit || C.leaderboardSize || 25;
    if (live) {
      const snap = await db.collection("boards").doc(period).collection("players")
        .orderBy("score", "desc").limit(limit).get();
      return sortBoard(snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    }
    const all = LS.get("cprchal:demoBoards", {});
    return sortBoard(Object.entries(all[period] || {}).map(([id, r]) => Object.assign({ id }, r))).slice(0, limit);
  }

  async function rankIn(period, score) {
    if (live) {
      const col = db.collection("boards").doc(period).collection("players");
      try {
        const agg = await col.where("score", ">", score).count().get();
        return agg.data().count + 1;
      } catch (e) {
        const rows = await getBoard(period, 100);
        const above = rows.filter(r => r.score > score).length;
        return above < rows.length ? above + 1 : null;
      }
    }
    const rows = Object.values((LS.get("cprchal:demoBoards", {}))[period] || {});
    return rows.filter(r => r.score > score).length + 1;
  }

  async function getMine(period, uid) {
    if (live) {
      const d = await db.collection("boards").doc(period).collection("players").doc(uid).get();
      return d.exists ? d.data() : null;
    }
    return ((LS.get("cprchal:demoBoards", {}))[period] || {})[uid] || null;
  }

  async function putBest(period, uid, rec) {
    if (live) {
      await db.collection("boards").doc(period).collection("players").doc(uid)
        .set(Object.assign({}, rec, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
      return;
    }
    const all = LS.get("cprchal:demoBoards", {});
    all[period] = all[period] || {};
    all[period][uid] = Object.assign({}, rec, { updatedAt: new Date().toISOString() });
    LS.set("cprchal:demoBoards", all);
  }

  // ---------- submit a finished game ----------
  // result: { name, role, score, correct, total, timeMs, answers }
  // returns { uid, month, bests: { all:{improved, best}, [month]:{improved, best} } }
  async function submit(result) {
    const uid = await playerUid();
    const month = periodKey();
    const base = { score: result.score, correct: result.correct, total: result.total, timeMs: result.timeMs };

    // 1. raw attempt for analytics (no name stored)
    const attempt = Object.assign({ uid, period: month, role: result.role, answers: result.answers, source: "web", v: 2 }, base);
    if (live) {
      attempt.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("attempts").add(attempt);
    } else {
      attempt.createdAt = new Date().toISOString();
      const list = LS.get("cprchal:demoAttempts", []); list.push(attempt); LS.set("cprchal:demoAttempts", list);
    }

    // 2. personal bests on the monthly and all-time boards
    const bests = {};
    for (const period of [month, "all"]) {
      const prev = await getMine(period, uid);
      const better = !prev || result.score > prev.score || (result.score === prev.score && result.timeMs < prev.timeMs);
      const rec = Object.assign({ name: result.name, role: result.role }, base);
      if (better) await putBest(period, uid, rec);
      bests[period] = { improved: better, hadPrevious: !!prev, best: better ? rec : prev };
    }
    return { uid, month, bests };
  }

  // ---------- admin (dashboard) ----------
  function onAdminAuth(cb) {
    if (!live) { cb(null); return; }
    auth.onAuthStateChanged(u => cb(u && !u.isAnonymous ? u : null));
  }
  async function adminSignIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await auth.signInWithPopup(provider);
  }
  async function adminSignOut() { if (auth) await auth.signOut(); }

  // attempts since a Date (or all if null), newest first, capped for safety
  async function fetchAttempts(since, cap) {
    cap = cap || 20000;
    if (live) {
      let q = db.collection("attempts");
      if (since) q = q.where("createdAt", ">=", firebase.firestore.Timestamp.fromDate(since));
      const snap = await q.orderBy("createdAt", "desc").limit(cap).get();
      return snap.docs.map(d => {
        const x = d.data();
        return Object.assign({}, x, { createdAt: x.createdAt && x.createdAt.toDate ? x.createdAt.toDate() : new Date() });
      });
    }
    return LS.get("cprchal:demoAttempts", [])
      .map(a => Object.assign({}, a, { createdAt: new Date(a.createdAt) }))
      .filter(a => !since || a.createdAt >= since)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  window.Store = {
    live, periodKey, periodLabel, getBoard, rankIn, submit,
    onAdminAuth, adminSignIn, adminSignOut, fetchAttempts, LS
  };
})();
