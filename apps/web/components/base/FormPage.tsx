"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { PageHead, type PageHeadCrumb } from "./PageHead";
import { Button, ButtonLink } from "./Button";
import { Badge } from "./piezas";
import { Alert } from "./estados";
import { FormFooter } from "./campos";
import s from "./FormPage.module.css";

/**
 * NEXARA · FormPage — plantilla de alta/edición (sistema visual v2).
 *
 * Encabezado (migas, «‹ Volver», título, descripción con la nota de obligatorios) →
 * secciones numeradas en tarjetas (`<FormSection step={1}>` con `<Field required>`:
 * el `*` lo pinta `Field`, la ayuda va bajo el campo y el error la reemplaza) →
 * columna derecha con la lista de pendientes (clicable: enfoca el campo que falta)
 * → pie fijo con Cancelar / Guardar y estado `loading`.
 *
 * Uso mínimo:
 *
 *   <FormPage
 *     title="Nueva actividad"
 *     description={<>Los campos con <RequiredMark /> son obligatorios. El folio se asigna al guardar.</>}
 *     back={{ href: "/erp/actividades", label: "Volver a Actividades" }}
 *     meta={<Badge tone="outline">Folio al guardar: AN-0036</Badge>}
 *     pendingTitle="Antes de crear"
 *     pending={[
 *       { id: "titulo", label: "Tipo y título", done: true, fieldId: "f-titulo" },
 *       { id: "hora", label: "Hora de inicio válida", error: true, fieldId: "f-hora" },
 *     ]}
 *     status="Borrador guardado hace 5 s"
 *     onSubmit={guardar}
 *     onCancel={() => router.back()}
 *     submitLabel="Crear actividad"
 *     submitKbd="Ctrl ↵"
 *     loading={guardando}
 *     dangerAction={<Button variant="danger-ghost" onClick={descartar}>Descartar</Button>}
 *     secondaryAction={<Button onClick={guardarYOtra}>Guardar y crear otra</Button>}
 *   >
 *     <FormSection step={1} title="¿Qué se va a hacer?" description="El tipo define qué evidencia se pide." columns={2}>
 *       <Field label="Título" required hint="Lo que verá el técnico en su lista." error={errores.titulo} fullWidth>
 *         <Input id="f-titulo" value={titulo} onChange={…} />
 *       </Field>
 *     </FormSection>
 *   </FormPage>
 *
 * El `fieldId` de cada pendiente es el `id` del control: al pulsar el renglón se
 * desplaza hasta él y lo enfoca (`focusField`).
 */

export type PendingItem = {
  id: string;
  label: ReactNode;
  /** Texto chico bajo la etiqueta («falta la hora»). */
  hint?: ReactNode;
  done?: boolean;
  /** Pendiente con error de validación (se pinta en rojo). */
  error?: boolean;
  /** `id` del control a enfocar al pulsar el renglón. */
  fieldId?: string;
  onSelect?: () => void;
};

/** Desplaza hasta el control con ese `id` y lo enfoca. Devuelve `false` si no existe. */
export function focusField(id: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(id);
  if (!el) return false;
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
  if (typeof (el as HTMLElement).focus === "function") (el as HTMLElement).focus({ preventScroll: true });
  return true;
}

function Tick({ state }: { state: "done" | "todo" | "error" }) {
  return (
    <span className={s.tick} data-state={state} aria-hidden="true">
      {state === "done" ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" focusable="false">
          <path d="M3.5 8.4l3 3 6-6.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : state === "error" ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" focusable="false">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      ) : null}
    </span>
  );
}

/**
 * Lista de pendientes del formulario: cada renglón dice si está hecho, falta o
 * tiene error, y al pulsarlo enfoca el campo (`fieldId`) o llama a `onSelect`.
 */
