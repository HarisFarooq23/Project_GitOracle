"use client";

import { useEffect } from "react";
import { getFirebaseApp } from "@/lib/firebase";

/** Ensures the Firebase Web SDK is initialized once (your firebaseConfig / env). */
export function FirebaseClientInit() {
  useEffect(() => {
    getFirebaseApp();
  }, []);
  return null;
}
