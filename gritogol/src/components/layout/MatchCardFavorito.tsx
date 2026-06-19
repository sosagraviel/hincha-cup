import s from "../../styles/app.module.css";
import type { CopaFixture } from "../../types/firestore";

interface MatchCardFavoritoProps {
  fixture: { id: string } & CopaFixture;
}

export function MatchCardFavorito({ fixture }: MatchCardFavoritoProps) {
  const enVivo = fixture.estado === "en_vivo";

  return (
    <div className={s.livebar}>
      <span
        className={`${s.dot} ${enVivo ? s.dotLive : ""}`}
        aria-hidden="true"
      />
      <span className={s.livebarScore}>
        {fixture.codigoLocal} {fixture.golesLocal} – {fixture.golesVisitante}{" "}
        {fixture.codigoVisitante}
      </span>
      <span className={s.livebarMin}>{fixture.minuto}&apos;</span>
    </div>
  );
}
