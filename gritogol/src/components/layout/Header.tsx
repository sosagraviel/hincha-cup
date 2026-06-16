import s from "../../styles/app.module.css";
import { usePartido } from "../../context/PartidoContext";
import { codigosPartido } from "../../utils/format";

export function Header() {
  const { partido } = usePartido();

  const equiposLabel = partido
    ? codigosPartido(partido.equipoLocal, partido.equipoVisitante)
    : "— – —";

  return (
    <header className={s.header}>
      <div>
        <div className={s.wordmark}>
          GRITO<span className={s.wordmarkAccent}>GOL</span>
        </div>
        <div className={s.tagline}>tu grito vale un gol</div>
      </div>
      <div className={s.headerMeta}>
        <div className={s.headerLabel}>MUNDIAL 2026</div>
        <div className={s.headerTeam}>{equiposLabel}</div>
      </div>
    </header>
  );
}
