"use client";

/**
 * Organigrama: flowchart de quién reporta a quién (`GET users/orgchart`).
 *
 * Montado en `/erp/organigrama` (Core) y `/erp/hr/orgchart` (RH).
 * Reasignar jefe (✎) solo con `canEditOrg`; la API exige USERS_MANAGE / CONSOLE_ADMIN.
 * El subtítulo del nodo es `puesto`, no el nombre del rol RBAC.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { Tag } from "@/components/ui/DataTable";
import HrModuleRail from "@/components/hr/HrModuleRail";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import KpiCard from "@/components/ui/KpiCard";
import {
  type OrgChartNode,
  flattenOrgNodes,
  orgNodeSubtitle,
  maxOrgDepth,
  countWithManager,
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

const LINE = "color-mix(in srgb, var(--primary) 40%, var(--border))";

function Avatar({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
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
        width: 40,
        height: 40,
        borderRadius: "50%",
        flexShrink: 0,
        background: "color-mix(in srgb, var(--primary) 20%, var(--surface))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
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
}

function NodeCard({ node, allUsers, token, onRefresh, canEditOrg, isRoot }: NodeCardProps) {
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
        padding: "12px 14px",
        background: isRoot
          ? "color-mix(in srgb, var(--primary) 10%, transparent)"
          : "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 200,
        maxWidth: 260,
        boxShadow: "0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar url={node.avatarUrl} name={node.nombre} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {node.nombre}
          </div>
          {puesto ? (
            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
              {puesto}
            </div>
          ) : null}
        </div>
        {node.department && (
          <Tag variant={isRoot ? "accent" : "neutral"}>{node.department.nombre}</Tag>
        )}
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
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              color: "var(--text-tertiary)",
              padding: "4px 6px",
              flexShrink: 0,
              minHeight: 32,
            }}
          >
            ✎
          </button>
        )}
      </div>

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
}

/** Rama del flowchart: nodo + conectores SVG/CSS + hijos en fila. */
function TreeBranch({
  node,
  allUsers,
  token,
  onRefresh,
  canEditOrg,
  isRoot = false,
}: TreeBranchProps) {
  const kids = node.children ?? [];
  const hasKids = kids.length > 0;

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
      />

      {hasKids && (
        <>
          {/* Drop from parent to horizontal bar */}
          <div
            aria-hidden
            style={{ width: 2, height: 20, background: LINE, flexShrink: 0 }}
          />

          <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
            {/* Horizontal bar from first sibling center to last */}
            {kids.length > 1 && (
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
                }}
              />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                gap: 20,
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
                    style={{ width: 2, height: 20, background: LINE, flexShrink: 0 }}
                  />
                  <TreeBranch
                    node={child}
                    allUsers={allUsers}
                    token={token}
                    onRefresh={onRefresh}
                    canEditOrg={canEditOrg}
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
  const levels = useMemo(() => maxOrgDepth(roots), [roots]);

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

      {!loading && allUsers.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <KpiCard label="Total personas" value={allUsers.length} icon="👥" />
          <KpiCard
            label="Con manager"
            value={withManager}
            icon="🔗"
            variant={withManager === allUsers.length - roots.length ? "positive" : "warning"}
          />
          <KpiCard label="Sin manager" value={roots.length} icon="🏛️" variant="accent" hint="Raíces del org" />
          <KpiCard label="Niveles" value={levels} icon="📊" />
        </div>
      )}

      {!loading && allUsers.length > 1 && (() => {
        const byDept: Record<string, number> = {};
        for (const u of allUsers) {
          const dept = u.department?.nombre ?? "Sin área";
          byDept[dept] = (byDept[dept] ?? 0) + 1;
        }
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
          <div
            style={{
              marginBottom: 18,
              padding: "12px 16px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 10,
              }}
            >
              Por departamento
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(byDept)
                .sort((a, b) => b[1] - a[1])
                .map(([dept, count], i) => (
                  <div
                    key={dept}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px 1fr 36px",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {dept}
                    </span>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: "var(--surface)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${(count / total) * 100}%`,
                          background: colors[i % colors.length],
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-tertiary)",
                        textAlign: "right",
                      }}
                    >
                      {count}
                    </span>
                  </div>
                ))}
            </div>
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

      <Section title={loading ? "Cargando…" : `${allUsers.length} personas`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 14 }}>
            Cargando organigrama…
          </div>
        ) : roots.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 14 }}>
            No hay usuarios en la base de datos aún.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              padding: "28px 16px 40px",
              background:
                "radial-gradient(ellipse at top, color-mix(in srgb, var(--primary) 6%, transparent), transparent 55%)",
              borderRadius: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 36,
                minWidth: "min-content",
              }}
            >
              {roots.map((root) => (
                <TreeBranch
                  key={root.id}
                  node={root}
                  allUsers={allUsers}
                  token={token}
                  onRefresh={load}
                  canEditOrg={canEditOrg}
                  isRoot
                />
              ))}
            </div>
          </div>
        )}
      </Section>
    </>
  );
}
