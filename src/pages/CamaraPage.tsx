import { useSearchParams } from "react-router-dom";

export default function CamaraPage() {
  const [searchParams] = useSearchParams();
  const golParam = searchParams.get("gol");
  const golNumero = golParam !== null ? parseInt(golParam, 10) : null;

  return (
    <main>
      <h1>Cámara</h1>
      {golNumero !== null && !isNaN(golNumero) ? (
        <p>Festejando el gol #{golNumero}</p>
      ) : (
        <p>Seleccioná un gol para festejar.</p>
      )}
      <p>
        <em>Grabación de cámara — próximamente (GG-01 / GG-11)</em>
      </p>
    </main>
  );
}