export function PendingList({
  items,
  title = "Antes de guardar",
  onSelect,
  allDoneLabel = "Todo listo",
  className,
}: {
  items: ReadonlyArray<PendingItem>;
  title?: ReactNode;
  onSelect?: (item: PendingItem) => void;
  allDoneLabel?: ReactNode;
  className?: string;
}) {
  const faltan = items.filter((i) => !i.done).length;
  return (
    <section className={[s.pending, className].filter(Boolean).join(" ")} aria-label={typeof title === "string" ? title : "Pendientes"}>
      <header className={s.pendingHead}>
        <h2 className={s.pendingTitle}>{title}</h2>
        {faltan > 0 ? (
          <Badge tone="warning" size="sm">
            {faltan} {faltan === 1 ? "pendiente" : "pendientes"}
          </Badge>
        ) : (
          <Badge tone="success" size="sm">
            {allDoneLabel}
          </Badge>
        )}
      </header>
      <ol className={s.pendingList}>
        {items.map((item) => {
          const state = item.done ? "done" : item.error ? "error" : "todo";
          const clicable = Boolean(item.fieldId || item.onSelect || onSelect);
          return (
            <li key={item.id}>
              <button
                type="button"
                className={s.pendingItem}
                data-state={state}
                disabled={!clicable}
                onClick={() => {
                  item.onSelect?.();
                  onSelect?.(item);
                  if (item.fieldId) focusField(item.fieldId);
                }}
              >
                <Tick state={state} />
                <span className={s.pendingLabel}>
                  {item.label}
                  {item.hint ? <span className={s.pendingHint}>{item.hint}</span> : null}
                </span>
                <span className="ui-sr-only">{state === "done" ? ", hecho" : state === "error" ? ", con error" : ", pendiente"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Asterisco rojo para la nota «Los campos con * son obligatorios». */
export function RequiredMark() {
  return (
    <b className={s.req} aria-label="asterisco">
      *
    </b>
  );
}

/** «Borrador guardado hace 5 s» con su palomita, para `status` del pie. */
export function SavedStatus({ children }: { children: ReactNode }) {
  return (
    <span className={s.saved}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5.2 8.2l2 2 3.6-4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </span>
  );
}

export type FormPageProps = {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: PageHeadCrumb[] | ReactNode;
  back?: { href: string; label: ReactNode };
  /** Insignias o datos cortos bajo la descripción («Folio al guardar: AN-0036»). */
  meta?: ReactNode;
  icon?: ReactNode;
  /** Sustituye el encabezado generado. */
  head?: ReactNode;
  /** Aviso de error general sobre las secciones («No se pudo guardar»). */
  error?: ReactNode;
  /** Lista de pendientes de la columna derecha. */
  pending?: ReadonlyArray<PendingItem>;
  pendingTitle?: ReactNode;
  onPendingSelect?: (item: PendingItem) => void;
  /** Más tarjetas o avisos bajo la lista de pendientes. */
  aside?: ReactNode;
  /** Secciones del formulario (`<FormSection/>`). */
  children: ReactNode;
  /** Sustituye el pie generado (un `<FormFooter/>` propio). */
  footer?: ReactNode;
  /** Si se da, la plantilla es un `<form>` y el botón principal envía. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  /** Enlace de cancelar (en lugar de `onCancel`). */
  cancelHref?: string;
  cancelLabel?: ReactNode;
  submitLabel?: ReactNode;
  submitKbd?: ReactNode;
  /** «Guardar y crear otra»: va entre Cancelar y el primario. */
  secondaryAction?: ReactNode;
  /** «Descartar»: va primero, separado por una raya. */
  dangerAction?: ReactNode;
  /** Guardando: el primario gira y se bloquea. */
  loading?: boolean;
  /** Bloquea el primario (p. ej. mientras hay pendientes). */
  disabled?: boolean;
  /** Estado a la izquierda del pie («Borrador guardado hace 5 s»). */
  status?: ReactNode;
  formId?: string;
  noValidate?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function FormPage({
  title,
  description,
  breadcrumbs,
  back,
  meta,
  icon,
  head,
  error,
  pending,
  pendingTitle,
  onPendingSelect,
  aside,
  children,
  footer,
  onSubmit,
  onCancel,
  cancelHref,
  cancelLabel = "Cancelar",
  submitLabel = "Guardar",
  submitKbd,
  secondaryAction,
  dangerAction,
  loading = false,
  disabled = false,
  status,
  formId,
  noValidate = true,
  className,
  style,
}: FormPageProps) {
  const esForm = Boolean(onSubmit);
  const hayAside = Boolean((pending && pending.length) || aside);

  const pie =
    footer !== undefined ? (
      footer
    ) : (
      <FormFooter start={status}>
        {dangerAction}
        {dangerAction ? <span className={s.footerDivider} aria-hidden="true" /> : null}
        {cancelHref ? (
          <ButtonLink href={cancelHref} variant="tertiary">
            {cancelLabel}
          </ButtonLink>
        ) : onCancel ? (
          <Button variant="tertiary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
        ) : null}
        {secondaryAction}
        <Button type={esForm ? "submit" : "button"} variant="primary" loading={loading} disabled={disabled} kbd={submitKbd}>
          {submitLabel}
        </Button>
      </FormFooter>
    );

  const cuerpo = (
    <>
      {head !== undefined ? head : <PageHead title={title} description={description} breadcrumbs={breadcrumbs} back={back} meta={meta} icon={icon} />}
      {error ? (
        <div className={s.error}>
          <Alert tone="danger" role="alert" srLabel="Error">
            {error}
          </Alert>
        </div>
      ) : null}
      <div className={s.wrap} data-aside={hayAside ? undefined : "false"}>
        <div className={s.main}>{children}</div>
        {hayAside ? (
          <aside className={s.aside}>
            {pending && pending.length ? <PendingList items={pending} title={pendingTitle} onSelect={onPendingSelect} /> : null}
            {aside}
          </aside>
        ) : null}
      </div>
      {pie}
    </>
  );

  const clases = [s.page, className].filter(Boolean).join(" ");
  if (esForm) {
    return (
      <form id={formId} className={clases} style={style} onSubmit={onSubmit} noValidate={noValidate} aria-busy={loading || undefined}>
        {cuerpo}
      </form>
    );
  }
  return (
    <div id={formId} className={clases} style={style} aria-busy={loading || undefined}>
      {cuerpo}
    </div>
  );
}
