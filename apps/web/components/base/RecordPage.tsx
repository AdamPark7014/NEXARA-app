"use client";

import Link from "next/link";
import { isValidElement, type CSSProperties, type ReactNode } from "react";
import type { PageHeadCrumb } from "./PageHead";
import { Badge, StatusBadge, type KindId, type Tone } from "./piezas";
import { Avatar, type Presence } from "./estados";
import s from "./RecordPage.module.css";
import b from "./base.module.css";

/**
 * NEXARA · RecordPage — plantilla de ficha de registro (sistema visual v2).
 *
 * Cabecera de estado (icono del tipo, folio, `StatusBadge`, insignias, título,
 * persona y metadatos, acciones ordenadas) con pasos horizontales
 * hecho / actual / pendiente → disposición en dos columnas: a la izquierda la
 * tarjeta principal con pestañas y el contenido (secciones, galería de
 * evidencias, línea de tiempo); a la derecha el panel de datos clave y acciones.
 * En teléfono (< 768 px) el panel baja debajo del contenido.
 *
 * Uso mínimo:
 *
 *   <RecordPage
 *     breadcrumbs={[{ label: "Hoy", href: "/erp" }, { label: "Actividades", href: "/erp/actividades" }, { label: "AN-0031" }]}
 *     kind="cctv" icon={<CctvIcon />}
 *     code="AN-0031"
 *     status="EN_PROCESO"
 *     badges={<><Badge tone="success" dot>En tiempo</Badge><Badge tone="outline">Prioridad normal</Badge></>}
 *     title="Mantenimiento preventivo de DVR y 12 cámaras"
 *     person={{ name: "José Antonio Ramírez", avatarUrl, role: "Técnico CCTV", presence: "online" }}
 *     meta={[{ icon: <PinIcon />, label: "Sucursal Centro" }, { icon: <ClockIcon />, label: "Hoy, 10:00 a 13:00" }]}
 *     tertiaryActions={<Button variant="ghost" icon aria-label="Más">···</Button>}
 *     secondaryActions={<Button>Reasignar</Button>}
 *     primaryAction={<Button variant="primary">Revisar evidencias</Button>}
 *     steps={[
 *       { id: "asignada", label: "Asignada", hint: "Ayer 18:20", state: "done" },
 *       { id: "sitio", label: "En sitio", hint: "Desde 10:06", state: "current" },
 *       { id: "revision", label: "En revisión", hint: "Tú apruebas", state: "pending" },
 *     ]}
 *     tabs={<Tabs items={[{ id: "ev", label: "Evidencias", count: 4 }]} value={tab} onChange={setTab} ariaLabel="Secciones" />}
 *     facts={[{ label: "Contacto", value: "Lic. Mariana Soto", hint: "222 318 4410" }, { label: "Proyecto", value: "Póliza anual 2026" }]}
 *     asideActions={<Button fullWidth>Escribir a José</Button>}
 *     aside={<AsideCard title="Materiales usados">…</AsideCard>}
 *   >
 *     <RecordSection title="Evidencias" subtitle="4 de 6 pasos" end={<Progress value={4} max={6} />}>
 *       <EvidenceGallery>
 *         <EvidencePhoto src={url} caption="DVR antes · 10:12" flag={<Badge tone="success" size="sm">Validada</Badge>} onClick={abrir} />
 *         <EvidenceSlot label="Firma del cliente" required={false} />
 *       </EvidenceGallery>
 *     </RecordSection>
 *     <RecordSection caption="Línea de tiempo">
 *       <Timeline>
 *         <TimelineItem state="current" icon={<CameraIcon />} title={<><b>José Antonio</b> subió 2 fotos</>} meta="Hace 35 min" />
 *       </Timeline>
 *     </RecordSection>
 *   </RecordPage>
 */

export type RecordStepState = "done" | "current" | "pending";
export type RecordStep = { id: string; label: ReactNode; hint?: ReactNode; state: RecordStepState };
export type RecordFact = { label: ReactNode; value: ReactNode; hint?: ReactNode };
export type RecordMetaItem = { icon?: ReactNode; label: ReactNode; href?: string };
export type RecordPerson = { name: string; avatarUrl?: string | null; role?: ReactNode; presence?: Presence; href?: string };

