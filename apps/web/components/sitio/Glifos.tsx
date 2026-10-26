import s from "./sitio.module.css";
import { SILUETA_MX } from "./mexicoSilueta";

/* Ilustraciones vectoriales pequeñas de las tarjetas de cifras (decorativas). */

/** Diez barras que crecen: una por año en campo. */
export function GlifoAnios() {
  return (
    <svg className={s.glifo} viewBox="0 0 140 72" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => {
        const h = 14 + i * 5.6;
        return (
          <rect
            key={i}
            className={i === 9 ? s.glifoBarraFuerte : s.glifoBarra}
            x={4 + i * 13.4}
            y={70 - h}
            width="8"
            height={h}
            rx="3"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        );
      })}
    </svg>
  );
}

/** Retícula de puntos donde algunos se encienden: los sitios instalados. */
export function GlifoSitios() {
  const encendidos = new Set([3, 9, 14, 18, 22, 27, 31, 36, 40, 45, 49, 53]);
  return (
    <svg className={s.glifo} viewBox="0 0 140 72" aria-hidden="true">
      {Array.from({ length: 56 }, (_, i) => {
        const col = i % 14;
        const fila = Math.floor(i / 14);
        const on = encendidos.has(i);
        return (
          <circle
            key={i}
            className={on ? s.glifoPuntoOn : s.glifoPunto}
            cx={6 + col * 9.8}
            cy={10 + fila * 17}
            r={on ? 3.4 : 2.4}
            style={on ? { animationDelay: `${(i % 7) * 0.35}s` } : undefined}
          />
        );
      })}
    </svg>
  );
}

/** Silueta de México con tres puntos de presencia. */
export function GlifoEstados() {
  return (
    <svg className={s.glifo} viewBox="40 24 920 580" aria-hidden="true">
      <g className={s.glifoMapa}>
        {SILUETA_MX.map((e) => (
          <path key={e.nombre} d={e.d} />
        ))}
      </g>
      <circle className={s.glifoPin} cx="625" cy="470" r="22" />
      <circle className={s.glifoPin} cx="592" cy="262" r="16" style={{ animationDelay: "-0.8s" }} />
      <circle className={s.glifoPin} cx="476" cy="414" r="16" style={{ animationDelay: "-1.6s" }} />
    </svg>
  );
}

/** Burbuja de mensaje con «escribiendo…»: la primera respuesta. */
export function GlifoRespuesta() {
  return (
    <svg className={s.glifo} viewBox="0 0 140 72" aria-hidden="true">
      <rect className={s.glifoBurbuja} x="4" y="8" width="92" height="44" rx="22" />
      <path className={s.glifoBurbuja} d="M22 50 l-6 16 l20 -14 z" />
      {[0, 1, 2].map((i) => (
        <circle key={i} className={s.glifoTecleo} cx={34 + i * 16} cy="30" r="5" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
      <circle className={s.glifoVisto} cx="116" cy="44" r="18" />
      <path className={s.glifoPalomita} d="M108 44 l6 6 l11 -12" />
    </svg>
  );
}
