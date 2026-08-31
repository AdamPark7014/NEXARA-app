"use client";

/**
 * NEXARA · CommandPalette (Cmd+K / Ctrl+K)
 * ========================================
 *
 * Paleta global de navegación rápida. Consume el access-matrix como única
 * fuente de verdad:
 *  - Solo lista módulos a los que el rol del usuario tiene acceso real.
 *  - Atajos a acciones globales (modo oscuro, panel switcher, logout).
 *  - Búsqueda fuzzy por label, descripción, panel y palabras del negocio
 *    (ej. "cotización" encuentra `/crm/quotes`).
 *
 * Se monta una sola vez dentro de AppShell y escucha ⌘K / Ctrl+K en window.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PANEL_META,
  type ModuleEntry,
  type PanelId,
} from "@/lib/access-matrix";
import {
  getUserAllowedModules,
  getUserAllowedPanels,
  getModuleEntryUrl,
  getUserPanelSwitchPath,
} from "@/lib/user-access";
import { buildCrossPanelUrl, resolveCrossPanelHref, isCrossPanelHref, detectCurrentPanelId, panelIdFromInternalPath } from "@/lib/cross-panel-handoff";
import type { UserAccessInput } from "@/lib/user-access";
import { fetchGlobalSearch, type GlobalSearchResult } from "@/lib/search-api";
import {
  searchResultIcon,
  searchResultTypeLabel,
  searchResultUrl,
} from "@/lib/search-routes";

type Action = {
  id: string;
  label: string;
  description?: string;
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
  erp: "ERP",
  crm: "CRM",
  ops: "OPS",
  studio: "STUDIO",
  lab: "LAB",
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

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setEntityResults([]);
      setEntityHint(null);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
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
    const list = getUserAllowedModules(user)
      .filter((m) => m.visible !== false)
      .map<Action>((m) => {
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
  }, [user]);

  const globalActions = useMemo<Action[]>(() => {
    const userJson = user ? JSON.stringify(user) : null;
    const current = detectCurrentPanelId();
    const toUrl = (path: string) => resolveCrossPanelHref(path, userJson, current);
    const acc: Action[] = [
      {
        id: "act:create-lead",
        label: "Crear lead",
        description: "Nuevo prospecto en CRM",
        icon: "🌱",
        group: "Crear",
        url: toUrl("/crm/leads"),
        keywords: ["nuevo", "prospecto", "lead"],
      },
      {
        id: "act:create-quote",
        label: "Crear cotización",
        description: "Nueva cotización comercial",
        icon: "📄",
        group: "Crear",
        url: toUrl("/crm/quotes"),
        keywords: ["cotizacion", "quote", "nuevo"],
      },
      {
        id: "act:create-ticket",
        label: "Crear ticket de soporte",
        description: "Bandeja OPS · soporte",
        icon: "🎫",
        group: "Crear",
        url: toUrl("/ops/support"),
        keywords: ["ticket", "soporte", "incidencia"],
      },
      {
        id: "act:dark",
        label: "Cambiar tema (claro / oscuro)",
        description: "Modo visual de la interfaz",
        icon: "🌗",
        group: "Acciones",
        onSelect: onToggleDark,
        keywords: ["tema", "dark", "light", "oscuro", "claro"],
      },
      {
        id: "act:logout",
        label: "Cerrar sesión",
        description: "Salir de NEXARA",
        icon: "🚪",
        group: "Acciones",
        onSelect: onLogout,
        keywords: ["salir", "logout", "exit"],
      },
    ];
    getUserAllowedPanels(user).forEach((p) => {
      acc.push({
        id: `panel:${p.id}`,
        label: `Ir a ${p.name}`,
        description: p.tagline,
        icon: p.icon,
        group: "Saltar a panel",
        panel: p.id,
        url: buildCrossPanelUrl(p.id, getUserPanelSwitchPath(user, p.id), userJson),
        keywords: [p.id, p.publicSubdomain],
      });
    });
    return acc;
  }, [onToggleDark, onLogout, user]);

  const entityActions = useMemo<Action[]>(() => {
    const userJson = user ? JSON.stringify(user) : null;
    const current = detectCurrentPanelId();
    return entityResults.map((r) => {
      const raw = searchResultUrl(r);
      const url = raw ? resolveCrossPanelHref(raw, userJson, current) : undefined;
      return {
        id: `entity:${r.type}:${r.id}`,
        label: r.title,
        description: r.subtitle
          ? `${searchResultTypeLabel(r.type)} · ${r.subtitle}`
          : searchResultTypeLabel(r.type),
        icon: searchResultIcon(r.type),
        group: "Entidades",
        url,
        keywords: [r.type, r.recommendation ?? ""],
      };
    });
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "color-mix(in srgb, #050a14 62%, transparent)",
        backdropFilter: "blur(10px) saturate(120%)",
        WebkitBackdropFilter: "blur(10px) saturate(120%)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "11vh",
        animation: "nxPaletteFade 180ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(740px, calc(100vw - 32px))",
          maxHeight: "72vh",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--surface) 99%, transparent) 0%, color-mix(in srgb, var(--surface-2) 92%, var(--surface)) 100%)",
          border: "1px solid var(--nx-panel-hairline)",
          borderRadius: 18,
          boxShadow:
            "0 4px 10px rgba(0,0,0,0.18), 0 36px 80px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "nxPaletteIn 220ms cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 18px",
            borderBottom: "1px solid var(--nx-panel-hairline-soft)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--primary) 10%, transparent) 0%, transparent 100%)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background:
                "linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 60%, var(--accent)) 100%)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontFamily: "var(--nx-font-display)",
              fontSize: 16,
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 14px color-mix(in srgb, var(--primary) 32%, transparent)",
            }}
          >
            ⌘
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clientes, actividades, módulos…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 15.5,
              fontWeight: 500,
              color: "var(--text-primary)",
              letterSpacing: "-0.005em",
            }}
            aria-label="Buscar"
          />
          <kbd
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 6,
              background: "var(--surface-2)",
              border: "1px solid var(--nx-panel-hairline)",
              color: "var(--text-tertiary)",
              fontFamily: "inherit",
              letterSpacing: "0.05em",
            }}
          >
            ESC
          </kbd>
        </div>

        <div
          ref={listRef}
          style={{
            overflow: "auto",
            padding: 8,
            flex: 1,
          }}
        >
          {entityLoading && query.trim().length >= 2 && (
            <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-tertiary)" }}>
              Buscando en toda la plataforma…
            </div>
          )}
          {entityHint && !entityLoading && entityResults.length > 0 && (
            <div style={{ padding: "6px 12px 10px", fontSize: 11.5, color: "var(--text-tertiary)" }}>
              {entityHint}
            </div>
          )}
          {flatResults.length === 0 && (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                color: "var(--text-tertiary)",
                fontSize: 13,
              }}
            >
              No hay coincidencias para <strong style={{ color: "var(--text-secondary)" }}>{query}</strong>.
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Prueba con: <em>cotizaciones</em>, <em>viáticos</em>, <em>almacén</em>, <em>aprobaciones</em>.
              </div>
            </div>
          )}

          {groups.map(([groupName, items]) => (
            <div key={groupName} style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-tertiary)",
                  padding: "10px 12px 4px",
                }}
              >
                {groupName}
              </div>
              {items.map((a) => {
                runningIdx += 1;
                const idx = runningIdx;
                const active = idx === activeIdx;
                return (
                  <button
                    key={a.id}
                    type="button"
                    data-idx={idx}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => selectAction(a)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      padding: "10px 12px",
                      border: "none",
                      background: active
                        ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                        : "transparent",
                      borderRadius: 10,
                      textAlign: "left",
                      cursor: "pointer",
                      color: "var(--text-primary)",
                      fontSize: 13.5,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 16,
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {a.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{a.label}</span>
                        {a.panel && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: `color-mix(in srgb, ${PANEL_META[a.panel].accent} 18%, transparent)`,
                              color: PANEL_META[a.panel].accent,
                              letterSpacing: "0.05em",
                            }}
                          >
                            {PANEL_LABEL[a.panel]}
                          </span>
                        )}
                      </div>
                      {a.description && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--text-tertiary)",
                            marginTop: 2,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {a.description}
                        </div>
                      )}
                    </div>
                    {a.url && (
                      <code
                        style={{
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          padding: "2px 6px",
                          borderRadius: 5,
                          background: "var(--surface-2)",
                          whiteSpace: "nowrap",
                          maxWidth: 220,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {a.url}
                      </code>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderTop: "1px solid var(--nx-panel-hairline-soft)",
            background: "color-mix(in srgb, var(--surface-2) 70%, transparent)",
            fontSize: 11,
            color: "var(--text-tertiary)",
          }}
        >
          <div style={{ display: "flex", gap: 14 }}>
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> navegar
            </span>
            <span>
              <Kbd>↵</Kbd> abrir
            </span>
            <span>
              <Kbd>esc</Kbd> cerrar
            </span>
          </div>
          <div style={{ fontVariantNumeric: "tabular-nums" }}>
            {flatResults.length} {flatResults.length === 1 ? "resultado" : "resultados"}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes nxPaletteFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes nxPaletteIn {
          from {
            opacity: 0;
            transform: translateY(-16px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
        style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 5,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        fontSize: 10.5,
        fontFamily: "inherit",
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </kbd>
  );
}
