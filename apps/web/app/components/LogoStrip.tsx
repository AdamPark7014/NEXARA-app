import styles from "./LogoStrip.module.css";

export type LogoStripItem = {
  src: string;
  alt: string;
};

type LogoStripProps = {
  /** Kicker corto encima de los logos ("Fabricantes", "Certificaciones"…). */
  label: string;
  items: LogoStripItem[];
  /**
   * grid: retícula estática. marquee: marquesina ambiental continua
   * (pausa al hover; con prefers-reduced-motion cae a retícula estática).
   */
  display?: "grid" | "marquee";
  /** Solo marquee: 1 fila o 2 filas en direcciones opuestas. */
  rows?: 1 | 2;
  className?: string;
};

const splitRows = (items: LogoStripItem[], rows: 1 | 2): LogoStripItem[][] => {
  if (rows === 1) return [items];
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)];
};

/**
 * Logos de marcas / certificaciones en celdas claras uniformes (los logos a
 * color conservan su identidad; la celda doma el caos visual). La marquesina
 * es CSS puro: sin JS, sin layout shift, y el track se duplica para el loop.
 */
export default function LogoStrip({
  label,
  items,
  display = "grid",
  rows = 2,
  className,
}: LogoStripProps) {
  if (!items.length) return null;

  const renderCells = (list: LogoStripItem[], hidden = false) =>
    list.map((item, i) => (
      <li key={`${item.src}-${hidden ? "b" : "a"}-${i}`} className={styles.cell} aria-hidden={hidden || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.src} alt={hidden ? "" : item.alt} loading="lazy" decoding="async" className={styles.logo} />
      </li>
    ));

  if (display === "marquee") {
    return (
      <div className={`${styles.strip} ${className || ""}`} role="group" aria-label={label}>
        <p className={styles.label}>{label}</p>
        {splitRows(items, rows).map((row, rowIdx) => (
          <div key={rowIdx} className={styles.viewport}>
            <ul
              className={`${styles.track} ${rowIdx % 2 === 1 ? styles.trackReverse : ""}`}
              style={{ "--marquee-count": row.length } as React.CSSProperties}
            >
              {renderCells(row)}
              {renderCells(row, true)}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`${styles.strip} ${className || ""}`} role="group" aria-label={label}>
      <p className={styles.label}>{label}</p>
      <ul className={styles.row}>{renderCells(items)}</ul>
    </div>
  );
}
