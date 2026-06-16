import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

function resolveApiKey(): string {
  if (useEmulators) {
    // Any AIzaSy… string works with the Auth emulator; placeholders crash the SDK.
    return "AIzaSyDEMO_KEY_FOR_EMULATORS_ONLY";
  }

  const raw = import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? "";
  if (!raw || raw.includes("your-api-key")) {
    throw new Error(
      "VITE_FIREBASE_API_KEY is missing. Copy .env.example to .env.local.",
    );
  }

  return raw;
}

const firebaseConfig = {
  apiKey: resolveApiKey(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8081);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

setPersistence(auth, browserLocalPersistence).catch((error: unknown) => {
  console.error("Failed to set auth persistence:", error);
});
