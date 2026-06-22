import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import s from "../styles/app.module.css";
import { usePartido } from "../context/PartidoContext";
import { obtenerCompetenciasDelPartido } from "../services/videoService";
import type { Competencia } from "../types/firestore";
import { NIVELES, computeNivel } from "../constants/niveles";
import { tiempoRelativo } from "../utils/format";

export default function GanadoresPage() {
  const { partidoId } = usePartido();
  const [competencias, setCompetencias] = useState<
    Array<{ id: string } & Competencia>
  >([]);

  useEffect(() => {
    if (!partidoId) return;
    return obtenerCompetenciasDelPartido(partidoId, setCompetencias);
  }, [partidoId]);

  const cerradas = competencias.filter((c) => c.estado === "cerrada");
  const activas = competencias.filter((c) => c.estado === "activa");

  return (
    <main className={s.main}>
      <div className="px-[18px] pt-5 pb-[10px]">
        <h2 className="text-[22px] font-bold text-[var(--tiza)] mb-1">Ganadores</h2>
        <p className="text-[13px] text-[var(--gris)] m-0">
          Los mejores festejos de este partido
        </p>
      </div>

      {activas.length > 0 && (
        <section className="pb-4">
          <h3 className="text-[11px] font-bold text-[var(--gris)] tracking-[1px] uppercase px-[18px] pt-[10px] pb-1.5 m-0">
            En competencia ahora
          </h3>
          {activas.map((comp) => (
            <div key={comp.id} className="mx-[14px] mb-[10px] bg-[var(--surface)] border border-[var(--linea)] rounded-[var(--radius)] px-[14px] py-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className={s.badgeVivo}>EN VIVO</span>
                <span className="text-[11px] text-[var(--gris)]">
                  {comp.videosParticipantes.length} festejos compitiendo
                </span>
              </div>
              <p className="text-[13px] text-[var(--gris)] m-0">
                Cierra {tiempoRelativo(comp.cierraEn)}
              </p>
            </div>
          ))}
        </section>
      )}

      {cerradas.length === 0 && activas.length === 0 && (
        <div className="py-[40px] px-6 text-center text-[var(--gris)] text-[14px]">
          <p>Las competencias aparecerán aquí cuando finalicen.</p>
          <p>
            <em>Sube un festejo para competir.</em>
          </p>
        </div>
      )}

      {cerradas.length > 0 && (
        <section className="pb-4">
          <h3 className="text-[11px] font-bold text-[var(--gris)] tracking-[1px] uppercase px-[18px] pt-[10px] pb-1.5 m-0">
            Competencias cerradas
          </h3>
          {cerradas.map((comp) => {
            if (!comp.ganadorVideoId) return null;
            return <GanadorCard key={comp.id} comp={comp} />;
          })}
        </section>
      )}
    </main>
  );
}

interface GanadorInfo {
  autorAlias: string;
  aplausos: number;
  nivelAlcanzado: number;
}

function GanadorCard({ comp }: { comp: { id: string } & Competencia }) {
  const [ganadorInfo, setGanadorInfo] = useState<GanadorInfo | null>(null);

  useEffect(() => {
    if (!comp.ganadorVideoId) return;
    let cancelled = false;
    void getDoc(doc(db, "videos", comp.ganadorVideoId)).then((snap) => {
      if (cancelled || !snap.exists()) return;
      const data = snap.data();
      setGanadorInfo({
        autorAlias: (data["autorAlias"] as string) ?? "Fanático",
        aplausos: (data["aplausos"] as number) ?? 0,
        nivelAlcanzado: (data["nivelAlcanzado"] as number) ?? 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [comp.ganadorVideoId]);

  const nivel = ganadorInfo ? computeNivel(ganadorInfo.aplausos) : 0;
  const premio = nivel > 0 ? NIVELES[nivel - 1]?.premio : null;

  return (
    <div className="mx-[14px] mb-[10px] bg-[var(--surface)] border border-[var(--linea)] rounded-[var(--radius)] px-[14px] py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={`${s.badge} ${s.badgeUno}`}>🏆 GANADOR</span>
        <span className="text-[11px] text-[var(--gris)]">
          cerrado {tiempoRelativo(comp.cierraEn)}
        </span>
      </div>
      {ganadorInfo ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-bold text-[var(--tiza)]">{ganadorInfo.autorAlias}</span>
            <span className="text-[13px] text-[var(--rojo)] font-semibold">
              ❤️ {ganadorInfo.aplausos} aplausos
            </span>
          </div>
          {premio && (
            <div className="text-[12px] text-[var(--sol)] font-semibold bg-[#3a2c0c] px-[10px] py-[5px] rounded-[8px]">
              {"⭐".repeat(nivel)} Premio Nivel {nivel}: {premio}
            </div>
          )}
        </>
      ) : (
        <p className="text-[13px] text-[var(--gris)] m-0">Cargando...</p>
      )}
    </div>
  );
}
