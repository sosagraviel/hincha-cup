import s from "../../styles/app.module.css";
import { usePartido } from "../../context/PartidoContext";
import { scoreCorto } from "../../utils/format";

export function LiveBar() {
  const { partido } = usePartido();

  if (!partido) {
    return <div className={s.loading}>Cargando partido…</div>;
  }

  const score = scoreCorto(
    partido.equipoLocal,
    partido.golesLocal,
    partido.equipoVisitante,
    partido.golesVisitante,
  );

  return (
    <div className={s.livebar}>
      <span
        className={`${s.dot} ${partido.estado === "en_vivo" ? s.dotLive : ""}`}
        aria-hidden="true"
      />
      <span className={s.livebarScore}>{score}</span>
      <span className={s.livebarMin}>{partido.minuto}&apos;</span>
    </div>
  );
}
