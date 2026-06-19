import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type EquipoHinchada,
  getEquipoHinchada,
  getPartidoId,
  setEquipoHinchada as persistEquipo,
} from "../constants";
import { suscribirPartido } from "../services/partidoService";
import type { Partido } from "../types/firestore";
import { useSuscripcion } from "./SuscripcionContext";
import { useCopa } from "./CopaContext";

interface PartidoContextValue {
  equipo: EquipoHinchada;
  partidoId: string;
  partido: ({ id: string } & Partido) | null;
  setEquipo: (equipo: EquipoHinchada) => void;
}

const PartidoContext = createContext<PartidoContextValue | null>(null);

export function PartidoProvider({ children }: { children: ReactNode }) {
  const [equipo, setEquipoState] = useState<EquipoHinchada>(getEquipoHinchada);
  const [partido, setPartido] = useState<({ id: string } & Partido) | null>(
    null,
  );

  const { fixtureFavorito } = useSuscripcion();
  const { fixturesEnVivo } = useCopa();

  const favoritoFixture = fixturesEnVivo.find(
    (f) => f.fixtureId === fixtureFavorito,
  );

  const partidoId = useMemo(
    () => favoritoFixture?.partidoId ?? getPartidoId(equipo),
    [favoritoFixture, equipo],
  );

  useEffect(() => {
    const unsubscribe = suscribirPartido(partidoId, setPartido);
    return unsubscribe;
  }, [partidoId]);

  const setEquipo = useCallback((next: EquipoHinchada) => {
    persistEquipo(next);
    setEquipoState(next);
  }, []);

  const value = useMemo(
    () => ({ equipo, partidoId, partido, setEquipo }),
    [equipo, partidoId, partido, setEquipo],
  );

  return (
    <PartidoContext.Provider value={value}>{children}</PartidoContext.Provider>
  );
}

export function usePartido(): PartidoContextValue {
  const ctx = useContext(PartidoContext);
  if (!ctx) {
    throw new Error("usePartido must be used within PartidoProvider");
  }
  return ctx;
}
