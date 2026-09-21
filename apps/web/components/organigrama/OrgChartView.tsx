"use client";

/**
 * Organigrama: flowchart de quién reporta a quién (`GET users/orgchart`).
 *
 * Montado en `/erp/organigrama` (Core) y `/erp/hr/orgchart` (RH).
 * Reasignar jefe (✎) solo con `canEditOrg`; la API exige USERS_MANAGE / CONSOLE_ADMIN.
 * El subtítulo del nodo es `puesto`, no el nombre del rol RBAC.
 */
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { Tag } from "@/components/ui/DataTable";
import HrModuleRail from "@/components/hr/HrModuleRail";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import MetricStrip from "@/components/ui/MetricStrip";
import {
  type OrgChartNode,
  flattenOrgNodes,
  orgNodeSubtitle,
  maxOrgDepth,
  countWithManager,
  countWithoutManager,
  countOrphanRoots,
} from "@/lib/orgchart-layout";

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const LINE = "color-mix(in srgb, var(--primary) 55%, var(--border))";
/** Ancho de la tarjeta de persona; la maquetacion del arbol depende de el. */
const ANCHO_TARJETA = 168;
/** Hermanos por renglon antes de envolver: mas de esto estira el arbol a lo ancho. */
const MAX_POR_FILA = 4;
const ZOOM_MIN = 0.3;
/**
 * Suelo del ajuste automático. Por debajo los nombres dejan de leerse, así que
 * más vale que la página se desplace a que el organigrama salga ilegible; a
 * mano se puede bajar hasta `ZOOM_MIN`.
 */
const ZOOM_LEGIBLE = 0.45;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

function norm(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function Avatar({ url, name }: { url?: string | null; name: string }) {
  const src = url ? resolveAssetUrl(url) : "";
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        flexShrink: 0,
        background: "color-mix(in srgb, var(--primary) 20%, var(--surface))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        color: "var(--primary)",
      }}
    >
      {initials}
    </div>
  );
}

interface NodeCardProps {
  node: OrgChartNode;
  allUsers: OrgChartNode[];
  token: string;
  onRefresh: () => void;
  canEditOrg: boolean;
  isRoot?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
}

