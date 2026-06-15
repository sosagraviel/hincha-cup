import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { suscribirPartido } from "../services/partidoService";
import type { Partido } from "../types/firestore";

export const seedPartidoId = "partido-arg-mex-2026";

export default function HomePage() {
  const [partido, setPartido] = useState<({ id: string } & Partido) | null>(
    null,
  );

  useEffect(() => {
    const unsubscribe = suscribirPartido(seedPartidoId, setPartido);
    return unsubscribe;
  }, []);

  return (
    <main>
      <h1>GritoGol</h1>
      {partido ? (
        <section>
          <h2>
            {partido.equipoLocal} {partido.golesLocal} -{" "}
            {partido.golesVisitante} {partido.equipoVisitante}
          </h2>
          <p>Estado: {partido.estado}</p>
          <p>Minuto: {partido.minuto}</p>
        </section>
      ) : (
        <p>Cargando partido...</p>
      )}
      <nav>
        <ul>
          <li>
            <Link to="/camara">Festejar</Link>
          </li>
          <li>
            <Link to="/tribuna">Tribuna</Link>
          </li>
          <li>
            <Link to="/ganadores">Ganadores</Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}
