"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import { AvatarAro } from "@/components/pizarra/EquipoPersonaCard";
import {
  ARO_DE_ESTADO,
  contextoActividad,
  filtrarCentroOperativo,
  queHace,
  resumenEquipo,
} from "@/components/pizarra/equipo-estado";
import type { TeamBoardUser } from "@/lib/team-board-api";
import s from "./CentroOperativo.module.css";

/** Cada minuto se vuelve a pedir el tablero: la pantalla queda puesta sola. */
const REFRESCO_MS = 60_000;
/** El reloj se mueve antes que los datos para que no se vea congelado. */
const RELOJ_MS = 30_000;

function horaLarga(t: number): string {
  return new Date(t).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * MODO CENTRO OPERATIVO — la pizarra a pantalla completa, como «Presentar».
 *
 * Pide `requestFullscreen()` al navegador; si lo rechaza (dentro de un iframe
 * es lo normal), se queda la capa fija a pantalla completa, que ya cubre la
 * ventana entera. Se sale con Esc o con el botón: en modo nativo Esc lo captura
 * el navegador y nuestro `keydown` no llega, por eso también se escucha
 * `fullscreenchange`.
 */
export default function CentroOperativo({
  users,
  onCerrar,
  onRefrescar,
}: {
  users: readonly TeamBoardUser[];
  onCerrar: () => void;
  onRefrescar?: () => void;
}) {
  const capaRef = useRef<HTMLDivElement | null>(null);
  const refrescarRef = useRef(onRefrescar);
  const nativoRef = useRef(false);
  const [montado, setMontado] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  refrescarRef.current = onRefrescar;

  useEffect(() => setMontado(true), []);

  const cerrar = useCallback(() => {
    if (typeof document !== "undefined" && document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => {
        /* ya salió o el navegador no deja: la capa se cierra igual */
      });
    }
    nativoRef.current = false;
    onCerrar();
  }, [onCerrar]);

  // Pantalla completa de verdad cuando el navegador la concede.
  useEffect(() => {
    const el = capaRef.current;
    if (!el || typeof el.requestFullscreen !== "function") return;
    let vivo = true;
    try {
      const p = el.requestFullscreen();
      if (p && typeof p.then === "function") {
        void p
          .then(() => {
            if (vivo) nativoRef.current = true;
          })
          .catch(() => {
            /* iframe o permiso denegado: se queda la capa */
          });
      } else {
        nativoRef.current = true;
      }
    } catch {
      /* navegador sin soporte: se queda la capa */
    }
    return () => {
      vivo = false;
    };
  }, [montado]);

  // Esc en la capa (y, en modo nativo, la salida de pantalla completa).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrar();
      }
    };
    const cambio = () => {
      if (nativoRef.current && !document.fullscreenElement) {
        nativoRef.current = false;
        onCerrar();
      }
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("fullscreenchange", cambio);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("fullscreenchange", cambio);
    };
  }, [cerrar, onCerrar]);

  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(Date.now()), RELOJ_MS);
    const datos = window.setInterval(() => refrescarRef.current?.(), REFRESCO_MS);
    return () => {
      window.clearInterval(reloj);
      window.clearInterval(datos);
    };
  }, []);

  const gente = useMemo(() => filtrarCentroOperativo(users), [users]);
  const r = useMemo(() => resumenEquipo(gente), [gente]);

  if (!montado || typeof document === "undefined") return null;

  return createPortal(
    <div ref={capaRef} className={s.capa} role="dialog" aria-modal="true" aria-label="Centro operativo">
      <header className={s.barra}>
        <div style={{ minWidth: 0 }}>
          <h2 className={s.titulo}>Centro operativo</h2>
          <p className={s.leyenda}>
            <span className={s.cuenta}>
              <span className={[s.punto, s.puntoTrabajando].join(" ")} aria-hidden="true" />
              {r.trabajando} trabajando
            </span>
            <span className={s.cuenta}>
              <span className={[s.punto, s.puntoRetraso].join(" ")} aria-hidden="true" />
              {r.retraso} con retraso
            </span>
            <span className={s.cuenta}>
              <span className={[s.punto, s.puntoLibre].join(" ")} aria-hidden="true" />
              {r.libres} libres
            </span>
          </p>
        </div>
        <div className={s.derecha}>
          <span className={s.reloj} aria-label="Hora">
            {horaLarga(ahora)}
          </span>
          <button type="button" className={s.salir} onClick={cerrar}>
            <CloseFullscreenIcon aria-hidden="true" fontSize="small" />
            Salir
            <span className={s.tecla}>Esc</span>
          </button>
        </div>
      </header>

      {gente.length === 0 ? (
        <p className={s.vacio}>Nadie en el tablero ahora mismo.</p>
      ) : (
        <div className={s.rejilla}>
          {gente.map((u) => {
            const actividad = queHace(u);
            const contexto = contextoActividad(u, ahora);
            return (
              <article key={u.id} className={s.persona}>
                <AvatarAro
                  nombre={u.nombre}
                  avatarUrl={u.avatarUrl}
                  estado={ARO_DE_ESTADO[u.status] ?? "retraso"}
                  size={132}
                />
                <span className={s.nombre}>{u.nombre}</span>
                {u.puesto ? <span className={s.puesto}>{u.puesto}</span> : null}
                <span className={s.actividad}>{actividad}</span>
                {contexto ? <span className={s.contexto}>{contexto}</span> : null}
              </article>
            );
          })}
        </div>
      )}
    </div>,
    document.body,
  );
}