function NodeCard({
  node,
  allUsers,
  token,
  onRefresh,
  canEditOrg,
  isRoot,
  dimmed,
  highlighted,
}: NodeCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [selectedManager, setSelectedManager] = useState(
    node.managerId ? String(node.managerId) : "",
  );

  const saveManager = async () => {
    setSaving(true);
    setSaveErr(null);
    try {
      const managerId = selectedManager ? parseInt(selectedManager, 10) : null;
      await apiFetch(`users/${node.id}/manager`, token, {
        method: "PATCH",
        body: JSON.stringify({ managerId }),
      });
      setEditing(false);
      onRefresh();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const descendants = new Set<number>();
  function collectDesc(n: OrgChartNode) {
    descendants.add(n.id);
    n.children.forEach(collectDesc);
  }
  collectDesc(node);
  const managerOptions = allUsers.filter((u) => !descendants.has(u.id));
  const puesto = orgNodeSubtitle(node);

  return (
    <div
      style={{
        position: "relative",
        padding: "8px 10px",
        paddingRight: canEditOrg ? 32 : 10,
        background: isRoot
          ? "color-mix(in srgb, var(--primary) 10%, transparent)"
          : "var(--surface)",
        border: highlighted
          ? "2px solid var(--primary)"
          : "1px solid var(--border)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 5,
        // Tarjeta mas angosta: con 16 personas, a 204px el arbol medía 3,650px
        // y para caber en pantalla habia que encogerlo al 40 %, donde el nombre
        // ya no se lee. Quitando ancho a la tarjeta, cabe al ~50 %: se gana
        // legibilidad sin quitar informacion.
        minWidth: 164,
        width: 168,
        boxShadow: highlighted
          ? "0 0 0 3px color-mix(in srgb, var(--primary) 28%, transparent)"
          : "0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent)",
        opacity: dimmed ? 0.28 : 1,
        pointerEvents: dimmed ? "none" : "auto",
        transition: "opacity 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
      }}
    >
      {canEditOrg && (
        <button
          type="button"
          onClick={() => {
            setEditing((e) => !e);
            setSelectedManager(node.managerId ? String(node.managerId) : "");
            setSaveErr(null);
          }}
          title="Editar jefe"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            color: "var(--text-tertiary)",
            padding: "4px 6px",
            flexShrink: 0,
            minHeight: 28,
            lineHeight: 1,
          }}
        >
          ✎
        </button>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <Avatar url={node.avatarUrl} name={node.nombre} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 12.5,
              lineHeight: 1.3,
              wordBreak: "break-word",
              color: highlighted ? "var(--primary)" : undefined,
            }}
          >
            {node.nombre}
          </div>
          {puesto ? (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                marginTop: 2,
                lineHeight: 1.3,
                wordBreak: "break-word",
              }}
            >
              {puesto}
            </div>
          ) : null}
        </div>
      </div>
      {node.department && (
        <div>
          <Tag variant={isRoot ? "accent" : "neutral"} size="sm">
            {node.department.nombre}
          </Tag>
        </div>
      )}

      {editing && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            paddingTop: 6,
            borderTop: "1px solid var(--border)",
          }}
        >
          <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
            Reporta a:
          </label>
          <select
            value={selectedManager}
            onChange={(e) => setSelectedManager(e.target.value)}
            style={{
              fontSize: 12,
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 8px",
              background: "var(--surface)",
              color: "var(--foreground)",
            }}
          >
            <option value="">— Sin jefe (raíz) —</option>
            {managerOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
                {orgNodeSubtitle(u) ? ` · ${orgNodeSubtitle(u)}` : u.role ? ` · ${u.role.nombre}` : ""}
              </option>
            ))}
          </select>
          {saveErr && (
            <div style={{ fontSize: 11, color: "var(--danger)" }}>{saveErr}</div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => void saveManager()}
              disabled={saving}
              style={{
                fontSize: 11,
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
                background: "var(--primary)",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                opacity: saving ? 0.6 : 1,
                minHeight: 32,
              }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                fontSize: 11,
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
                background: "var(--surface-2)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                minHeight: 32,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface TreeBranchProps {
  node: OrgChartNode;
  allUsers: OrgChartNode[];
  token: string;
  onRefresh: () => void;
  canEditOrg: boolean;
  isRoot?: boolean;
  matchIds: Set<number> | null;
  hasActiveFilter: boolean;
}

/** Rama del flowchart: nodo + conectores SVG/CSS + hijos en fila. */
function TreeBranch({
  node,
  allUsers,
  token,
  onRefresh,
  canEditOrg,
  isRoot = false,
  matchIds,
  hasActiveFilter,
}: TreeBranchProps) {
  const kids = node.children ?? [];
  const hasKids = kids.length > 0;
  /** Con muchos hermanos se cambia ancho por alto. */
  const envuelve = kids.length > MAX_POR_FILA;
  const isMatch = !hasActiveFilter || (matchIds?.has(node.id) ?? true);
  const highlighted = hasActiveFilter && (matchIds?.has(node.id) ?? false);
  const dimmed = hasActiveFilter && !isMatch;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
    >
      <NodeCard
        node={node}
        allUsers={allUsers}
        token={token}
        onRefresh={onRefresh}
        canEditOrg={canEditOrg}
        isRoot={isRoot}
        dimmed={dimmed}
        highlighted={highlighted}
      />

      {hasKids && (
        <>
          {/* Drop from parent to horizontal bar */}
          <div
            aria-hidden
            style={{ width: 2, height: 18, background: LINE, flexShrink: 0, borderRadius: 1 }}
          />

          <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
            {/* Barra horizontal del primer hermano al ultimo. Solo tiene sentido
                cuando van en una sola fila: al envolver, cada hijo se enlaza con
                su propio tramo vertical y una barra larga cruzaria por encima de
                la segunda fila. */}
            {kids.length > 1 && !envuelve && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  left: `calc(100% / ${kids.length * 2})`,
                  right: `calc(100% / ${kids.length * 2})`,
                  height: 2,
                  background: LINE,
                  pointerEvents: "none",
                  borderRadius: 1,
                }}
              />
            )}

            <div
              style={{
                display: "flex",
                flexWrap: envuelve ? "wrap" : "nowrap",
                justifyContent: "center",
                alignItems: "flex-start",
                gap: 16,
                rowGap: 18,
                // Con muchos hermanos, una sola fila estira el arbol a lo ancho
                // y obliga a encogerlo hasta que no se lee. Se cambia ancho por
                // alto: cuatro por renglon.
                maxWidth: envuelve ? MAX_POR_FILA * (ANCHO_TARJETA + 16) : undefined,
              }}
            >
              {kids.map((child) => (
                <div
                  key={child.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <div
                    aria-hidden
                    style={{ width: 2, height: 18, background: LINE, flexShrink: 0, borderRadius: 1 }}
                  />
                  <TreeBranch
                    node={child}
                    allUsers={allUsers}
                    token={token}
                    onRefresh={onRefresh}
                    canEditOrg={canEditOrg}
                    matchIds={matchIds}
                    hasActiveFilter={hasActiveFilter}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export type OrgChartViewProps = {
  /** Muestra ✎ para reasignar jefe: RH y dirección (`getHrSectionConfig(user).canAssign`). */
  canEditOrg: boolean;
  eyebrow: string;
  /** Carril de RH (plantilla, incidencias, KPIs): solo dentro de `/erp/hr`. */
  showHrRail?: boolean;
};

const TITULO = "Organigrama";
const SUBTITULO = "Jerarquía corporativa y líneas de reporte.";

const zoomBtnStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  minWidth: 36,
  minHeight: 36,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--foreground)",
  cursor: "pointer",
  lineHeight: 1,
};

const chipStyle = (active: boolean): CSSProperties => ({
  fontSize: 12,
  fontWeight: active ? 700 : 500,
  padding: "6px 12px",
  borderRadius: 999,
  border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)",
  background: active
    ? "color-mix(in srgb, var(--primary) 14%, var(--surface))"
    : "var(--surface)",
  color: active ? "var(--primary)" : "var(--text-secondary)",
  cursor: "pointer",
  minHeight: 32,
  lineHeight: 1.2,
});

export default function OrgChartView({
  canEditOrg,
  eyebrow,
  showHrRail = false,
}: OrgChartViewProps) {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [roots, setRoots] = useState<OrgChartNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  /** Ancho natural del arbol, para poder ajustarlo al hueco disponible. */
  const contentRef = useRef<HTMLDivElement>(null);
  /**
   * Tamaño real del arbol sin escalar. Hace falta guardarlo porque `scale()`
   * encoge el DIBUJO pero no la CAJA: sin esto el arbol se veia pequeño y
   * arrinconado dentro de un hueco enorme, y la barra de desplazamiento seguia
   * ahi aunque ya cupiera entero.
   */
  const [tamanoNatural, setTamanoNatural] = useState<{ w: number; h: number } | null>(null);
  /** Mientras nadie toque el zoom a mano, el arbol se reajusta solo al cambiar el ancho. */
  const zoomManual = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("users/orgchart", token);
      setRoots(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const allUsers = useMemo(() => flattenOrgNodes(roots), [roots]);
  const withManager = useMemo(() => countWithManager(roots), [roots]);
  const withoutManager = useMemo(() => countWithoutManager(roots), [roots]);
  const orphanRoots = useMemo(() => countOrphanRoots(roots), [roots]);
  const levels = useMemo(() => maxOrgDepth(roots), [roots]);
  const trueRoots = useMemo(() => roots.filter((r) => r.managerId == null), [roots]);
  const danglingRoots = useMemo(() => roots.filter((r) => r.managerId != null), [roots]);

  const byDept = useMemo(() => {
    const map: Record<string, number> = {};
    for (const u of allUsers) {
      const dept = u.department?.nombre ?? "Sin área";
      map[dept] = (map[dept] ?? 0) + 1;
    }
    return map;
  }, [allUsers]);

  const deptEntries = useMemo(
    () => Object.entries(byDept).sort((a, b) => b[1] - a[1]),
    [byDept],
  );

  const q = norm(searchQuery);
  const hasSearch = q.length > 0;
  const hasDept = selectedDept != null;
  const hasActiveFilter = hasSearch || hasDept;

  const matchIds = useMemo(() => {
    if (!hasActiveFilter) return null;
    const ids = new Set<number>();
    for (const u of allUsers) {
      const deptName = u.department?.nombre ?? "Sin área";
      if (hasDept && deptName !== selectedDept) continue;
      if (hasSearch) {
        const hay = `${norm(u.nombre)} ${norm(orgNodeSubtitle(u) ?? "")}`;
        if (!hay.includes(q)) continue;
      }
      ids.add(u.id);
    }
    return ids;
  }, [allUsers, hasActiveFilter, hasDept, hasSearch, q, selectedDept]);

  /**
   * Ajusta el arbol al ancho disponible.
   *
   * Arrancaba siempre al 100 %, asi que con 16 personas el organigrama salia
   * cortado y habia que arrastrarlo de lado para verlo entero — justo lo que no
   * debe pasar en una vista cuyo unico trabajo es enseñar la estructura de un
   * vistazo. `scale()` no cambia el tamaño de caja, asi que `scrollWidth` del
   * contenido sigue siendo el ancho natural aunque ya este escalado.
   *
   * Nunca amplia por encima del 100 %: un organigrama de tres personas se ve
   * raro estirado a pantalla completa.
   */
  const ajustarAlAncho = useCallback(() => {
    const caja = canvasRef.current;
    const contenido = contentRef.current;
    if (!caja || !contenido) return;
    const anchoNatural = contenido.scrollWidth;
    const altoNatural = contenido.scrollHeight;
    if (anchoNatural <= 0) return;
    setTamanoNatural({ w: anchoNatural, h: altoNatural });

    // Se ajusta a las DOS medidas. Mirar solo el ancho hacía que el árbol
    // entrara de lado y se cortara por abajo: con 16 personas quedaban tres
    // tarjetas partidas por la mitad contra el borde de la caja.
    const anchoDisponible = caja.clientWidth - 24; // relleno lateral del lienzo
    const altoDisponible = Math.max(
      360,
      (typeof window !== "undefined" ? window.innerHeight : 900) - caja.getBoundingClientRect().top - 48,
    );
    const factor = Math.min(1, anchoDisponible / anchoNatural, altoDisponible / Math.max(1, altoNatural));
    setZoom(Math.max(ZOOM_LEGIBLE, Math.round(factor * 100) / 100));
    caja.scrollLeft = 0;
    caja.scrollTop = 0;
  }, []);

  /** Al entrar y al cambiar el ancho, si nadie toco el zoom a mano. */
  useEffect(() => {
    const caja = canvasRef.current;
    if (!caja || typeof ResizeObserver === "undefined") return;
    const reajustar = () => {
      if (!zoomManual.current) ajustarAlAncho();
    };
    reajustar();
    const observador = new ResizeObserver(reajustar);
    observador.observe(caja);
    return () => observador.disconnect();
  }, [ajustarAlAncho, roots, selectedDept, searchQuery]);

  const bumpZoom = (delta: number) => {
    zoomManual.current = true;
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 10) / 10)));
  };

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("button, a, input, select, textarea, label")) return;
    const el = canvasRef.current;
    if (!el) return;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      sl: el.scrollLeft,
      st: el.scrollTop,
    };
    setPanning(true);
    el.setPointerCapture(e.pointerId);
  };

  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = canvasRef.current;
    if (!drag || !el) return;
    el.scrollLeft = drag.sl - (e.clientX - drag.x);
    el.scrollTop = drag.st - (e.clientY - drag.y);
  };

  const onCanvasPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setPanning(false);
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={TITULO}
        subtitle={
          canEditOrg
            ? `${SUBTITULO} Haz clic en ✎ en cualquier nodo para reasignar su jefe.`
            : `${SUBTITULO} Solo RH y Dirección pueden reasignar jefes.`
        }
      />

      {showHrRail && <HrModuleRail />}

      {!loading && allUsers.length > 0 && (() => {
        const total = allUsers.length;
        const colors = [
          "var(--primary)",
          "var(--success)",
          "var(--warning)",
          "#a855f7",
          "#0ea5e9",
          "#f59e0b",
          "var(--danger)",
        ];
        return (
          <div style={{ marginBottom: 10 }}>
            <div
              style={{ marginBottom: allUsers.length > 1 ? 8 : 0 }}
            >
              <MetricStrip
                ariaLabel="Resumen del organigrama"
                metrics={[
                  { label: "Personas", value: allUsers.length },
                  { label: "Con jefe", value: withManager },
                  {
                    label: "Sin jefe",
                    value: withoutManager,
                    hint: orphanRoots > 0 ? `${orphanRoots} con jefe inválido` : "raíces",
                    tone: orphanRoots > 0 ? "warning" : "default",
                  },
                  { label: "Niveles", value: levels },
                ]}
              />
            </div>

            {allUsers.length > 1 && (
              <div
                style={{
                  padding: "8px 12px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                  }}
                >
                  Por departamento
                </div>
                <div
                  style={{
                    display: "flex",
                    height: 10,
                    borderRadius: 5,
                    overflow: "hidden",
                    background: "var(--surface)",
                    marginBottom: 8,
                  }}
                  title="Distribución por departamento"
                >
                  {deptEntries.map(([dept, count], i) => (
                    <div
                      key={dept}
                      title={`${dept}: ${count}`}
                      style={{
                        width: `${(count / total) * 100}%`,
                        background: colors[i % colors.length],
                        minWidth: count > 0 ? 2 : 0,
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px 10px",
                    alignItems: "center",
                  }}
                >
                  {deptEntries.map(([dept, count], i) => (
                    <span
                      key={dept}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                        lineHeight: 1.2,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: colors[i % colors.length],
                          flexShrink: 0,
                        }}
                      />
                      {dept}
                      <span style={{ color: "var(--text-tertiary)", fontWeight: 600 }}>{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            marginBottom: 12,
            background: "color-mix(in srgb, var(--danger) 10%, transparent)",
            color: "var(--danger)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${allUsers.length} personas`} dense>
        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 14 }}>
            Cargando organigrama…
          </div>
        ) : roots.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-tertiary)", fontSize: 14 }}>
            No hay usuarios en la base de datos aún.
          </div>
        ) : (
          <>
            {/* Toolbar: search + zoom + dept chips */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar persona o puesto…"
                  aria-label="Buscar persona o puesto"
                  style={{
                    flex: "1 1 200px",
                    minWidth: 160,
                    maxWidth: 360,
                    fontSize: 16,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--foreground)",
                    minHeight: 36,
                  }}
                />
                <div
                  role="group"
                  aria-label="Zoom"
                  style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
                >
                  <button
                    type="button"
                    style={zoomBtnStyle}
                    onClick={() => bumpZoom(-ZOOM_STEP)}
                    disabled={zoom <= ZOOM_MIN}
                    title="Alejar"
                    aria-label="Alejar"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    style={{ ...zoomBtnStyle, minWidth: 52, fontWeight: 600, fontSize: 12 }}
                    onClick={() => {
                      zoomManual.current = false;
                      ajustarAlAncho();
                    }}
                    title="Ajustar el organigrama al ancho de la pantalla"
                    aria-label="Zoom 100%"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    style={zoomBtnStyle}
                    onClick={() => bumpZoom(ZOOM_STEP)}
                    disabled={zoom >= ZOOM_MAX}
                    title="Acercar"
                    aria-label="Acercar"
                  >
                    +
                  </button>
                </div>
                {hasActiveFilter && (
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {matchIds?.size ?? 0} coincidencia{(matchIds?.size ?? 0) === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {deptEntries.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginRight: 2,
                    }}
                  >
                    Área
                  </span>
                  <button
                    type="button"
                    style={chipStyle(selectedDept === null)}
                    onClick={() => setSelectedDept(null)}
                  >
                    Todas
                  </button>
                  {deptEntries.map(([dept, count]) => (
                    <button
                      key={dept}
                      type="button"
                      style={chipStyle(selectedDept === dept)}
                      onClick={() =>
                        setSelectedDept((cur) => (cur === dept ? null : dept))
                      }
                    >
                      {dept}
                      <span
                        style={{
                          marginLeft: 6,
                          opacity: 0.7,
                          fontWeight: 600,
                          fontSize: 11,
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              ref={canvasRef}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerUp}
              style={{
                // Sin `maxHeight`: la caja crece con el árbol ya escalado. Antes
                // recortaba a 70vh y desplazaba por dentro, que es lo que
                // rebanaba las tarjetas de la última fila. Si el árbol no cabe,
                // se desplaza la página entera y ninguna tarjeta queda a medias.
                overflowX: "auto",
                overflowY: "hidden",
                padding: "16px 12px 24px",
                background:
                  "radial-gradient(ellipse at top, color-mix(in srgb, var(--primary) 6%, transparent), transparent 55%)",
                borderRadius: 12,
                cursor: panning ? "grabbing" : "grab",
                userSelect: panning ? "none" : undefined,
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  // La caja ocupa el tamaño YA ESCALADO, para que el hueco
                  // sobrante desaparezca y la barra de desplazamiento solo
                  // aparezca cuando de verdad no cabe.
                  width: tamanoNatural ? tamanoNatural.w * zoom : "100%",
                  height: tamanoNatural ? tamanoNatural.h * zoom : undefined,
                  margin: "0 auto",
                  position: "relative",
                }}
              >
                <div
                  ref={contentRef}
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    position: tamanoNatural ? "absolute" : "relative",
                    top: 0,
                    left: 0,
                    // Sin esto se muerde la cola: al estar posicionado, su ancho
                    // lo marcaria el padre, y el ancho del padre sale de medirlo
                    // a el. `max-content` lo ata a su propio contenido.
                    width: tamanoNatural ? "max-content" : undefined,
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 16,
                    minWidth: "min-content",
                  }}
                >
                  {trueRoots.map((root) => (
                    <TreeBranch
                      key={root.id}
                      node={root}
                      allUsers={allUsers}
                      token={token}
                      onRefresh={load}
                      canEditOrg={canEditOrg}
                      isRoot
                      matchIds={matchIds}
                      hasActiveFilter={hasActiveFilter}
                    />
                  ))}
                </div>

                {danglingRoots.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--warning)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 8,
                        textAlign: "center",
                      }}
                    >
                      Sin línea de reporte válida ({danglingRoots.length})
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "center",
                        gap: 12,
                        minWidth: "min-content",
                      }}
                    >
                      {danglingRoots.map((root) => (
                        <TreeBranch
                          key={root.id}
                          node={root}
                          allUsers={allUsers}
                          token={token}
                          onRefresh={load}
                          canEditOrg={canEditOrg}
                          isRoot
                          matchIds={matchIds}
                          hasActiveFilter={hasActiveFilter}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </Section>
    </>
  );
}
