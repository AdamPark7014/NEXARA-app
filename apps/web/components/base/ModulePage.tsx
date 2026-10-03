"use client";

import { isValidElement, type CSSProperties, type ReactNode } from "react";
import { PageHead, type PageHeadCrumb } from "./PageHead";
import { EmptyState, SkeletonRows, type EmptyStateTone } from "./estados";
import { Segmented, TONE_COLOR, type Tone } from "./piezas";
import s from "./ModulePage.module.css";

/**
 * NEXARA · ModulePage — plantilla de página de módulo (sistema visual v2).
 *
 * Secuencia fija (la misma en todos los módulos): encabezado con migas, título,
 * descripción y acciones ordenadas (terciario → secundario → primario, **un solo
 * primario**) → pestañas con contador → franja de KPI → tarjeta de lista (barra de
 * herramientas con buscador, chips, «Filtro» y selector de vista → contenido → pie).
 *
 * Todo son slots: lo que no se pasa, no se pinta. Estados integrados: `loading`
 * (renglones esqueleto) y `empty` (vacío con acción). Dentro de la tarjeta la
 * `DataTable` pierde su marco solo (el marco es la tarjeta).
 *
 * Uso mínimo:
 *
 *   <ModulePage
 *     title="Actividades"
 *     description="Equipo del día: asigna, sigue el avance y revisa las evidencias."
 *     breadcrumbs={[{ label: "Hoy", href: "/erp" }, { label: "Actividades" }]}
 *     tertiaryActions={<Button variant="ghost" iconStart={<DownloadIcon />}>Exportar</Button>}
 *     secondaryActions={<Button iconStart={<CopyIcon />}>Desde plantilla</Button>}
 *     primaryAction={<Button variant="primary" iconStart={<AddIcon />} kbd="N">Nueva actividad</Button>}
 *     tabs={<Tabs items={[{ id: "equipo", label: "Mi equipo", count: 38 }]} value={tab} onChange={setTab} ariaLabel="Vistas" />}
 *     stats={<StatRow><Stat label="Para hoy" value={38} /> …</StatRow>}
 *     toolbar={
 *       <ModuleToolbar
 *         search={<SearchInput placeholder="Buscar folio o cliente" shortcut="/" value={q} onChange={(e) => setQ(e.target.value)} />}
 *         chips={
 *           <FilterChips ariaLabel="Estado">
 *             <FilterChip active={f === "todas"} count={38} onClick={() => setF("todas")}>Todas</FilterChip>
 *             <FilterChip active={f === "atrasadas"} count={3} dot="danger" onClick={() => setF("atrasadas")}>Atrasadas</FilterChip>
 *           </FilterChips>
 *         }
 *         filter={<FilterButton onClick={abrirFiltros} count={filtrosActivos} />}
 *         end={<ViewSwitch value={vista} onChange={setVista} />}
 *       />
 *     }
 *     loading={cargando}
 *     empty={!cargando && filas.length === 0}
 *     emptyState={{ title: "Todo al día", description: "Ninguna actividad atrasada.", action: <Button variant="primary">Nueva actividad</Button> }}
 *     footer={<ListFooter from={1} to={6} total={38} end={<Pager page={1} pages={7} onChange={setPagina} />} />}
 *   >
 *     <DataTable columns={columnas} rows={filas} rowKey={(r) => r.id} selectable … />
 *   </ModulePage>
 */

export type ModuleEmpty = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  tone?: EmptyStateTone;
};

export type ModulePageProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** Migas sobre el título: `{ label, href }` o nodo propio. */
  breadcrumbs?: PageHeadCrumb[] | ReactNode;
  /** Icono del módulo junto al título. */
  icon?: ReactNode;
  back?: { href: string; label: ReactNode };
  /** Insignias o datos cortos bajo la descripción. */
  meta?: ReactNode;
  /** La acción a la que vino la persona. Una sola; va al final. */
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  /** Texto, iconos o menú «···»; van primero. */
  tertiaryActions?: ReactNode;
  /** Sustituye por completo el encabezado generado (un `<PageHead/>` propio). */
  head?: ReactNode;
  /** `<Tabs/>` con contadores, pegadas al borde inferior del encabezado. */
  tabs?: ReactNode;
  /** Franja de KPI: `<StatRow><Stat/>…</StatRow>`. */
  stats?: ReactNode;
  /** Aviso o bloque entre los KPI y la lista (`<Alert/>`). */
  before?: ReactNode;
  /** Barra de herramientas de la tarjeta: `<ModuleToolbar/>` o nodo propio. */
  toolbar?: ReactNode;
  /** Contenido de la tarjeta: tabla, tablero o lista. */
  children?: ReactNode;
  /** Pie de la tarjeta: `<ListFooter/>` o nodo propio. */
  footer?: ReactNode;
  loading?: boolean;
  loadingRows?: number;
  /** Con `true` se pinta el vacío (`emptyState`) en lugar de los hijos. */
  empty?: boolean;
  emptyState?: ModuleEmpty | ReactNode;
  /** `false` = el contenido va sin tarjeta (tableros o mapas con marco propio). */
  card?: boolean;
  /** Nombre de la tarjeta de lista para el lector de pantalla. */
  listLabel?: string;
  className?: string;
  style?: CSSProperties;
};

