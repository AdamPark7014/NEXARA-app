import s from "./sitio.module.css";

/* Ilustraciones de producto dibujadas en HTML/SVG (decorativas): se usan en la portada y en Servicios. */

/** Topología de red animada: internet → switch central → tres áreas. */
export function TopologiaRed() {
  return (
    <svg className={s.red} viewBox="0 0 320 230" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path className={s.redLinea} d="M160 40 V100 M160 100 L60 170 M160 100 L160 180 M160 100 L260 170" />
      <path className={s.redFlujo} d="M160 40 V100 L60 170" />
      <path className={s.redFlujo} d="M160 40 V100 L160 180" />
      <path className={s.redFlujo} d="M160 40 V100 L260 170" />
      <circle className={s.redNodo} cx="160" cy="32" r="16" />
      <path className={s.redIcono} d="M152 32a8 8 0 0 1 16 0M156 32a4 4 0 0 1 8 0" />
      <circle className={s.redNodoCentral} cx="160" cy="100" r="22" />
      <path className={`${s.redIcono} ${s.redIconoClaro}`} d="M150 96h20M150 104h20M154 96v8M166 96v8" />
      <circle className={s.redNodo} cx="60" cy="176" r="18" />
      <circle className={s.redNodo} cx="160" cy="186" r="18" />
      <circle className={s.redNodo} cx="260" cy="176" r="18" />
      <path
        className={s.redIcono}
        d="M52 176a8 8 0 0 1 16 0M56 176a4 4 0 0 1 8 0M152 186a8 8 0 0 1 16 0M156 186a4 4 0 0 1 8 0M252 176a8 8 0 0 1 16 0M256 176a4 4 0 0 1 8 0"
      />
      <text className={s.redTexto} x="184" y="36">
        Internet
      </text>
      <text className={s.redTexto} x="190" y="104">
        Switch central
      </text>
      <text className={s.redTexto} x="34" y="214">
        Oficinas
      </text>
      <text className={s.redTexto} x="140" y="224">
        Almacén
      </text>
      <text className={s.redTexto} x="236" y="214">
        Patio
      </text>
    </svg>
  );
}

/** Reporte de soporte con su línea de tiempo y el SLA consumido. */
export function TicketSoporte() {
  return (
    <div className={s.ticket} aria-hidden="true">
      <div className={s.ticketCabeza}>
        Reporte de soporte
        <span className={s.ticketPrioridad}>Prioridad alta</span>
      </div>
      <ol className={s.ticketPasos}>
        <li className={`${s.ticketPaso} ${s.ticketPasoHecho}`}>
          Recibido <time>09:02</time>
        </li>
        <li className={`${s.ticketPaso} ${s.ticketPasoHecho}`}>
          Técnico asignado <time>09:10</time>
        </li>
        <li className={`${s.ticketPaso} ${s.ticketPasoHecho}`}>
          En sitio <time>10:15</time>
        </li>
        <li className={s.ticketPaso}>
          Cierre con evidencia <time>—</time>
        </li>
      </ol>
      <div className={s.ticketSla}>
        Tiempo del SLA usado
        <div className={s.ticketBarra}>
          <i />
        </div>
      </div>
    </div>
  );
}

/** Indicador semanal con barras que crecen. */
export function GraficaEntregas() {
  return (
    <div className={s.grafica} aria-hidden="true">
      Entregas a tiempo, por semana
      <span className={s.graficaValor}>En aumento</span>
      <div className={s.barras}>
        {[38, 52, 46, 61, 58, 72, 80, 92].map((h, i) => (
          <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
    </div>
  );
}
