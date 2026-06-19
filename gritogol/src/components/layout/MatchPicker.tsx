import s from "../../styles/app.module.css";
import type { CopaFixture } from "../../types/firestore";
import { useSuscripcion } from "../../context/SuscripcionContext";

interface MatchPickerProps {
  fixtures: Array<{ id: string } & CopaFixture>;
}

export function MatchPicker({ fixtures }: MatchPickerProps) {
  const { marcarFavorito, toggleSecundario } = useSuscripcion();

  if (fixtures.length === 0) {
    return (
      <div className={s.loading}>No hay partidos en vivo ahora mismo.</div>
    );
  }

  return (
    <div className={s.copaTicker} aria-label="Seleccionar partido a seguir">
      <div className={s.copaTickerTrack}>
        {fixtures.map((fixture) => (
          <span key={fixture.id} className={s.copaTickerItem}>
            <span className={s.copaTickerDot} aria-hidden="true" />
            {fixture.codigoLocal} vs {fixture.codigoVisitante}
            <button
              className={s.badge}
              style={{ marginLeft: 6, cursor: "pointer" }}
              onClick={() => void marcarFavorito(fixture.fixtureId)}
              type="button"
            >
              ⭐ Marcar favorito
            </button>
            <button
              className={s.badge}
              style={{ marginLeft: 4, cursor: "pointer" }}
              onClick={() => void toggleSecundario(fixture.fixtureId)}
              type="button"
            >
              + Seguir
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