const VACIO_POR_DEFECTO: ModuleEmpty = { title: "Sin registros", description: "No hay nada que mostrar con los filtros actuales.", tone: "neutral" };

export function ModulePage({
  title,
  description,
  breadcrumbs,
  icon,
  back,
  meta,
  primaryAction,
  secondaryActions,
  tertiaryActions,
  head,
  tabs,
  stats,
  before,
  toolbar,
  children,
  footer,
  loading = false,
  loadingRows = 6,
  empty = false,
  emptyState,
  card = true,
  listLabel,
  className,
  style,
}: ModulePageProps) {
  const encabezado =
    head !== undefined ? (
      head
    ) : title != null ? (
      <PageHead
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        icon={icon}
        back={back}
        meta={meta}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        tertiaryActions={tertiaryActions}
        tabs={tabs}
      />
    ) : (
      tabs ?? null
    );

  let contenido: ReactNode;
  if (loading) {
    contenido = <SkeletonRows rows={loadingRows} />;
  } else if (empty) {
    if (isValidElement(emptyState)) {
      contenido = emptyState;
    } else {
      const e = (emptyState as ModuleEmpty | undefined) ?? VACIO_POR_DEFECTO;
      contenido = (
        <EmptyState
          icon={e.icon}
          title={e.title}
          description={e.description}
          action={e.action}
          secondaryAction={e.secondaryAction}
          tone={e.tone ?? "brand"}
          titleAs="h2"
        />
      );
    }
  } else {
    contenido = children;
  }

  const hayTarjeta = Boolean(toolbar || contenido || footer);

  return (
    <div className={[s.page, className].filter(Boolean).join(" ")} style={style} data-loading={loading ? "true" : undefined}>
      {encabezado}
      {stats}
      {before ? <div className={s.before}>{before}</div> : null}
      {hayTarjeta ? (
        card ? (
          <section className={s.list} aria-label={listLabel} aria-busy={loading || undefined}>
            {toolbar}
            <div className={s.content}>{contenido}</div>
            {footer}
          </section>
        ) : (
          <div aria-busy={loading || undefined}>
            {toolbar}
            <div className={s.content}>{contenido}</div>
            {footer}
          </div>
        )
      ) : null}
    </div>
  );
}

/* ─── Barra de herramientas ─────────────────────────────────────────────── */

/**
 * Renglón de herramientas de la tarjeta de lista: buscador → chips → «Filtro» →
 * lo que venga en `children` → y, pegado a la derecha, `end` (selector de vista).
 */
export function ModuleToolbar({
  search,
  chips,
  filter,
  children,
  end,
  className,
}: {
  search?: ReactNode;
  chips?: ReactNode;
  filter?: ReactNode;
  children?: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div className={[s.toolbar, className].filter(Boolean).join(" ")} role="search">
      {search ? <div className={s.toolbarSearch}>{search}</div> : null}
      {chips}
      {filter}
      {children}
      {end ? <div className={s.toolbarEnd}>{end}</div> : null}
    </div>
  );
}

