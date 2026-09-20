"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import type { StatusTone } from "@/components/ui/StatusDot";

/**
 * NEXARA · Piezas visuales de Facturación CFDI.
 *
 * Lista y detalle compartían el mismo problema: título, pestañas, seis cifras,
 * estado, dos alertas, filtros y tabla pesaban casi lo mismo, y la pantalla no
 * decía por dónde empezar. Aquí viven las piezas que fijan el orden —dónde
 * estoy, qué puedo hacer, cómo voy, qué hay, cómo lo filtro, cómo está
 * configurado— sin tocar componentes compartidos.
 *
 * Dos reglas gobiernan el archivo entero:
 *   · lo que se separa con aire no se separa además con un borde;
 *   · lo que se distingue con tipografía no necesita además una tarjeta.
 */

/* ------------------------------------------------------------------ *
 * Estado fiscal
 * ------------------------------------------------------------------ */

export type FiscalInput = {
  status?: string | null;
  cfdiUuid?: string | null;
  satPaymentMethod?: string | null;
  isCancelled?: boolean;
};

/** Etiqueta comercial del `status` del ERP. */
export const COMMERCIAL_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
};

/**
 * Estado fiscal de la factura.
 *
 * El `status` del ERP mezcla lo comercial (pagada, vencida) con lo fiscal
 * (borrador, cancelada), y frente al SAT lo que manda es si el CFDI está
 * timbrado. Por eso el punto lleva el estado fiscal —lo que la contadora
 * busca primero— y lo comercial baja a la línea gris de abajo.
 *
 * Vivía duplicado en la lista y en el detalle; el detalle además miraba
 * `isCancelled`. Una sola función para las dos pantallas evita que se
 * separen con el tiempo.
 */
export function fiscalState(inv: FiscalInput): { label: string; tone: StatusTone; title: string } {
  if (inv.isCancelled || inv.status === "CANCELLED") {
    return { label: "Cancelada", tone: "danger", title: "CFDI cancelado ante el SAT" };
  }
  if (!inv.cfdiUuid) {
    return { label: "Sin timbrar", tone: "warning", title: "Borrador: todavía no tiene UUID fiscal" };
  }
  if (inv.satPaymentMethod === "PPD") {
    return {
      label: "Timbrada · PPD",
      tone: "neutral",
      title: "Timbrada. Cada pago exige complemento (Pagos 2.0)",
    };
  }
  return { label: "Timbrada", tone: "neutral", title: "CFDI con UUID fiscal" };
}

/* ------------------------------------------------------------------ *
 * Avisos con jerarquía
 * ------------------------------------------------------------------ */

export type NoticeLevel = "critical" | "warning" | "info";

export type Notice = {
  id: string;
  level: NoticeLevel;
  /** Una línea: qué pasa, no cómo se llama el campo. */
  text: string;
  /** La salida, cuando existe. Si hay algo que hacer, se ve. */
  action?: { label: string; href?: string; onClick?: () => void; busy?: boolean };
  /** Segunda salida, para avisos que admiten dos respuestas (reevaluar / eximir). */
  secondaryAction?: { label: string; onClick: () => void; busy?: boolean };
  onDismiss?: () => void;
};

const LEVEL_RANK: Record<NoticeLevel, number> = { critical: 0, warning: 1, info: 2 };

const LEVEL_COLOR: Record<NoticeLevel, string> = {
  critical: "var(--state-danger-text, #b91c1c)",
  warning: "var(--state-warning-text, #b45309)",
  info: "var(--text-tertiary)",
};

/**
 * Pila de avisos.
 *
 * Antes cada condición traía su propia caja de color con su propio margen: el
 * PAC en modo mock y el CSD sin configurar sumaban más alto que las cifras y
 * que la tabla juntas. Aquí todos los avisos comparten UN bloque —el color del
 * bloque es el del aviso más grave— y cada uno ocupa un renglón: punto,
 * frase, botón. Se ordenan solos: primero lo que bloquea, luego lo que avisa.
 *
 * Los avisos no desaparecen; dejan de gritar.
 */
