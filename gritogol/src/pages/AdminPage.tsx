import { useState } from "react";
import { dispararGol, cerrarVotacion } from "../services/partidoService";
import { seedPartidoId } from "./HomePage";

export default function AdminPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDispararGol() {
    setLoading(true);
    setMessage(null);
    try {
      await dispararGol(seedPartidoId);
      setMessage("Gol disparado correctamente.");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      setMessage(`Error al disparar gol: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCerrarVotacion() {
    setLoading(true);
    setMessage(null);
    try {
      await cerrarVotacion(seedPartidoId);
      setMessage("Votación cerrada correctamente.");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      setMessage(`Error al cerrar votación: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Admin</h1>
      <p>Panel de administración del partido.</p>
      <div>
        <button onClick={() => void handleDispararGol()} disabled={loading}>
          Disparar Gol
        </button>
        <button onClick={() => void handleCerrarVotacion()} disabled={loading}>
          Cerrar Votación
        </button>
      </div>
      {message !== null && <p>{message}</p>}
    </main>
  );
}
