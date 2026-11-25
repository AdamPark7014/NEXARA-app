import { trazar } from "./trazado";
import n from "./noche.module.css";

/** Las cinco señales, en el orden de los servicios (los valores de `--senal-*`). */
const SENALES = ["#6ec6d9", "#2fbf9f", "#fbc223", "#c56ab6", "#f0704a"];

type Props = {
  lado: "izq" | "der";
  /** Cambia el dibujo. La misma semilla pinta siempre lo mismo. */
  semilla?: number;
  className?: string;
};

/**
 * Pistas de circuito fijas que entran por un costado: el mismo dibujo del escenario de la portada, sin lienzo ni
 * JavaScript. Es decorativo y va detrás del contenido; en pantallas angostas se oculta (ver `noche.module.css`).
 */
export default function Trazas({ lado, semilla = 11, className }: Props) {
  const t = trazar(semilla, 40, 34);
  return (
    <svg
      className={`${n.trazas} ${lado === "der" ? n.trazasDer : n.trazasIzq} ${className ?? ""}`}
      viewBox={`0 0 ${t.ancho} ${t.alto}`}
      width={t.ancho}
      height={t.alto}
      aria-hidden="true"
      focusable="false"
    >
      {/* El costado derecho es el mismo dibujo girado media vuelta: se ve distinto y pesa lo mismo. */}
      <g
        transform={lado === "der" ? `rotate(180 ${t.ancho / 2} ${t.alto / 2})` : undefined}
        fill="none"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path className={n.pista} d={t.pistas + t.anillos} />
        {t.senales.map((s, i) => (
          <path key={i} className={n.senal} d={s.d + s.anillo} stroke={SENALES[s.color]} />
        ))}
      </g>
    </svg>
  );
}
