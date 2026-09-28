"use client";

/**
 * NEXARA · CommandPalette (Cmd+K / Ctrl+K)
 * ========================================
 *
 * Paleta global de navegación rápida. Consume el access-matrix como única
 * fuente de verdad:
 *  - Solo lista módulos a los que el rol del usuario tiene acceso real.
 *  - Atajos a acciones globales (modo oscuro, logout; en Core: Nuevo cliente).
 *  - Acciones CRM/OPS/multi-panel viven en CommandPalette.legacy-actions.ts
 *    (código reciclable, desconectado si CORE_SURFACE_ONLY).
 *  - Búsqueda fuzzy por label, descripción, panel y sinónimos.
 *
 * Se monta una sola vez dentro de AppShell y escucha ⌘K / Ctrl+K en window.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PANEL_META,
  type ModuleEntry,
  type PanelId,
} from "@/lib/access-matrix";
import {
  getUserAllowedModules,
  getModuleEntryUrl,
} from "@/lib/user-access";
import { resolveCrossPanelHref, isCrossPanelHref, detectCurrentPanelId } from "@/lib/cross-panel-handoff";
import type { UserAccessInput } from "@/lib/user-access";
import { fetchGlobalSearch, type GlobalSearchResult } from "@/lib/search-api";
import {
  searchResultIcon,
  searchResultTypeLabel,
  searchResultUrl,
} from "@/lib/search-routes";
import {
  filterModulesByNavigation,
  type MeNavigation,
} from "@/lib/me-navigation";
import { CORE_SURFACE_ONLY } from "@/lib/core-surface";
import SearchIcon from "@mui/icons-material/Search";
import { PaletteActionIcon } from "./ShellIcons";
import styles from "./CommandPalette.module.scss";
import {
  buildLegacyCreateActions,
  buildLegacyPanelJumpActions,
} from "./CommandPalette.legacy-actions";

/** Tipos de entidad con superficie en Core ola1. */
const CORE_SEARCH_ENTITY_TYPES = new Set(["sales-client", "activity"]);

type Action = {
  id: string;
  label: string;
  description?: string;
  /** Clave heredada (búsqueda); el glifo visible sale de `PaletteActionIcon` por id. */
  icon: string;
  group: string;
  panel?: PanelId;
  url?: string;
  onSelect?: () => void;
  keywords?: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  user: UserAccessInput | null;
  token?: string | null;
  /** Misma fuente que AppShell sidebar (`GET /me/navigation`). */
  navigation?: MeNavigation | null;
  onToggleDark: () => void;
  onLogout: () => void;
};

/**
 * Sinónimos en español para que la búsqueda sea natural. Mapea palabra que
 * la gente escribe → palabras a inyectar en el haystack del módulo.
 */
const SYNONYMS: Record<string, string[]> = {
  cotizacion: ["quotes"],
  cotizaciones: ["quotes"],
  factura: ["invoicing"],
  facturas: ["invoicing", "cfdi"],
  cfdi: ["invoicing"],
  viatico: ["viatics"],
  viaticos: ["viatics"],
  gasto: ["expenses"],
  gastos: ["expenses"],
  nomina: ["hr"],
  rh: ["hr"],
  ot: ["activities", "my-activities"],
  ordenes: ["activities", "procurement"],
  ticket: ["support"],
  tickets: ["support"],
  almacen: ["warehouse"],
  inventario: ["warehouse"],
  banco: ["banking"],
  bancos: ["banking"],
  conciliacion: ["banking"],
  contabilidad: ["accounting"],
  auditoria: ["audit"],
  proveedor: ["procurement"],
  proveedores: ["procurement"],
  compra: ["procurement"],
  compras: ["procurement"],
  ventas: ["pipeline", "opportunities", "leads"],
  prospecto: ["leads"],
  prospectos: ["leads"],
  cliente: ["clients", "service-clients"],
  clientes: ["clients", "service-clients"],
  mantenimiento: ["maintenance"],
  uptime: ["noc"],
  flotilla: ["vehicles", "my-vehicles"],
  vehiculo: ["vehicles", "my-vehicles"],
  vehiculos: ["vehicles", "my-vehicles"],
  herramienta: ["tools"],
  herramientas: ["tools"],
  evidencia: ["evidences", "my-evidences"],
  evidencias: ["evidences", "my-evidences"],
  redes: ["social"],
  social: ["social"],
  marketing: ["pages", "social", "news"],
  noticia: ["news"],
  noticias: ["news"],
  pago: ["banking", "employee-payments"],
  pagos: ["banking", "employee-payments"],
  nominas: ["hr", "employee-payments"],
  reclutamiento: ["recruiting"],
  cv: ["recruiting"],
  cvs: ["recruiting"],
  multa: ["fines"],
  multas: ["fines"],
  asistencia: ["attendance"],
  comida: ["lunch-breaks"],
  comidas: ["lunch-breaks"],
  organigrama: ["orgchart"],
  organi: ["orgchart"],
  usuario: ["users"],
  usuarios: ["users"],
  rol: ["users"],
  roles: ["users"],
  permisos: ["users"],
  arquitectura: ["architecture"],
  mapa: ["architecture"],
  aprobacion: ["approvals"],
  aprobaciones: ["approvals"],
  ceo: ["executive"],
  ejecutivo: ["executive"],
};

