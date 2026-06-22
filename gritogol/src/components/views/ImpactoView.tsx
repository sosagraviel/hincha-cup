import { useEffect, useState } from "react";
import { usePartido } from "../../context/PartidoContext";
import { suscribirBeneficiarios } from "../../services/impactoService";
import { BeneficiaryCard } from "../impact/BeneficiaryCard";
import type { Beneficiario } from "../../types/firestore";

export function ImpactoView() {
  const { equipo } = usePartido();
  const [beneficiarios, setBeneficiarios] = useState<
    Array<{ id: string } & Beneficiario>
  >([]);

  useEffect(() => {
    const unsubscribe = suscribirBeneficiarios(equipo, setBeneficiarios);
    return unsubscribe;
  }, [equipo]);

  return (
    <>
      <div className="flex items-baseline justify-between px-[18px] pt-[2px] pb-[10px]">
        <h3 className="text-[16px] font-bold">A dónde va el impacto</h3>
        <small className="text-[12px] text-[var(--gris)]">actualizado hoy</small>
      </div>

      {beneficiarios.map((b) => (
        <BeneficiaryCard key={b.id} beneficiario={b} />
      ))}

      <p className="mx-[18px] mb-4 mt-1 text-[12px] text-[var(--gris)] leading-[1.6] [&_b]:text-[var(--tiza)]">
        Cada festejo subido al muro suma puntos de impacto. Los sponsors
        convierten esos puntos en{" "}
        <b>pelotas, becas, útiles y equipamiento</b> para quien más lo
        necesita. Todo se publica acá, con nombre y apellido, para que veas
        exactamente a dónde llegó tu grito.
      </p>
    </>
  );
}
