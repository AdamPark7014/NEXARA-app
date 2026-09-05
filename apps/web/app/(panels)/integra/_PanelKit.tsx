"use client";

/**
 * Piezas compartidas por las cinco pantallas que se arreglan en este turno:
 * inicio, horarios, visitas, asistencia y espacios.
 *
 * No sustituye a `_Console.tsx` —esas primitivas las está tocando otro agente—
 * ni pretende unificar las tablas a mano de cada página. Aquí solo vive lo que
 * faltaba y las cinco necesitaban por igual: texto truncado legible, estados
 * con título y reintento, esqueletos de carga, resultados de operación con el
 * crudo plegable y pestañas que de verdad apuntan a su panel.
 */

import type { ReactNode } from "react";
import { useId } from "react";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InboxIcon from "@mui/icons-material/Inbox";
import ReplayIcon from "@mui/icons-material/Replay";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import css from "./_panels.module.css";

/* ── Texto truncado ────────────────────────────────────────────────── */

/**
 * Texto de una celda que se corta con puntos suspensivos. El `title` es
 * obligatorio por construcción: media consola cortaba nombres largos sin
 * dejar ninguna forma de leerlos completos.
 */
export function Trunc({
  text,
  className,
  inline,
  title,
}: {
  text: string;
  className?: string;
  inline?: boolean;
  /** Sobrescribe el tooltip cuando el texto visible no es el completo. */
  title?: string;
}) {
  const base = inline ? css.truncInline : css.trunc;
  return (
    <span className={className ? `${base} ${className}` : base} title={title ?? text}>
      {text}
    </span>
  );
}

/* ── Estados ───────────────────────────────────────────────────────── */

export function PanelEmpty({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={css.state}>
      <span className={css.stateIcon} aria-hidden>
        {icon ?? <InboxIcon fontSize="small" />}
      </span>
      <strong className={css.stateTitle}>{title}</strong>
      {hint && <span className={css.stateHint}>{hint}</span>}
      {action && <div className={css.stateActions}>{action}</div>}
    </div>
  );
}

/**
 * Error con título, causa y reintento. Un `role="alert"` suelto con el mensaje
 * del `catch` deja al operador sin saber qué se rompió ni cómo volver a probar.
 */
export function PanelError({
  title,
  message,
  onRetry,
  retryLabel = "Reintentar",
  extra,
}: {
  title: string;
  message?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  extra?: ReactNode;
}) {
  return (
    <div className={css.state} data-tone="danger" role="alert">
      <span className={css.stateIcon} aria-hidden>
        <ErrorOutlineIcon fontSize="small" />
      </span>
      <strong className={css.stateTitle}>{title}</strong>
      {message && <span className={css.stateHint}>{message}</span>}
      {(onRetry || extra) && (
        <div className={css.stateActions}>
          {onRetry && (
            <button type="button" className={css.retryBtn} onClick={onRetry}>
              <ReplayIcon fontSize="small" aria-hidden />
              {retryLabel}
            </button>
          )}
          {extra}
        </div>
      )}
    </div>
  );
}

/** Esqueleto con la forma de la lista que está por llegar. */
export function PanelSkeleton({
  rows = 4,
  avatar = false,
  label = "Cargando…",
}: {
  rows?: number;
  avatar?: boolean;
  label?: string;
}) {
  return (
    <div className={css.skeleton} role="status" aria-live="polite" aria-busy="true">
      <span className={css.srOnly}>{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={css.skelRow} aria-hidden>
          {avatar ? <span className={css.skelDot} /> : <span className={css.skelBar} />}
          <span className={css.skelStack}>
            <span className={css.skelBar} />
            <span className={css.skelBar} />
          </span>
          <span className={css.skelBar} />
        </div>
      ))}
    </div>
  );
}

/* ── Resultado de una operación ────────────────────────────────────── */

export type OpFact = { label: string; value: string; mono?: boolean };

/**
 * Resumen legible de lo que acaba de pasar, con la respuesta cruda plegada
 * debajo. Sustituye a los `<pre>{JSON.stringify(data, null, 2)}</pre>` que
 * enseñaban el sobre del API como si fuera el resultado.
 */
export function OpResult({
  title,
  tone = "ok",
  facts,
  hint,
  raw,
  rawLabel = "Ver respuesta del servidor",
}: {
  title: string;
  tone?: "ok" | "danger" | "neutral";
  facts?: OpFact[];
  hint?: string;
  raw?: unknown;
  rawLabel?: string;
}) {
  const rawText = raw == null ? null : safeJson(raw);
  return (
    <div className={css.opResult} data-tone={tone}>
      <div className={css.opHead}>
        <span className={css.icon} aria-hidden>
          {tone === "danger" ? (
            <ErrorOutlineIcon fontSize="small" />
          ) : (
            <TaskAltIcon fontSize="small" />
          )}
        </span>
        {title}
      </div>
      {hint && <span className={css.stateHint}>{hint}</span>}
      {facts && facts.length > 0 && (
        <dl className={css.opFacts}>
          {facts.map((f) => (
            <div key={f.label} className={css.opFact}>
              <dt className={css.opFactLabel}>{f.label}</dt>
              <dd className={css.opFactValue} data-mono={f.mono ? "1" : undefined}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {rawText && (
        <details className={css.rawBlock}>
          <summary>
            <ExpandMoreIcon className={css.icon} fontSize="small" aria-hidden />
            {rawLabel}
          </summary>
          <pre className={css.rawPre}>{rawText}</pre>
        </details>
      )}
    </div>
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/* ── Pestañas accesibles ───────────────────────────────────────────── */

export type TabDef<T extends string> = { id: T; label: string };

/**
 * Devuelve los ids que unen cada pestaña con su panel. Sin `aria-controls` ni
 * `role="tabpanel"` el `role="tablist"` miente: anuncia pestañas que no llevan
 * a ningún contenido asociado.
 */
export function useTabIds(prefix: string) {
  const uid = useId();
  return {
    tabId: (id: string) => `${prefix}-tab-${id}-${uid}`,
    panelId: (id: string) => `${prefix}-panel-${id}-${uid}`,
  };
}

export function TabPanel({
  id,
  labelledBy,
  active,
  children,
}: {
  id: string;
  labelledBy: string;
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div id={id} role="tabpanel" aria-labelledby={labelledBy} className={css.tabPanel}>
      {children}
    </div>
  );
}
