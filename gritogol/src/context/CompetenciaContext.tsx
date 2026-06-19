import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { Competencia } from "../types/firestore";

interface CompetenciaContextValue {
  competencia: ({ id: string } & Competencia) | null;
}

const CompetenciaContext = createContext<CompetenciaContextValue | null>(null);

export function CompetenciaProvider({
  eventoId,
  children,
}: {
  eventoId: string | null;
  children: ReactNode;
}) {
  const [competencia, setCompetencia] = useState<
    ({ id: string } & Competencia) | null
  >(null);

  useEffect(() => {
    if (!eventoId) {
      setCompetencia(null);
      return;
    }
    const ref = doc(db, "competencias", eventoId);
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setCompetencia(null);
        return;
      }
      setCompetencia({ id: snap.id, ...(snap.data() as Competencia) });
    });
  }, [eventoId]);

  return (
    <CompetenciaContext.Provider value={{ competencia }}>
      {children}
    </CompetenciaContext.Provider>
  );
}

export function useCompetencia() {
  const ctx = useContext(CompetenciaContext);
  if (!ctx)
    throw new Error("useCompetencia must be used within CompetenciaProvider");
  return ctx;
}
