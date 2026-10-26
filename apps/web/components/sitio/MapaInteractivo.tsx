"use client";

import Link from "next/link";
import { useState } from "react";
import { GEO_CITIES } from "@/lib/seo/geo-cities";
import s from "./sitio.module.css";
import m from "./mapa.module.css";
import Flecha from "./Flecha";
import { ESTADOS_MX } from "./mexicoEstados";
import { BASE_MAPA, curvaDesdeBase } from "./MapaMexico";

type Modo = "base" | "campo" | "extendida";

/** Cómo se atiende cada estado: la base, los vecinos con visitas programadas y el resto por fases. */
const MODO_ESTADO: Record<string, Modo> = {
  Puebla: "base",
  "Ciudad de México": "base",
  Tlaxcala: "campo",
  "Estado de México": "campo",
  Querétaro: "campo",
  Guanajuato: "campo",
  Morelos: "campo",
  Hidalgo: "campo",
};

const MODOS: Record<Modo, { etiqueta: string; detalle: string; color: string }> = {
  base: {
    etiqueta: "Base de operación",
    detalle: "Cuadrillas propias y diagnóstico en sitio desde la base.",
    color: m.colorBase,
  },
  campo: {
    etiqueta: "Campo cercano",
    detalle: "Visitas programadas desde Puebla o la Ciudad de México, con el mismo estándar de campo.",
    color: m.colorCampo,
  },
  extendida: {
    etiqueta: "Proyecto por fases",
    detalle: "Diagnóstico, instalación y soporte por etapas, con viajes programados y soporte remoto.",
    color: m.colorExtendida,
  },
};

const modoDe = (estado: string): Modo => MODO_ESTADO[estado] ?? "extendida";

/** Ciudades con página de cobertura dentro del estado. */
const ciudadesDe = (estado: string) =>
  GEO_CITIES.filter((c) => c.region === estado || (estado === "Ciudad de México" && c.region === "CDMX"));

const ORDEN = [...ESTADOS_MX].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

/**
 * Mapa de cobertura interactivo: al pasar el cursor o tocar un estado se dibuja la ruta desde Puebla y la ficha dice
 * cómo se atiende, qué ciudades tienen página y a dónde cotizar. Con teclado y en pantallas chicas se usa el selector
 * de la ficha (el dibujo es solo apoyo visual).
 */
export default function MapaInteractivo({ inicial = "Puebla" }: { inicial?: string }) {
  const [elegido, setElegido] = useState(inicial);
  const [encima, setEncima] = useState<string | null>(null);
  const activo = encima ?? elegido;
  const estado = ESTADOS_MX.find((e) => e.nombre === activo) ?? ESTADOS_MX[0];
  const modo = modoDe(estado.nombre);
  const info = MODOS[modo];
  const ciudades = ciudadesDe(estado.nombre);
  const destino = { x: estado.c[0], y: estado.c[1] };
  const conRuta = modo !== "base";
  const cotizar = ciudades[0] ? `/contacto?city=${ciudades[0].slug}` : "/contacto";

  return (
    <div className={m.marco}>
      <div className={m.lienzo} onPointerLeave={() => setEncima(null)}>
        <svg viewBox="35 18 935 595" aria-hidden="true">
          <g>
            {ESTADOS_MX.map((e) => (
              <path
                key={e.nombre}
                d={e.d}
                className={m.estado}
                data-modo={modoDe(e.nombre)}
                data-activo={e.nombre === activo ? "" : undefined}
                onPointerEnter={(ev) => ev.pointerType === "mouse" && setEncima(e.nombre)}
                onClick={() => {
                  setElegido(e.nombre);
                  setEncima(null);
                }}
              />
            ))}
          </g>
          <path d={estado.d} className={m.contorno} />
          {conRuta ? <path key={`r-${estado.nombre}`} d={curvaDesdeBase(destino)} className={m.ruta} pathLength={1} /> : null}
          <circle className={m.sede} cx={BASE_MAPA.x} cy={BASE_MAPA.y} r="6.5" />
          <circle className={m.sede} cx="598" cy="458" r="6.5" />
          {conRuta ? (
            <g key={`d-${estado.nombre}`}>
              <circle className={m.halo} cx={destino.x} cy={destino.y} r="7" />
              <circle className={m.destino} cx={destino.x} cy={destino.y} r="6" />
              <text
                className={m.etiqueta}
                x={destino.x > 700 ? destino.x - 12 : destino.x + 12}
                y={destino.y - 10}
                textAnchor={destino.x > 700 ? "end" : "start"}
              >
                {estado.nombre}
              </text>
            </g>
          ) : estado.nombre === "Ciudad de México" ? (
            <text className={m.etiqueta} x="586" y="446" textAnchor="end">
              Ciudad de México
            </text>
          ) : (
            <text className={m.etiqueta} x={BASE_MAPA.x + 12} y={BASE_MAPA.y + 20}>
              {estado.nombre}
            </text>
          )}
        </svg>
        <div className={m.leyenda} aria-hidden="true">
          {(["base", "campo", "extendida"] as const).map((k) => (
            <span key={k}>
              <i className={MODOS[k].color} /> {MODOS[k].etiqueta}
            </span>
          ))}
        </div>
      </div>

      <div className={m.ficha} aria-live="polite">
        <label className={m.elegir}>
          ¿Dónde está tu sitio?
          <select value={elegido} onChange={(e) => setElegido(e.target.value)}>
            {ORDEN.map((e) => (
              <option key={e.nombre} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
        <h3 className={m.nombre}>{estado.nombre}</h3>
        <span className={m.modo}>
          <i className={info.color} /> {info.etiqueta}
        </span>
        <p className={m.detalle}>{info.detalle}</p>
        {ciudades.length ? (
          <div className={m.ciudades}>
            {ciudades.map((c) => (
              <Link key={c.slug} href={`/cobertura/${c.slug}`}>
                {c.name}
              </Link>
            ))}
          </div>
        ) : null}
        <p className={m.accion}>
          <Link href={cotizar} className={`${s.boton} ${s.botonPrimario}`} data-track-conversion="mapa_cobertura_cta">
            Cotizar en {estado.nombre}
            <Flecha />
          </Link>
        </p>
      </div>
    </div>
  );
}