export function NoticeStack({
  notices,
  ariaLabel = "Avisos de facturación",
  style,
}: {
  notices: Notice[];
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  if (notices.length === 0) return null;

  const sorted = [...notices].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  const accent = LEVEL_COLOR[sorted[0].level];

  return (
    <div
      role={sorted[0].level === "critical" ? "alert" : "status"}
      aria-label={ariaLabel}
      style={{
        display: "grid",
        gap: 1,
        padding: "3px 12px",
        marginBottom: 14,
        borderRadius: 9,
        border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
        background: `color-mix(in srgb, ${accent} 6%, transparent)`,
        ...style,
      }}
    >
      {sorted.map((n) => (
        <NoticeRow key={n.id} notice={n} />
      ))}
    </div>
  );
}

function NoticeRow({ notice }: { notice: Notice }) {
  const color = LEVEL_COLOR[notice.level];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, minHeight: 30, padding: "3px 0" }}>
      <span
        aria-hidden="true"
        style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12.5,
          lineHeight: 1.35,
          color: notice.level === "info" ? "var(--text-secondary)" : color,
        }}
      >
        {notice.text}
      </span>
      {notice.secondaryAction && (
        <Button
          size="sm"
          variant="ghost"
          onClick={notice.secondaryAction.onClick}
          disabled={notice.secondaryAction.busy}
        >
          {notice.secondaryAction.label}
        </Button>
      )}
      {notice.action &&
        (notice.action.href ? (
          <Link href={notice.action.href} style={{ textDecoration: "none", flexShrink: 0 }}>
            <Button size="sm" variant="link">
              {notice.action.label}
            </Button>
          </Link>
        ) : (
          <Button
            size="sm"
            variant="link"
            onClick={notice.action.onClick}
            disabled={notice.action.busy}
          >
            {notice.action.label}
          </Button>
        ))}
      {notice.onDismiss && (
        <button
          type="button"
          onClick={notice.onDismiss}
          aria-label="Descartar aviso"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            fontSize: 15,
            lineHeight: 1,
            padding: "0 2px",
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cifras: etiqueta pequeña · valor grande · metadato callado
 * ------------------------------------------------------------------ */

/**
 * El valor de una cifra, al tamaño que le toca.
 *
 * `MetricStrip` pinta el valor a 20px y la pista en `--text-secondary`: al
 * lado de una etiqueta de 11px los tres pesos quedaban casi iguales. Estas dos
 * piezas abren la distancia sin tocar el componente compartido.
 */
export function MetricValue({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 25, letterSpacing: "-0.015em" }}>{children}</span>;
}

/**
 * Corrige la tira de cifras cuando una celda se puede pulsar.
 *
 * `MetricStrip` pinta con `<button>` las celdas que llevan `onClick`, y su
 * `border: "none"` se pierde: React aplica la propiedad `border` después de
 * `borderRight`, el atajo borra el divisor y la celda se queda con el borde y
 * el radio que el navegador da a cualquier botón. En pantalla, las cifras que
 * filtran aparecen como pastillas y las que no, planas — lo contrario de una
 * tira agrupada con divisores sutiles.
 *
 * El componente es compartido y hay más agentes trabajando sobre él, así que
 * la corrección vive aquí, acotada a esta pantalla: se quita el borde del
 * navegador y se devuelve el divisor a TODAS las celdas por igual.
 */
const METRIC_FRAME_CSS = `
.nx-metric-frame > * > button,
.nx-metric-frame > * > a {
  border: 0 !important;
  border-radius: 0 !important;
  -webkit-appearance: none;
  appearance: none;
}
.nx-metric-frame > * > *:not(:last-child) {
  border-right: 1px solid var(--nx-panel-hairline, var(--border)) !important;
}
`;

export function MetricFrame({ children }: { children: ReactNode }) {
  return (
    <div className="nx-metric-frame" style={{ marginBottom: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: METRIC_FRAME_CSS }} />
      {children}
    </div>
  );
}

export function MetricHint({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const color =
    tone === "warning"
      ? "var(--state-warning-text, #b45309)"
      : tone === "danger"
        ? "var(--state-danger-text, #b91c1c)"
        : tone === "success"
          ? "var(--state-success-text, #15803d)"
          : "var(--text-tertiary)";
  return <span style={{ fontSize: 10.5, color, letterSpacing: "0.005em" }}>{children}</span>;
}

/* ------------------------------------------------------------------ *
 * Encabezado de bloque y barra de trabajo
 * ------------------------------------------------------------------ */

/**
 * Encabezado de un bloque de contenido, dicho con tipografía.
 *
 * `Section` envolvía la tabla en una tarjeta con cabecera, degradado y sombra,
 * y la tabla trae su propia superficie: eran dos cajas para un solo bloque.
 * Aquí el título es un `h2` y el aire hace de separador.
 */
export function BlockHeading({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  /** Conteo o contexto. Va callado, a la derecha del título. */
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 10,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--nx-font-display)",
          fontSize: 15.5,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          margin: 0,
          color: "var(--text-primary)",
          display: "flex",
          alignItems: "baseline",
          gap: 9,
        }}
      >
        {title}
        {meta != null && (
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)" }}>{meta}</span>
        )}
      </h2>
      {actions && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>
      )}
    </div>
  );
}

