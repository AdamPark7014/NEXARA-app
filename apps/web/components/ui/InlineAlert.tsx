"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * NEXARA · InlineAlert
 *
 * Cuatro niveles reales, que se distinguen por **peso**, no por tamaño de caja:
 *
 *   danger   → fondo teñido + borde de 1px. Es lo único que se lee como «para todo».
 *   warning  → fondo teñido, sin borde. El color ya separa; el borde sobraba.
 *   info     → sin caja. Icono + texto. Una nota no puede pesar como un error.
 *   success  → sin caja. Icono + texto. Una confirmación se lee y se olvida.
 *
 * Antes las cuatro eran la misma caja de 1px con el mismo alto, así que la
 * pantalla se llenaba de rectángulos y nada destacaba.
 *
 * API compatible: `message`, `variant`, `onDismiss`, `action`, `style`.
 * Añadidos opcionales: `title`, `icon`, `dense`, `className`.
 */

type Variant = "danger" | "warning" | "info" | "success";

type Tone = {
  /** Fondo. `null` = sin caja. */
  bg: string | null;
  /** Borde de 1px. `null` = sin borde. */
  border: string | null;
  text: string;
  icon: string;
  /** Lo que anuncia un lector de pantalla antes del mensaje. */
  label: string;
  /** Un error interrumpe; una nota espera su turno. */
  live: "assertive" | "polite";
};

const TONES: Record<Variant, Tone> = {
  danger: {
    bg: "var(--state-danger-bg)",
    border: "var(--state-danger-border)",
    text: "var(--state-danger-text)",
    icon: "var(--danger)",
    label: "Error",
    live: "assertive",
  },
  warning: {
    bg: "var(--state-warning-bg)",
    border: null,
    text: "var(--state-warning-text)",
    icon: "var(--warning)",
    label: "Aviso",
    live: "assertive",
  },
  info: {
    bg: null,
    border: null,
    text: "var(--text-secondary)",
    icon: "var(--primary)",
    label: "Información",
    live: "polite",
  },
  success: {
    bg: null,
    border: null,
    text: "var(--state-success-text)",
    icon: "var(--success)",
    label: "Listo",
    live: "polite",
  },
};

/**
 * Cada nivel tiene su forma. Quien no distingue rojo de ámbar sigue viendo un
 * aspa, un triángulo, una «i» o una palomita.
 */
function ToneIcon({ variant, size }: { variant: Variant; size: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none" as const,
    "aria-hidden": true,
    focusable: "false" as const,
    style: { flex: "0 0 auto", display: "block" as const },
  };
  const stroke = { stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (variant === "danger") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.4" {...stroke} />
        <path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2" {...stroke} />
      </svg>
    );
  }
  if (variant === "warning") {
    return (
      <svg {...common}>
        <path d="M8 2.4L14.4 13.4H1.6z" {...stroke} />
        <path d="M8 6.5v3.1" {...stroke} />
        <circle cx="8" cy="11.4" r="0.75" fill="currentColor" />
      </svg>
    );
  }
  if (variant === "success") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.4" {...stroke} />
        <path d="M5.2 8.2l2 2 3.6-4.1" {...stroke} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.4" {...stroke} />
      <path d="M8 7.3v3.6" {...stroke} />
      <circle cx="8" cy="5.1" r="0.8" fill="currentColor" />
    </svg>
  );
}

const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export default function InlineAlert({
  message,
  variant = "danger",
  onDismiss,
  style,
  action,
  title,
  icon,
  dense = false,
  className,
}: {
  message: string;
  variant?: Variant;
  onDismiss?: () => void;
  style?: CSSProperties;
  /**
   * La salida del error, dentro del aviso. Sin esto, «Reintentar» quedaba de
   * hermano suelto debajo de la caja roja y no se leía como la respuesta a lo
   * que acababa de fallar.
   */
  action?: ReactNode;
  /** Titular corto encima del mensaje. Solo cuando el mensaje es largo. */
  title?: ReactNode;
  /** Sustituye el icono del nivel. */
  icon?: ReactNode;
  /** Aún más plano: para avisos repetidos dentro de una lista o una fila. */
  dense?: boolean;
  className?: string;
}) {
  const tone = TONES[variant];
  const boxed = tone.bg !== null;

  // El aire sale del nivel, no de un tamaño arbitrario: con caja hace falta
  // separar el texto del borde; sin caja, el texto ya está separado.
  const padY = boxed ? (dense ? 7 : 9) : 0;
  const padX = boxed ? (dense ? 10 : 12) : 0;

  return (
    <div
      // role="alert" en los cuatro niveles: hay pantallas que lo buscan así.
      // Quien decide si interrumpe o no es aria-live.
      role="alert"
      aria-live={tone.live}
      className={["nx-alert", `nx-alert--${variant}`, className].filter(Boolean).join(" ")}
      style={{
        display: "flex",
        alignItems: title ? "flex-start" : "center",
        gap: 8,
        padding: `${padY}px ${padX}px`,
        marginBottom: boxed ? 12 : 8,
        borderRadius: boxed ? 8 : 0,
        border: tone.border ? `1px solid ${tone.border}` : undefined,
        background: tone.bg ?? undefined,
        color: tone.text,
        fontSize: 13,
        lineHeight: 1.45,
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: tone.icon,
          display: "inline-flex",
          // Alinea el icono con la primera línea, no con el bloque entero.
          marginTop: title ? 2 : 0,
        }}
      >
        {icon ?? <ToneIcon variant={variant} size={boxed ? 15 : 14} />}
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={SR_ONLY}>{tone.label}: </span>
        {title && (
          <strong
            style={{
              display: "block",
              fontWeight: 650,
              color: "var(--text-primary)",
              letterSpacing: "-0.005em",
            }}
          >
            {title}
          </strong>
        )}
        {message}
      </span>

      {action && <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center" }}>{action}</span>}

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          title="Cerrar"
          className="nx-alert__x"
          style={{
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            background: "none",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            color: "inherit",
            opacity: 0.6,
            padding: 0,
            transition: "opacity 140ms var(--nx-ease-out, ease-out), background 140ms var(--nx-ease-out, ease-out)",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}

      <style jsx>{`
        .nx-alert__x:hover {
          opacity: 1;
          background: color-mix(in srgb, currentColor 12%, transparent);
        }
        .nx-alert__x:focus-visible {
          opacity: 1;
          outline: 2px solid currentColor;
          outline-offset: 1px;
        }
        @media (prefers-reduced-motion: reduce) {
          .nx-alert__x {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
