"use client";

import {
  Children,
  cloneElement,
  forwardRef,
  Fragment,
  isValidElement,
  useId,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import s from "./campos.module.css";

/**
 * Campos del sistema (v2): 36 px, borde fuerte de 1 px, foco con anillo de marca,
 * `invalid` en rojo y `valid` en verde con palomita. `aria-invalid="true"` también
 * pinta el error, así que `Field` puede marcarlo sin que el control lo sepa.
 */

export type ControlSize = "sm" | "md" | "lg";

type EstadoCampo = {
  invalid?: boolean;
  valid?: boolean;
  /** sm 32 (tablas) · md 36 · lg 44 (táctil). */
  controlSize?: ControlSize;
};

const TAMANO: Record<ControlSize, string> = { sm: s.sm, md: "", lg: s.lg };

function Palomita() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.2 8.2l2 2 3.6-4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function clases(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> &
  EstadoCampo & {
    /** Icono a la izquierda (lupa, moneda, calendario). */
    iconStart?: ReactNode;
    /** Contenido a la derecha (unidad, atajo, botón chico). */
    end?: ReactNode;
    /** Clase del contenedor cuando hay icono o contenido a los lados. */
    wrapperClassName?: string;
  };

/** Campo de texto. Con `iconStart`/`end`/`valid` se envuelve para dibujar los adornos dentro. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, valid, controlSize = "md", iconStart, end, wrapperClassName, className, ...rest },
  ref,
) {
  const ariaInvalid = rest["aria-invalid"] ?? (invalid ? true : undefined);
  const fin = end ?? (valid && !invalid ? <span className={s.okIco}><Palomita /></span> : null);
  if (!iconStart && !fin) {
    return (
      <input
        ref={ref}
        {...rest}
        aria-invalid={ariaInvalid}
        data-valid={valid && !invalid ? "true" : undefined}
        className={clases(s.ctl, TAMANO[controlSize], className)}
      />
    );
  }
  return (
    <span
      className={clases(s.wrap, TAMANO[controlSize], wrapperClassName)}
      data-invalid={ariaInvalid === true || ariaInvalid === "true" ? "true" : undefined}
      data-valid={valid && !invalid ? "true" : undefined}
      data-disabled={rest.disabled ? "true" : undefined}
    >
      {iconStart ? (
        <span className={s.adorno} aria-hidden="true">
          {iconStart}
        </span>
      ) : null}
      <input ref={ref} {...rest} aria-invalid={ariaInvalid} className={clases(s.bare, className)} />
      {fin ? <span className={s.adornoFin}>{fin}</span> : null}
    </span>
  );
});

/** Fecha (o `type="time"`/`"datetime-local"`), con la misma caja que `Input`. */
export const DateInput = forwardRef<HTMLInputElement, InputProps>(function DateInput({ type = "date", ...rest }, ref) {
  return <Input ref={ref} type={type} {...rest} />;
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> &
  EstadoCampo & {
    iconStart?: ReactNode;
    wrapperClassName?: string;
  };

/** Lista nativa con chevron propio (se conserva el teclado y el lector de pantalla del navegador). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, valid, controlSize = "md", iconStart, wrapperClassName, className, children, ...rest },
  ref,
) {
  const ariaInvalid = rest["aria-invalid"] ?? (invalid ? true : undefined);
  return (
    <span
      className={clases(s.selectWrap, TAMANO[controlSize], iconStart ? s.conIcono : "", wrapperClassName)}
      data-disabled={rest.disabled ? "true" : undefined}
    >
      {iconStart ? (
        <span className={s.selectIco} aria-hidden="true">
          {iconStart}
        </span>
      ) : null}
      <select
        ref={ref}
        {...rest}
        aria-invalid={ariaInvalid}
        data-valid={valid && !invalid ? "true" : undefined}
        className={clases(s.ctl, s.select, TAMANO[controlSize], className)}
      >
        {children}
      </select>
      <svg className={s.chev} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <path d="M4.5 6.5 8 10l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & Omit<EstadoCampo, "controlSize">;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, valid, className, ...rest }, ref) {
  const ariaInvalid = rest["aria-invalid"] ?? (invalid ? true : undefined);
  return (
    <textarea
      ref={ref}
      {...rest}
      aria-invalid={ariaInvalid}
      data-valid={valid && !invalid ? "true" : undefined}
      className={clases(s.ctl, s.area, className)}
    />
  );
});

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Texto a la derecha del control; si se da, todo el renglón es clicable. */
  label?: ReactNode;
  /** Explicación corta bajo el texto. */
  description?: ReactNode;
};

function toggle({ label, description, className, style, inputClass, role, ...rest }: ToggleProps & { inputClass: string }, ref: Ref<HTMLInputElement>) {
  const input = <input ref={ref} type="checkbox" role={role} {...rest} className={clases(inputClass, label ? undefined : className)} style={label ? undefined : style} />;
  if (!label) return input;
  return (
    <label className={clases(s.toggleRow, className)} style={style} data-disabled={rest.disabled ? "true" : undefined}>
      {input}
      <span className={s.toggleText}>
        <span className={s.toggleLabel}>{label}</span>
        {description ? <span className={s.toggleDesc}>{description}</span> : null}
      </span>
    </label>
  );
}

/** Interruptor encendido/apagado: un checkbox nativo con `role="switch"`. */
export const Switch = forwardRef<HTMLInputElement, ToggleProps>(function Switch(props, ref) {
  return toggle({ ...props, inputClass: s.switch, role: "switch" }, ref);
});

/** Casilla de 18 px con palomita de marca. */
export const Checkbox = forwardRef<HTMLInputElement, ToggleProps>(function Checkbox(props, ref) {
  return toggle({ ...props, inputClass: s.check }, ref);
});

type ControlAria = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
};

/**
 * Etiqueta + control + pista o error. El error reemplaza la pista; `*` marca lo
 * obligatorio. Si el hijo es un solo control, recibe `aria-describedby`,
 * `aria-invalid` y `aria-required` para que el lector de pantalla lea el porqué.
 */
export function Field({
  label,
  children,
  fullWidth,
  hint,
  optional,
  error,
  describedById,
  required,
  valid,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  fullWidth?: boolean;
  hint?: ReactNode;
  optional?: boolean;
  error?: string | null;
  describedById?: string;
  required?: boolean;
  /** Mensaje de validación correcta bajo el control («RFC válido»). */
  valid?: ReactNode;
  className?: string;
}) {
  const autoId = useId();
  const errorId = describedById ?? `campo-error-${autoId}`;
  const hintId = `campo-pista-${autoId}`;
  const messageId = error ? errorId : hint || valid ? hintId : undefined;

  let control: ReactNode = children;
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  if (isValidElement(only) && only.type !== Fragment && (messageId || required)) {
    const el = only as ReactElement<ControlAria>;
    const own = el.props;
    const describedBy = [own["aria-describedby"], messageId].filter(Boolean).join(" ") || undefined;
    control = cloneElement(el, {
      "aria-describedby": describedBy,
      ...(error && own["aria-invalid"] == null ? { "aria-invalid": true } : null),
      ...(required && own["aria-required"] == null ? { "aria-required": true } : null),
    });
  }

  return (
    <label className={clases(s.field, fullWidth ? s.fieldFull : "", className)} data-invalid={error ? "true" : undefined}>
      <span className={s.fieldLabel}>
        {label}
        {required ? (
          <span className={s.fieldRequired} aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
        {optional ? <span className={s.fieldOptional}> · opcional</span> : null}
      </span>
      {control}
      {error ? (
        <span id={errorId} role="alert" className={s.fieldError}>
          {error}
        </span>
      ) : valid ? (
        <span id={hintId} className={s.fieldValid}>
          {valid}
        </span>
      ) : hint ? (
        <span id={hintId} className={s.fieldHint}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/** Rejilla de campos: 2 columnas por defecto, 1 en teléfono. */
export function FieldGrid({ children, columns, className }: { children: ReactNode; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <div className={clases(s.grid, className)} data-columns={columns && columns !== 2 ? columns : undefined}>
      {children}
    </div>
  );
}

/**
 * Sección de formulario en tarjeta numerada: número (o palomita si `done`), título,
 * explicación corta y, a la derecha, una acción («+ Agregar paso»).
 */
export function FormSection({
  title,
  description,
  step,
  done = false,
  actions,
  children,
  columns,
  id,
  className,
  style,
}: {
  title: ReactNode;
  description?: ReactNode;
  step?: number;
  done?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  /** Si se da, el cuerpo es una rejilla de campos de esas columnas. */
  columns?: 1 | 2 | 3;
  id?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const tituloId = useId();
  return (
    <section className={clases(s.section, className)} aria-labelledby={tituloId} id={id} style={style}>
      <header className={s.sectionHead}>
        {step != null || done ? (
          <span className={s.sectionStep} data-done={done ? "true" : undefined} aria-hidden="true">
            {done ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" focusable="false">
                <path d="M3.5 8.4l3 3 6-6.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              step
            )}
          </span>
        ) : null}
        <div className={s.sectionText}>
          <h2 id={tituloId} className={s.sectionTitle}>
            {title}
          </h2>
          {description ? <p className={s.sectionDesc}>{description}</p> : null}
        </div>
        {actions ? <div className={s.sectionActions}>{actions}</div> : null}
      </header>
      <div className={s.sectionBody}>
        {columns ? (
          <div className={s.grid} data-columns={columns !== 2 ? columns : undefined}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/**
 * Pie fijo del formulario: estado a la izquierda («Borrador guardado hace 5 s») y
 * acciones a la derecha (peligro · cancelar · secundario · primario).
 */
export function FormFooter({ start, children, className }: { start?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={clases(s.footer, className)}>
      {start ? <div className={s.footerStart}>{start}</div> : null}
      <div className={s.footerActions}>{children}</div>
    </div>
  );
}
