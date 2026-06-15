import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main>
      <h1>404 — Página no encontrada</h1>
      <p>La ruta que buscás no existe.</p>
      <Link to="/">Volver al inicio</Link>
    </main>
  );
}
