import type { ReactNode } from "react";
import styles from "./PublicPageHero.module.css";

type PublicPageHeroProps = {
  eyebrow: string;
  title: ReactNode;
  lead: string;
  /** Imagen desktop (principal). */
  imageSrc: string;
  /** Imagen móvil opcional; si falta, se usa imageSrc. */
  imageSrcMobile?: string;
  imageAlt: string;
  actions?: ReactNode;
  /** Altura más contenida para páginas internas (default true). */
  compact?: boolean;
};

/**
 * Hero full-bleed para páginas públicas internas.
 * Headline + lead (+ CTAs opcionales) sobre imagen edge-to-edge.
 * Desktop + móvil vía CSS (sin JS).
 */
export default function PublicPageHero({
  eyebrow,
  title,
  lead,
  imageSrc,
  imageSrcMobile,
  imageAlt,
  actions,
  compact = true,
}: PublicPageHeroProps) {
  const mobileSrc = imageSrcMobile || imageSrc;

  return (
    <section
      className={`${styles.hero} ${compact ? styles.compact : ""}`}
      aria-label={eyebrow}
    >
      {/* Preload LCP: desktop + móvil (el navegador elige por media) */}
      {imageSrc ? (
        <link
          rel="preload"
          as="image"
          href={imageSrc}
          media="(min-width: 768px)"
          fetchPriority="high"
        />
      ) : null}
      {mobileSrc ? (
        <link
          rel="preload"
          as="image"
          href={mobileSrc}
          media="(max-width: 767px)"
          fetchPriority="high"
        />
      ) : null}
      <div
        className={`${styles.media} ${styles.mediaDesktop}`}
        style={{ backgroundImage: `url("${imageSrc}")` }}
        role="img"
        aria-label={imageAlt}
      />
      <div
        className={`${styles.media} ${styles.mediaMobile}`}
        style={{ backgroundImage: `url("${mobileSrc}")` }}
        role="img"
        aria-hidden={mobileSrc === imageSrc}
        aria-label={mobileSrc === imageSrc ? undefined : imageAlt}
      />
      <div className={styles.overlay} aria-hidden />
      <div className={styles.content}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{lead}</p>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </section>
  );
}
