import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { suscribirUsuario, guardarSuscripcion } from "../services/suscripcionService";

interface SuscripcionContextValue {
  fixtureFavorito: number | null;
  fixturesSecundarios: number[];
  marcarFavorito: (fixtureId: number) => Promise<void>;
  toggleSecundario: (fixtureId: number) => Promise<void>;
}

const SuscripcionContext = createContext<SuscripcionContextValue | null>(null);

export function SuscripcionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [fixtureFavorito, setFixtureFavorito] = useState<number | null>(null);
  const [fixturesSecundarios, setFixturesSecundarios] = useState<number[]>([]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = suscribirUsuario(user.uid, (usuario) => {
      setFixtureFavorito(usuario?.fixtureFavorito ?? null);
      setFixturesSecundarios(usuario?.fixturesSecundarios ?? []);
    });

    return unsubscribe;
  }, [user]);

  const marcarFavorito = useCallback(
    async (fixtureId: number) => {
      if (!user) return;

      const prevFavorito = fixtureFavorito;
      const secundariosActuales = fixturesSecundarios.filter(
        (id) => id !== fixtureId,
      );

      const nuevosSecundarios =
        prevFavorito !== null && prevFavorito !== fixtureId
          ? [...secundariosActuales, prevFavorito]
          : secundariosActuales;

      await guardarSuscripcion(user.uid, {
        fixtureFavorito: fixtureId,
        fixturesSecundarios: nuevosSecundarios,
      });
    },
    [user, fixtureFavorito, fixturesSecundarios],
  );

  const toggleSecundario = useCallback(
    async (fixtureId: number) => {
      if (!user || fixtureId === fixtureFavorito) return;

      const yaEstabaEnLista = fixturesSecundarios.includes(fixtureId);
      const nuevosSecundarios = yaEstabaEnLista
        ? fixturesSecundarios.filter((id) => id !== fixtureId)
        : [...fixturesSecundarios, fixtureId];

      await guardarSuscripcion(user.uid, {
        fixturesSecundarios: nuevosSecundarios,
      });
    },
    [user, fixtureFavorito, fixturesSecundarios],
  );

  const value = useMemo(
    () => ({ fixtureFavorito, fixturesSecundarios, marcarFavorito, toggleSecundario }),
    [fixtureFavorito, fixturesSecundarios, marcarFavorito, toggleSecundario],
  );

  return (
    <SuscripcionContext.Provider value={value}>
      {children}
    </SuscripcionContext.Provider>
  );
}

export function useSuscripcion(): SuscripcionContextValue {
  const ctx = useContext(SuscripcionContext);
  if (!ctx) {
    throw new Error("useSuscripcion must be used within SuscripcionProvider");
  }
  return ctx;
}
