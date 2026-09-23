import Link from "next/link";
import styles from "./VisualEvidenceGrid.module.css";

export type EvidenceItem = {
  src: string;
  alt: string;
  label: string;
  href?: string;
};

export default function VisualEvidenceGrid({ items }: { items: EvidenceItem[] }) {
  return (
    <div className={styles.grid} data-reveal-stagger>
      {items.map((it, i) => {
        const body = (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.img} src={it.src} alt={it.alt} loading="lazy" decoding="async" />
            <span className={styles.label}>{it.label}</span>
          </>
        );
        return it.href ? (
          <Link key={`${it.src}-${i}`} href={it.href} className={styles.tile} data-reveal="up">
            {body}
          </Link>
        ) : (
          <figure key={`${it.src}-${i}`} className={styles.tile} data-reveal="up">
            {body}
          </figure>
        );
      })}
    </div>
  );
}

