import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);

const firestoreConnectionSettings = {
  experimentalAutoDetectLongPolling: true
};

function createFirestoreDatabase() {
  try {
    return initializeFirestore(firebaseApp, {
      ...firestoreConnectionSettings,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (error) {
    console.warn("Persistent Firestore cache unavailable; falling back to memory cache.", error);
    return initializeFirestore(firebaseApp, {
      ...firestoreConnectionSettings,
      localCache: memoryLocalCache()
    });
  }
}

export const db = createFirestoreDatabase();

export const auth = getAuth(firebaseApp);

export async function initializeAuthPersistence() {
  await setPersistence(auth, browserLocalPersistence);
}

export {
  collection,
  deleteDoc,
  doc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  onAuthStateChanged,
  onSnapshot,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  writeBatch
};
