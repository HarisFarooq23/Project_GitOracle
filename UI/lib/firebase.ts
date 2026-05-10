import { type FirebaseOptions, initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyA4i_91soyII7DJlYlC8BC5webds5Or4U4",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "dbms-gitoracle.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "dbms-gitoracle",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "dbms-gitoracle.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "689033537924",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:689033537924:web:1bb7b923aab7741b9695d1",
};

/**
 * Singleton Firebase Web SDK app instance (Hosting, Auth, etc.).
 * Firestore user documents are written from Flask with the Admin SDK; production rules
 * deny client reads/writes to keep only server-side mirrored `users` table fields.
 */
export function getFirebaseApp() {
  if (!getApps().length) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

/** Firestore client — available if you loosen rules locally or add Firebase Auth. */
export function getFirebaseFirestoreDb() {
  return getFirestore(getFirebaseApp());
}
