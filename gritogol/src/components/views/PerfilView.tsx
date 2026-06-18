import { useEffect, useState } from "react";
import s from "../../styles/app.module.css";
import { useAuth } from "../../context/AuthContext";
import { usePartido } from "../../context/PartidoContext";
import { useToast } from "../../context/ToastContext";
import { obtenerMisFestejos } from "../../services/videoService";
import { getIniciales, type EquipoHinchada } from "../../constants";
import { compartirInsignia } from "../../utils/insigniaCanvas";
import { scoreCorto } from "../../utils/format";
import type { Video } from "../../types/firestore";

const HINCHADA_OPTIONS: { id: EquipoHinchada; code: string; flag: string }[] = [
  { id: "uruguay", code: "URU", flag: "🇺🇾" },
  { id: "argentina", code: "ARG", flag: "🇦🇷" },
];

export function PerfilView() {
  const { user, alias, setAlias, signInGoogle } = useAuth();
  const { partido, partidoId, equipo, setEquipo } = usePartido();
  const { showToast } = useToast();
  const [festejos, setFestejos] = useState<Array<{ id: string } & Video>>([]);
  const [aliasDraft, setAliasDraft] = useState(alias);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = obtenerMisFestejos(partidoId, user.uid, setFestejos);
    return unsubscribe;
  }, [partidoId, user]);

  const publicados = festejos.filter((v) => v.estado === "publicado");
  const ultimo = publicados[0];
  const partidoLabel = partido
    ? `${scoreCorto(partido.equipoLocal, partido.golesLocal, partido.equipoVisitante, partido.golesVisitante)} · Mundial 2026`
    : "Mundial 2026";

  function guardarAlias() {
    setAlias(aliasDraft);
    showToast("Nombre actualizado");
  }

  async function compartir() {
    if (!ultimo?.gritoNumero) return;
    const puesto = `FESTEJO #${ultimo.gritoNumero}`;
    const texto = `Mi grito está en el Muro de la Hinchada 🇺🇾 ${puesto} · ${partidoLabel}. Cada festejo dona una pelota, una beca o útiles para quien más lo necesita. #GritoGol #Mundial2026`;
    await compartirInsignia(puesto, partidoLabel, texto, showToast);
  }

  return (
    <>
      <div className={s.seccionTitulo}>
        <h3>Tu perfil de hincha</h3>
      </div>

      <div className={s.perfilCard}>
        <div className={`${s.avatar} ${s.avCeleste} ${s.perfilAvatar}`}>
          {getIniciales(alias)}
        </div>
        <h4>{alias}</h4>
        <p>Hincha desde el primer partido</p>
        <input
          className={s.aliasInput}
          value={aliasDraft}
          onChange={(e) => setAliasDraft(e.target.value)}
          placeholder="Tu nombre en el muro"
          aria-label="Tu nombre en el muro"
        />
        <button type="button" className={s.btnGrande} onClick={guardarAlias}>
          Guardar nombre
        </button>
        <button
          type="button"
          className={`${s.btnGrande} ${s.btnOutline}`}
          onClick={() => void signInGoogle()}
        >
          Iniciar con Google
        </button>
      </div>

      <div className={s.seccionTitulo}>
        <h3>Tu hinchada</h3>
      </div>
      <div className={s.equipoSwitcher}>
        {HINCHADA_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`${s.equipoBtn} ${equipo === opt.id ? s.equipoBtnActive : ""}`}
            onClick={() => {
              setEquipo(opt.id);
              showToast(`Seguís la campaña ${opt.code}`);
            }}
          >
            {opt.flag} {opt.code}
          </button>
        ))}
      </div>

      <div className={s.perfilStats}>
        <div className={s.cifra}>
          <div className={s.cifraNum}>{publicados.length}</div>
          <div className={s.cifraLbl}>festejos</div>
        </div>
        <div className={s.cifra}>
          <div className={s.cifraNum}>{publicados.length}</div>
          <div className={s.cifraLbl}>pelotas donadas</div>
        </div>
        <div className={s.cifra}>
          <div className={s.cifraNum}>
            {ultimo?.gritoNumero ?? "—"}
          </div>
          <div className={s.cifraLbl}>mejor puesto</div>
        </div>
      </div>

      {ultimo?.gritoNumero ? (
        <>
          <div className={s.insignia}>
            <div className={s.insigniaMini}>★ Insignia de hincha ★</div>
            <div className={s.insigniaGrande}>
              FESTEJO #{ultimo.gritoNumero}
            </div>
            <div className={s.insigniaPartido}>
              {partido
                ? scoreCorto(
                    partido.equipoLocal,
                    partido.golesLocal,
                    partido.equipoVisitante,
                    partido.golesVisitante,
                  )
                : "Mundial 2026"}
            </div>
            <div className={s.insigniaLinea}>
              Tu grito desbloqueó 1 pelota para quien más la necesita
            </div>
          </div>
          <button
            type="button"
            className={s.btnCompartir}
            onClick={() => void compartir()}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" />
            </svg>
            Compartir mi insignia
          </button>
        </>
      ) : (
        <p className={s.notaImpacto}>
          Todavía no subiste festejos. Cuando tu selección grite un gol, tenés
          minutos para subir el tuyo y ganarte tu lugar en el muro.
        </p>
      )}
    </>
  );
}
