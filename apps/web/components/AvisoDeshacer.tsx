"use client";

/**
 * Aviso «Deshacer» estilo Instagram (Adam, 27-11-2026).
 *
 *   import { avisoDeshacer } from "@/components/AvisoDeshacer";
 *
 *   avisoDeshacer({
 *     mensaje: "Actividad asignada a José",
 *     deshacer: () => deshacerAlta(token, "actividad", id),
 *     alDeshacer: () => recargar(),
 *   });
 *
 * Una barra que se vacía en 5 s. Tocar «Deshacer» llama a la API; mientras responde dice «Deshaciendo…»,
 * luego «Listo, se deshizo» o el motivo del servidor (ya pasó el plazo, ya avanzó…). Pasar el ratón o el
 * foco encima pausa la cuenta, para quien lee despacio o usa teclado. Uno a la vez: el nuevo reemplaza
 * al anterior, que se queda hecho.
 *
 * Se monta solo dentro de `<ToastViewport />` (layouts de ERP, Finanzas, RH y Tickets).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PLAZO_DESHACER_MS, motivoNoSeDeshizo } from "@/lib/deshacer-api";

const EVENTO = "nx:deshacer";

export type AvisoDeshacerInput = {
  mensaje: string;
  /** Segunda línea opcional («Se le avisará en unos segundos»). */
  detalle?: string;
  /** Lo que revierte (normalmente `deshacerAlta`). Si lanza, se muestra el motivo. */
  deshacer: () => Promise<unknown>;
  /** Después de deshacer bien: recargar la lista, volver al formulario… */
  alDeshacer?: () => void;
  duracionMs?: number;
};

type Aviso = AvisoDeshacerInput & { id: number };

type Fase = "contando" | "deshaciendo" | "deshecho" | "error";

export function avisoDeshacer(input: AvisoDeshacerInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Aviso>(EVENTO, { detail: { ...input, id: Date.now() + Math.random() } }));
}

export function AvisoDeshacerViewport() {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    const alLlegar = (e: Event) => {
      const detail = (e as CustomEvent<Aviso>).detail;
      if (detail) setAviso(detail);
    };
    window.addEventListener(EVENTO, alLlegar);
    return () => window.removeEventListener(EVENTO, alLlegar);
  }, []);

  if (!aviso) return null;
  return <Tarjeta key={aviso.id} aviso={aviso} cerrar={() => setAviso((a) => (a?.id === aviso.id ? null : a))} />;
}

