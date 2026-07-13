import type { ReactNode } from "react";
import styles from "./PublicPageHero.module.css";

type PublicPageHeroProps = {
  eyebrow: string;
  title: ReactNode;
  lead: string;
  imageSrc: string;
  imageAlt: string;
  actions?: ReactNode;
  /** Altura más contenida para páginas internas (default true). */
  compact?: boolean;
};

/**
 * Hero full-bleed para páginas públicas internas.
 * Headline + lead (+ CTAs opcionales) sobre imagen edge-to-edge.
 */
export default function PublicPageHero({
  eyebrow,
  title,
  lead,
  imageSrc,
  imageAlt,
  actions,
  compact = true,
}: PublicPageHeroProps) {
  return (
    <section
      className={`${styles.hero} ${compact ? styles.compact : ""}`}
      aria-label={eyebrow}
    >
      <div
        className={styles.media}
        style={{ backgroundImage: `url("${imageSrc}")` }}
        role="img"
        aria-label={imageAlt}
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
