import s from "../../styles/app.module.css";
import { useSuscripcion } from "../../context/SuscripcionContext";
import { useCopa } from "../../context/CopaContext";
import { MatchCardFavorito } from "./MatchCardFavorito";
import { MatchCardSecundario } from "./MatchCardSecundario";
import { MatchPicker } from "./MatchPicker";

export function MatchBar() {
  const { fixtureFavorito, fixturesSecundarios } = useSuscripcion();
  const { fixturesEnVivo } = useCopa();

  if (fixtureFavorito === null) {
    return <MatchPicker fixtures={fixturesEnVivo} />;
  }

  const favoritoFixture = fixturesEnVivo.find(
    (f) => f.fixtureId === fixtureFavorito,
  );

  const secundarios = fixturesSecundarios
    .map((id) => fixturesEnVivo.find((f) => f.fixtureId === id))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);

  return (
    <>
      {favoritoFixture && <MatchCardFavorito fixture={favoritoFixture} />}
      {secundarios.length > 0 && (
        <div
          className={s.copaTicker}
          aria-label="Partidos secundarios en vivo"
        >
          <div className={s.copaTickerTrack}>
            {secundarios.map((f) => (
              <MatchCardSecundario key={f.id} fixture={f} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