function Tarjeta({ aviso, cerrar }: { aviso: Aviso; cerrar: () => void }) {
  const duracion = aviso.duracionMs ?? PLAZO_DESHACER_MS;
  const [fase, setFase] = useState<Fase>("contando");
  const [error, setError] = useState("");
  const [restante, setRestante] = useState(duracion);
  const pausado = useRef(false);
  const enviando = useRef(false);

  // Cuenta regresiva con pausa: se descuenta solo mientras no hay ratón ni foco encima.
  useEffect(() => {
    if (fase !== "contando") return;
    // Pasos fijos de 100 ms: en una pestaña en segundo plano el navegador frena el reloj y el plazo
    // se alarga (nunca se acorta); el servidor pone el tope real.
    const t = window.setInterval(() => {
      if (!pausado.current) setRestante((r) => Math.max(0, r - 100));
    }, 100);
    return () => window.clearInterval(t);
  }, [fase]);

  useEffect(() => {
    if (fase === "contando" && restante <= 0) cerrar();
  }, [fase, restante, cerrar]);

  // Mensaje final: se queda lo justo para leerlo.
  useEffect(() => {
    if (fase !== "deshecho" && fase !== "error") return;
    const t = window.setTimeout(cerrar, fase === "deshecho" ? 1_800 : 5_000);
    return () => window.clearTimeout(t);
  }, [fase, cerrar]);

  const deshacer = useCallback(async () => {
    if (enviando.current) return; // doble clic
    enviando.current = true;
    setFase("deshaciendo");
    try {
      await aviso.deshacer();
      setFase("deshecho");
      aviso.alDeshacer?.();
    } catch (e) {
      setError(motivoNoSeDeshizo(e));
      setFase("error");
    }
  }, [aviso]);

  const pausar = (v: boolean) => {
    pausado.current = v;
  };

  const texto =
    fase === "deshaciendo" ? "Deshaciendo…" : fase === "deshecho" ? "Listo, se deshizo" : fase === "error" ? error : aviso.mensaje;
  const segundos = Math.max(1, Math.ceil(restante / 1000));

  return (
    <div className="nx-deshacer-zona" aria-live="polite">
      <div
        role="status"
        className={`nx-deshacer nx-deshacer--${fase}`}
        onMouseEnter={() => pausar(true)}
        onMouseLeave={() => pausar(false)}
        onFocus={() => pausar(true)}
        onBlur={() => pausar(false)}
      >
        <div className="nx-deshacer__texto">
          <span className="nx-deshacer__mensaje">{texto}</span>
          {fase === "contando" && aviso.detalle ? <span className="nx-deshacer__detalle">{aviso.detalle}</span> : null}
        </div>
        {fase === "contando" ? (
          <button
            type="button"
            className="nx-deshacer__boton"
            onClick={deshacer}
            aria-label={`Deshacer (quedan ${segundos} segundos)`}
          >
            Deshacer
            <span className="nx-deshacer__seg" aria-hidden="true">
              {segundos}
            </span>
          </button>
        ) : fase === "deshaciendo" ? (
          <span className="nx-deshacer__giro" aria-hidden="true" />
        ) : (
          <button type="button" className="nx-deshacer__cerrar" onClick={cerrar} aria-label="Cerrar">
            ×
          </button>
        )}
        {fase === "contando" ? (
          <span className="nx-deshacer__barra" aria-hidden="true" style={{ transform: `scaleX(${restante / duracion})` }} />
        ) : null}
      </div>
      <style>{`
        .nx-deshacer-zona {
          position: fixed; left: 0; right: 0; bottom: 24px; z-index: 10001;
          display: flex; justify-content: center; padding: 0 16px; pointer-events: none;
        }
        .nx-deshacer {
          pointer-events: auto; position: relative; overflow: hidden; box-sizing: border-box;
          display: flex; align-items: center; gap: 16px;
          width: min(460px, 100%); min-height: 52px; padding: 10px 10px 12px 18px;
          border-radius: 14px;
          /* Siempre oscuro (como las barras de aviso de los teléfonos): se lee igual en tema claro y oscuro. */
          background: #151b23; color: #fff; border: 1px solid rgba(255, 255, 255, .08);
          box-shadow: 0 10px 34px rgba(16, 24, 40, .28);
          font-family: var(--ui-font, inherit); font-size: 14px; line-height: 1.35;
          animation: nx-deshacer-in .26s cubic-bezier(.2, .9, .3, 1.2);
        }
        .nx-deshacer--error { background: #9f1c1c; }
        .nx-deshacer__texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .nx-deshacer__mensaje { font-weight: 600; overflow-wrap: anywhere; }
        .nx-deshacer__detalle { font-size: 12.5px; opacity: .72; }
        .nx-deshacer__boton {
          flex: 0 0 auto; display: inline-flex; align-items: center; gap: 8px;
          min-height: 36px; padding: 0 12px; border: none; border-radius: 10px; cursor: pointer;
          background: rgba(255, 255, 255, .1);
          color: #5fe0c4; font: inherit; font-weight: 700; letter-spacing: .01em;
        }
        .nx-deshacer__boton:hover { background: rgba(255, 255, 255, .18); }
        .nx-deshacer__boton:active { transform: scale(.96); }
        .nx-deshacer__seg {
          display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%;
          font-size: 11.5px; font-variant-numeric: tabular-nums;
          border: 1.5px solid currentColor; opacity: .85;
        }
        .nx-deshacer__cerrar {
          flex: 0 0 auto; width: 32px; height: 32px; border: none; border-radius: 8px; cursor: pointer;
          background: transparent; color: inherit; font-size: 20px; line-height: 1; opacity: .8;
        }
        .nx-deshacer__giro {
          width: 20px; height: 20px; margin-right: 8px; border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, .3); border-top-color: #fff; animation: nx-deshacer-giro .7s linear infinite;
        }
        .nx-deshacer__barra {
          position: absolute; left: 0; right: 0; bottom: 0; height: 3px; transform-origin: left center;
          background: #5fe0c4; transition: transform .1s linear;
        }
        .nx-deshacer__boton:focus-visible, .nx-deshacer__cerrar:focus-visible {
          outline: 2px solid #5fe0c4; outline-offset: 2px;
        }
        @keyframes nx-deshacer-in { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes nx-deshacer-giro { to { transform: rotate(360deg); } }
        @media (max-width: 560px) { .nx-deshacer-zona { bottom: 16px; } }
        @media (prefers-reduced-motion: reduce) {
          .nx-deshacer, .nx-deshacer__giro { animation: none; }
          .nx-deshacer__barra { transition: none; }
        }
      `}</style>
    </div>
  );
}
