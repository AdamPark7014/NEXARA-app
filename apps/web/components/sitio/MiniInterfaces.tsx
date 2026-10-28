import s from "./sitio.module.css";

/* Ilustraciones de producto dibujadas en HTML/SVG (decorativas): se usan en la portada, en Servicios y en Soluciones. */

/** Tarjeta de un equipo al pie de la topología: ícono, nombre, detalle y semáforo. */
function Destino({ x, titulo, detalle, icono }: { x: number; titulo: string; detalle: string; icono: React.ReactNode }) {
  return (
    <g transform={`translate(${x} 166)`}>
      <rect width="88" height="50" rx="12" className={s.redTarjeta} />
      <circle cx="18" cy="25" r="11" className={s.redIconoFondo} />
      <g className={s.redIcono}>{icono}</g>
      <text x="34" y="22" className={s.redTitulo}>
        {titulo}
      </text>
      <text x="34" y="35" className={s.redSub}>
        {detalle}
      </text>
      <circle cx="78" cy="11" r="2.6" className={s.redEstado} />
    </g>
  );
}

/**
 * Topología de red como la de una consola de administración: internet, switch central con sus puertos encendidos y
 * tres destinos (oficinas, Wi‑Fi del almacén y cámaras del patio), con el tráfico corriendo por los enlaces.
 */
export function TopologiaRed() {
  const ramas = ["M160 44 V124 C160 146 60 140 60 166", "M160 44 V166", "M160 44 V124 C160 146 260 140 260 166"];
  return (
    <svg className={s.red} viewBox="0 0 320 230" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {ramas.map((d) => (
        <path key={`l${d}`} className={s.redLinea} d={d} />
      ))}
      {ramas.map((d) => (
        <path key={`f${d}`} className={s.redFlujo} d={d} />
      ))}

      <g transform="translate(110 14)">
        <rect width="100" height="30" rx="15" className={s.redTarjeta} />
        <g className={s.redIcono}>
          <circle cx="17" cy="15" r="6" />
          <ellipse cx="17" cy="15" rx="2.6" ry="6" />
          <path d="M11 15 H23" />
        </g>
        <text x="30" y="18.5" className={s.redTitulo}>
          Internet
        </text>
        <circle cx="86" cy="15" r="2.6" className={s.redEstado} />
      </g>

      <g transform="translate(96 84)">
        <rect width="128" height="40" rx="10" className={s.redTarjetaCentral} />
        <text x="12" y="17" className={s.redTituloClaro}>
          Switch central
        </text>
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={12 + i * 10.4} y="24" width="7" height="6" rx="1.5" className={i < 8 ? s.redPuertoOn : s.redPuerto} />
        ))}
      </g>

      <Destino
        x={16}
        titulo="Oficinas"
        detalle="24 equipos"
        icono={
          <>
            <rect x="11.5" y="20" width="13" height="8.5" rx="1.5" />
            <path d="M9.5 31 H26.5" />
          </>
        }
      />
      <Destino
        x={116}
        titulo="Almacén"
        detalle="Wi‑Fi"
        icono={
          <>
            <path d="M11.5 23.5 a9.2 9.2 0 0 1 13 0 M14.2 26.2 a5.4 5.4 0 0 1 7.6 0" />
            <circle cx="18" cy="29" r="1.1" className={s.redPunto} />
          </>
        }
      />
      <Destino
        x={216}
        titulo="Patio"
        detalle="6 cámaras"
        icono={
          <>
            <rect x="10" y="20.5" width="11.5" height="7" rx="2" />
            <path d="M21.5 22.6 L26 20.8 V27.2 L21.5 25.4 M14 27.5 V30.5 H18.5" />
          </>
        }
      />
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

const SEMANAS = [38, 52, 46, 61, 58, 72, 80, 92];

/** Curva suave (Catmull-Rom a Bézier) por los puntos de la gráfica. */
function curva(p: [number, number][]) {
  return p
    .map(([x, y], i) => {
      if (i === 0) return `M${x} ${y}`;
      const [x0, y0] = p[Math.max(0, i - 2)];
      const [x1, y1] = p[i - 1];
      const [x3, y3] = p[Math.min(p.length - 1, i + 1)];
      const c1 = [x1 + (x - x0) / 6, y1 + (y - y0) / 6];
      const c2 = [x - (x3 - x1) / 6, y - (y3 - y1) / 6];
      return `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${x} ${y}`;
    })
    .join(" ");
}

/** Indicador semanal: curva con degradado, rejilla tenue y el último punto marcado. */
export function GraficaEntregas() {
  const puntos = SEMANAS.map((v, i) => [i * 40, 116 - v] as [number, number]);
  const linea = curva(puntos);
  const ultimo = puntos[puntos.length - 1];
  return (
    <div className={s.grafica} aria-hidden="true">
      <div className={s.graficaCabeza}>
        <span>
          Entregas a tiempo, por semana
          <span className={s.graficaValor}>En aumento</span>
        </span>
        <span className={s.graficaChip}>8 semanas</span>
      </div>
      <div className={s.graficaLienzo}>
        <svg viewBox="0 0 280 120" preserveAspectRatio="none">
          <defs>
            <linearGradient id="grafica-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0.32 }} />
              <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {[30, 60, 90].map((y) => (
            <line key={y} x1="0" y1={y} x2="280" y2={y} className={s.graficaRejilla} />
          ))}
          <path d={`${linea} L280 120 L0 120 Z`} fill="url(#grafica-area)" />
          <path d={linea} className={s.graficaLinea} pathLength={1} />
        </svg>
        <span className={s.graficaPunto} style={{ left: `${(ultimo[0] / 280) * 100}%`, top: `${(ultimo[1] / 120) * 100}%` }} />
      </div>
      <div className={s.graficaEjes}>
        {SEMANAS.map((_, i) => (
          <span key={i}>S{i + 1}</span>
        ))}
      </div>
    </div>
  );
}
