import {
  signInWithPopup,
  signInAnonymously,
  onAuthStateChanged,
  type UserCredential,
  type User,
  type Unsubscribe,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

/** Signs in the user with Google OAuth via popup. Silently ignores popup dismissal. */
export async function loginGoogle(): Promise<UserCredential> {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: unknown) {
    const code =
      error instanceof Error && "code" in error
        ? (error as { code: string }).code
        : "";

    if (code === "auth/popup-closed-by-user") {
      throw new Error("El usuario cerró el popup de inicio de sesión.");
    }

    if (code === "auth/popup-blocked") {
      throw new Error(
        "Habilita las ventanas emergentes para iniciar sesión con Google.",
      );
    }

    throw error;
  }
}

/** Creates an anonymous Firebase Auth session for demo/pre-login access. */
export async function loginAnonimo(): Promise<UserCredential> {
  return signInAnonymously(auth);
}

/** Subscribes to auth state changes. Returns the unsubscribe function. */
export function onAuthState(cb: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, cb);
}
