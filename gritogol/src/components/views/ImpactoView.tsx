import { useEffect, useState } from "react";
import s from "../../styles/app.module.css";
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
      <div className={s.seccionTitulo}>
        <h3>A dónde va el impacto</h3>
        <small>actualizado hoy</small>
      </div>

      {beneficiarios.map((b) => (
        <BeneficiaryCard key={b.id} beneficiario={b} />
      ))}

      <p className={s.notaImpacto}>
        Cada festejo subido al muro suma puntos de impacto. Los sponsors
        convierten esos puntos en{" "}
        <b>pelotas, becas, útiles y equipamiento</b> para quien más lo
        necesita. Todo se publica acá, con nombre y apellido, para que veas
        exactamente a dónde llegó tu grito.
      </p>
    </>
  );
}