export type RecordPageProps = {
  breadcrumbs?: PageHeadCrumb[] | ReactNode;
  /** Icono del tipo de registro en la pastilla grande; `kind` le da el color de categoría. */
  icon?: ReactNode;
  kind?: KindId;
  /** Folio o clave («AN-0031»). */
  code?: ReactNode;
  /** Estado del backend o etiqueta legible: lo pinta `StatusBadge` con el mapa único. */
  status?: string | null;
  statusLabel?: ReactNode;
  statusTone?: Tone;
  /** Más insignias junto al estado («En tiempo», «Prioridad normal»). */
  badges?: ReactNode;
  title: ReactNode;
  /** Persona responsable: avatar, nombre y rol, en la línea de metadatos. */
  person?: RecordPerson;
  /** Datos cortos con icono bajo el título, o un nodo propio. */
  meta?: RecordMetaItem[] | ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  tertiaryActions?: ReactNode;
  /** Pasos del flujo (hecho / actual / pendiente). */
  steps?: ReadonlyArray<RecordStep>;
  /** Sustituye por completo la cabecera generada. */
  head?: ReactNode;
  /** `<Tabs/>` arriba del contenido principal. */
  tabs?: ReactNode;
  /** Contenido principal: `<RecordSection/>`, galería, línea de tiempo. */
  children: ReactNode;
  /** Datos clave del panel derecho (lista etiqueta / valor). */
  facts?: ReadonlyArray<RecordFact>;
  factsTitle?: ReactNode;
  factsActions?: ReactNode;
  /** Acciones del panel derecho, en columna bajo los datos clave. */
  asideActions?: ReactNode;
  /** Más tarjetas del panel derecho (`<AsideCard/>`). */
  aside?: ReactNode;
  /** Nombre del panel derecho para el lector de pantalla. */
  asideLabel?: string;
  className?: string;
  style?: CSSProperties;
};

function Crumbs({ breadcrumbs }: { breadcrumbs: PageHeadCrumb[] | ReactNode }) {
  if (Array.isArray(breadcrumbs) && !isValidElement(breadcrumbs)) {
    const crumbs = breadcrumbs as PageHeadCrumb[];
    return (
      <nav aria-label="Ruta de la página" className={[b.headCrumbs, s.crumbs].join(" ")}>
        <ol>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i}>
                {c.href && !last ? <Link href={c.href}>{c.label}</Link> : <span aria-current={last ? "page" : undefined}>{c.label}</span>}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }
  return <div className={[b.headCrumbs, s.crumbs].join(" ")}>{breadcrumbs as ReactNode}</div>;
}

