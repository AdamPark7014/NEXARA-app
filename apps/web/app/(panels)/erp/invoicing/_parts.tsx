"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { Alert, Button, ButtonLink, type AlertTone, type Tone } from "@/components/base";
import s from "./invoicing.module.css";

/**
 * NEXARA · Piezas de Facturación CFDI.
 *
 * Lista y ficha comparten lo que no es de la base: el estado fiscal, la pila de
 * avisos, el pie de configuración y la referencia copiable. Cifras, tarjetas,
 * barra de filtros y botones son los de `components/base`.
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
 * timbrado. Por eso la insignia lleva el estado fiscal —lo que la contadora
 * busca primero— y lo comercial baja a la línea gris de abajo.
 *
 * Vivía duplicado en la lista y en el detalle; el detalle además miraba
 * `isCancelled`. Una sola función para las dos pantallas evita que se
 * separen con el tiempo.
 */
export function fiscalState(inv: FiscalInput): { label: string; tone: Tone; title: string } {
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

const LEVEL_TONE: Record<NoticeLevel, AlertTone> = {
  critical: "danger",
  warning: "warning",
  info: "info",
};

/**
 * Pila de avisos.
 *
 * Cada aviso ocupa un renglón compacto —icono, frase, botón— y se ordenan
 * solos: primero lo que bloquea, luego lo que avisa. Los avisos no
 * desaparecen; dejan de gritar.
 */
export function NoticeStack({
  notices,
  ariaLabel = "Avisos de facturación",
  className,
}: {
  notices: Notice[];
  ariaLabel?: string;
  className?: string;
}) {
  if (notices.length === 0) return null;

  const sorted = [...notices].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);

  return (
    <div role="group" aria-label={ariaLabel} className={[s.avisos, className].filter(Boolean).join(" ")}>
      {sorted.map((n) => (
        <NoticeRow key={n.id} notice={n} />
      ))}
    </div>
  );
}

function NoticeRow({ notice }: { notice: Notice }) {
  const { action, secondaryAction } = notice;
  return (
    <Alert
      dense
      tone={LEVEL_TONE[notice.level]}
      role={notice.level === "critical" ? "alert" : "status"}
      onDismiss={notice.onDismiss}
      dismissLabel="Descartar aviso"
      action={
        action || secondaryAction ? (
          <span className={s.avisoAcciones}>
            {secondaryAction ? (
              <Button size="sm" variant="ghost" onClick={secondaryAction.onClick} disabled={secondaryAction.busy}>
                {secondaryAction.label}
              </Button>
            ) : null}
            {action ? (
              action.href ? (
                <ButtonLink size="sm" href={action.href}>
                  {action.label}
                </ButtonLink>
              ) : (
                <Button size="sm" onClick={action.onClick} disabled={action.busy}>
                  {action.label}
                </Button>
              )
            ) : null}
          </span>
        ) : undefined
      }
    >
      {notice.text}
    </Alert>
  );
}

/* ------------------------------------------------------------------ *
 * Pie de configuración
 * ------------------------------------------------------------------ */

/**
 * Metadato de pie: cómo está configurado esto y de dónde salen los números.
 *
 * Último en la jerarquía y último en la página: no compite con las cifras.
 */
export function FootNote({ children }: { children: ReactNode }) {
  return <p className={s.pie}>{children}</p>;
}

/** Separador de metadatos. Un punto medio, no un borde. */
export function Dot() {
  return <span aria-hidden="true">·</span>;
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

  const copy = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <span className={s.ref}>
      <code className={s.refCodigo}>{display ?? value}</code>
      <button
        type="button"
        onClick={copy}
        title={copied ? "Copiado" : `Copiar ${label}`}
        aria-label={copied ? "Copiado" : `Copiar ${label}`}
        className={[s.refBoton, copied ? s.refBotonListo : ""].filter(Boolean).join(" ")}
      >
        {copied ? <CheckRoundedIcon fontSize="inherit" /> : <ContentCopyOutlinedIcon fontSize="inherit" />}
      </button>
    </span>
  );
}
