/* =================================================================
   Data layer shared by all three pages.
   LIVE mode  — Firebase configured in config.js.
   DEMO mode  — no Firebase; everything is kept in this browser only.

   Firestore layout (each game sets its own collection names in window.GAME,
   following the pattern <game>_boards and <game>_attempts)
     <game>_boards/{period}/players/{uid}   best score per player, period = "all" or "m-YYYY-MM"
                                     { name, role, score, correct, total, timeMs, updatedAt }
     <game>_attempts/{autoId}               every finished game, no names (admin-only read)
                                     { uid, period, role, score, correct, total, timeMs,
                                       answers:[{q, r, c, ms, to}], source, v, createdAt }
   ================================================================= */
(function () {
  const C = window.APP_CONFIG || {};
  // Which game is using the store. The misconceptions game uses the defaults;
  // other games set window.GAME before loading this file.
  const G = Object.assign({ boards: "boards", attempts: "attempts", prefix: "cprchal", source: "web", v: 2 }, window.GAME || {});
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
      const snap = await db.collection(G.boards).doc(period).collection("players")
        .orderBy("score", "desc").limit(limit).get();
      return sortBoard(snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    }
    const all = LS.get(G.prefix + ":demoBoards", {});
    return sortBoard(Object.entries(all[period] || {}).map(([id, r]) => Object.assign({ id }, r))).slice(0, limit);
  }

  async function rankIn(period, score) {
    if (live) {
      const col = db.collection(G.boards).doc(period).collection("players");
      try {
        const agg = await col.where("score", ">", score).count().get();
        return agg.data().count + 1;
      } catch (e) {
        const rows = await getBoard(period, 100);
        const above = rows.filter(r => r.score > score).length;
        return above < rows.length ? above + 1 : null;
      }
    }
    const rows = Object.values((LS.get(G.prefix + ":demoBoards", {}))[period] || {});
    return rows.filter(r => r.score > score).length + 1;
  }

  async function getMine(period, uid) {
    if (live) {
      const d = await db.collection(G.boards).doc(period).collection("players").doc(uid).get();
      return d.exists ? d.data() : null;
    }
    return ((LS.get(G.prefix + ":demoBoards", {}))[period] || {})[uid] || null;
  }

  async function putEntry(period, uid, rec) {
    if (live) {
      await db.collection(G.boards).doc(period).collection("players").doc(uid)
        .set(Object.assign({}, rec, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
      return;
    }
    const all = LS.get(G.prefix + ":demoBoards", {});
    all[period] = all[period] || {};
    all[period][uid] = Object.assign({}, rec, { updatedAt: new Date().toISOString() });
    LS.set(G.prefix + ":demoBoards", all);
  }

  // ---------- submit a finished game ----------
  // Leaderboards are FIRST-SCORE: only a player's first game ever is posted (to the all-time board
  // and to the board for the month they first played). Later games are practice: they still go to
  // the analytics, and update the player's personal best (kept on this device).
  // result: { name, role, score, correct, total, timeMs, answers }
  // returns { uid, month, posted, board, newPB, hadPB, pb }
  //   posted: this game went on the leaderboard (it was the player's first)
  //   board:  the player's leaderboard entry (this game, or their first game)
  //   newPB / hadPB / pb: personal-best status after this game
  async function submit(result) {
    const uid = await playerUid();
    const month = periodKey();
    const base = { score: result.score, correct: result.correct, total: result.total, timeMs: result.timeMs };

    // 1. raw attempt for analytics (no name stored)
    const attempt = Object.assign({ uid, period: month, role: result.role, answers: result.answers, source: G.source, v: G.v }, base);
    if (live) {
      attempt.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection(G.attempts).add(attempt);
    } else {
      attempt.createdAt = new Date().toISOString();
      const list = LS.get(G.prefix + ":demoAttempts", []); list.push(attempt); LS.set(G.prefix + ":demoAttempts", list);
    }

    // 2. leaderboard: first game only
    const first = await getMine("all", uid);
    const rec = Object.assign({ name: result.name, role: result.role }, base);
    let posted = false;
    if (!first) {
      await putEntry("all", uid, rec);
      await putEntry(month, uid, rec);
      posted = true;
    }

    // 3. personal best (this device)
    const pbKey = G.prefix + ":personalBest";
    const pb = LS.get(pbKey, null) || (first ? first : null);
    const newPB = !pb || result.score > pb.score || (result.score === pb.score && result.timeMs < pb.timeMs);
    const bestNow = newPB ? base : { score: pb.score, correct: pb.correct, total: pb.total, timeMs: pb.timeMs };
    LS.set(pbKey, bestNow);

    return { uid, month, posted, board: posted ? rec : first, newPB, hadPB: !!pb, pb: bestNow };
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

  // attempts since a Date (or all if null), newest first.
  // Firestore allows at most 10,000 per request, so load in pages of 5,000.
  async function fetchAttempts(since, cap) {
    cap = cap || 50000;
    if (live) {
      const PAGE = 5000, out = [];
      let base = db.collection(G.attempts);
      if (since) base = base.where("createdAt", ">=", firebase.firestore.Timestamp.fromDate(since));
      base = base.orderBy("createdAt", "desc");
      let last = null;
      while (out.length < cap) {
        let q = base.limit(Math.min(PAGE, cap - out.length));
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        snap.docs.forEach(d => {
          const x = d.data();
          out.push(Object.assign({}, x, { createdAt: x.createdAt && x.createdAt.toDate ? x.createdAt.toDate() : new Date() }));
        });
        if (snap.docs.length < PAGE) break;
        last = snap.docs[snap.docs.length - 1];
      }
      return out;
    }
    return LS.get(G.prefix + ":demoAttempts", [])
      .map(a => Object.assign({}, a, { createdAt: new Date(a.createdAt) }))
      .filter(a => !since || a.createdAt >= since)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  window.Store = {
    live, periodKey, periodLabel, getBoard, rankIn, submit,
    onAdminAuth, adminSignIn, adminSignOut, fetchAttempts, LS
  };
})();
