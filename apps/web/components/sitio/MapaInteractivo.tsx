"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GEO_CITIES } from "@/lib/seo/geo-cities";
import s from "./sitio.module.css";
import m from "./mapa.module.css";
import Flecha from "./Flecha";
import { ESTADOS_MX } from "./mexicoEstados";
import { BASE_MAPA, curvaDesdeBase } from "./MapaMexico";
import { enCalma } from "./pausa";

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
    color: "var(--senal-ambar)",
  },
  campo: {
    etiqueta: "Campo cercano",
    detalle: "Visitas programadas desde Puebla o la Ciudad de México, con el mismo estándar de campo.",
    color: "var(--senal-teal)",
  },
  extendida: {
    etiqueta: "Proyecto por fases",
    detalle: "Diagnóstico, instalación y soporte por etapas, con viajes programados y soporte remoto.",
    color: "var(--senal-cian)",
  },
};

const modoDe = (estado: string): Modo => MODO_ESTADO[estado] ?? "extendida";

/** Ciudades con página de cobertura dentro del estado. */
const ciudadesDe = (estado: string) =>
  GEO_CITIES.filter((c) => c.region === estado || (estado === "Ciudad de México" && c.region === "CDMX"));

const ORDEN = [...ESTADOS_MX].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
const RUTAS = ESTADOS_MX.filter((e) => modoDe(e.nombre) !== "base");
const CDMX = { x: 598, y: 458 };

/** Por dónde se pasea el mapa mientras nadie lo toca: extremos del país para que las rutas luzcan. */
const PASEO = ["Nuevo León", "Baja California", "Yucatán", "Jalisco", "Querétaro", "Chihuahua", "Quintana Roo", "Oaxaca", "Sinaloa", "Puebla"];
const CADA_MS = 2800;

/** Rótulo en píldora centrado en (x, y), legible sobre cualquier estado. */
function Etiqueta({ texto, x, y }: { texto: string; x: number; y: number }) {
  const ancho = texto.length * 10.6 + 32;
  const izq = Math.min(Math.max(x - ancho / 2, 40), 965 - ancho);
  return (
    <g className={m.rotulo}>
      <rect x={izq} y={y - 17} width={ancho} height="34" rx="17" />
      <text x={izq + ancho / 2} y={y + 6}>
        {texto}
      </text>
    </g>
  );
}

/**
 * Mapa de cobertura: el país como una placa iluminada, con señales que salen de Puebla a cada estado. Al pasar el
 * cursor o tocar un estado, se levanta, se enciende su ruta y la ficha dice cómo se atiende. Con teclado y en pantallas
 * chicas se usa el selector de la ficha (el dibujo es apoyo visual).
 */
