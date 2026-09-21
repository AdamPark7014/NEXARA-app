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

/**
 * Reparto que hace que TODOS quepan en una pantalla.
 *
 * La primera versión fijaba el avatar en 132px y la rejilla en `minmax(220px)`:
 * con 15 personas salían seis columnas y tres filas, y la tercera se cortaba
 * contra el borde. En una pantalla de pared no hay quien desplace, así que el
 * tamaño no puede ser una constante — se calcula.
 *
 * Se prueban todos los repartos posibles y gana el que deja el avatar más
 * grande sin salirse. El bloque de texto bajo la foto mide algo fijo (nombre,
 * puesto, actividad, contexto y barra), y de ahí sale el alto disponible para
 * la foto en cada reparto.
 */
export function repartoQueCabe(
  cuantos: number,
  ancho: number,
  alto: number,
): { columnas: number; avatar: number } {
  if (cuantos <= 0 || ancho <= 0 || alto <= 0) return { columnas: 1, avatar: AVATAR_MAX };

  const HUECO = 24;
  const TEXTO = 168; // nombre + puesto + actividad + contexto + barra
  let mejor = { columnas: 1, avatar: AVATAR_MIN };

  for (let columnas = 1; columnas <= cuantos; columnas += 1) {
    const filas = Math.ceil(cuantos / columnas);
    const anchoCelda = (ancho - HUECO * (columnas - 1)) / columnas;
    const altoCelda = (alto - HUECO * (filas - 1)) / filas;
    // La foto no puede ser más ancha que su celda ni más alta que lo que sobra
    // tras el texto.
    const avatar = Math.floor(Math.min(anchoCelda * 0.78, altoCelda - TEXTO));
    if (avatar >= mejor.avatar) mejor = { columnas, avatar };
  }

  return {
    columnas: mejor.columnas,
    avatar: Math.max(AVATAR_MIN, Math.min(AVATAR_MAX, mejor.avatar)),
  };
}

/** Por debajo de esto los nombres dejan de leerse desde lejos. */
const AVATAR_MIN = 56;
/** Por encima de esto una sola persona ocuparía media pared. */
const AVATAR_MAX = 132;

/**
 * Cuánto lleva cerrado del día: cerradas sobre asignadas.
 *
 * Es lo que Adam pidió ver de un vistazo. Sin nada asignado no hay avance que
 * enseñar —una barra al 0 % de cero actividades diría algo falso—, así que
 * devuelve `null` y no se pinta.
 */
export function avanceDelDia(u: TeamBoardUser): { pct: number; cerradas: number; asignadas: number } | null {
  const asignadas = u.kpis?.asignadas ?? 0;
  if (asignadas <= 0) return null;
  const cerradas = Math.min(u.kpis?.cerradas ?? 0, asignadas);
  return { pct: Math.round((cerradas / asignadas) * 100), cerradas, asignadas };
}

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
  const rejillaRef = useRef<HTMLDivElement | null>(null);
  const [zona, setZona] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const refrescarRef = useRef(onRefrescar);
  const nativoRef = useRef(false);
  const [montado, setMontado] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  refrescarRef.current = onRefrescar;

  useEffect(() => setMontado(true), []);

  // La rejilla se vuelve a repartir cuando cambia el tamaño de la ventana o el
  // número de personas: entrar en pantalla completa cambia el alto disponible.
  useEffect(() => {
    const caja = rejillaRef.current;
    if (!caja || typeof ResizeObserver === "undefined") return;
    const medir = () => setZona({ w: caja.clientWidth, h: caja.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(caja);
    return () => observador.disconnect();
  }, [montado]);

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

  const reparto = useMemo(
    () => repartoQueCabe(gente.length, zona.w, zona.h),
    [gente.length, zona.w, zona.h],
  );

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
        <div
          ref={rejillaRef}
          className={s.rejilla}
          style={
            {
              "--columnas": reparto.columnas,
              "--avatar": `${reparto.avatar}px`,
            } as React.CSSProperties
          }
        >
          {gente.map((u) => {
            const actividad = queHace(u);
            const contexto = contextoActividad(u, ahora);
            return (
              <article key={u.id} className={s.persona}>
                <AvatarAro
                  nombre={u.nombre}
                  avatarUrl={u.avatarUrl}
                  estado={ARO_DE_ESTADO[u.status] ?? "retraso"}
                  size={reparto.avatar}
                />
                <span className={s.nombre}>{u.nombre}</span>
                {u.puesto ? <span className={s.puesto}>{u.puesto}</span> : null}
                <span className={s.actividad}>{actividad}</span>
                {contexto ? <span className={s.contexto}>{contexto}</span> : null}
                {(() => {
                  const avance = avanceDelDia(u);
                  if (!avance) return null;
                  return (
                    <div
                      className={s.avance}
                      role="img"
                      aria-label={`${avance.cerradas} de ${avance.asignadas} actividades cerradas`}
                      title={`${avance.cerradas} de ${avance.asignadas} cerradas`}
                    >
                      <div className={s.avanceCarril}>
                        <div className={s.avanceRelleno} style={{ width: `${avance.pct}%` }} />
                      </div>
                      <span className={s.avanceCifra}>
                        {avance.cerradas}/{avance.asignadas}
                      </span>
                    </div>
                  );
                })()}
              </article>
            );
          })}
        </div>
      )}
    </div>,
    document.body,
  );
}
