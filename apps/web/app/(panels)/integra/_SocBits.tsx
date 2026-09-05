"use client";

/**
 * Piezas de la consola SOC que `_Console.tsx` no da y no puedo añadir ahí
 * (lo tienen abierto otros agentes): severidad con color y FORMA, estado del
 * flujo de atención, tabla que ordena, esqueletos y vacíos con tono propio.
 */

import type { ReactNode } from "react";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CodeIcon from "@mui/icons-material/Code";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import FiberNewIcon from "@mui/icons-material/FiberNew";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import RepeatIcon from "@mui/icons-material/Repeat";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import styles from "./_soc.module.css";
import {
  SEVERITY_LABEL,
  STATUS_LABEL,
  normalizeSeverity,
  normalizeStatus,
  toKeyValues,
  type KeyValue,
  type SocSeverity,
  type SocStatus,
  type SortDir,
} from "./_soc";

/* ── Severidad ──────────────────────────────────────────────────────────── */

function SeverityIcon({ sev }: { sev: SocSeverity }) {
  if (sev === "alta") return <ReportProblemIcon aria-hidden />;
  if (sev === "media") return <WarningAmberIcon aria-hidden />;
  if (sev === "baja") return <InfoOutlinedIcon aria-hidden />;
  return <HelpOutlineIcon aria-hidden />;
}

export function SocSeverityPill({ severity }: { severity: string | null | undefined }) {
  const sev = normalizeSeverity(severity);
  const raw = String(severity ?? "").trim();
  return (
    <span
      className={styles.sevPill}
      data-sev={sev}
      title={
        sev === "desconocida" && raw
          ? `El backend devolvió «${raw}», que no es alta/media/baja`
          : `Severidad ${SEVERITY_LABEL[sev].toLowerCase()}`
      }
    >
      <SeverityIcon sev={sev} />
      {SEVERITY_LABEL[sev]}
    </span>
  );
}

/* ── Estado del flujo de atención ───────────────────────────────────────── */

function StatusIcon({ status }: { status: SocStatus }) {
  if (status === "OPEN") return <FiberNewIcon aria-hidden />;
  if (status === "TICKETED") return <ConfirmationNumberIcon aria-hidden />;
  if (status === "ACK") return <HowToRegIcon aria-hidden />;
  if (status === "CLEARED") return <CheckCircleIcon aria-hidden />;
  return <HelpOutlineIcon aria-hidden />;
}

export function SocStatusPill({
  status,
  title,
}: {
  status: string | null | undefined;
  title?: string;
}) {
  const st = normalizeStatus(status);
  return (
    <span className={styles.statusPill} data-status={st} title={title}>
      <StatusIcon status={st} />
      {STATUS_LABEL[st]}
    </span>
  );
}

/* ── Contador de repeticiones ───────────────────────────────────────────── */

export function SocRepeatChip({ count, hint }: { count: number; hint?: string }) {
  if (count <= 1) return null;
  return (
    <span
      className={styles.dupChip}
      data-hot={count >= 5 ? "1" : undefined}
      title={hint || `Se repitió ${count} veces`}
    >
      <RepeatIcon aria-hidden />
      {`×${count}`}
    </span>
  );
}

/* ── Tabla ordenable ────────────────────────────────────────────────────── */

export type SocColumn<K extends string> = {
  key: K;
  label: string;
  width?: string;
  /** Solo las columnas que ordenan llevan botón; el resto es cabecera muda. */
  sortable?: boolean;
  align?: "left" | "right" | "center";
};

export type SocRow<K extends string> = {
  key: string;
  cells: Record<K, ReactNode>;
  severity?: SocSeverity;
  attended?: boolean;
};

