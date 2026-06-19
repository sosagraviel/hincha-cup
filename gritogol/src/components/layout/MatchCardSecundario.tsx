import s from "../../styles/app.module.css";
import type { CopaFixture } from "../../types/firestore";

interface MatchCardSecundarioProps {
  fixture: { id: string } & CopaFixture;
}

export function MatchCardSecundario({ fixture }: MatchCardSecundarioProps) {
  const enVivo = fixture.estado === "en_vivo";

  return (
    <span className={s.copaTickerItem}>
      <span
        className={`${s.copaTickerDot} ${enVivo ? s.dotLive : ""}`}
        aria-hidden="true"
      />
      {fixture.codigoLocal} {fixture.golesLocal} – {fixture.golesVisitante}{" "}
      {fixture.codigoVisitante}
      <span className={s.copaTickerMin}>{fixture.minuto}&apos;</span>
    </span>
  );
}
