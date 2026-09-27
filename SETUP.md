# CPR Misconceptions Challenge: setup guide

The site has three pages that share one Firebase database:

| Page | Who uses it | What it does |
|---|---|---|
| `index.html` | Learners | The game. Every game counts; the leaderboard keeps each player's best. |
| `leaderboard.html` | Anyone | Public, view-only leaderboard (this month and all time). Safe to link from your website or social media. |
| `dashboard.html` | You and named colleagues | Private per-question analytics. Requires signing in with an approved Google account. |

The other files are shared by all three pages:

```
css/brand.css            RECOVER colors, fonts and layout
js/config.js             your settings (Firebase, dashboard users, timing)
js/questions.js          the twelve questions, explanations and takeaways
js/store.js              saving and loading scores
js/strip.js              the rhythm-strip animation
assets/recover-logo.webp the RECOVER logo
```

**Before Firebase is connected, everything runs in demo mode:** scores are saved only in the browser being used. The dashboard's **Show sample data** box fills it with realistic, clearly labeled sample results, so you can demo the analytics before any learners have played.

---

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and sign in with a Google account. A RECOVER-owned account is best, so the project doesn't depend on one person.
2. Click **Create a project** and name it (e.g. `recover-cpr-challenge`). You can turn Google Analytics off.
3. Open **Build → Firestore Database → Create database**. Choose a location near most learners (e.g. `nam5 (us-central)`), then **Start in production mode**.
4. Open **Project settings** (gear icon) → **General** → **Your apps** → the **</>** (web) icon. Give it a nickname, leave Firebase Hosting unchecked, and click **Register app**.
5. Copy the block inside `const firebaseConfig = { ... }` and paste it into `js/config.js`, replacing `firebase: null,`:

```js
firebase: {
  apiKey: "AIza...",
  authDomain: "recover-cpr-challenge.firebaseapp.com",
  projectId: "recover-cpr-challenge",
  storageBucket: "recover-cpr-challenge.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
},
```

This config is safe to publish. It identifies the project; the security rules in step 3 are what protect the data.

6. In the same file, replace `you@example.org` in `adminEmails` with the Google account(s) that should see the dashboard.

---

## 2. Turn on sign-in

1. Open **Build → Authentication → Get started → Sign-in method**.
2. Enable **Anonymous**. Learners are signed in invisibly, with no account or password. This gives each browser a private ID so players can only update their own leaderboard entry.
3. Enable **Google** and pick a support email. This is only used by dashboard users.
4. Open **Authentication → Settings → Authorized domains → Add domain** and add your GitHub Pages domain, e.g. `yourname.github.io` (just the domain, no `https://` or folder).

---

## 3. Security rules

