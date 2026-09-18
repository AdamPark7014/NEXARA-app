"use client";

import { forwardRef, useEffect, useId, useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from "react";
import SearchIcon from "@mui/icons-material/Search";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { Kbd } from "./Button";
import b from "./base.module.css";
import s from "./estados.module.css";

/** Fila de filtros compacta: buscador, segmentos y, al final, el conteo. */
export function Toolbar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className={s.toolbar}>
      {children}
      {end ? <div className={s.toolbarEnd}>{end}</div> : null}
    </div>
  );
}

/** Buscador de 32 px con lupa y el atajo a la derecha. */
export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { shortcut?: string }>(
  function SearchInput({ shortcut, className, ...rest }, ref) {
    return (
      <div className={[s.search, className].filter(Boolean).join(" ")}>
        <SearchIcon className={s.searchIcon} aria-hidden="true" />
        <input ref={ref} type="search" className={s.searchInput} {...rest} />
        {shortcut ? (
          <span className={s.searchKbd}>
            <Kbd>{shortcut}</Kbd>
          </span>
        ) : null}
      </div>
    );
  },
);

/** Clase para <select>/<input type="date"> con la misma altura y borde que el buscador. */
export const fieldClass = s.field;

/** Estado vacío: icono, una línea, una explicación corta y la acción que lo resuelve. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={s.empty} role="status">
      {icon ? <span className={s.emptyIcon} aria-hidden="true">{icon}</span> : null}
      <p className={s.emptyTitle}>{title}</p>
      {description ? <p className={s.emptyText}>{description}</p> : null}
      {action ? <div className={s.emptyAction}>{action}</div> : null}
    </div>
  );
}

/** Bloque gris que late mientras carga. */
export function Skeleton({ width = "100%", height = 12, radius, style }: { width?: number | string; height?: number | string; radius?: number; style?: CSSProperties }) {
  return <span className={s.skeleton} style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

/** Renglones de tabla de mentira mientras llega la lista. */
export function SkeletonRows({ rows = 5, label = "Cargando" }: { rows?: number; label?: string }) {
  return (
    <div className={s.skeletonRows} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={s.skeletonRow}>
          <Skeleton width={120} />
          <Skeleton width={`${28 + ((i * 17) % 30)}%`} />
          <Skeleton width={64} style={{ marginLeft: "auto" }} />
        </div>
      ))}
    </div>
  );
}

const ALERTA = {
  warning: { background: "var(--ui-warning-bg)", color: "var(--ui-warning-text)" },
  danger: { background: "var(--ui-danger-bg)", color: "var(--ui-danger-text)" },
  info: { background: "var(--ui-info-bg)", color: "var(--ui-info-text)" },
  neutral: { background: "var(--ui-hover)", color: "var(--ui-fg-2)" },
} as const;

/** Aviso en línea, tenue; `action` va a la derecha. */
export function Alert({
  tone = "warning",
  icon,
  children,
  action,
  role,
}: {
  tone?: keyof typeof ALERTA;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div className={s.alert} style={ALERTA[tone]} role={role}>
      <span className={s.alertBody}>
        {icon}
        <span>{children}</span>
      </span>
      {action}
    </div>
  );
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

/** Foto de la persona o sus iniciales en gris. */
export function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  const src = url ? resolveAssetUrl(url) : null;
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={s.avatar} style={style} />;
  }
  return (
    <span className={s.avatar} style={style} aria-hidden="true">
      {iniciales(name)}
    </span>
  );
}

/**
 * Botón chico que abre una ventanita con texto de ayuda («¿Cómo se calcula?»).
 * Se cierra con Escape o al tocar fuera.
 */
export function InfoPopover({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [open]);
  return (
    <div className={s.pop} ref={ref}>
      <button
        type="button"
        className={`${b.btn} ${b.btnGhost}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <InfoOutlinedIcon aria-hidden="true" />
        {label}
      </button>
      {open ? (
        <div id={id} role="dialog" aria-label={title ?? label} className={s.popPanel}>
          {title ? <p className={s.popTitle}>{title}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
