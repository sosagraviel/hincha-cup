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
      <div className={s.ganadoresHeader}>
        <h2 className={s.ganadoresTitulo}>Ganadores</h2>
        <p className={s.ganadoresSubtitulo}>
          Los mejores festejos de este partido
        </p>
      </div>

      {activas.length > 0 && (
        <section className={s.ganadoresSeccion}>
          <h3 className={s.ganadoresSectionTitle}>En competencia ahora</h3>
          {activas.map((comp) => (
            <div key={comp.id} className={s.ganadoresCard}>
              <div className={s.ganadoresCardHead}>
                <span className={s.badgeVivo}>EN VIVO</span>
                <span className={s.ganadoresMeta}>
                  {comp.videosParticipantes.length} festejos compitiendo
                </span>
              </div>
              <p className={s.ganadoresInfo}>
                Cierra {tiempoRelativo(comp.cierraEn)}
              </p>
            </div>
          ))}
        </section>
      )}

      {cerradas.length === 0 && activas.length === 0 && (
        <div className={s.ganadoresVacio}>
          <p>Las competencias aparecerán aquí cuando finalicen.</p>
          <p>
            <em>Sube un festejo para competir.</em>
          </p>
        </div>
      )}

      {cerradas.length > 0 && (
        <section className={s.ganadoresSeccion}>
          <h3 className={s.ganadoresSectionTitle}>Competencias cerradas</h3>
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
    <div className={s.ganadoresCard}>
      <div className={s.ganadoresCardHead}>
        <span className={`${s.badge} ${s.badgeUno}`}>🏆 GANADOR</span>
        <span className={s.ganadoresMeta}>
          cerrado {tiempoRelativo(comp.cierraEn)}
        </span>
      </div>
      {ganadorInfo ? (
        <>
          <div className={s.ganadoresGanador}>
            <span className={s.ganadoresNombre}>{ganadorInfo.autorAlias}</span>
            <span className={s.ganadoresAplausos}>
              ❤️ {ganadorInfo.aplausos} aplausos
            </span>
          </div>
          {premio && (
            <div className={s.ganadoresPremio}>
              {"⭐".repeat(nivel)} Premio Nivel {nivel}: {premio}
            </div>
          )}
        </>
      ) : (
        <p className={s.ganadoresInfo}>Cargando...</p>
      )}
    </div>
  );
}