Open **Firestore Database → Rules**, replace everything with the rules below, **change the email address** in `isAdmin()` to match `adminEmails` in `config.js`, and click **Publish**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Dashboard users: must match adminEmails in js/config.js
    function isAdmin() {
      return request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email in ['you@example.org'];
    }

    function validEntry(d) {
      return d.keys().hasOnly(['name','role','score','correct','total','timeMs','updatedAt'])
        && d.name is string && d.name.size() <= 30
        && d.name.matches('^.{1,27} [^ ]\\.$')          // "First L." only
        && d.role is string && d.role.size() <= 40
        && d.total == 12
        && d.correct is int && d.correct >= 0 && d.correct <= 12
        && d.score is int
        && d.score >= d.correct * 500 && d.score <= d.correct * 1000
        && d.timeMs is int && d.timeMs >= 0
        && d.updatedAt == request.time;
    }

    // Leaderboards: anyone can read; each player writes only their own entry
    match /boards/{period}/players/{uid} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == uid
        && (period == 'all' || period.matches('^m-[0-9]{4}-[0-9]{2}$'))
        && validEntry(request.resource.data);
      allow update: if request.auth != null && request.auth.uid == uid
        && validEntry(request.resource.data)
        && request.resource.data.score >= resource.data.score;
      allow delete: if isAdmin();
    }

    // Per-question results: no names; players can add, only dashboard users can read
    match /attempts/{attemptId} {
      allow create: if request.auth != null
        && request.resource.data.keys().hasOnly(
             ['uid','period','role','score','correct','total','timeMs','answers','source','v','createdAt'])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.total == 12
        && request.resource.data.answers is list
        && request.resource.data.answers.size() == 12
        && request.resource.data.score is int
        && request.resource.data.createdAt == request.time;
      allow read, delete: if isAdmin();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

What the rules guarantee:
- The public can see leaderboard names, roles and scores, and nothing else.
- Leaderboard names must be in "First L." form, so full names can't be posted.
- A player can only change their own entry, and only to a higher score.
- Per-question results can be read only by the accounts listed in `isAdmin()`.
- Nobody can edit or delete anything except dashboard users.

To add a dashboard user later, add their Google address in **both** places: `isAdmin()` in the rules and `adminEmails` in `config.js`.

---

## 4. Put it on GitHub Pages

1. Create a public repository on GitHub, e.g. `cpr-challenge`.
2. Click **Add file → Upload files** and drag in **everything in this folder**, including the `css`, `js` and `assets` folders, keeping the same structure. Click **Commit changes**.
3. Go to **Settings → Pages**. Set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, and click **Save**.
4. After a minute or two you'll have three links:
   - Game: `https://yourname.github.io/cpr-challenge/`
   - Public leaderboard: `https://yourname.github.io/cpr-challenge/leaderboard.html`
   - Dashboard: `https://yourname.github.io/cpr-challenge/dashboard.html`

To change anything later, upload the edited file to the same place in the repository.

---

## 5. Check that it works

1. Open the game, play once, and confirm the results screen says your score is on the leaderboard. The yellow "Demo mode" notice should be gone.
2. Open the public leaderboard in a private/incognito window. Your entry should appear.
3. Play again with a better score and confirm your leaderboard entry updates (you should appear only once).
4. Open the dashboard, sign in with your Google account, and confirm your games appear.
5. In Firebase, open **Firestore Database → Data**. You should see `boards` and `attempts`.

If something doesn't work, the browser's developer console (F12 → Console) usually names the problem. The most common causes are a missed step in section 2 (Anonymous sign-in off, or the GitHub domain not authorized) or a typo in the rules.

---

## 6. Using the dashboard

- **Time period:** this month, last month, 90 days, 12 months, or all time. Monthly leaderboards reset on the 1st (UTC); the analytics keep everything.
- **First attempt per player vs every attempt:** first attempts show what people believed before the game taught them, which is what you want for finding misconceptions. Every attempt shows learning over repeat plays.
- **Role:** compare veterinarians, technicians, students and others.
- **Red bar segments** are wrong answers given in under 10 seconds. A question with low accuracy *and* a lot of fast wrong answers is flagged **Likely misconception**: people weren't unsure, they were confidently wrong.
- **Export** gives a per-question summary or every individual answer as CSV for Excel. Exports never include names.
- **Show sample data** is for demos only and is clearly labeled on screen and in export file names.

## 7. Managing the leaderboard

- **Remove an entry:** Firestore Database → Data → `boards` → the month (e.g. `m-2026-10`) or `all` → `players` → select the entry → three-dot menu → **Delete document**.
- **Free-plan capacity:** each finished game uses up to 3 writes and roughly 30–55 reads (mostly loading the top 25). The free plan's 20,000 writes and 50,000 reads per day allow roughly 1,000 games a day. Opening the dashboard reads one record per game in the chosen time period, so an "All time" view with 5,000 games uses 5,000 reads; prefer shorter periods once data builds up. If limits are reached, the game still plays; saving and the leaderboard resume after the daily reset (midnight Pacific).

## 8. Known limits

- A player's identity is their browser. Clearing browser data or switching devices creates a new player, so one person can appear more than once on the board.
- Scoring happens in the browser. The rules reject impossible scores, but a technically skilled person could post a plausible fake. The public board is for motivation, not prizes.
- The answers are visible in the page source to anyone who looks.

## 9. Moving to Docebo later

The Docebo version reuses almost everything here. The planned changes:
- The game gets packaged as a **SCORM 2004** zip and uploaded to a Docebo course.
- The learner's name comes from Docebo automatically (still shown publicly as "First L.").
- Each answer is also reported to Docebo, so its **Answers breakdown** report works alongside this dashboard.
- The public leaderboard stays on GitHub Pages; set `playUrl` in `config.js` to the Docebo course link so "Play the challenge" sends people there.
- Add your Docebo domain to **Authentication → Authorized domains**.
