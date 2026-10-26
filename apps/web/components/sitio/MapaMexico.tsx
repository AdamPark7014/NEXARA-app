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

/** Curva suave de Puebla a la ciudad, abombada hacia arriba. */
function ruta(c: Ciudad) {
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

/** Mapa vectorial de México: estados, base en Puebla y CDMX, y rutas animadas a las ciudades atendidas. */
export default function MapaMexico() {
  return (
    <figure className={s.mapaMx}>
      <svg viewBox="35 18 935 595" role="img" aria-labelledby="mapa-mx-titulo">
        <title id="mapa-mx-titulo">Mapa de México con la base de NEXARA en Puebla y Ciudad de México y rutas a las ciudades donde trabaja</title>
        <g className={s.mapaEstados}>
          {ESTADOS_MX.map((e) => (
            <path key={e.nombre} d={e.d} className={BASE.has(e.nombre) ? s.mapaBase : undefined} />
          ))}
        </g>
        <g aria-hidden="true">
          {CIUDADES_MAPA.map((c, i) => (
            <g key={c.nombre} data-ciudad={c.nombre}>
              <path className={s.mapaRuta} d={ruta(c)} />
              <path className={s.mapaFlujo} d={ruta(c)} pathLength={100} style={{ animationDelay: `${-i * 0.37}s` }} />
            </g>
          ))}
          {CIUDADES_MAPA.map((c) => (
            <g key={`p-${c.nombre}`} className={s.mapaCiudad} data-ciudad={c.nombre}>
              <circle cx={c.x} cy={c.y} r="4.5" />
              <text x={c.lado === "izq" ? c.x - 10 : c.x + 10} y={c.y + 4} textAnchor={c.lado === "izq" ? "end" : "start"}>
                {c.nombre}
              </text>
            </g>
          ))}
          <g className={s.mapaSede}>
            <circle className={s.mapaPulso} cx={ORIGEN.x} cy={ORIGEN.y} r="8" />
            <circle className={s.mapaPulso} cx="598" cy="458" r="8" style={{ animationDelay: "-1.2s" }} />
            <circle cx="598" cy="458" r="6.5" data-ciudad="Ciudad de México" />
            <circle cx={ORIGEN.x} cy={ORIGEN.y} r="6.5" data-ciudad="Puebla" />
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
