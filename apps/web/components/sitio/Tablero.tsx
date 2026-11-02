"use client";

import { useEffect, useRef, useState } from "react";
import { foto, type Foto } from "./fotos";
import s from "./sitio.module.css";
import Reloj from "./Reloj";
import { TicketSoporte, TopologiaRed } from "./MiniInterfaces";

const CAMARAS: (Foto & { id: string; lugar: string; deteccion?: React.CSSProperties })[] = [
  { ...foto("control-acceso-torniquetes", "180px"), id: "CAM 01", lugar: "Acceso", deteccion: { top: "40%", left: "50%", width: "22%", height: "42%" } },
  { ...foto("campo-mastil-antenas", "180px"), id: "CAM 02", lugar: "Perímetro" },
  { ...foto("control-acceso-terminal-facial", "180px"), id: "CAM 03", lugar: "Recepción" },
  { ...foto("monitoreo-sala-videowall", "180px"), id: "CAM 04", lugar: "Monitoreo" },
];

const VISTAS = [
  { id: "camaras", label: "Cámaras" },
  { id: "red", label: "Red" },
  { id: "soporte", label: "Soporte" },
] as const;

type Vista = (typeof VISTAS)[number]["id"];

/** Cuánto dura cada vista mientras el tablero avanza solo. */
const DURACION_MS = 6500;

const ESTADOS: Record<Vista, { etiqueta: string; valor: string }[]> = {
  camaras: [
    { etiqueta: "Videovigilancia", valor: "Todas en línea" },
    { etiqueta: "Red y Wi‑Fi", valor: "Estable" },
    { etiqueta: "Respaldos", valor: "Completado" },
    { etiqueta: "Soporte", valor: "Sin pendientes" },
  ],
  red: [
    { etiqueta: "Switch central", valor: "En línea" },
    { etiqueta: "Wi‑Fi oficinas", valor: "En línea" },
    { etiqueta: "Wi‑Fi almacén", valor: "En línea" },
    { etiqueta: "Enlace al patio", valor: "En línea" },
  ],
  soporte: [
    { etiqueta: "Reporte", valor: "Atendido" },
    { etiqueta: "Técnico", valor: "En sitio" },
    { etiqueta: "Evidencia", valor: "Con fotos" },
    { etiqueta: "Memoria técnica", valor: "Actualizada" },
  ],
};

/**
 * Demo del centro de monitoreo en tres vistas (cámaras, red y soporte). Avanza sola mientras está a la vista,
 * se pausa con el cursor encima y se queda quieta en cuanto la persona elige una pestaña. Es ilustrativa: el
 * texto del hero dice lo mismo en palabras.
 */
export default function Tablero() {
  const [vista, setVista] = useState<Vista>("camaras");
  const [auto, setAuto] = useState(true);
  const [pausa, setPausa] = useState(false);
  const [visible, setVisible] = useState(true);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
    const el = raiz.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const corriendo = auto && !pausa && visible;

  useEffect(() => {
    if (!corriendo) return;
    const id = window.setTimeout(() => {
      setVista((v) => VISTAS[(VISTAS.findIndex((x) => x.id === v) + 1) % VISTAS.length].id);
    }, DURACION_MS);
    return () => window.clearTimeout(id);
  }, [corriendo, vista]);

  const elegir = (v: Vista) => {
    setAuto(false);
    setVista(v);
  };

  return (
    <div
      ref={raiz}
      className={`${s.visual} ${s.visualGrande}`}
      onPointerEnter={() => setPausa(true)}
      onPointerLeave={() => setPausa(false)}
      aria-label="Demo del centro de monitoreo de NEXARA"
      role="group"
    >
      <div className={s.ventana}>
        <div className={s.ventanaBarra}>
          <span className={s.puntos} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={s.ventanaTitulo}>Centro de monitoreo</span>
          <span className={s.vivo} aria-hidden="true">
            <i /> En vivo
          </span>
        </div>
        <div className={s.demoTabs} role="tablist" aria-label="Vistas del tablero">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={vista === v.id}
              className={s.demoTab}
              onClick={() => elegir(v.id)}
            >
              {v.label}
              {vista === v.id && auto ? (
                <i
                  key={`${v.id}-${String(corriendo)}`}
                  className={s.demoProgreso}
                  style={{ animationDuration: `${DURACION_MS}ms`, animationPlayState: corriendo ? "running" : "paused" }}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          ))}
        </div>
        <div key={vista} className={`${s.ventanaCuerpo} ${s.vistaEntra}`} role="tabpanel" aria-label={VISTAS.find((v) => v.id === vista)?.label}>
          {vista === "camaras" ? (
            <div className={s.camaras} aria-hidden="true">
              {CAMARAS.map((c, i) => (
                <figure key={c.id} className={s.camara}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.src} srcSet={c.srcSet} sizes={c.sizes} alt="" loading="eager" decoding="async" />
                  <span className={s.rec}>
                    <i /> REC
                  </span>
                  {c.deteccion ? (
                    <span className={s.deteccion} style={c.deteccion}>
                      <span>Persona</span>
                    </span>
                  ) : null}
                  <span className={s.camaraEtiqueta}>
                    {c.id} · {c.lugar}
                  </span>
                  <span className={s.camaraHora}>
                    <Reloj desfase={i} />
                  </span>
                </figure>
              ))}
            </div>
          ) : (
            <div className={s.demoLienzo} aria-hidden="true">
              {vista === "red" ? <TopologiaRed /> : <TicketSoporte />}
            </div>
          )}
          <ul className={s.estados}>
            {ESTADOS[vista].map((e, i) => (
              <li key={e.etiqueta} className={s.estado}>
                {e.etiqueta}
                <b>{e.valor}</b>
                {vista === "camaras" && i === 1 ? (
                  <svg className={s.linea} viewBox="0 0 150 34" preserveAspectRatio="none" aria-hidden="true">
                    <path className={s.lineaArea} d="M0 26 L18 22 L34 24 L52 14 L70 18 L88 10 L106 13 L124 6 L150 8 L150 34 L0 34 Z" />
                    <path d="M0 26 L18 22 L34 24 L52 14 L70 18 L88 10 L106 13 L124 6 L150 8" />
                  </svg>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {vista !== "soporte" ? (
        <div className={`${s.flotante} ${s.flotanteTicket}`} aria-hidden="true">
          <strong>Ticket resuelto en sitio</strong>
          Cámara de acceso reconfigurada y probada.
          <span className={s.pasitos}>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className={s.flotanteFila}>
            <span>Recibido</span>
            <span>Asignado</span>
            <span>En sitio</span>
            <span>Cerrado</span>
          </span>
        </div>
      ) : null}

      <div className={`${s.flotante} ${s.flotanteRed}`} aria-hidden="true">
        Próximo mantenimiento
        <strong>Martes 10:00</strong>
      </div>
    </div>
  );
}
