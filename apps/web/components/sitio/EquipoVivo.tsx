"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EQUIPO, retrato } from "./equipo";
import { HEXAGONO, SENALES } from "./senales";
import { enCalma } from "./pausa";
import v from "./vivo.module.css";

/** Orden de la foto de grupo, con las compañeras al frente. */
const ORDEN = [
  "alejandro-gonzalez",
  "carolina-juarez",
  "josue-cervantes",
  "daniela-hernandez",
  "david-morales",
  "luis-aguilar",
  "jose-ramirez",
  "paulina-tlapaltotoli",
  "roberto-vivanco",
  "israel-ramos",
  "ivan-camargo",
];
const GENTE = ORDEN.map((clave) => EQUIPO.find((x) => x.clave === clave)).filter((x) => x !== undefined);
const CADA_MS = 2600;

/**
 * El equipo en escena: cada persona es un nodo de la línea de color. La elegida (cursor, dedo o teclado) pasa al
 * frente con su hexágono trazado y su contorno encendido, y abajo se lee quién es. Mientras nadie toca nada, la luz
 * recorre al equipo.
 */
export default function EquipoVivo({ prioridad = false }: { prioridad?: boolean }) {
  const [activo, setActivo] = useState(Math.floor(GENTE.length / 2));
  const [solo, setSolo] = useState(true);
  const [visible, setVisible] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const fila = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!solo || !visible) return;
    const id = window.setInterval(() => {
      if (!enCalma()) setActivo((a) => (a + 1) % GENTE.length);
    }, CADA_MS);
    return () => window.clearInterval(id);
  }, [solo, visible]);

  // En el teléfono la fila se desliza: la persona encendida queda al centro.
  useEffect(() => {
    const f = fila.current;
    const li = f?.children[activo] as HTMLElement | undefined;
    if (!f || !li || f.scrollWidth <= f.clientWidth + 4) return;
    f.scrollTo({ left: li.offsetLeft - f.clientWidth / 2 + li.offsetWidth / 2, behavior: enCalma() ? "auto" : "smooth" });
  }, [activo]);

  const elegir = (i: number) => {
    setSolo(false);
    setActivo(i);
  };
  const quien = GENTE[activo];

  return (
    <div
      ref={raiz}
      className={v.escena}
      style={{ "--c": SENALES[activo % 5].color } as CSSProperties}
      role="group"
      aria-label="Integrantes del equipo de NEXARA"
    >
      <ul ref={fila} className={v.fila} style={{ "--n": GENTE.length } as CSSProperties}>
        {GENTE.map((x, i) => (
          <li
            key={x.clave}
            data-activo={i === activo ? "" : undefined}
            style={{ "--i": i, "--lejos": Math.abs(i - activo), "--c": SENALES[i % 5].color } as CSSProperties}
          >
            <button
              type="button"
              aria-pressed={i === activo}
              onClick={() => elegir(i)}
              onFocus={(e) => e.currentTarget.matches(":focus-visible") && elegir(i)}
              onPointerEnter={(e) => e.pointerType === "mouse" && elegir(i)}
            >
              <svg className={v.hex} viewBox="0 0 52 56" aria-hidden="true">
                <path className={v.hexLuz} d={HEXAGONO} />
                <path className={v.hexTrazo} d={HEXAGONO} pathLength={1} />
              </svg>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={retrato(x.clave)}
                alt={`${x.nombre}, ${x.rol.toLowerCase()}`}
                width={512}
                height={492}
                loading={prioridad ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
              />
              <i className={v.nodo} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p key={quien.clave} className={v.quien} aria-live={solo ? "off" : "polite"}>
        <b>{quien.nombre}</b>
        <span>{quien.rol}</span>
      </p>
    </div>
  );
}
