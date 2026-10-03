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

/** Buscador de 36 px con lupa y el atajo a la derecha. */
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

export type EmptyStateTone = "brand" | "neutral" | "info" | "success" | "warning" | "danger";

/** Estado vacío: icono, una línea, una explicación corta y la acción que lo resuelve. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  tone = "brand",
  size = "default",
  titleAs: TitleTag = "p",
  className,
  style,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Segunda salida junto a `action` («Limpiar filtros»). */
  secondaryAction?: ReactNode;
  /** Color de la pastilla del icono (`success` = todo al día, `danger` = no cargó). */
  tone?: EmptyStateTone;
  /** compact = dentro de una tabla · default · page = pantalla entera. */
  size?: "compact" | "default" | "page";
  titleAs?: "p" | "h2" | "h3";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={[s.empty, className].filter(Boolean).join(" ")} data-size={size} data-tone={tone} role="status" style={style}>
      {icon ? (
        <span className={s.emptyIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <TitleTag className={s.emptyTitle}>{title}</TitleTag>
      {description ? <p className={s.emptyText}>{description}</p> : null}
      {action || secondaryAction ? (
        <div className={s.emptyAction}>
          {action}
          {secondaryAction}
        </div>
      ) : null}
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

export type AlertTone = "warning" | "danger" | "info" | "neutral" | "success" | "brand";

/** Cada tono tiene su forma: quien no distingue rojo de ámbar sigue viendo aspa, triángulo, «i» o palomita. */
function AlertIcon({ tone }: { tone: AlertTone }) {
  const p = { stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      {tone === "danger" ? (
        <>
          <circle cx="8" cy="8" r="6.4" {...p} />
          <path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2" {...p} />
        </>
      ) : tone === "warning" ? (
        <>
          <path d="M8 2.4L14.4 13.4H1.6z" {...p} />
          <path d="M8 6.5v3.1" {...p} />
          <circle cx="8" cy="11.4" r="0.75" fill="currentColor" />
        </>
      ) : tone === "success" ? (
        <>
          <circle cx="8" cy="8" r="6.4" {...p} />
          <path d="M5.2 8.2l2 2 3.6-4.1" {...p} />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="6.4" {...p} />
          <path d="M8 7.3v3.6" {...p} />
          <circle cx="8" cy="5.1" r="0.8" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/**
 * Aviso en línea: fondo tenue del tono, borde fino, icono por tono, título opcional y
 * la acción que lo resuelve a la derecha. `icon={null}` quita el icono.
 */
export function Alert({
  tone = "warning",
  icon,
  children,
  action,
  role,
  title,
  onDismiss,
  dismissLabel = "Cerrar",
  ariaLive,
  srLabel,
  dense = false,
  className,
  style,
}: {
  tone?: AlertTone;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
  title?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  ariaLive?: "assertive" | "polite";
  /** Prefijo solo para lector de pantalla («Error», «Aviso»). */
  srLabel?: string;
  dense?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={[s.alert, dense ? s.alertDense : "", className].filter(Boolean).join(" ")}
      data-tone={tone}
      data-titled={title ? "true" : undefined}
      role={role}
      aria-live={ariaLive}
      style={style}
    >
      {icon !== null ? (
        <span className={s.alertIco} aria-hidden="true">
          {icon ?? <AlertIcon tone={tone} />}
        </span>
      ) : null}
      <span className={s.alertText}>
        {srLabel ? <span className="ui-sr-only">{srLabel}: </span> : null}
        {title ? <strong className={s.alertTitle}>{title}</strong> : null}
        {children}
      </span>
      {action ? <span className={s.alertAction}>{action}</span> : null}
      {onDismiss ? (
        <button type="button" className={s.alertX} onClick={onDismiss} aria-label={dismissLabel} title={dismissLabel}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
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

export type Presence = "online" | "away" | "off";

const PRESENCIA: Record<Presence, string> = { online: "En línea", away: "Ausente", off: "Desconectado" };

/**
 * Foto real de la persona (`avatarUrl` de la API) o sus iniciales en gris si no hay o
 * no carga. `presence` agrega el punto de estado en la esquina.
 */
export function Avatar({
  url,
  avatarUrl,
  name,
  size = 32,
  presence,
  title,
  className,
}: {
  url?: string | null;
  /** Mismo que `url`, con el nombre que trae la API. */
  avatarUrl?: string | null;
  name: string;
  size?: number;
  presence?: Presence;
  title?: string;
  className?: string;
}) {
  const crudo = url ?? avatarUrl ?? null;
  const src = crudo ? resolveAssetUrl(crudo) : null;
  const [fallo, setFallo] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  const conFoto = Boolean(src) && fallo !== src;
  const cara = conFoto ? (
    <span className={[s.avatar, presence ? "" : className].filter(Boolean).join(" ")} style={style} title={presence ? undefined : title}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src as string} alt="" className={s.avatarImg} onError={() => setFallo(src)} />
    </span>
  ) : (
    <span className={[s.avatar, presence ? "" : className].filter(Boolean).join(" ")} style={style} aria-hidden="true" title={presence ? undefined : title}>
      {iniciales(name)}
    </span>
  );
  if (!presence) return cara;
  const punto = Math.max(8, Math.round(size * 0.3));
  return (
    <span className={[s.avWrap, className].filter(Boolean).join(" ")} title={title}>
      {cara}
      <span
        className={s.avPresence}
        data-presence={presence}
        style={{ width: punto, height: punto }}
        role="img"
        aria-label={PRESENCIA[presence]}
      />
    </span>
  );
}

/**
 * Icono ⓘ que abre una ventanita con la explicación. La página no lleva el texto:
 * vive aquí. Se cierra con Escape o al tocar fuera. `conTexto` muestra la etiqueta.
 */
export function InfoPopover({
  label,
  title,
  conTexto = false,
  children,
}: {
  label: string;
  title?: string;
  conTexto?: boolean;
  children: ReactNode;
}) {
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
        className={`${b.btn} ${b.btnGhost}${conTexto ? "" : ` ${b.btnIcon}`}`}
        aria-expanded={open}
        aria-label={conTexto ? undefined : label}
        title={conTexto ? undefined : label}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <InfoOutlinedIcon aria-hidden="true" />
        {conTexto ? label : null}
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
