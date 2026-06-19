export const NIVELES = [
  { nivel: 1 as const, umbral: 100, premio: "Pelotita oficial Copa" },
  { nivel: 2 as const, umbral: 400, premio: "Beca de entrenamiento" },
  { nivel: 3 as const, umbral: 900, premio: "Escuela de fútbol" },
] as const;

export type NivelAlcanzado = 0 | 1 | 2 | 3;

export function computeNivel(aplausos: number): NivelAlcanzado {
  if (aplausos >= 900) return 3;
  if (aplausos >= 400) return 2;
  if (aplausos >= 100) return 1;
  return 0;
}

export function nivelSiguiente(nivel: NivelAlcanzado): (typeof NIVELES)[number] | null {
  return NIVELES.find((n) => n.nivel > nivel) ?? null;
}

export function umbralAnterior(nivel: NivelAlcanzado): number {
  return nivel === 0 ? 0 : NIVELES[nivel - 1]!.umbral;
}