/** Control de la barra de trabajo: alto de botón, borde propio, nada más. */
export const toolbarControl: CSSProperties = {
  height: 34,
  padding: "0 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
};

/**
 * Barra de trabajo.
 *
 * No es un formulario: no lleva panel, ni fondo, ni cabecera. Los controles
 * viven sobre la página, a la izquierda, y la acción se va al extremo derecho.
 * Lo que separa la barra de la tabla es el aire.
 */
export function WorkToolbar({
  children,
  actions,
  note,
}: {
  children: ReactNode;
  actions?: ReactNode;
  /** Línea callada de estado del filtrado; solo aparece si filtra algo. */
  note?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flex: "1 1 320px" }}>
          {children}
        </div>
        {actions && <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{actions}</div>}
      </div>
      {note && (
        <div
          style={{
            marginTop: 7,
            fontSize: 11.5,
            color: "var(--text-tertiary)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}

/**
 * Metadato de pie: cómo está configurado esto y de dónde salen los números.
 *
 * Último en la jerarquía y último en la página. Antes abría la pantalla en
 * gris justo debajo de las cifras, compitiendo con ellas por el primer
 * vistazo.
 */
export function FootNote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 10,
        fontSize: 11.5,
        color: "var(--text-tertiary)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 7,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

/** Separador de metadatos. Un punto medio, no un borde. */
export function Dot() {
  return <span aria-hidden="true">·</span>;
}

/**
 * Acción del tamaño del texto que la rodea.
 *
 * `Button` mide 32px de alto aun en `sm`: dentro de una línea de metadatos de
 * 11.5px abre un hueco y rompe el renglón. Esto es la misma acción con el
 * cuerpo de su frase.
 */
export function InlineAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        margin: 0,
        font: "inherit",
        color: "var(--primary)",
        cursor: "pointer",
        textDecoration: "underline",
        textUnderlineOffset: 2,
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Referencias copiables
 * ------------------------------------------------------------------ */

/**
 * Folio y UUID copiables sin romper la fila.
 *
 * El UUID mide 36 caracteres: pintarlo entero ensancha la tabla y obliga a
 * scroll horizontal. Se muestra el arranque —que es lo que se reconoce de un
 * vistazo— y el botón copia el valor íntegro, que es lo que se pega en el
 * portal del SAT.
 */
export function CopyableRef({
  value,
  display,
  label,
}: {
  value: string;
  display?: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
      <code style={{ fontSize: 11.5, letterSpacing: "0.01em" }}>{display ?? value}</code>
      <button
        type="button"
        onClick={copy}
        title={copied ? "Copiado" : `Copiar ${label}`}
        aria-label={copied ? "Copiado" : `Copiar ${label}`}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: 0,
          fontSize: 11,
          lineHeight: 1,
          color: copied ? "var(--state-success-text, #15803d)" : "var(--text-tertiary)",
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Iconos
 * ------------------------------------------------------------------ */

/** Un CFDI: hoja con renglones y el sello doblado de la esquina. */
export function CfdiIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h7.5L19 8.5V21H6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M13.5 3v5.5H19" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 13h7M9 16.5h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Embudo: lo que hay está escondido detrás de un filtro. */
export function FilterIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5h16l-6.2 7.3V20l-3.6-2.2v-5L4 5.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Algo falló. */
export function AlertIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** Esperando datos. */
export function LoadingIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 5.5H6A1.5 1.5 0 0 0 4.5 7v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.6-5.9"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path d="M20 4v4.5h-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v10.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M7.5 10.5L12 15l4.5-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
