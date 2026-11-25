import type { CSSProperties, ReactNode } from "react";
import s from "./sitio.module.css";
import p from "./paginas.module.css";
import n from "./noche.module.css";
import FondoNoche from "./FondoNoche";

type Props = {
  /** `id` del `<h1>`: nombra la sección. */
  id: string;
  /** El texto del hero: antetítulo, título, bajada y acciones. */
  children: ReactNode;
  /** Foto, mosaico o mapa: va montado en el corte entre la noche y la página. */
  visual?: ReactNode;
  /** Sin el hilo de color al pie: lo pone la sección que sigue (por ejemplo, un `PuenteNoche`). */
  sinHilo?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Con qué abre cada página interior: un escenario de «Noche NEXARA» (el mismo de la portada, sin la entrada) con el
 * texto centrado y, si la hay, la foto de la página a caballo entre la noche y el contenido. La barra de navegación
 * viste de noche mientras tiene detrás una sección con `data-hero-noche` (Encabezado.tsx).
 */
export default function HeroPagina({ id, children, visual, sinHilo, className, style }: Props) {
  const clases = [s.noche, p.hero, n.escena, visual ? n.conVisual : "", className ?? ""];
  return (
    <>
      <section className={clases.filter(Boolean).join(" ")} aria-labelledby={id} data-hero-noche="" style={style}>
        <FondoNoche hilo={visual || sinHilo ? "ninguno" : "abajo"} />
        <div className={`${s.contenedor} ${s.centro}`}>{children}</div>
      </section>
      {visual ? (
        <div className={n.puente}>
          <i className={n.puenteZona} data-noche-zona="" aria-hidden="true" />
          <div className={s.contenedor}>{visual}</div>
        </div>
      ) : null}
    </>
  );
}
