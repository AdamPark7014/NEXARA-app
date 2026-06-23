"use client";

/**
 * CommandPalette — paleta global Cmd+K / Ctrl+K para NEXARA ERP.
 *
 * Indexa en una sola interfaz:
 *  - Rutas locales del panel actual + atajos a otros paneles (PanelSwitcher).
 *  - Módulos del MODULE_MAP (single source of truth) con ruta principal.
 *  - Acciones rápidas globales (crear cotización, ir a aprobaciones, etc.).
 *  - Búsqueda server-side cross-entidad vía API `/search` (clientes, proyectos,
 *    actividades, facturas, activos, vehículos, work-projects).
 *
 * UX:
 *  - Se abre con Cmd+K (mac) / Ctrl+K (win) o haciendo click en el launcher.
 *  - Navegación con flechas + Enter.
 *  - Filtrado por permisos: solo muestra acciones/rutas accesibles al usuario.
 *  - El placeholder cambia para indicar capacidades ("Buscar clientes,
 *    proyectos, módulos, atajos…").
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { MODULE_DEFAULT_ROUTE, MODULE_MAP, type ModuleNode } from "@/lib/module-map";
import { getAccessiblePanels } from "@/lib/panel-routing";
import { getPanelUrl, type PanelSlug } from "@/lib/panel-urls";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/lib/permissions";

export type CommandItem = {
  id: string;
  group: "Atajos" | "Acciones" | "Módulos" | "Paneles" | "Resultados";
  icon: string;
  title: string;
  subtitle?: string;
  /** URL absoluta o relativa al panel actual. */
  href?: string;
  /** Handler imperativo. Si está presente, se prefiere sobre href. */
  onSelect?: () => void;
  /** Filtro por permisos (al menos uno requerido para mostrar). */
  requiresAnyPermission?: string[];
  /** Boost de orden — más alto = aparece primero dentro de su grupo. */
  rank?: number;
};

type SearchHit = {
  type: string;
  id: number;
  title: string;
  subtitle?: string;
};

const RESULT_ICONS: Record<string, string> = {
  user: "👤",
  client: "🏢",
  project: "📁",
  activity: "📋",
  invoice: "🧾",
  asset: "🔧",
  vehicle: "🚙",
  "work-project": "📊",
};

const RESULT_URLS: Record<string, (id: number) => { panel: PanelSlug; path: string }> = {
  user: (id) => ({ panel: "console", path: `/users?focus=${id}` }),
  client: (id) => ({ panel: "console", path: `/clients/${id}` }),
  project: (id) => ({ panel: "operacion", path: `/projects/${id}` }),
  activity: (id) => ({ panel: "operacion", path: `/activities?focus=${id}` }),
  invoice: (id) => ({ panel: "contabilidad", path: `/invoicing?focus=${id}` }),
  asset: (id) => ({ panel: "operacion", path: `/assets?focus=${id}` }),
  vehicle: (id) => ({ panel: "operacion", path: `/vehicles?focus=${id}` }),
  "work-project": (id) => ({ panel: "contabilidad", path: `/work-projects?focus=${id}` }),
};

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  /** Color de acento del panel actual (para resaltar). */
  accentColor?: string;
};

