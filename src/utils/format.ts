import type { Timestamp } from "firebase/firestore";

export function formatoNumero(n: number): string {
  return n.toLocaleString("es-UY");
}

export function tiempoRelativo(ts: Timestamp | null): string {
  if (!ts) return "recién";
  const diffMs = Date.now() - ts.toMillis();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "recién";
  if (mins === 1) return "hace 1 min";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "hace 1 h" : `hace ${hours} h`;
}

export function formatoDuracion(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function abreviarEquipo(nombre: string): string {
  const map: Record<string, string> = {
    Uruguay: "URU",
    España: "ESP",
    Argentina: "ARG",
    México: "MEX",
  };
  return map[nombre] ?? nombre.slice(0, 3).toUpperCase();
}

export function codigosPartido(local: string, visitante: string): string {
  return `${abreviarEquipo(local)} – ${abreviarEquipo(visitante)}`;
}

export function scoreCorto(
  local: string,
  golesLocal: number,
  visitante: string,
  golesVisitante: number,
): string {
  return `${abreviarEquipo(local)} ${golesLocal} – ${golesVisitante} ${abreviarEquipo(visitante)}`;
}
