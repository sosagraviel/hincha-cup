import s from "../../styles/app.module.css";
import { useCopa } from "../../context/CopaContext";
import { usePartido } from "../../context/PartidoContext";
import { scoreCorto } from "../../utils/format";

export function CopaTicker() {
  const { fixturesEnVivo } = useCopa();
  const { partidoId } = usePartido();

  const otros = fixturesEnVivo.filter(
    (fixture) => fixture.partidoId !== partidoId,
  );

  if (otros.length === 0) {
    return null;
  }

  return (
    <div className={s.copaTicker} aria-label="Otros partidos en vivo del Mundial">
      <div className={s.copaTickerTrack}>
        {otros.map((fixture) => {
          const score = scoreCorto(
            fixture.equipoLocal,
            fixture.golesLocal,
            fixture.equipoVisitante,
            fixture.golesVisitante,
          );
          return (
            <span key={fixture.id} className={s.copaTickerItem}>
              <span className={s.copaTickerDot} aria-hidden="true" />
              {score}
              <span className={s.copaTickerMin}>{fixture.minuto}&apos;</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
