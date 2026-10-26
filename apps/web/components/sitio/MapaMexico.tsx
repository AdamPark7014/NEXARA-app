import s from "./sitio.module.css";
import { ESTADOS_MX } from "./mexicoEstados";

/** Estados donde está la base de operación (se pintan en el azul de acción). */
const BASE = new Set(["Puebla", "Ciudad de México"]);

/** Puebla, de donde salen las rutas. Coordenadas en la caja del mapa (45 28 910 573). */
const ORIGEN = { x: 625, y: 470 };

type Ciudad = { nombre: string; x: number; y: number; lado?: "izq" | "der" };

export const CIUDADES_MAPA: Ciudad[] = [
  { nombre: "Querétaro", x: 563, y: 418, lado: "izq" },
  { nombre: "Guadalajara", x: 476, y: 414, lado: "izq" },
  { nombre: "Monterrey", x: 592, y: 262 },
  { nombre: "Chihuahua", x: 380, y: 160 },
  { nombre: "Hermosillo", x: 240, y: 135 },
  { nombre: "Tijuana", x: 82, y: 38 },
  { nombre: "Mérida", x: 875, y: 404, lado: "izq" },
  { nombre: "Cancún", x: 948, y: 398, lado: "izq" },
  { nombre: "Veracruz", x: 688, y: 466 },
  { nombre: "Oaxaca", x: 668, y: 540 },
  { nombre: "Tuxtla Gutiérrez", x: 790, y: 548 },
];

/** Ciudades con página de cobertura que no salen en el mapa general; solo se dibujan cuando son la destacada. */
const EXTRAS: Ciudad[] = [
  { nombre: "León", x: 525, y: 402, lado: "izq" },
  { nombre: "Tlaxcala", x: 622, y: 456 },
];

/** Las vecinas de la base se marcan con su sede: la ruta sería de unos pocos píxeles. */
const SEDE_DE: Record<string, string> = { "San Andrés Cholula": "Puebla", "Estado de México": "Ciudad de México" };

/** Caja completa del mapa (el viewBox de todo el país). */
const CAJA = { x: 35, y: 18, w: 935, h: 595 };

/**
 * Encuadre que contiene la base y la ciudad destacada con aire para las etiquetas, en la proporción del marco del
 * hero (21:9). Si no cabe en el país (Monterrey, Cancún…), se ajusta al borde; si es más grande, el país entero.
 */
function encuadre(puntos: { x: number; y: number }[], aspecto = 21 / 9): string {
  const xs = puntos.map((p) => p.x);
  const ys = puntos.map((p) => p.y);
  let x0 = Math.min(...xs) - 130;
  let y0 = Math.min(...ys) - 90;
  let w = Math.max(...xs) + 130 - x0;
  let h = Math.max(...ys) + 90 - y0;
  if (w / h < aspecto) {
    const nw = h * aspecto;
    x0 -= (nw - w) / 2;
    w = nw;
  } else {
    const nh = w / aspecto;
    y0 -= (nh - h) / 2;
    h = nh;
  }
  // No acercar más de ~1.6×: con la base y una vecina (Puebla, Cholula) las etiquetas se volverían enormes.
  const minimo = 600;
  if (w < minimo) {
    x0 -= (minimo - w) / 2;
    y0 -= (minimo / aspecto - h) / 2;
    w = minimo;
    h = minimo / aspecto;
  }
  if (w >= CAJA.w || h >= CAJA.h) return `${CAJA.x} ${CAJA.y} ${CAJA.w} ${CAJA.h}`;
  x0 = Math.min(Math.max(x0, CAJA.x), CAJA.x + CAJA.w - w);
  y0 = Math.min(Math.max(y0, CAJA.y), CAJA.y + CAJA.h - h);
  return `${x0.toFixed(0)} ${y0.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`;
}

/** Curva suave de Puebla a un punto del mapa, abombada hacia arriba (la usan este mapa y el interactivo). */
export function curvaDesdeBase(c: { x: number; y: number }) {
  return ruta(c);
}

export const BASE_MAPA = ORIGEN;

