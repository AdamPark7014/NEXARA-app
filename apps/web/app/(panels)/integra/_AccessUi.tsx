"use client";

import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { IgBtn } from "./_Console";
import type { Diagnostico } from "./_fallosApi";
import a from "./_access.module.css";

/* ── Estado de puerta ──────────────────────────────────────────────────
 *
 * El backend (`listDoors` en integra-artemis.service.ts) devuelve `status`
 * traducido desde `ARTEMIS_DOOR_STATE`: remain_open · closed · open ·
 * remain_closed · offline · unknown. Nada más. En particular NO existe un
 * estado «forzada» en el espejo ni en la consulta live, así que aquí no se
 * pinta: sería inventar información sobre una cerradura física.
 */

export type DoorStateKey =
  | "open"
  | "closed"
  | "remain_open"
  | "remain_closed"
  | "offline"
  | "unknown";

const STATE_LABEL: Record<DoorStateKey, string> = {
  open: "Abierta",
  closed: "Cerrada",
  remain_open: "Mantenida abierta",
  remain_closed: "Mantenida cerrada",
  offline: "Equipo caído",
  unknown: "Sin dato",
};

/** Orden del filtro: primero lo que exige atención. */
export const DOOR_STATE_FILTERS: Array<{ value: DoorStateKey; label: string }> = [
  { value: "offline", label: STATE_LABEL.offline },
  { value: "remain_open", label: STATE_LABEL.remain_open },
  { value: "open", label: STATE_LABEL.open },
  { value: "closed", label: STATE_LABEL.closed },
  { value: "remain_closed", label: STATE_LABEL.remain_closed },
  { value: "unknown", label: STATE_LABEL.unknown },
];

function isStateKey(v: string): v is DoorStateKey {
  return v in STATE_LABEL;
}

/**
 * Estado efectivo de una puerta.
 *
 * Si la terminal está fuera de línea manda «equipo caído»: el `doorState` del
 * espejo puede ser el último conocido antes de la caída, y presentarlo como
 * estado actual es exactamente la clase de mentira que hace que un operador
 * confíe en una puerta que ya no reporta.
 */
export function doorState(d: { online?: boolean; status?: string }): DoorStateKey {
  if (d.online === false) return "offline";
  const s = (d.status || "").trim();
  return isStateKey(s) ? s : "unknown";
}

export function doorStateLabel(key: DoorStateKey): string {
  return STATE_LABEL[key];
}

export function DoorStateBadge({ state }: { state: DoorStateKey }) {
  return (
    <span className={a.stateBadge} data-state={state}>
      <span className={a.stateDot} aria-hidden />
      {STATE_LABEL[state]}
    </span>
  );
}

/* ── «Mostrando X de N» ────────────────────────────────────────────────
 *
 * Antes estas listas se cortaban con un `.slice(0, 24)` mudo y el operador
 * creía estar viendo el sitio completo. El recuento es obligatorio siempre
 * que haya datos, aunque no haya recorte.
 */

export function ShowingCount({
  shown,
  matching,
  total,
  noun,
  onMore,
  onAll,
}: {
  /** Elementos realmente pintados. */
  shown: number;
  /** Elementos que pasan los filtros activos. */
  matching: number;
  /** Elementos cargados en total, antes de filtrar. */
  total: number;
  /** Sustantivo en plural: «puertas», «equipos», «personas». */
  noun: string;
  onMore?: () => void;
  onAll?: () => void;
}) {
  if (total === 0) return null;
  const truncated = shown < matching;
  return (
    <p className={a.showing} role="status">
      <span>
        Mostrando <span className={truncated ? a.showingWarn : a.showingStrong}>{shown}</span> de{" "}
        <span className={a.showingStrong}>{matching}</span> {noun}
        {matching !== total ? ` · ${total} cargadas sin filtro` : ""}
      </span>
      {truncated && onMore ? (
        <IgBtn onClick={onMore} aria-label={`Ver más ${noun}`}>
          Ver más
          <UnfoldMoreIcon className={a.btnIcon} aria-hidden />
        </IgBtn>
      ) : null}
      {truncated && onAll ? (
        <IgBtn onClick={onAll} aria-label={`Ver las ${matching} ${noun}`}>
          Ver las {matching}
        </IgBtn>
      ) : null}
    </p>
  );
}

/* ── Carga y error ─────────────────────────────────────────────────────── */

export function DoorGridSkeleton({ cells = 8 }: { cells?: number }) {
  return (
    <div className={a.doorGrid} aria-hidden>
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className={`${a.skel} ${a.skelDoor}`} />
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={a.skelList} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${a.skel} ${a.skelRow}`} />
      ))}
    </div>
  );
}

/**
 * Error con reintento — sustituye al par `setError` + `toast.error`.
 *
 * Recibe un `Diagnostico` (de `_fallosApi`), no una cadena suelta: «no tienes
 * permiso» y «el servidor no responde» son dos problemas distintos con dos
 * soluciones distintas, y hasta ahora llegaban a la pantalla como el mismo
 * texto gris. El botón solo aparece cuando reintentar puede arreglarlo: un 403
 * no cambia por pulsar otra vez, y ofrecerlo es mandar al operador a un bucle.
 */
export function RetryNotice({
  diag,
  onRetry,
  busy,
}: {
  diag: Diagnostico;
  onRetry: () => void;
  busy?: boolean;
}) {
  const Icono = diag.tono === "warn" ? WarningAmberOutlinedIcon : CloudOffOutlinedIcon;
  return (
    <div className={a.retryBox} role="alert" data-tone={diag.tono}>
      <p className={a.retryTitle}>
        <Icono className={a.icon} aria-hidden />
        {diag.titulo}
      </p>
      <p className={a.retryMsg}>{diag.cuerpo}</p>
      {diag.reintentable ? (
        <IgBtn onClick={onRetry} disabled={busy} aria-label="Reintentar la carga">
          {busy ? "Reintentando…" : "Reintentar"}
          <RefreshIcon className={a.btnIcon} aria-hidden />
        </IgBtn>
      ) : null}
    </div>
  );
}

/**
 * Diagnóstico para un fallo que no viene de la API: el permiso lo comprobó la
 * propia pantalla con las capacidades ya cargadas, sin llegar a llamar a nadie.
 */
export function diagLocal(titulo: string, cuerpo: string): Diagnostico {
  return { titulo, cuerpo, tono: "warn", reintentable: false };
}
