import s from "../../styles/app.module.css";
import { usePartido } from "../../context/PartidoContext";
import { scoreCorto } from "../../utils/format";

export function VideoSponsorOverlay() {
  const { partido } = usePartido();
  if (!partido) return null;

  const score = scoreCorto(
    partido.equipoLocal,
    partido.golesLocal,
    partido.equipoVisitante,
    partido.golesVisitante,
  );

  return (
    <div className={s.videoSponsorOverlay}>
      <span className={s.videoSponsorScore}>{score}</span>
      <span className={s.videoSponsorBrand}>QUBIKA</span>
    </div>
  );
}
