import { EQUIPO, retrato } from "./equipo";
import b from "./portada.module.css";

/** Orden de la foto de grupo: atrás y adelante alternados (atrás en las dos orillas), con las compañeras al frente. */
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

/**
 * Los retratos recortados en dos filas escalonadas, como una foto de grupo de estudio. Es decorativa: los nombres y
 * puestos están en Nosotros. Las posiciones se reparten entre 6 % y 94 % del ancho según cuántos sean.
 */
export default function EquipoGrupo({ prioridad = false }: { prioridad?: boolean }) {
  const personas = ORDEN.map((clave) => EQUIPO.find((x) => x.clave === clave)).filter((x) => x !== undefined);
  return (
    <div className={b.grupo} aria-hidden="true">
      {personas.map((x, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={x.clave}
          src={retrato(x.clave)}
          alt=""
          width={512}
          height={492}
          loading={prioridad ? "eager" : "lazy"}
          decoding="async"
          data-fila={i % 2 === 0 ? "atras" : "frente"}
          style={{ "--x": `${6 + (i * 88) / Math.max(1, personas.length - 1)}%` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
