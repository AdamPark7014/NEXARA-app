"use client";

import { type ReactNode } from "react";
import BlockRounded from "@mui/icons-material/BlockRounded";
import CreditCardRounded from "@mui/icons-material/CreditCardRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import FaceRounded from "@mui/icons-material/FaceRounded";
import FilterAltOffRounded from "@mui/icons-material/FilterAltOffRounded";
import FingerprintRounded from "@mui/icons-material/FingerprintRounded";
import GridViewRounded from "@mui/icons-material/GridViewRounded";
import SwapVertRounded from "@mui/icons-material/SwapVertRounded";
import TableRowsRounded from "@mui/icons-material/TableRowsRounded";
import { IgBadge } from "../_Console";
import { PersonFaceThumb } from "../_PersonFace";
import styles from "./_people.module.css";
import {
  SORT_OPTIONS,
  describeCredentials,
  describeValidity,
  flattenDetail,
  genderLabel,
  userTypeLabel,
  type CredentialKind,
  type Person,
  type SortKey,
  type ValidityInfo,
} from "./_peopleView";
import type { ViewMode } from "./_usePeopleQuery";

/* ── Vigencia ─────────────────────────────────────────────────────────── */

/** Insignia de vigencia con punto de color: se lee sin leer. */
export function ValidityPill({ info, title }: { info: ValidityInfo; title?: boolean }) {
  return (
    <span className={styles.validity} data-tone={info.tone} title={title ? info.meaning : undefined}>
      <span className={styles.validityDot} aria-hidden />
      {info.label}
    </span>
  );
}

/**
 * Marca de suspensión. `validEnable=false` estaba escondido dentro del cálculo
 * de vigencia; una persona suspendida es lo primero que hay que ver de ella.
 */
export function SuspendedFlag() {
  return (
    <span className={styles.suspendedFlag}>
      <BlockRounded aria-hidden />
      Suspendida
    </span>
  );
}

/* ── Cabecera de la ficha ─────────────────────────────────────────────── */

/**
 * Foto grande, identidad y estado de un vistazo.
 *
 * La cabecera vieja pintaba la vigencia como una etiqueta suelta («Vencida») y
 * enseñaba el `userType` crudo del terminal (`normal`, `blackList`). Aquí la
 * vigencia lleva su color y, debajo, **qué implica**: no es lo mismo «caducó
 * hace tres días» que «está suspendida a mano», y hasta ahora las dos se leían
 * igual de rojo sin decir cuál era.
 */
export function PersonHero({
  person,
  bust,
  children,
}: {
  person: Person;
  /** Cambia tras subir foto para forzar el re-fetch del rostro. */
  bust?: number;
  /** Fila extra bajo el estado (identidad ERP, etc.). */
  children?: ReactNode;
}) {
  const v = describeValidity(person);
  const genero = genderLabel(person.gender);
  return (
    <div className={styles.hero}>
      <PersonFaceThumb
        className={styles.heroPhoto}
        size="xl"
        personId={person.id}
        personName={person.name}
        bust={bust}
      />
      <div className={styles.heroMain}>
        <h3 className={styles.heroName}>{person.name}</h3>
        <p className={styles.heroCode}>{person.code || person.id}</p>
        <div className={styles.heroBadges}>
          <ValidityPill info={v} />
          {person.validEnable === false && <SuspendedFlag />}
          <IgBadge>{userTypeLabel(person.userType)}</IgBadge>
          {person.orgName && <IgBadge>{person.orgName}</IgBadge>}
          {genero && <IgBadge>{genero}</IgBadge>}
        </div>
        <p className={styles.heroMeaning}>{v.meaning}</p>
        {children}
      </div>
    </div>
  );
}

/* ── Credenciales ─────────────────────────────────────────────────────── */

const CRED_ICON: Record<CredentialKind, typeof FaceRounded> = {
  face: FaceRounded,
  fp: FingerprintRounded,
  card: CreditCardRounded,
};

/** Tres iconos apagados/encendidos para listado y tabla. */
export function CredentialMini({ person }: { person: Person }) {
  const creds = describeCredentials(person);
  const resumen = creds
    .map((c) => `${c.label}: ${c.on ? (c.count || "sí") : "no"}`)
    .join(" · ");
  return (
    <span className={styles.credMini} title={resumen} aria-label={`Credenciales — ${resumen}`}>
      {creds.map((c) => {
        const Icon = CRED_ICON[c.kind];
        return (
          <span key={c.kind} className={styles.credMiniItem} data-on={c.on ? "1" : undefined}>
            <Icon aria-hidden />
            {c.count > 0 ? c.count : ""}
          </span>
        );
      })}
    </span>
  );
}