/** Curva suave de Puebla a la ciudad, abombada hacia arriba. */
function ruta(c: { x: number; y: number }) {
  const mx = (ORIGEN.x + c.x) / 2;
  const my = (ORIGEN.y + c.y) / 2;
  const dx = c.x - ORIGEN.x;
  const dy = c.y - ORIGEN.y;
  const k = 0.24;
  const a = { x: mx - dy * k, y: my + dx * k };
  const b = { x: mx + dy * k, y: my - dx * k };
  const control = a.y < b.y ? a : b;
  return `M${ORIGEN.x} ${ORIGEN.y} Q${control.x.toFixed(1)} ${control.y.toFixed(1)} ${c.x} ${c.y}`;
}

/**
 * Mapa vectorial de México: estados, base en Puebla y CDMX, y rutas animadas a las ciudades atendidas. Con
 * `destacar` (el nombre de una ciudad de cobertura) deja esa ruta encendida y atenúa las demás.
 */
export default function MapaMexico({ destacar, acercar }: { destacar?: string; acercar?: boolean }) {
  const activa = destacar ? (SEDE_DE[destacar] ?? destacar) : undefined;
  const extra = EXTRAS.find((c) => c.nombre === activa);
  const ciudades = extra ? [...CIUDADES_MAPA, extra] : CIUDADES_MAPA;
  const marca = (nombre: string) => (nombre === activa ? { "data-activa": "" } : {});
  const destino = ciudades.find((c) => c.nombre === activa);
  const caja =
    acercar && activa
      ? encuadre([ORIGEN, { x: 598, y: 458 }, ...(destino ? [destino] : [])])
      : `${CAJA.x} ${CAJA.y} ${CAJA.w} ${CAJA.h}`;
  return (
    <figure className={s.mapaMx} data-hay-activa={activa ? "" : undefined}>
      <svg viewBox={caja} role="img" aria-labelledby="mapa-mx-titulo">
        <title id="mapa-mx-titulo">
          {destacar
            ? `Mapa de México con la base de NEXARA en Puebla y Ciudad de México y su cobertura en ${destacar}`
            : "Mapa de México con la base de NEXARA en Puebla y Ciudad de México y rutas a las ciudades donde trabaja"}
        </title>
        <g className={s.mapaEstados}>
          {ESTADOS_MX.map((e) => (
            <path key={e.nombre} d={e.d} className={BASE.has(e.nombre) ? s.mapaBase : undefined} />
          ))}
        </g>
        <g aria-hidden="true">
          {ciudades.map((c, i) => (
            <g key={c.nombre} data-ciudad={c.nombre} {...marca(c.nombre)}>
              <path className={s.mapaRuta} d={ruta(c)} />
              <path className={s.mapaFlujo} d={ruta(c)} pathLength={100} style={{ animationDelay: `${-i * 0.37}s` }} />
            </g>
          ))}
          {ciudades.map((c) => (
            <g key={`p-${c.nombre}`} className={s.mapaCiudad} data-ciudad={c.nombre} {...marca(c.nombre)}>
              <circle cx={c.x} cy={c.y} r="4.5" />
              <text x={c.lado === "izq" ? c.x - 10 : c.x + 10} y={c.y + 4} textAnchor={c.lado === "izq" ? "end" : "start"}>
                {c.nombre}
              </text>
            </g>
          ))}
          <g className={s.mapaSede}>
            <circle className={s.mapaPulso} cx={ORIGEN.x} cy={ORIGEN.y} r="8" />
            <circle className={s.mapaPulso} cx="598" cy="458" r="8" style={{ animationDelay: "-1.2s" }} />
            <circle cx="598" cy="458" r="6.5" data-ciudad="Ciudad de México" {...marca("Ciudad de México")} />
            <circle cx={ORIGEN.x} cy={ORIGEN.y} r="6.5" data-ciudad="Puebla" {...marca("Puebla")} />
            <text x="590" y="446" textAnchor="end">
              CDMX
            </text>
            <text x={ORIGEN.x + 12} y={ORIGEN.y + 18}>
              Puebla
            </text>
          </g>
        </g>
      </svg>
      <figcaption className={s.mapaLeyenda}>
        <span>
          <i className={s.leyendaBase} /> Base de operación
        </span>
        <span>
          <i className={s.leyendaCiudad} /> Proyectos en todo el país
        </span>
      </figcaption>
    </figure>
  );
}
