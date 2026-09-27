/* =================================================================
   CPR Misconceptions Challenge — shared settings
   Edit this file, then re-upload it to GitHub. All three pages use it:
   index.html (the game), leaderboard.html (public), dashboard.html (admin).
   ================================================================= */
window.APP_CONFIG = {

  // Your Firebase project settings (from Project settings → General → Your apps).
  firebase: {
    apiKey: "AIzaSyB-Evldhw1CRErqC9jT5sZ5jjj8ECKtiZI",
    authDomain: "cpr-misconceptions-1.firebaseapp.com",
    projectId: "cpr-misconceptions-1",
    storageBucket: "cpr-misconceptions-1.firebasestorage.app",
    messagingSenderId: "756118633177",
    appId: "1:756118633177:web:b42223f37567d1d5709cc8"
  },

  // Google accounts allowed to open the analytics dashboard.
  // These must ALSO be listed in the Firestore security rules (SETUP.md, step 3) —
  // the rules are what actually protect the data; this list only controls what the page shows.
  adminEmails: ["dan.fletcher@recoverinitiative.org"],   // <-- replace with your Google address, keep the quotes

  secondsPerQuestion: 30,
  maxPoints: 1000,          // points for an instant correct answer
  minPoints: 500,           // points for a correct answer at the buzzer
  leaderboardSize: 25,

  // Where the "Play the challenge" button on the public leaderboard points.
  // For the demo this is the game on GitHub Pages; later it can be your Docebo course link.
  playUrl: "index.html",

  footer: "RECOVER Initiative"
};