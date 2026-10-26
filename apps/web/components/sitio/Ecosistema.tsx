import PublicIcon, { type PublicIconName } from "@/app/components/PublicIcon";
import s from "./sitio.module.css";

const CENTRO = 280;
const RADIO = 190;

const NODOS: { etiqueta: string; icono: PublicIconName }[] = [
  { etiqueta: "Videovigilancia", icono: "camera" },
  { etiqueta: "Redes y Wi‑Fi", icono: "wifi" },
  { etiqueta: "Cómputo", icono: "server" },
  { etiqueta: "Soporte", icono: "headset" },
  { etiqueta: "Plataformas", icono: "code" },
];

const posicion = (i: number) => {
  const angulo = ((-90 + i * 72) * Math.PI) / 180;
  return { x: CENTRO + RADIO * Math.cos(angulo), y: CENTRO + RADIO * Math.sin(angulo) };
};

/** Diagrama vectorial: las cinco especialidades conectadas a un solo responsable. */
export default function Ecosistema() {
  return (
    <div className={s.eco} role="img" aria-label="Diagrama: videovigilancia, redes, cómputo, soporte y plataformas conectados a NEXARA como un solo sistema">
      <svg viewBox="0 0 560 560" aria-hidden="true">
        <circle className={s.ecoAnillo} cx={CENTRO} cy={CENTRO} r={RADIO} />
        <circle className={s.ecoAnilloFuera} cx={CENTRO} cy={CENTRO} r="252" />
        <g className={s.ecoGira}>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i * 36 * Math.PI) / 180;
            return <circle key={i} className={s.ecoSatelite} cx={CENTRO + 252 * Math.cos(a)} cy={CENTRO + 252 * Math.sin(a)} r={i % 3 === 0 ? 4 : 2.6} />;
          })}
        </g>
        {NODOS.map((n, i) => {
          const p = posicion(i);
          const d = `M${CENTRO} ${CENTRO} L${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
          return (
            <g key={n.etiqueta}>
              <path className={s.ecoLinea} d={d} />
              <path className={s.ecoPulso} d={d} pathLength={100} style={{ animationDelay: `${-i * 0.55}s` }} />
            </g>
          );
        })}
        <circle className={s.ecoOnda} cx={CENTRO} cy={CENTRO} r="70" />
        <circle className={s.ecoOnda} cx={CENTRO} cy={CENTRO} r="70" style={{ animationDelay: "-1.5s" }} />
        <circle className={s.ecoNucleo} cx={CENTRO} cy={CENTRO} r="66" />
        <image href="/brand/nexara-mark-v2.png" x={CENTRO - 30} y={CENTRO - 30} width="60" height="60" />
      </svg>
      {NODOS.map((n, i) => {
        const p = posicion(i);
        return (
          <span key={n.etiqueta} className={s.ecoNodo} style={{ left: `${(p.x / 560) * 100}%`, top: `${(p.y / 560) * 100}%` }}>
            <span className={s.ecoIcono}>
              <PublicIcon name={n.icono} size={18} />
            </span>
            {n.etiqueta}
          </span>
        );
      })}
    </div>
  );
}