export default function CommandPalette({ open, onClose, accentColor = "#0ea5e9" }: CommandPaletteProps) {
  const router = useRouter();
  const { user } = useUser();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setSearchHits([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounce de la consulta para el search server-side
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(handle);
  }, [query]);

  // Búsqueda server-side cuando el usuario teclea 2+ chars
  useEffect(() => {
    if (!open) return;
    if (debouncedQuery.length < 2) {
      setSearchHits([]);
      return;
    }
    if (!user?.token) return;
    if (!hasPermission(user, PERMISSIONS.SEARCH_VIEW) && !user.isSuperAdmin) {
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();
    setSearchLoading(true);
    fetch(buildApiUrl(`search?q=${encodeURIComponent(debouncedQuery)}&limit=12`), {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => {
        if (cancelled) return;
        setSearchHits(Array.isArray(data?.results) ? data.results : []);
      })
      .catch(() => {
        if (!cancelled) setSearchHits([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [debouncedQuery, open, user]);

  // Atajos / acciones rápidas globales
  const baseItems = useMemo<CommandItem[]>(() => {
    if (!user) return [];

    const items: CommandItem[] = [];

    // 1) Atajos a paneles accesibles
    const panels = getAccessiblePanels(user);
    for (const panel of panels) {
      items.push({
        id: `panel:${panel.key}`,
        group: "Paneles",
        icon: panel.icon,
        title: `Ir a ${panel.name}`,
        subtitle: panel.description,
        href: getPanelUrl(panel.key, panel.entryPath),
        rank: 30,
      });
    }

    // 2) Módulos del MODULE_MAP
    const modulesArr: ModuleNode[] = Object.values(MODULE_MAP);
    for (const mod of modulesArr) {
      const route = MODULE_DEFAULT_ROUTE[mod.id];
      if (!route) continue;
      items.push({
        id: `module:${mod.id}`,
        group: "Módulos",
        icon: mod.icon,
        title: mod.name,
        subtitle: mod.purpose,
        href: getPanelUrl(route.panel, route.path),
        rank: 20,
      });
    }

    // 3) Acciones rápidas con permisos
    const quickActions: CommandItem[] = [
      {
        id: "action:clients-360",
        group: "Acciones",
        icon: "🤝",
        title: "Clientes corporativos (vista 360°)",
        subtitle: "Console → clients",
        href: getPanelUrl("console", "/clients"),
        requiresAnyPermission: [PERMISSIONS.CONSOLE_ADMIN],
        rank: 90,
      },
      {
        id: "action:pipeline",
        group: "Acciones",
        icon: "🧭",
        title: "Pipeline comercial (Kanban)",
        subtitle: "Ventas → pipeline",
        href: getPanelUrl("ventas", "/pipeline"),
        requiresAnyPermission: [PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_MANAGE],
        rank: 85,
      },
      {
        id: "action:create-quote",
        group: "Acciones",
        icon: "📝",
        title: "Crear nueva cotización",
        subtitle: "Ventas → cotizaciones",
        href: getPanelUrl("ventas", "/cotizaciones?new=1"),
        requiresAnyPermission: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_MANAGE],
        rank: 80,
      },
      {
        id: "action:create-opportunity",
        group: "Acciones",
        icon: "🎯",
        title: "Crear oportunidad",
        subtitle: "Ventas → oportunidades",
        href: getPanelUrl("ventas", "/oportunidades?new=1"),
        requiresAnyPermission: [PERMISSIONS.SALES_MANAGE, PERMISSIONS.SALES_VIEW],
        rank: 75,
      },
      {
        id: "action:create-activity",
        group: "Acciones",
        icon: "✨",
        title: "Crear orden de trabajo",
        subtitle: "Operación → actividades",
        href: getPanelUrl("operacion", "/activities?new=1"),
        requiresAnyPermission: [PERMISSIONS.ACTIVITIES_MANAGE],
        rank: 75,
      },
      {
        id: "action:open-approvals",
        group: "Acciones",
        icon: "🛡️",
        title: "Mis aprobaciones pendientes",
        subtitle: "Console → workflow",
        href: getPanelUrl("console", "/approvals"),
        requiresAnyPermission: [PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.WORKFLOW_MANAGE, PERMISSIONS.CONSOLE_ADMIN],
        rank: 85,
      },
      {
        id: "action:open-architecture",
        group: "Acciones",
        icon: "🗺️",
        title: "Mapa de arquitectura del ERP",
        subtitle: "Console → architecture",
        href: getPanelUrl("console", "/architecture"),
        rank: 60,
      },
      {
        id: "action:open-stock",
        group: "Acciones",
        icon: "📦",
        title: "Ver stock por almacén",
        subtitle: "Console → stock",
        href: getPanelUrl("console", "/stock"),
        requiresAnyPermission: [PERMISSIONS.STOCK_VIEW, PERMISSIONS.WAREHOUSE_VIEW],
        rank: 70,
      },
      {
        id: "action:open-invoicing",
        group: "Acciones",
        icon: "🧾",
        title: "Generar factura CFDI",
        subtitle: "Contabilidad → facturación",
        href: getPanelUrl("contabilidad", "/invoicing"),
        requiresAnyPermission: [PERMISSIONS.INVOICING_MANAGE, PERMISSIONS.CONTABILIDAD_MANAGE],
        rank: 75,
      },
      {
        id: "action:my-activities",
        group: "Atajos",
        icon: "🎯",
        title: "Mis actividades de hoy",
        subtitle: "Operación → mis actividades",
        href: getPanelUrl("operacion", "/my-activities"),
        rank: 90,
      },
      {
        id: "action:my-viatics",
        group: "Atajos",
        icon: "💸",
        title: "Mis viáticos",
        subtitle: "Operación → mis viáticos",
        href: getPanelUrl("operacion", "/my-viatics"),
        rank: 50,
      },
      {
        id: "action:my-profile",
        group: "Atajos",
        icon: "👤",
        title: "Mi perfil",
        href: getPanelUrl("console", "/my-profile"),
        rank: 40,
      },
    ];

    items.push(...quickActions);

    // Filtrado por permisos
    return items.filter((item) => {
      if (!item.requiresAnyPermission) return true;
      if (user.isSuperAdmin) return true;
      return hasAnyPermission(user, item.requiresAnyPermission);
    });
  }, [user]);

  // Combina: server-side hits cuando hay query, base items siempre
  const items = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? baseItems.filter((item) => {
          const haystack = `${item.title} ${item.subtitle ?? ""}`.toLowerCase();
          return haystack.includes(q);
        })
      : baseItems;

    const hitItems: CommandItem[] = searchHits.map((hit) => {
      const factory = RESULT_URLS[hit.type];
      const route = factory ? factory(hit.id) : null;
      return {
        id: `hit:${hit.type}:${hit.id}`,
        group: "Resultados",
        icon: RESULT_ICONS[hit.type] || "📄",
        title: hit.title || `#${hit.id}`,
        subtitle: hit.subtitle || hit.type,
        href: route ? getPanelUrl(route.panel, route.path) : undefined,
        rank: 100,
      };
    });

    const combined = [...hitItems, ...filtered];
    combined.sort((a, b) => {
      if (a.group !== b.group) {
        const order = ["Resultados", "Acciones", "Atajos", "Módulos", "Paneles"];
        return order.indexOf(a.group) - order.indexOf(b.group);
      }
      return (b.rank ?? 0) - (a.rank ?? 0);
    });
    return combined.slice(0, 40);
  }, [baseItems, searchHits, query]);

  // Reset active index when items change
  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      onClose();
      if (item.onSelect) {
        item.onSelect();
        return;
      }
      if (!item.href) return;
      // Si es URL absoluta a otro subdominio, navegar con window
      if (/^https?:\/\//i.test(item.href)) {
        window.location.href = item.href;
      } else {
        router.push(item.href);
      }
    },
    [onClose, router],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((idx) => Math.min(items.length - 1, idx + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((idx) => Math.max(0, idx - 1));
      } else if (e.key === "Enter") {
        const item = items[activeIndex];
        if (item) {
          e.preventDefault();
          handleSelect(item);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, items, activeIndex, handleSelect, onClose]);

  // Scroll active item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLButtonElement>(`[data-cmd-idx="${activeIndex}"]`);
    if (node) node.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!open) return null;

  // Group items
  const groups: Record<string, CommandItem[]> = {};
  items.forEach((item) => {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  });
  let runningIdx = 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "8vh 16px 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(680px, 100%)",
          maxHeight: "75vh",
          background: "var(--bg-primary, #fff)",
          color: "var(--text-primary, #111)",
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.28), 0 8px 16px rgba(0,0,0,0.18)",
          border: "1px solid var(--border, #e5e7eb)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid var(--border, #e5e7eb)",
          }}
        >
          <span style={{ fontSize: 18 }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clientes, proyectos, módulos, atajos…"
            aria-label="Buscar en NEXARA"
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text-primary, #111)",
              fontSize: 16,
            }}
          />
          {searchLoading && (
            <span style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)" }}>buscando…</span>
          )}
          <kbd
            style={{
              fontSize: 10,
              padding: "3px 6px",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 4,
              color: "var(--text-secondary, #6b7280)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
            }}
          >
            ESC
          </kbd>
        </div>

        <div ref={listRef} style={{ overflow: "auto", padding: 8 }}>
          {items.length === 0 ? (
            <div style={{ padding: 36, textAlign: "center", color: "var(--text-secondary, #6b7280)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🤔</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Sin resultados</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Prueba con un nombre de cliente, número de factura o el nombre del módulo.
              </div>
            </div>
          ) : (
            Object.entries(groups).map(([group, groupItems]) => (
              <div key={group} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    color: "var(--text-secondary, #6b7280)",
                    padding: "8px 10px 4px",
                  }}
                >
                  {group}
                </div>
                {groupItems.map((item) => {
                  const idx = runningIdx++;
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-cmd-idx={idx}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        background: active ? `${accentColor}15` : "transparent",
                        border: active ? `1px solid ${accentColor}40` : "1px solid transparent",
                        borderRadius: 8,
                        cursor: "pointer",
                        marginBottom: 2,
                        color: "var(--text-primary, #111)",
                      }}
                    >
                      <span style={{ fontSize: 20, lineHeight: 1, marginTop: 1 }}>{item.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
                        {item.subtitle && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--text-secondary, #6b7280)",
                              marginTop: 2,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      {active && (
                        <kbd
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            border: `1px solid ${accentColor}`,
                            borderRadius: 4,
                            color: accentColor,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                          }}
                        >
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            padding: "8px 14px",
            borderTop: "1px solid var(--border, #e5e7eb)",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--text-secondary, #6b7280)",
            background: "var(--bg-secondary, #f9fafb)",
          }}
        >
          <span>
            <kbd style={kbdStyle}>↑↓</kbd> navegar · <kbd style={kbdStyle}>↵</kbd> abrir
          </span>
          <span>{items.length} resultado{items.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "2px 5px",
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 3,
  color: "var(--text-secondary, #6b7280)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
  margin: "0 2px",
};
