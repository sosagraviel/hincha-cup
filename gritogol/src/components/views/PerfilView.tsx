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
      <div className="flex items-baseline justify-between px-[18px] pt-[2px] pb-[10px]">
        <h3 className="text-[16px] font-bold">Tu hinchada</h3>
      </div>
      <div className="flex gap-2 mx-[18px] mb-3">
        {HINCHADA_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`flex-1 py-2 px-2 rounded-[8px] border text-[12px] font-semibold transition-colors ${
              equipo === opt.id
                ? "border-[var(--celeste)] text-[var(--celeste)] bg-[rgba(111,195,238,0.08)]"
                : "border-[var(--linea)] text-[var(--gris)]"
            }`}
            onClick={() => {
              setEquipo(opt.id);
              showToast(`Seguís la campaña ${opt.code}`);
            }}
          >
            {opt.flag} {opt.code}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mx-[18px]" style={{ marginBottom: '24px' }}>
        <div className="flex-1 text-center bg-[var(--surface)] border border-[var(--linea)] rounded-[10px] py-[10px] px-1">
          <div className="font-['Anton',sans-serif] text-[28px] leading-none text-[var(--tiza)] [font-variant-numeric:tabular-nums]">{publicados.length}</div>
          <div className="text-[11px] text-[var(--gris)] mt-1">festejos</div>
        </div>
        <div className="flex-1 text-center bg-[var(--surface)] border border-[var(--linea)] rounded-[10px] py-[10px] px-1">
          <div className="font-['Anton',sans-serif] text-[28px] leading-none text-[var(--tiza)] [font-variant-numeric:tabular-nums]">{publicados.length}</div>
          <div className="text-[11px] text-[var(--gris)] mt-1">pelotas donadas</div>
        </div>
        <div className="flex-1 text-center bg-[var(--surface)] border border-[var(--linea)] rounded-[10px] py-[10px] px-1">
          <div className="font-['Anton',sans-serif] text-[28px] leading-none text-[var(--tiza)] [font-variant-numeric:tabular-nums]">
            {ultimo?.gritoNumero ?? "—"}
          </div>
          <div className="text-[11px] text-[var(--gris)] mt-1">mejor puesto</div>
        </div>
      </div>

      {ultimo?.gritoNumero ? (
        <>
          <div className="mx-[18px] mb-[14px] border-2 border-[var(--sol)] rounded-[var(--radius)] bg-gradient-to-b from-[#1a2540] to-[#13203a] py-[22px] px-[18px] text-center">
            <div className="text-[10px] tracking-[2.5px] text-[var(--sol)] font-bold uppercase">★ Insignia de hincha ★</div>
            <div className="font-['Anton',sans-serif] text-[34px] text-[var(--tiza)] mt-1.5 mb-0.5">
              FESTEJO #{ultimo.gritoNumero}
            </div>
            <div className="text-[13px] text-[var(--gris)]">
              {partido
                ? scoreCorto(
                    partido.equipoLocal,
                    partido.golesLocal,
                    partido.equipoVisitante,
                    partido.golesVisitante,
                  )
                : "Mundial 2026"}
            </div>
            <div className="mt-3 pt-3 border-t border-dashed border-[var(--linea)] text-[12.5px] text-[var(--cesped)] font-bold">
              Tu grito desbloqueó 1 pelota para quien más la necesita
            </div>
          </div>
          <button
            type="button"
            className="mx-[18px] mb-5 w-[calc(100%-36px)] bg-[var(--celeste)] text-[#06121e] text-[15px] font-bold py-[14px] rounded-[12px] flex items-center justify-center gap-2"
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
        <p className="mx-[18px] mb-4 mt-1 text-[12px] text-[var(--gris)] leading-[1.6]">
          Todavía no subiste festejos. Cuando tu selección grite un gol, tenés
          minutos para subir el tuyo y ganarte tu lugar en el muro.
        </p>
      )}

      <div className="flex items-baseline justify-between px-[18px] pt-[2px] pb-[10px]">
        <h3 className="text-[16px] font-bold">Tu perfil de hincha</h3>
      </div>

      <div className="mx-[18px] mb-[14px] bg-[var(--surface)] border border-[var(--linea)] rounded-[var(--radius)] p-5 text-center">
        <div className={`${s.avatar} ${s.avCeleste} ${s.perfilAvatar}`}>
          {getIniciales(alias)}
        </div>
        <h4 className="text-[17px] font-bold">{alias}</h4>
        <p className="text-[12.5px] text-[var(--gris)] mt-0.5">Hincha desde el primer partido</p>
        <input
          className="w-full max-w-[280px] mb-4 px-[14px] py-3 rounded-[10px] border border-[var(--linea)] bg-[var(--surface)] text-[var(--tiza)] text-[14px] outline-none"
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
    </>
  );
}
