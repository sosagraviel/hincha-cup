import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { suscribirFixturesEnVivo } from "../services/copaService";
import type { CopaFixture } from "../types/firestore";

interface CopaContextValue {
  fixturesEnVivo: Array<{ id: string } & CopaFixture>;
}

const CopaContext = createContext<CopaContextValue | null>(null);

export function CopaProvider({ children }: { children: ReactNode }) {
  const [fixturesEnVivo, setFixturesEnVivo] = useState<
    Array<{ id: string } & CopaFixture>
  >([]);

  useEffect(() => {
    return suscribirFixturesEnVivo(setFixturesEnVivo);
  }, []);

  const value = useMemo(() => ({ fixturesEnVivo }), [fixturesEnVivo]);

  return (
    <CopaContext.Provider value={value}>{children}</CopaContext.Provider>
  );
}

export function useCopa(): CopaContextValue {
  const ctx = useContext(CopaContext);
  if (!ctx) {
    throw new Error("useCopa must be used within CopaProvider");
  }
  return ctx;
}
