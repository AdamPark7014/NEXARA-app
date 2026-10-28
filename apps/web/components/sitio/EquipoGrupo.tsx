import { EQUIPO, retrato } from "./equipo";
import b from "./portada.module.css";

/** Orden de la foto de grupo: atrás y adelante alternados, con las cuatro compañeras repartidas al frente. */
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
  "monica-garcia",
  "ivan-camargo",
  "israel-ramos",
];

/**
 * Los doce retratos recortados en dos filas escalonadas, como una foto de grupo de estudio. Es decorativa: los
 * nombres y puestos están en Nosotros.
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
          style={{ "--x": `${6 + i * 8}%` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
