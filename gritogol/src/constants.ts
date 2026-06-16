export type EquipoHinchada = "uruguay" | "argentina";

export const PARTIDOS: Record<EquipoHinchada, string> = {
  uruguay: "partido-uru-esp-2026",
  argentina: "partido-arg-mex-2026",
};

export const EQUIPO_LABELS: Record<
  EquipoHinchada,
  { flag: string; label: string }
> = {
  uruguay: { flag: "🇺🇾", label: "Uruguay" },
  argentina: { flag: "🇦🇷", label: "Argentina" },
};

const ALIAS_STORAGE_KEY = "gritogol-alias";
const EQUIPO_STORAGE_KEY = "gritogol-equipo";

export function getEquipoHinchada(): EquipoHinchada {
  const stored = localStorage.getItem(EQUIPO_STORAGE_KEY);
  if (stored === "argentina" || stored === "uruguay") {
    return stored;
  }

  const env = import.meta.env.VITE_EQUIPO;
  if (env === "argentina" || env === "uruguay") {
    return env;
  }

  return "uruguay";
}

export function setEquipoHinchada(equipo: EquipoHinchada): void {
  localStorage.setItem(EQUIPO_STORAGE_KEY, equipo);
}

export function getPartidoId(
  equipo: EquipoHinchada = getEquipoHinchada(),
): string {
  return PARTIDOS[equipo];
}

export function getAlias(): string {
  return localStorage.getItem(ALIAS_STORAGE_KEY) ?? "Vos";
}

export function setAlias(alias: string): void {
  localStorage.setItem(ALIAS_STORAGE_KEY, alias.trim() || "Vos");
}

export function getIniciales(nombre: string): string {
  const parts = nombre.replace(/^@/, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
