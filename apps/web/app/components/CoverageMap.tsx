import type { ReactNode } from "react";
import styles from "./CoverageMap.module.css";

const ANCHOS = [1200, 1600, 2000] as const;

const srcSet = (tema: "claro" | "oscuro") =>
  ANCHOS.map((w) => `/fotos/mapa-cobertura-nexara-${tema}-${w}.webp ${w}w`).join(", ");

const ALT = "Mapa de cobertura NEXARA — 32 estados y +200 puntos de presencia en México; base en Puebla y CDMX";

type CoverageMapProps = {
  /** `sizes` del srcset según el ancho que ocupa el mapa en cada página. */
  sizes: string;
  caption?: ReactNode;
  className?: string;
};

/**
 * Mapa de cobertura (infografía de Adam, 2:1) en su versión clara u oscura según
 * `html[data-public-theme]`. Van las dos en el HTML y el CSS oculta la que no
 * toca; con `loading="lazy"` el navegador no descarga la oculta. Se muestra
 * completa: es texto e iconos hasta el borde, no una foto que aguante recorte.
 */
export default function CoverageMap({ sizes, caption, className }: CoverageMapProps) {
  return (
    <figure className={`${styles.panel} ${className || ""}`}>
      {(["claro", "oscuro"] as const).map((tema) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={tema}
          className={tema === "claro" ? styles.claro : styles.oscuro}
          src={`/fotos/mapa-cobertura-nexara-${tema}-2000.webp`}
          srcSet={srcSet(tema)}
          sizes={sizes}
          width={2000}
          height={1000}
          alt={ALT}
          loading="lazy"
          decoding="async"
        />
      ))}
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}
