import type { CSSProperties } from "react";
import styles from "./Skeleton.module.scss";

/**
 * NEXARA · Skeleton
 *
 * Bloques grises que ocupan el sitio del contenido mientras llega. Sin
 * `"use client"`: sirven en `loading.tsx` (componente de servidor) y no suman
 * JavaScript al navegador. La animación es CSS y se apaga con
 * `prefers-reduced-motion`.
 *
 * Piezas:
 *   <Skeleton width={120} height={12} />       bloque suelto
 *   <SkeletonText lines={3} />                 párrafo
 *   <SkeletonCard />                           tarjeta (KPI / resumen)
 *   <SkeletonTable rows={6} columns={4} />     tabla con encabezado
 *   <PageSkeleton variant="list" />            pantalla completa de módulo
 */

type Size = number | string;

export type SkeletonProps = {
  width?: Size;
  height?: Size;
  /** Radio en px. Por defecto el de controles (`--ui-radius-sm`). */
  radius?: number;
  shape?: "rect" | "circle" | "pill";
  className?: string;
  style?: CSSProperties;
};

export default function Skeleton({
  width = "100%",
  height = 12,
  radius,
  shape = "rect",
  className,
  style,
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={["ui-skeleton", className].filter(Boolean).join(" ")}
      data-shape={shape === "rect" ? undefined : shape}
      style={{
        width,
        height,
        ...(shape === "circle" ? { width: width === "100%" ? height : width } : null),
        ...(radius != null ? { borderRadius: radius } : null),
        ...style,
      }}
    />
  );
}

export { Skeleton };

/** Anchos que varían para que el párrafo no parezca una rejilla. */
const LINE_WIDTHS = ["100%", "92%", "78%", "86%", "64%"];

export function SkeletonText({
  lines = 3,
  lineHeight = 12,
  gap = 8,
  className,
}: {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  className?: string;
}) {
  return (
    <span className={[styles.text, className].filter(Boolean).join(" ")} style={{ gap }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 && lines > 1 ? "58%" : LINE_WIDTHS[i % LINE_WIDTHS.length]}
        />
      ))}
    </span>
  );
}

export function SkeletonCard({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={[styles.card, className].filter(Boolean).join(" ")} aria-hidden="true">
      <div className={styles.cardHead}>
        <Skeleton width="42%" height={10} />
        <Skeleton width={28} height={28} radius={8} />
      </div>
      <Skeleton width="56%" height={26} radius={6} />
      {lines > 0 ? <SkeletonText lines={lines} lineHeight={10} /> : null}
    </div>
  );
}

export function SkeletonTable({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  const cols = Math.max(1, columns);
  const template = `minmax(0, 1.6fr) ${"minmax(0, 1fr) ".repeat(cols - 1)}`.trim();
  return (
    <div className={[styles.table, className].filter(Boolean).join(" ")} aria-hidden="true">
      <div className={styles.tableHead} style={{ gridTemplateColumns: template }}>
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} width={c === 0 ? "40%" : "55%"} height={9} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={styles.tableRow} style={{ gridTemplateColumns: template }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton
              key={c}
              height={11}
              width={c === 0 ? `${62 + ((r * 13) % 30)}%` : c === cols - 1 ? "48%" : `${50 + ((r * 7 + c * 11) % 36)}%`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Pantalla de carga de un módulo completo. Reproduce la silueta real
 * (encabezado → tarjetas → tabla) para que al llegar los datos no salte nada.
 */
export function PageSkeleton({
  variant = "list",
  label = "Cargando…",
}: {
  variant?: "list" | "dashboard" | "detail";
  /** Lo que anuncia el lector de pantalla. */
  label?: string;
}) {
  return (
    <div className={styles.page} role="status" aria-live="polite" aria-busy="true">
      <span className="ui-sr-only">{label}</span>

      <div className={styles.header} aria-hidden="true">
        <div className={styles.headerText}>
          <Skeleton width={180} height={20} radius={6} />
          <Skeleton width={320} height={12} />
        </div>
        <div className={styles.headerActions}>
          <Skeleton width={96} height={32} radius={8} />
          <Skeleton width={120} height={32} radius={8} />
        </div>
      </div>

      {variant === "dashboard" ? (
        <>
          <div className={styles.kpis}>
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className={styles.split}>
            <div className={styles.panel} aria-hidden="true">
              <Skeleton width="30%" height={12} />
              <Skeleton height={180} radius={8} />
            </div>
            <div className={styles.panel} aria-hidden="true">
              <Skeleton width="40%" height={12} />
              <SkeletonText lines={5} />
            </div>
          </div>
        </>
      ) : variant === "detail" ? (
        <div className={styles.split}>
          <div className={styles.panel} aria-hidden="true">
            <Skeleton width="28%" height={12} />
            <SkeletonText lines={6} />
          </div>
          <div className={styles.panel} aria-hidden="true">
            <Skeleton width="44%" height={12} />
            <SkeletonText lines={4} />
          </div>
        </div>
      ) : (
        <>
          <div className={styles.toolbar} aria-hidden="true">
            <Skeleton width={260} height={32} radius={8} />
            <Skeleton width={110} height={32} radius={8} />
          </div>
          <SkeletonTable rows={7} columns={5} />
        </>
      )}
    </div>
  );
}
