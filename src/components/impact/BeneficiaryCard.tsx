import s from "../../styles/app.module.css";
import type { Beneficiario } from "../../types/firestore";

interface BeneficiaryCardProps {
  beneficiario: { id: string } & Beneficiario;
}

function Icono({ tipo }: { tipo: Beneficiario["tipoImpacto"] }) {
  if (tipo === "escuelas") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M4 19V7l8-4 8 4v12M9 19v-6h6v6" />
      </svg>
    );
  }

  if (tipo === "becas") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="9" cy="8" r="3" />
        <circle cx="16.5" cy="9.5" r="2.5" />
        <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M14.5 14.5c2.8.2 5 1.8 5 4.5" />
      </svg>
    );
  }

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4.5 3.3-1.7 5.3H9.2L7.5 10.3z" />
    </svg>
  );
}

export function BeneficiaryCard({ beneficiario }: BeneficiaryCardProps) {
  const iconClass =
    beneficiario.tipoImpacto === "escuelas"
      ? `${s.beneficiarioIcono} ${s.beneficiarioIconoDorado}`
      : s.beneficiarioIcono;

  return (
    <div className={s.beneficiario}>
      <div className={iconClass}>
        <Icono tipo={beneficiario.tipoImpacto} />
      </div>
      <div>
        <h4>{beneficiario.nombre}</h4>
        <p>
          {beneficiario.ubicacion} · {beneficiario.descripcion}
        </p>
        <div className={s.recibido}>Recibió: {beneficiario.recibido}</div>
      </div>
    </div>
  );
}