export function SocSortableTable<K extends string>({
  columns,
  rows,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  selectedKey,
  caption,
  empty,
}: {
  columns: ReadonlyArray<SocColumn<K>>;
  rows: ReadonlyArray<SocRow<K>>;
  sortKey: K | null;
  sortDir: SortDir;
  onSort: (key: K) => void;
  onRowClick?: (key: string) => void;
  selectedKey?: string | null;
  /** Descripción para lector de pantalla; no se pinta. */
  caption: string;
  empty?: ReactNode;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sortKey === c.key;
              const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={{ width: c.width, textAlign: c.align || "left" }}
                  aria-sort={c.sortable ? ariaSort : undefined}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      className={styles.sortBtn}
                      data-active={active ? "1" : undefined}
                      onClick={() => onSort(c.key)}
                      aria-label={
                        active
                          ? `${c.label}: ordenado ${sortDir === "asc" ? "de menor a mayor" : "de mayor a menor"}. Pulsa para invertir`
                          : `Ordenar por ${c.label}`
                      }
                    >
                      {c.label}
                      {active ? (
                        sortDir === "asc" ? (
                          <ArrowUpwardIcon aria-hidden />
                        ) : (
                          <ArrowDownwardIcon aria-hidden />
                        )
                      ) : (
                        <UnfoldMoreIcon aria-hidden />
                      )}
                    </button>
                  ) : (
                    <span className={styles.thPad}>{c.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              data-sev={r.severity}
              data-attended={r.attended ? "1" : undefined}
              data-selected={selectedKey === r.key ? "1" : undefined}
              data-click={onRowClick ? "1" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(r.key) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(r.key);
                      }
                    }
                  : undefined
              }
            >
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align || "left" }}>
                  {r.cells[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && empty}
    </div>
  );
}

/* ── Pares clave-valor + crudo plegable ─────────────────────────────────── */

export function SocKeyValues({ pairs }: { pairs: ReadonlyArray<KeyValue> }) {
  if (!pairs.length) return null;
  return (
    <dl className={styles.kv}>
      {pairs.map((p) => (
        <div key={p.key} style={{ display: "contents" }}>
          <dt className={styles.kvKey}>{p.label}</dt>
          <dd className={styles.kvVal} data-empty={p.empty ? "1" : undefined}>
            {p.empty ? "sin dato" : p.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Ficha legible de un registro crudo. El JSON queda para depurar, plegado. */
export function SocRawRecord({
  title,
  meta,
  raw,
  summaryLabel = "Ver JSON crudo (depuración)",
  limit,
}: {
  title: ReactNode;
  meta?: ReactNode;
  raw: unknown;
  summaryLabel?: string;
  limit?: number;
}) {
  const pairs = toKeyValues(raw, limit);
  return (
    <article className={styles.recordCard}>
      <header className={styles.recordHead}>
        <span className={styles.recordTitle}>{title}</span>
        {meta}
      </header>
      {pairs.length ? (
        <SocKeyValues pairs={pairs} />
      ) : (
        <p className={styles.hint}>
          El registro no trae campos legibles. Ábrelo en crudo para ver qué llegó.
        </p>
      )}
      <details className={styles.raw}>
        <summary className={styles.rawSummary}>
          <CodeIcon aria-hidden />
          {summaryLabel}
        </summary>
        <pre className={styles.rawPre}>{safeJson(raw)}</pre>
      </details>
    </article>
  );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? "null";
  } catch {
    return "No se pudo serializar el registro (referencia circular).";
  }
}

/* ── Esqueletos ─────────────────────────────────────────────────────────── */

export function SocTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={styles.skel} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.skelRow}>
          <span className={styles.skelBar} style={{ width: "72%" }} />
          <span className={styles.skelBar} style={{ width: `${88 - (i % 3) * 14}%` }} />
          <span className={styles.skelBar} style={{ width: "64%" }} />
          <span className={styles.skelBar} style={{ width: "40%" }} />
          <span className={styles.skelBar} style={{ width: "84%" }} />
          <span className={styles.skelBar} style={{ width: "58%" }} />
        </div>
      ))}
    </div>
  );
}

export function SocCardsSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className={styles.skelCards} aria-hidden>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className={styles.skelCard}>
          <span className={styles.skelAvatar} />
          <span className={styles.skelLines}>
            <span className={styles.skelBar} style={{ width: `${70 - (i % 3) * 10}%` }} />
            <span className={styles.skelBar} style={{ width: "52%" }} />
            <span className={styles.skelBar} style={{ width: "36%" }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Vacío ──────────────────────────────────────────────────────────────── */

export function SocEmpty({
  icon,
  title,
  hint,
  tone = "neutral",
  actions,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  /** «ok» = buena noticia. Un SOC sin alarmas no es un error. */
  tone?: "ok" | "neutral";
  actions?: ReactNode;
}) {
  return (
    <div className={styles.empty} data-tone={tone}>
      <span className={styles.emptyIcon}>{icon}</span>
      <strong className={styles.emptyTitle}>{title}</strong>
      {hint && <span className={styles.emptyHint}>{hint}</span>}
      {actions && <div className={styles.emptyActions}>{actions}</div>}
    </div>
  );
}
