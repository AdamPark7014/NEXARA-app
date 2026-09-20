"use client";

/**
 * Organigrama: diagrama de flujo (nodos + conectores) de quién reporta a quién.
 * `GET users/orgchart` — muestra `puesto` (no el nombre del rol RBAC).
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { Tag } from "@/components/ui/DataTable";
import HrModuleRail from "@/components/hr/HrModuleRail";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import KpiCard from "@/components/ui/KpiCard";

interface OrgNode {
  id: number;
  nombre: string;
  puesto?: string | null;
  avatarUrl?: string | null;
  managerId?: number | null;
  role?: { id: number; nombre: string } | null;
  department?: { id: number; nombre: string } | null;
  children: OrgNode[];
}

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

function flatten(nodes: OrgNode[]): OrgNode[] {
  const out: OrgNode[] = [];
  function walk(n: OrgNode) {
    out.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return out;
}

function Avatar({ url, name, size = 44 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: "color-mix(in srgb, var(--primary) 22%, var(--surface))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.32,
        fontWeight: 700,
        color: "var(--primary)",
      }}
    >
      {initials}
    </div>
  );
}

interface NodeCardProps {
  node: OrgNode;
  allUsers: OrgNode[];
  token: string;
  onRefresh: () => void;
  canEditOrg: boolean;
  isRoot?: boolean;
}

function NodeCard({ node, allUsers, token, onRefresh, canEditOrg, isRoot }: NodeCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [selectedManager, setSelectedManager] = useState(node.managerId ? String(node.managerId) : "");

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
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const descendants = new Set<number>();
  function collectDesc(n: OrgNode) {
    descendants.add(n.id);
    n.children.forEach(collectDesc);
  }
  collectDesc(node);
  const managerOptions = allUsers.filter((u) => !descendants.has(u.id));
  const titulo = node.puesto?.trim() || node.role?.nombre || "Sin puesto";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
        minWidth: 200,
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          background: isRoot
            ? "linear-gradient(160deg, color-mix(in srgb, var(--primary) 14%, var(--surface)), var(--surface))"
            : "var(--surface)",
          border: isRoot ? "2px solid var(--primary)" : "1px solid var(--border)",
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minWidth: 200,
          maxWidth: 240,
          boxShadow: "0 8px 24px color-mix(in srgb, var(--foreground) 6%, transparent)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar url={node.avatarUrl} name={node.nombre} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 750,
                fontSize: 13.5,
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={node.nombre}
            >
              {node.nombre}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--primary)",
                marginTop: 2,
                lineHeight: 1.3,
              }}
            >
              {titulo}
            </div>
          </div>
          {canEditOrg && (
            <button
              type="button"
              onClick={() => {
                setEditing((e) => !e);
                setSelectedManager(node.managerId ? String(node.managerId) : "");
              }}
              title="Editar jefe"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                color: "var(--text-tertiary)",
                padding: 4,
              }}
            >
              ✎
            </button>
          )}
        </div>
        {node.department && (
          <Tag variant={isRoot ? "accent" : "neutral"}>{node.department.nombre}</Tag>
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
              Reporta a
            </label>
            <select
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              style={{
                fontSize: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "6px 8px",
                background: "var(--surface)",
                color: "var(--foreground)",
              }}
            >
              <option value="">— Sin jefe (raíz) —</option>
              {managerOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                  {u.puesto ? ` · ${u.puesto}` : ""}
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
                  borderRadius: 8,
                  cursor: "pointer",
                  background: "var(--primary)",
                  color: "#fff",
                  border: "none",
                  fontWeight: 650,
                  opacity: saving ? 0.6 : 1,
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
                  borderRadius: 8,
                  cursor: "pointer",
                  background: "var(--surface-2)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <>
          <div
            aria-hidden
            style={{
              width: 2,
              height: 18,
              background: "color-mix(in srgb, var(--primary) 45%, var(--border))",
            }}
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 20,
              paddingTop: 0,
              position: "relative",
            }}
          >
            {node.children.length > 1 && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  left: "10%",
                  right: "10%",
                  height: 2,
                  background: "color-mix(in srgb, var(--primary) 35%, var(--border))",
                }}
              />
            )}
            {node.children.map((c) => (
              <div key={c.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div
                  aria-hidden
                  style={{
                    width: 2,
                    height: 14,
                    background: "color-mix(in srgb, var(--primary) 45%, var(--border))",
                  }}
                />
                <NodeCard
                  node={c}
                  allUsers={allUsers}
                  token={token}
                  onRefresh={onRefresh}
                  canEditOrg={canEditOrg}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export type OrgChartViewProps = {
  canEditOrg: boolean;
  eyebrow: string;
  showHrRail?: boolean;
};

const TITULO = "Organigrama";
const SUBTITULO = "Jerarquía corporativa y líneas de reporte.";

export default function OrgChartView({ canEditOrg, eyebrow, showHrRail = false }: OrgChartViewProps) {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [roots, setRoots] = useState<OrgNode[]>([]);
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

  const allUsers = useMemo(() => flatten(roots), [roots]);

  const maxDepth = useMemo(() => {
    function calc(nodes: OrgNode[], d: number): number {
      if (!nodes.length) return d;
      return Math.max(...nodes.map((n) => calc(n.children, d + 1)));
    }
    return calc(roots, 0);
  }, [roots]);

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={TITULO}
        subtitle={
          canEditOrg
            ? `${SUBTITULO} Haz clic en ✎ para reasignar el jefe.`
            : `${SUBTITULO} Solo RH y Dirección pueden reasignar jefes.`
        }
      />

      {showHrRail && <HrModuleRail />}

      {!loading && allUsers.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <KpiCard label="Personas" value={String(allUsers.length)} />
          <KpiCard label="Raíces" value={String(roots.length)} />
          <KpiCard label="Con jefe" value={String(allUsers.filter((u) => !!u.managerId).length)} />
          <KpiCard label="Niveles" value={String(maxDepth)} />
        </div>
      )}

      <Section title="Diagrama">
        {loading && <p style={{ color: "var(--text-secondary)" }}>Cargando organigrama…</p>}
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        {!loading && !error && roots.length === 0 && (
          <p style={{ color: "var(--text-secondary)" }}>No hay personas activas para mostrar.</p>
        )}
        {!loading && !error && roots.length > 0 && (
          <div
            style={{
              overflowX: "auto",
              padding: "24px 12px 40px",
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
                gap: 28,
                minWidth: "min-content",
              }}
            >
              {roots.map((r) => (
                <NodeCard
                  key={r.id}
                  node={r}
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