/** Grupo de chips de filtro (`role="group"`). */
export function FilterChips({ children, ariaLabel = "Filtros", className }: { children: ReactNode; ariaLabel?: string; className?: string }) {
  return (
    <div className={[s.chips, className].filter(Boolean).join(" ")} role="group" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

/**
 * Chip de filtro de 32 px (40 táctil) con contador y punto de tono. Es un botón
 * con `aria-pressed`; el activo se pinta sólido. Con `onRemove` se vuelve un
 * «filtro aplicado» (etiqueta: valor ×) con su botón de quitar.
 */
export function FilterChip({
  active = false,
  count,
  dot,
  icon,
  onClick,
  onRemove,
  removeLabel = "Quitar filtro",
  disabled,
  title,
  children,
  className,
}: {
  active?: boolean;
  count?: number;
  /** Punto de color antes del texto (tono de estado, p. ej. `danger` en «Atrasadas»). */
  dot?: Tone;
  icon?: ReactNode;
  onClick?: () => void;
  /** Si se da, el chip es un filtro aplicado y muestra la × para quitarlo. */
  onRemove?: () => void;
  removeLabel?: string;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const cuerpo = (
    <>
      {dot ? <span className={s.chipDot} style={{ background: TONE_COLOR[dot] }} aria-hidden="true" /> : null}
      {icon}
      {children}
      {count != null ? <span className={s.chipN}>{count}</span> : null}
    </>
  );
  if (onRemove) {
    return (
      <span className={[s.chip, s.chipFilter, className].filter(Boolean).join(" ")} title={title}>
        {cuerpo}
        <button type="button" className={s.chipX} onClick={onRemove} aria-label={removeLabel} disabled={disabled}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={[s.chip, className].filter(Boolean).join(" ")}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {cuerpo}
    </button>
  );
}

/** Botón «+ Filtro» (chip punteado). `count` = filtros avanzados aplicados. */
export function FilterButton({
  onClick,
  count,
  label = "Filtro",
  expanded,
  className,
}: {
  onClick?: () => void;
  count?: number;
  label?: ReactNode;
  /** Si abre un panel, anuncia su estado. */
  expanded?: boolean;
  className?: string;
}) {
  return (
    <button type="button" className={[s.chip, s.chipDashed, className].filter(Boolean).join(" ")} onClick={onClick} aria-expanded={expanded}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {label}
      {count ? <span className={s.chipN}>{count}</span> : null}
    </button>
  );
}

export type ViewId = "lista" | "tablero" | "mapa";

const VISTAS: Record<ViewId, { label: string; icon: ReactNode }> = {
  lista: {
    label: "Lista",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <path d="M5.5 4h8M5.5 8h8M5.5 12h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="2.6" cy="4" r="0.9" fill="currentColor" />
        <circle cx="2.6" cy="8" r="0.9" fill="currentColor" />
        <circle cx="2.6" cy="12" r="0.9" fill="currentColor" />
      </svg>
    ),
  },
  tablero: {
    label: "Tablero",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <rect x="2" y="2.5" width="3.4" height="11" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="6.3" y="2.5" width="3.4" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10.6" y="2.5" width="3.4" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  mapa: {
    label: "Mapa",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        <path d="M2 4.2 6 2.6l4 1.6 4-1.6v9.2l-4 1.6-4-1.6-4 1.6zM6 2.6v9.2M10 4.2v9.2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
};

/**
 * Selector de vista lista / tablero / mapa (control segmentado). Solo la vista
 * activa muestra su nombre; las demás, el icono con el nombre para el lector.
 */
export function ViewSwitch({
  value,
  onChange,
  views = ["lista", "tablero", "mapa"],
  ariaLabel = "Vista",
}: {
  value: ViewId;
  onChange: (v: ViewId) => void;
  views?: ReadonlyArray<ViewId>;
  ariaLabel?: string;
}) {
  return (
    <span className={s.view}>
      <Segmented
        ariaLabel={ariaLabel}
        value={value}
        onChange={onChange}
        items={views.map((id) => ({
          id,
          title: VISTAS[id].label,
          label: (
            <>
              {VISTAS[id].icon}
              {value === id ? VISTAS[id].label : <span className="ui-sr-only">{VISTAS[id].label}</span>}
            </>
          ),
        }))}
      />
    </span>
  );
}

/* ─── Pie de lista y paginador ─────────────────────────────────────────── */

/**
 * Pie de la tarjeta: «Mostrando 1 a 6 de 38» (o `children`) a la izquierda y
 * `end` (paginador, selector de tamaño) a la derecha.
 */
export function ListFooter({
  from,
  to,
  total,
  unit,
  children,
  end,
  className,
}: {
  from?: number;
  to?: number;
  total?: number;
  /** Sustantivo del total («actividades»): «Mostrando 1 a 6 de 38 actividades». */
  unit?: ReactNode;
  children?: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  const resumen =
    total != null ? (
      from != null && to != null && total > 0 ? (
        <span>
          Mostrando {from} a {Math.min(to, total)} de {total}
          {unit ? <> {unit}</> : null}
        </span>
      ) : (
        <span>
          {total}
          {unit ? <> {unit}</> : null}
        </span>
      )
    ) : null;
  return (
    <div className={[s.footer, className].filter(Boolean).join(" ")}>
      {resumen}
      {children}
      {end ? <div className={s.footerEnd}>{end}</div> : null}
    </div>
  );
}

function paginasVisibles(page: number, pages: number): Array<number | "…"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const ini = Math.max(2, page - 1);
  const fin = Math.min(pages - 1, page + 1);
  if (ini > 2) out.push("…");
  for (let p = ini; p <= fin; p += 1) out.push(p);
  if (fin < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

/** Paginador compacto: ‹ 1 2 3 … 7 ›. `page` empieza en 1. */
export function Pager({
  page,
  pages,
  onChange,
  ariaLabel = "Páginas",
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  ariaLabel?: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className={s.pager} aria-label={ariaLabel}>
      <button type="button" className={s.pg} onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {paginasVisibles(page, pages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className={[s.pg, s.pgGap].join(" ")} aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={s.pg}
            aria-current={p === page ? "page" : undefined}
            aria-label={`Página ${p}`}
            onClick={() => (p === page ? undefined : onChange(p))}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className={s.pg} onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Página siguiente">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </nav>
  );
}