export function RecordPage({
  breadcrumbs,
  icon,
  kind,
  code,
  status,
  statusLabel,
  statusTone,
  badges,
  title,
  person,
  meta,
  primaryAction,
  secondaryActions,
  tertiaryActions,
  steps,
  head,
  tabs,
  children,
  facts,
  factsTitle,
  factsActions,
  asideActions,
  aside,
  asideLabel = "Datos clave",
  className,
  style,
}: RecordPageProps) {
  const hayAcciones = Boolean(tertiaryActions || secondaryActions || primaryAction);
  const restoDeAcciones = Boolean(secondaryActions || primaryAction);
  const hayAside = Boolean((facts && facts.length) || asideActions || aside);
  const metaLista = Array.isArray(meta) && !isValidElement(meta) ? (meta as RecordMetaItem[]) : null;

  const cabecera =
    head !== undefined ? (
      head
    ) : (
      <header className={s.hero}>
        <div className={s.heroTop}>
          {icon ? (
            <span className={s.heroIco} data-kind={kind} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className={s.heroText}>
            {code != null || status != null || statusLabel != null || badges ? (
              <div className={s.heroMeta}>
                {code != null ? <span className={s.code}>{code}</span> : null}
                {status != null || statusLabel != null ? <StatusBadge status={status} label={statusLabel} tone={statusTone} /> : null}
                {badges}
              </div>
            ) : null}
            <h1 className={s.heroTitle}>{title}</h1>
            {person || metaLista || (meta && !metaLista) ? (
              <div className={s.heroSub}>
                {person ? (
                  <span className={s.heroPerson}>
                    <Avatar name={person.name} avatarUrl={person.avatarUrl} size={22} presence={person.presence} />
                    {person.href ? (
                      <Link href={person.href} className={s.heroPersonName}>
                        {person.name}
                      </Link>
                    ) : (
                      <span className={s.heroPersonName}>{person.name}</span>
                    )}
                    {person.role ? <span className={s.heroPersonRole}>· {person.role}</span> : null}
                  </span>
                ) : null}
                {metaLista
                  ? metaLista.map((m, i) =>
                      m.href ? (
                        <Link key={i} href={m.href}>
                          {m.icon}
                          {m.label}
                        </Link>
                      ) : (
                        <span key={i}>
                          {m.icon}
                          {m.label}
                        </span>
                      ),
                    )
                  : (meta as ReactNode)}
              </div>
            ) : null}
          </div>
          {hayAcciones ? (
            <div className={s.heroActions}>
              {tertiaryActions}
              {tertiaryActions && restoDeAcciones ? <span className={s.heroDivider} aria-hidden="true" /> : null}
              {secondaryActions}
              {primaryAction}
            </div>
          ) : null}
        </div>
        {steps && steps.length ? <Stepper steps={steps} /> : null}
      </header>
    );

  return (
    <div className={[s.page, className].filter(Boolean).join(" ")} style={style}>
      {breadcrumbs ? <Crumbs breadcrumbs={breadcrumbs} /> : null}
      {cabecera}
      <div className={s.layout} data-aside={hayAside ? undefined : "false"}>
        <section className={s.main}>
          {tabs ? <div className={s.mainTabs}>{tabs}</div> : null}
          <div className={s.mainBody}>{children}</div>
        </section>
        {hayAside ? (
          <aside className={s.aside} aria-label={asideLabel}>
            {(facts && facts.length) || asideActions ? (
              <AsideCard title={factsTitle} actions={factsActions}>
                {facts && facts.length ? <KeyFacts items={facts} /> : null}
                {asideActions ? <div className={s.asideActions}>{asideActions}</div> : null}
              </AsideCard>
            ) : null}
            {aside}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Piezas de la ficha ───────────────────────────────────────────────── */

/** Pasos horizontales del flujo: hecho (verde) · actual (marca, `aria-current="step"`) · pendiente. */
export function Stepper({ steps, ariaLabel = "Pasos" }: { steps: ReadonlyArray<RecordStep>; ariaLabel?: string }) {
  return (
    <ol className={s.stepper} aria-label={ariaLabel} style={{ "--steps": steps.length } as CSSProperties}>
      {steps.map((st, i) => (
        <li key={st.id} className={s.step} data-state={st.state} aria-current={st.state === "current" ? "step" : undefined}>
          <span className={s.stepDot} aria-hidden="true">
            {st.state === "done" ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" focusable="false">
                <path d="M3.5 8.4l3 3 6-6.6" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              i + 1
            )}
          </span>
          <span className={s.stepText}>
            <span className={s.stepT}>{st.label}</span>
            {st.hint != null ? <span className={s.stepM}>{st.hint}</span> : <span className={s.stepM}>—</span>}
          </span>
          <span className="ui-sr-only">{st.state === "done" ? ", hecho" : st.state === "current" ? ", en curso" : ", pendiente"}</span>
        </li>
      ))}
    </ol>
  );
}

/** Lista etiqueta / valor del panel derecho. */
export function KeyFacts({ items, className }: { items: ReadonlyArray<RecordFact>; className?: string }) {
  return (
    <dl className={[s.facts, className].filter(Boolean).join(" ")}>
      {items.map((f, i) => (
        <div key={i} className={s.fact}>
          <dt>{f.label}</dt>
          <dd>
            {f.value}
            {f.hint != null ? <span className={s.factHint}>{f.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Tarjeta del panel derecho con título y acción chica («+ Agregar»). */
export function AsideCard({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={[s.asideCard, className].filter(Boolean).join(" ")}>
      {title || actions ? (
        <header className={s.asideHead}>
          {title ? <h2 className={s.asideTitle}>{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Bloque del contenido principal: título (o `caption` en versalitas, como «Línea de
 * tiempo»), subtítulo y, a la derecha, `end` (avance, acción).
 */
export function RecordSection({
  title,
  caption,
  subtitle,
  end,
  children,
  className,
}: {
  title?: ReactNode;
  caption?: ReactNode;
  subtitle?: ReactNode;
  end?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={[s.section, className].filter(Boolean).join(" ")}>
      {title || caption || subtitle || end ? (
        <header className={s.sectionHead}>
          <div className={s.sectionText}>
            {caption ? <h2 className={s.sectionCaption}>{caption}</h2> : null}
            {title ? <h2 className={s.sectionTitle}>{title}</h2> : null}
            {subtitle ? <p className={s.sectionSub}>{subtitle}</p> : null}
          </div>
          {end ? <div className={s.sectionEnd}>{end}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Rejilla de miniaturas (3 columnas; 2 en teléfono). */
export function EvidenceGallery({ children, cols, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div className={[s.gallery, className].filter(Boolean).join(" ")} style={cols ? ({ "--gallery-cols": cols } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}

/** Foto con pie («DVR antes · 10:12 · GPS ✓») e insignia arriba («Validada»). */
export function EvidencePhoto({
  src,
  alt = "",
  caption,
  flag,
  href,
  onClick,
  className,
}: {
  src: string;
  alt?: string;
  caption?: ReactNode;
  flag?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const cuerpo = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={s.photoImg} loading="lazy" />
      {flag ? <span className={s.photoFlag}>{flag}</span> : null}
      {caption ? (
        <span className={s.photoCap}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
            <path d="M2.5 5.5h2.2l1.1-1.6h4.4l1.1 1.6h2.2v7h-11z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <circle cx="8" cy="8.8" r="2.1" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          {caption}
        </span>
      ) : null}
    </>
  );
  const clases = [s.photo, className].filter(Boolean).join(" ");
  if (onClick) {
    return (
      <button type="button" className={clases} onClick={onClick} aria-label={typeof caption === "string" ? caption : alt || "Ver evidencia"}>
        {cuerpo}
      </button>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={clases}>
        {cuerpo}
      </a>
    );
  }
  return <figure className={clases}>{cuerpo}</figure>;
}

/** Hueco de evidencia que falta: icono, nombre del paso y si es obligatorio. */
export function EvidenceSlot({
  icon,
  label,
  required = false,
  badge,
  onClick,
  className,
}: {
  icon?: ReactNode;
  label: ReactNode;
  required?: boolean;
  /** Sustituye la insignia «Obligatorio» / «Opcional». */
  badge?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const cuerpo = (
    <>
      {icon ?? (
        <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <path d="M2.5 5.5h2.2l1.1-1.6h4.4l1.1 1.6h2.2v7h-11z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="8" cy="8.8" r="2.1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )}
      <span>{label}</span>
      {badge !== undefined ? (
        badge
      ) : required ? (
        <Badge tone="danger" size="sm">
          Obligatorio
        </Badge>
      ) : (
        <Badge tone="outline" size="sm">
          Opcional
        </Badge>
      )}
    </>
  );
  const clases = [s.slot, className].filter(Boolean).join(" ");
  if (onClick) {
    return (
      <button type="button" className={clases} onClick={onClick}>
        {cuerpo}
      </button>
    );
  }
  return <div className={clases}>{cuerpo}</div>;
}

/** Lista vertical de sucesos, del más reciente al más viejo. */
export function Timeline({ children, ariaLabel = "Línea de tiempo", className }: { children: ReactNode; ariaLabel?: string; className?: string }) {
  return (
    <ol className={[s.timeline, className].filter(Boolean).join(" ")} aria-label={ariaLabel}>
      {children}
    </ol>
  );
}

export type TimelineState = "default" | "done" | "current" | "danger";

/** Suceso: icono en círculo (`state` lo colorea), título, hora/meta y nota opcional. */
export function TimelineItem({
  icon,
  state = "default",
  title,
  meta,
  note,
  children,
  className,
}: {
  icon?: ReactNode;
  state?: TimelineState;
  title: ReactNode;
  meta?: ReactNode;
  /** Comentario o detalle en caja gris bajo el suceso. */
  note?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <li className={[s.tlItem, className].filter(Boolean).join(" ")}>
      <span className={s.tlDot} data-state={state === "default" ? undefined : state} aria-hidden="true">
        {icon ?? (
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
            <circle cx="4" cy="4" r="3" fill="currentColor" />
          </svg>
        )}
      </span>
      <div className={s.tlBody}>
        <div className={s.tlT}>{title}</div>
        {meta ? <div className={s.tlM}>{meta}</div> : null}
        {note ? <div className={s.tlNote}>{note}</div> : null}
        {children}
      </div>
    </li>
  );
}
