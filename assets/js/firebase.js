// JK Database V7.2 Firebase client configuration.
// This web config is public by design; Firestore Security Rules enforce access.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  runTransaction,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA9cw1kCGw5sTfbmahsdOejqCj9jFR_JZg",
  authDomain: "jkdatabase-35a49.firebaseapp.com",
  projectId: "jkdatabase-35a49",
  storageBucket: "jkdatabase-35a49.firebasestorage.app",
  messagingSenderId: "792234251566",
  appId: "1:792234251566:web:064257635c7ee044f256bf",
  measurementId: "G-YF47H7JZ5D",
};

export const BUSINESS_ID = "jkdatabase-main";
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const firebaseAuth = {
  browserLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
};
export const firebaseStore = {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  writeBatch,
};