export default function MapaInteractivo({ inicial = "Puebla" }: { inicial?: string }) {
  const [elegido, setElegido] = useState(inicial);
  const [encima, setEncima] = useState<string | null>(null);
  const [solo, setSolo] = useState(true);
  const [visible, setVisible] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!solo || !visible) return;
    let n = 0;
    const id = window.setInterval(() => {
      if (!enCalma()) setElegido(PASEO[n++ % PASEO.length]);
    }, CADA_MS);
    return () => window.clearInterval(id);
  }, [solo, visible]);

  const activo = encima ?? elegido;
  const estado = ESTADOS_MX.find((e) => e.nombre === activo) ?? ESTADOS_MX[0];
  const modo = modoDe(estado.nombre);
  const info = MODOS[modo];
  const ciudades = ciudadesDe(estado.nombre);
  const destino = { x: estado.c[0], y: estado.c[1] };
  const conRuta = modo !== "base";
  const cotizar = ciudades[0] ? `/contacto?city=${ciudades[0].slug}` : "/contacto";
  const elegir = (nombre: string) => {
    setSolo(false);
    setElegido(nombre);
    setEncima(null);
  };

  return (
    <div ref={raiz} className={m.marco} data-viva={visible ? "" : undefined} style={{ "--c": info.color } as CSSProperties}>
      <div className={m.lienzo} data-inclina="4" onPointerLeave={() => setEncima(null)}>
        <span className={m.radar} aria-hidden="true" />
        <svg viewBox="35 18 935 615" aria-hidden="true">
          <defs>
            <pattern id="mapa-puntos" width="9" height="9" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.05" className={m.punto} />
            </pattern>
            <linearGradient id="mapa-cara" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#16304f" />
              <stop offset="1" stopColor="#0c1a2e" />
            </linearGradient>
            <filter id="mapa-brillo" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>
          {/* El canto de la placa: la silueta repetida hacia abajo. */}
          <g className={m.canto}>
            {[18, 12, 6].map((y) => (
              <g key={y} transform={`translate(0 ${y})`}>
                {ESTADOS_MX.map((e) => (
                  <path key={e.nombre} d={e.d} />
                ))}
              </g>
            ))}
          </g>
          <g>
            {ESTADOS_MX.map((e) => (
              <path
                key={e.nombre}
                d={e.d}
                className={m.estado}
                data-modo={modoDe(e.nombre)}
                onPointerEnter={(ev) => {
                  if (ev.pointerType !== "mouse") return;
                  setSolo(false);
                  setEncima(e.nombre);
                }}
                onClick={() => elegir(e.nombre)}
              />
            ))}
          </g>
          <g className={m.trama}>
            {ESTADOS_MX.map((e) => (
              <path key={e.nombre} d={e.d} fill="url(#mapa-puntos)" />
            ))}
          </g>
          {/* El estado elegido se levanta de la placa. */}
          <g key={`a-${estado.nombre}`} className={m.alzado}>
            <path d={estado.d} className={m.alzadoLuz} filter="url(#mapa-brillo)" />
            <path d={estado.d} className={m.alzadoCanto} transform="translate(0 9)" />
            <path d={estado.d} className={m.alzadoCara} />
          </g>
          <g className={m.rutas}>
            {RUTAS.map((e, i) => {
              const d = curvaDesdeBase({ x: e.c[0], y: e.c[1] });
              return (
                <g key={e.nombre} style={{ "--i": i } as CSSProperties} data-modo={modoDe(e.nombre)}>
                  <path className={m.rutaTenue} d={d} />
                  <path className={m.rutaPulso} d={d} pathLength={100} />
                  <circle className={m.puntoEstado} cx={e.c[0]} cy={e.c[1]} r="2.6" />
                </g>
              );
            })}
          </g>
          {conRuta ? <path key={`r-${estado.nombre}`} d={curvaDesdeBase(destino)} className={m.ruta} pathLength={1} /> : null}
          {conRuta ? <path key={`c-${estado.nombre}`} d={curvaDesdeBase(destino)} className={m.cometa} pathLength={100} /> : null}
          {/* Las dos sedes laten siempre: de ahí salen las cuadrillas. */}
          {[BASE_MAPA, CDMX].map((b) => (
            <g key={`${b.x}-${b.y}`}>
              <circle className={m.pulso} cx={b.x} cy={b.y} r="7" />
              <circle className={m.sede} cx={b.x} cy={b.y} r="6" />
            </g>
          ))}
          {conRuta ? (
            <g key={`d-${estado.nombre}`}>
              <circle className={m.halo} cx={destino.x} cy={destino.y} r="7" />
              <circle className={m.destino} cx={destino.x} cy={destino.y} r="6" />
              <Etiqueta texto={estado.nombre} x={destino.x} y={destino.y - 30} />
            </g>
          ) : estado.nombre === "Ciudad de México" ? (
            <Etiqueta texto="Ciudad de México" x={540} y={428} />
          ) : (
            <Etiqueta texto={estado.nombre} x={BASE_MAPA.x + 30} y={BASE_MAPA.y + 34} />
          )}
        </svg>
        <div className={m.leyenda} aria-hidden="true">
          {(["base", "campo", "extendida"] as const).map((k) => (
            <span key={k} data-activa={k === modo ? "" : undefined} style={{ "--c": MODOS[k].color } as CSSProperties}>
              <i /> {MODOS[k].etiqueta}
            </span>
          ))}
        </div>
      </div>

      <div className={m.ficha} aria-live={solo ? "off" : "polite"} data-luz="">
        <label className={m.elegir}>
          ¿Dónde está tu sitio?
          <select value={elegido} onChange={(e) => elegir(e.target.value)} onFocus={() => setSolo(false)}>
            {ORDEN.map((e) => (
              <option key={e.nombre} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
        <div key={estado.nombre} className={m.fichaEntra}>
          <h3 className={m.nombre}>{estado.nombre}</h3>
          <span className={m.modo}>
            <i /> {info.etiqueta}
          </span>
          <p className={m.detalle}>{info.detalle}</p>
          <div className={m.ciudades}>
            {ciudades.map((c) => (
              <Link key={c.slug} href={`/cobertura/${c.slug}`}>
                {c.name}
              </Link>
            ))}
          </div>
        </div>
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
