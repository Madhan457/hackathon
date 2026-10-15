
import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAPobaUCxqmW4OioVFmwyokYYxjhnLpS6M",
  authDomain: "hackathon-d2299.firebaseapp.com",
  projectId: "hackathon-d2299",
  storageBucket: "hackathon-d2299.firebasestorage.app",
  messagingSenderId: "671238435034",
  appId: "1:671238435034:web:294b6511cdc95358eb35e3",
  measurementId: "G-5Y09HN3LT7"
};

const requiredConfig = ["apiKey", "authDomain", "projectId", "appId"];
const missingConfig = requiredConfig.filter((key) => !firebaseConfig[key]?.trim());

export const firebaseConfigurationError = missingConfig.length
  ? new Error(`Firebase configuration is missing: ${missingConfig.join(", ")}.`)
  : null;

let app = null;
let auth = null;
let db = null;

if (!firebaseConfigurationError) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export {
  app,
  auth,
  db,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
};