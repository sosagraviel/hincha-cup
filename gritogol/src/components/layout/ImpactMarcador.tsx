import s from "../../styles/app.module.css";
import { usePartido } from "../../context/PartidoContext";

export function ImpactMarcador() {
  const { partido } = usePartido();

  if (!partido) return null;

  return (
    <section className={s.marcador} aria-label="Marcador de impacto">
      <h2 className={s.marcadorTitle}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
        </svg>
        Impacto desbloqueado hoy
      </h2>
      <div className={s.cifras}>
        <div className={s.cifra}>
          <div className={s.cifraNum}>{partido.pelotasDesbloqueadas ?? 0}</div>
          <div className={s.cifraLbl}>pelotas</div>
        </div>
        <div className={s.cifra}>
          <div className={s.cifraNum}>{partido.becasDesbloqueadas ?? 0}</div>
          <div className={s.cifraLbl}>becas</div>
        </div>
        <div className={s.cifra}>
          <div className={s.cifraNum}>{partido.escuelasBeneficiadas ?? 0}</div>
          <div className={s.cifraLbl}>escuelas</div>
        </div>
      </div>
      <div className={s.sponsor}>
        <span>Impacto financiado por</span>
        <b className={s.sponsorName}>⚡ {partido.sponsor.nombre}</b>
      </div>
    </section>
  );
}