const PANEL_LABEL: Record<PanelId, string> = {
  erp: "Core",
  finance: "Contabilidad",
  hr: "RRHH",
  crm: "CRM",
  ops: "OPS",
  studio: "STUDIO",
  lab: "Lab",
  integra: "INTEGRA",
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensFromQuery(q: string): string[] {
  const base = normalize(q).split(" ").filter(Boolean);
  const extras: string[] = [];
  for (const t of base) {
    if (SYNONYMS[t]) extras.push(...SYNONYMS[t]);
  }
  return [...base, ...extras];
}

function moduleHaystack(m: ModuleEntry): string {
  return normalize(
    `${m.label} ${m.description ?? ""} ${m.group ?? ""} ${m.id} ${m.panel} ${PANEL_LABEL[m.panel]}`,
  );
}

function actionHaystack(a: Action): string {
  return normalize(
    `${a.label} ${a.description ?? ""} ${a.group} ${a.keywords?.join(" ") ?? ""}`,
  );
}

function scoreMatch(haystack: string, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  let score = 0;
  for (const t of tokens) {
    if (!t) continue;
    const idx = haystack.indexOf(t);
    if (idx === -1) return 0;
    score += idx === 0 ? 5 : haystack.includes(` ${t}`) ? 3 : 1;
  }
  return score;
}

export default function CommandPalette({
  open,
  onClose,
  user,
  token,
  navigation = null,
  onToggleDark,
  onLogout,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [entityResults, setEntityResults] = useState<GlobalSearchResult[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  const [entityHint, setEntityHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIdx(0);
    setEntityResults([]);
    setEntityHint(null);
    const prevFocus = document.activeElement as HTMLElement | null;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(raf);
      body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !token) {
      setEntityResults([]);
      setEntityHint(null);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setEntityResults([]);
      setEntityHint(null);
      return;
    }

    setEntityLoading(true);
    const timer = window.setTimeout(() => {
      fetchGlobalSearch(token, q, 10)
        .then((res) => {
          setEntityResults(res.results);
          setEntityHint(res.intelligence?.why ?? null);
        })
        .catch(() => {
          setEntityResults([]);
          setEntityHint(null);
        })
        .finally(() => setEntityLoading(false));
    }, 280);

    return () => window.clearTimeout(timer);
  }, [open, query, token]);

  const modules = useMemo<Action[]>(() => {
    const userJson = user ? JSON.stringify(user) : null;
    const current = detectCurrentPanelId();
    const allowed = getUserAllowedModules(user).filter((m) => m.visible !== false);
    const list = filterModulesByNavigation(allowed, navigation).map<Action>((m) => {
      const internal = getModuleEntryUrl(m);
      return {
        id: `mod:${m.id}`,
        label: m.label,
        description: m.description,
        icon: m.icon ?? "•",
        group: `${PANEL_LABEL[m.panel]} · ${m.group ?? "General"}`,
        panel: m.panel,
        url: resolveCrossPanelHref(internal, userJson, current),
        keywords: [m.id, m.path],
      };
    });
    return list;
  }, [user, navigation]);

  const globalActions = useMemo<Action[]>(() => {
    const shared: Action[] = [
      {
        id: "act:dark",
        label: "Cambiar tema (claro / oscuro)",
        description: "Modo visual de la interfaz",
        icon: "theme",
        group: "Acciones",
        onSelect: onToggleDark,
        keywords: ["tema", "dark", "light", "oscuro", "claro"],
      },
      {
        id: "act:logout",
        label: "Cerrar sesión",
        description: "Salir de NEXARA",
        icon: "logout",
        group: "Acciones",
        onSelect: onLogout,
        keywords: ["salir", "logout", "exit"],
      },
    ];

    // CRM/OPS/multi-panel viven en CommandPalette.legacy-actions.ts (reciclables).
    if (CORE_SURFACE_ONLY) {
      return shared;
    }

    return [
      ...(buildLegacyCreateActions(user) as Action[]),
      ...shared,
      ...(buildLegacyPanelJumpActions(user) as Action[]),
    ];
  }, [onToggleDark, onLogout, user]);

  const entityActions = useMemo<Action[]>(() => {
    const userJson = user ? JSON.stringify(user) : null;
    const current = detectCurrentPanelId();
    const rows = CORE_SURFACE_ONLY
      ? entityResults.filter((r) => CORE_SEARCH_ENTITY_TYPES.has(r.type))
      : entityResults;
    return rows
      .map((r): Action | null => {
        const raw = searchResultUrl(r);
        if (!raw) return null;
        return {
          id: `entity:${r.type}:${r.id}`,
          label: r.title,
          description: r.subtitle
            ? `${searchResultTypeLabel(r.type)} · ${r.subtitle}`
            : searchResultTypeLabel(r.type),
          icon: searchResultIcon(r.type),
          group: "Entidades",
          url: resolveCrossPanelHref(raw, userJson, current),
          keywords: [r.type, r.recommendation ?? ""],
        };
      })
      .filter((a): a is Action => a != null);
  }, [entityResults, user]);

  const allActions = useMemo<Action[]>(
    () => [...entityActions, ...modules, ...globalActions],
    [entityActions, modules, globalActions],
  );

  const results = useMemo(() => {
    const tokens = tokensFromQuery(query);
    if (!query.trim()) {
      return allActions.slice(0, 40);
    }

    const entityIds = new Set(entityActions.map((a) => a.id));
    const scored = allActions
      .filter((a) => !entityIds.has(a.id))
      .map((a) => {
        const hay = a.id.startsWith("mod:")
          ? moduleHaystack({
              id: a.id,
              label: a.label,
              description: a.description ?? "",
              icon: a.icon,
              path: a.url ?? "",
              panel: a.panel ?? "erp",
              group: a.group,
              allowedRoles: [],
              visible: true,
            } as ModuleEntry)
          : actionHaystack(a);
        return { action: a, score: scoreMatch(hay, tokens) };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((r) => r.action);

    return [...entityActions, ...scored].slice(0, 40);
  }, [query, allActions, entityActions]);

  const groups = useMemo(() => {
    const map = new Map<string, Action[]>();
    for (const a of results) {
      if (!map.has(a.group)) map.set(a.group, []);
      map.get(a.group)!.push(a);
    }
    return Array.from(map.entries());
  }, [results]);

  const flatResults = results;

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(flatResults.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "PageDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(flatResults.length - 1, i + 8));
      } else if (e.key === "PageUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 8));
      } else if ((e.key === "Home" || e.key === "End") && e.ctrlKey) {
        e.preventDefault();
        setActiveIdx(e.key === "Home" ? 0 : Math.max(0, flatResults.length - 1));
      } else if (e.key === "Tab") {
        // El foco se queda en el buscador: las flechas mueven la selección.
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const sel = flatResults[activeIdx];
        if (sel) selectAction(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flatResults, activeIdx, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function selectAction(a: Action) {
    onClose();
    if (a.onSelect) {
      a.onSelect();
    } else if (a.url) {
      const url = a.url;
      if (
        a.id.startsWith("panel:") ||
        url.startsWith("http") ||
        url.includes("?_nxt=") ||
        isCrossPanelHref(url, detectCurrentPanelId())
      ) {
        window.location.assign(url);
      } else {
        router.push(url);
      }
    }
  }

  if (!open) return null;

  let runningIdx = -1;
  const activeOptionId = flatResults[activeIdx] ? `${listboxId}-opt-${activeIdx}` : undefined;

  return (
    <div className={styles.scrim} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en NEXARA"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <span className={styles.headIcon} aria-hidden="true">
            <SearchIcon aria-hidden="true" sx={{ fontSize: 20 }} />
          </span>
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clientes, actividades, módulos…"
            aria-label="Buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          {entityLoading && query.trim().length >= 2 ? (
            <span className={styles.spinner} aria-hidden="true" />
          ) : null}
          <button type="button" className={styles.escBtn} onClick={onClose} aria-label="Cerrar búsqueda">
            <span className={styles.escLabel}>Esc</span>
            <span className={styles.escClose} aria-hidden="true">
              ×
            </span>
          </button>
        </div>

        <div ref={listRef} className={styles.list} id={listboxId} role="listbox" aria-label="Resultados">
          {entityLoading && query.trim().length >= 2 && (
            <div className={styles.note} role="status">
              {CORE_SURFACE_ONLY ? "Buscando…" : "Buscando en toda la plataforma…"}
            </div>
          )}
          {entityHint && !entityLoading && entityResults.length > 0 && (
            <div className={styles.note}>{entityHint}</div>
          )}
          {flatResults.length === 0 && (
            <div className={styles.empty} role="status">
              No hay coincidencias para <strong>{query}</strong>.
              <div className={styles.emptyHint}>
                {CORE_SURFACE_ONLY ? (
                  <>
                    Prueba con: <em>clientes</em>, <em>actividades</em>, <em>asistencias</em>,{" "}
                    <em>chat</em>.
                  </>
                ) : (
                  <>
                    Prueba con: <em>cotizaciones</em>, <em>viáticos</em>, <em>almacén</em>,{" "}
                    <em>aprobaciones</em>.
                  </>
                )}
              </div>
            </div>
          )}

          {groups.map(([groupName, items]) => (
            <div key={groupName} className={styles.group} role="group" aria-label={groupName}>
              <div className={styles.groupTitle} aria-hidden="true">
                {groupName}
              </div>
              {items.map((a) => {
                runningIdx += 1;
                const idx = runningIdx;
                const active = idx === activeIdx;
                return (
                  <div
                    key={a.id}
                    id={`${listboxId}-opt-${idx}`}
                    role="option"
                    aria-selected={active}
                    data-idx={idx}
                    data-active={active ? "true" : undefined}
                    className={styles.option}
                    onMouseMove={() => {
                      if (!active) setActiveIdx(idx);
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectAction(a)}
                  >
                    <span className={styles.optionIcon} aria-hidden="true">
                      <PaletteActionIcon actionId={a.id} size={18} />
                    </span>
                    <span className={styles.optionBody}>
                      <span className={styles.optionHead}>
                        <span className={styles.optionLabel}>{a.label}</span>
                        {a.panel && a.panel !== "erp" && (
                          <span
                            className={styles.panelTag}
                            style={{ "--tag-color": PANEL_META[a.panel].accent } as React.CSSProperties}
                          >
                            {PANEL_LABEL[a.panel]}
                          </span>
                        )}
                      </span>
                      {a.description && <span className={styles.optionDesc}>{a.description}</span>}
                    </span>
                    <span className={styles.optionEnter} aria-hidden="true">
                      ↵
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className={styles.foot}>
          <div className={styles.footKeys}>
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> moverte
            </span>
            <span>
              <Kbd>↵</Kbd> abrir
            </span>
            <span>
              <Kbd>esc</Kbd> cerrar
            </span>
          </div>
          <div className={styles.footCount} aria-live="polite">
            {flatResults.length} {flatResults.length === 1 ? "resultado" : "resultados"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