/** Credenciales de la ficha: cada una con lo que significa de verdad. */
export function CredentialList({ person }: { person: Person }) {
  return (
    <div className={styles.credList}>
      {describeCredentials(person).map((c) => {
        const Icon = CRED_ICON[c.kind];
        return (
          <div key={c.kind} className={styles.credRow} data-on={c.on ? "1" : undefined}>
            <span className={styles.credIcon} aria-hidden>
              <Icon />
            </span>
            <span className={styles.credBody}>
              <strong>{c.label}</strong>
              <span className={styles.credMeaning}>{c.meaning}</span>
              <span className={styles.credDetail}>{c.detail}</span>
            </span>
            <span className={styles.credCount} aria-label={`${c.count} ${c.label.toLowerCase()}`}>
              {c.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Detalle técnico legible ──────────────────────────────────────────── */

/**
 * Sustituye al `<pre>{JSON.stringify(detail)}</pre>` que era el contenido
 * principal de la ficha. Los pares clave-valor van arriba, en español; el
 * crudo sigue ahí, plegado, porque para depurar hace falta.
 */
export function DetailFacts({
  detail,
  emptyHint = "El terminal no devolvió detalle adicional.",
}: {
  detail: unknown;
  emptyHint?: string;
}) {
  const facts = flattenDetail(detail);
  if (facts.length === 0 && detail == null) return null;
  return (
    <>
      {facts.length > 0 ? (
        <dl className={styles.factGrid}>
          {facts.map((f) => (
            <div key={f.path} className={styles.factCell}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.credDetail}>{emptyHint}</p>
      )}
      <details className={styles.rawBlock}>
        <summary className={styles.rawToggle}>
          <ExpandMoreRounded aria-hidden />
          Ver respuesta cruda (depuración)
        </summary>
        <pre className={styles.rawPre}>{JSON.stringify(detail, null, 2)}</pre>
      </details>
    </>
  );
}

/* ── Barra de vista ───────────────────────────────────────────────────── */

/** Conmutador tarjetas/tabla, orden y resumen de lo que se está viendo. */
export function ViewBar({
  view,
  onView,
  sort,
  onSort,
  shown,
  total,
  activeFilterCount,
  onResetFilters,
}: {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  shown: number;
  total: number;
  activeFilterCount: number;
  onResetFilters: () => void;
}) {
  return (
    <div className={styles.viewBar}>
      <span className={styles.resultCount}>
        {shown === total ? `${total} personas` : `${shown} de ${total}`}
      </span>
      {activeFilterCount > 0 && (
        <span className={styles.activeChips}>
          <span className={styles.chip}>
            {activeFilterCount} {activeFilterCount === 1 ? "filtro" : "filtros"}
          </span>
          <button
            type="button"
            className={styles.chipReset}
            onClick={onResetFilters}
            aria-label="Quitar todos los filtros"
          >
            <FilterAltOffRounded style={{ fontSize: 12, verticalAlign: "-2px" }} aria-hidden /> Limpiar
          </button>
        </span>
      )}
      <span className={styles.viewBarSpacer} />
      <label className={styles.sortField}>
        <SwapVertRounded aria-hidden style={{ fontSize: 15 }} />
        <span className={styles.srOnly}>Ordenar directorio por</span>
        <select
          className={styles.sortSelect}
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.viewToggle} role="group" aria-label="Forma de ver el directorio">
        <button
          type="button"
          className={styles.viewToggleBtn}
          aria-pressed={view === "tarjetas"}
          aria-label="Ver como tarjetas con foto"
          onClick={() => onView("tarjetas")}
        >
          <GridViewRounded aria-hidden />
          Tarjetas
        </button>
        <button
          type="button"
          className={styles.viewToggleBtn}
          aria-pressed={view === "tabla"}
          aria-label="Ver como tabla densa"
          onClick={() => onView("tabla")}
        >
          <TableRowsRounded aria-hidden />
          Tabla
        </button>
      </div>
    </div>
  );
}

/* ── Skeletons ────────────────────────────────────────────────────────── */

/**
 * Esqueleto del directorio. Calca la geometría de lo que va a aparecer para
 * que la lista no dé el salto de vacío a llena — el panel no tenía ninguno.
 */
export function DirectorySkeleton({ view, count = 8 }: { view: ViewMode; count?: number }) {
  if (view === "tabla") {
    return (
      <div className={styles.skelRows} role="status" aria-busy="true" aria-live="polite">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={styles.skelRow}>
            <span className={`${styles.shimmer} ${styles.shimmerThumb}`} />
            <span className={`${styles.shimmer} ${styles.shimmerLine}`} />
            <span className={`${styles.shimmer} ${styles.shimmerLine}`} />
          </div>
        ))}
        <span className={styles.srOnly}>Cargando el directorio de personas…</span>
      </div>
    );
  }
  return (
    <div className={styles.skelGrid} role="status" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skelCard}>
          <span className={`${styles.shimmer} ${styles.shimmerAvatar}`} />
          <span className={`${styles.shimmer} ${styles.shimmerLine}`} />
          <span className={`${styles.shimmer} ${styles.shimmerLine}`} style={{ width: "60%" }} />
        </div>
      ))}
      <span className={styles.srOnly}>Cargando el directorio de personas…</span>
    </div>
  );
}

/** Esqueleto de la ficha mientras el terminal contesta. */
export function DetailSkeleton({ label = "Cargando la ficha…" }: { label?: string }) {
  return (
    <div className={styles.skelDetail} role="status" aria-busy="true" aria-live="polite">
      <div className={styles.skelHero}>
        <span className={`${styles.shimmer} ${styles.shimmerHero}`} />
        <div className={styles.skelHeroMain}>
          <span className={`${styles.shimmer} ${styles.shimmerLine}`} style={{ height: 14, width: "70%" }} />
          <span className={`${styles.shimmer} ${styles.shimmerLine}`} style={{ width: "40%" }} />
          <span className={`${styles.shimmer} ${styles.shimmerLine}`} style={{ width: "55%" }} />
        </div>
      </div>
      <span className={`${styles.shimmer} ${styles.shimmerBlock}`} />
      <span className={`${styles.shimmer} ${styles.shimmerBlock}`} />
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}

/* ── Grupo de acciones ────────────────────────────────────────────────── */

/** Agrupa acciones por peligrosidad: lo reversible junto, lo destructivo aparte. */
export function ActionGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.actionGroup}>
      <div className={styles.actionGroupHead}>
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div className={styles.actionRow}>{children}</div>
    </div>
  );
}
