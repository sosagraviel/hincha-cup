import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { loginAnonimo, loginGoogle, onAuthState } from "../services/authService";
import { getAlias, setAlias as persistAlias } from "../constants";

interface AuthContextValue {
  user: User | null;
  alias: string;
  ready: boolean;
  setAlias: (alias: string) => void;
  signInGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [alias, setAliasState] = useState(getAlias);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthState((nextUser) => {
      if (!nextUser) {
        void loginAnonimo().catch((error: unknown) => {
          console.error("Anonymous login failed:", error);
        });
        return;
      }
      setUser(nextUser);
      setReady(true);
    });

    return unsubscribe;
  }, []);

  const setAlias = useCallback((value: string) => {
    persistAlias(value);
    setAliasState(getAlias());
  }, []);

  const signInGoogle = useCallback(async () => {
    await loginGoogle();
  }, []);

  const value = useMemo(
    () => ({ user, alias, ready, setAlias, signInGoogle }),
    [user, alias, ready, setAlias, signInGoogle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
