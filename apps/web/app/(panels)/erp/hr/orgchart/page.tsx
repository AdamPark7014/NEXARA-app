"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { Tag } from "@/components/ui/DataTable";
import HrModuleRail from "@/components/hr/HrModuleRail";
import { useUser } from "@/components/UserContext";
import { useHrManagementGuard } from "@/lib/useHrManagementGuard";
import { getHrSubmoduleConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import KpiCard from "@/components/ui/KpiCard";

interface OrgNode {
  id: number;
  nombre: string;
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

// Flatten tree to list for manager picker dropdown
function flatten(nodes: OrgNode[]): OrgNode[] {
  const out: OrgNode[] = [];
  function walk(n: OrgNode) {
    out.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return out;
}

function Avatar({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div
      style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: "color-mix(in srgb, var(--primary) 20%, var(--surface))",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, color: "var(--primary)",
      }}
    >
      {initials}
    </div>
  );
}

interface NodeProps {
  node: OrgNode;
  depth?: number;
  allUsers: OrgNode[];
  token: string;
  onRefresh: () => void;
  canEditOrg: boolean;
}

function Node({ node, depth = 0, allUsers, token, onRefresh, canEditOrg }: NodeProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [selectedManager, setSelectedManager] = useState<string>(
    node.managerId ? String(node.managerId) : ""
  );

  const saveManager = async () => {
    setSaving(true);
    try {
      const managerId = selectedManager ? parseInt(selectedManager) : null;
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

  // Exclude self and descendants from manager options to prevent cycles
  const descendants = new Set<number>();
  function collectDesc(n: OrgNode) {
    descendants.add(n.id);
    n.children.forEach(collectDesc);
  }
  collectDesc(node);
  const managerOptions = allUsers.filter(u => !descendants.has(u.id));

  return (
    <div style={{ paddingLeft: depth === 0 ? 0 : 20, position: "relative" }}>
      <div
        style={{
          padding: "10px 14px",
          background: depth === 0
            ? "color-mix(in srgb, var(--primary) 10%, transparent)"
            : "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "inline-flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 8,
          minWidth: 260,
          maxWidth: 320,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar url={node.avatarUrl} name={node.nombre} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {node.nombre}
            </div>
            {node.role && (
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
                {node.role.nombre}
              </div>
            )}
          </div>
          {node.department && (
            <Tag variant={depth === 0 ? "accent" : "neutral"}>{node.department.nombre}</Tag>
          )}
          {canEditOrg && (
            <button
              onClick={() => { setEditing(e => !e); setSelectedManager(node.managerId ? String(node.managerId) : ""); }}
              title="Editar manager"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-tertiary)", padding: "2px 4px", flexShrink: 0 }}
            >
              ✎
            </button>
          )}
        </div>

        {editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
            <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
              Manager / Reporta a:
            </label>
            <select
              value={selectedManager}
              onChange={e => setSelectedManager(e.target.value)}
              style={{
                fontSize: 12, border: "1px solid var(--border)", borderRadius: 6,
                padding: "4px 6px", background: "var(--surface)", color: "var(--foreground)",
              }}
            >
              <option value="">— Sin manager (raíz) —</option>
              {managerOptions.map(u => (
                <option key={u.id} value={u.id}>{u.nombre}{u.role ? ` · ${u.role.nombre}` : ""}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={saveManager}
                disabled={saving}
                style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                  background: "var(--primary)", color: "#fff", border: "none", fontWeight: 600,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                  background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <div
          style={{
            marginLeft: 14,
            borderLeft: "2px dashed var(--border)",
            paddingLeft: 14,
            marginTop: 4,
          }}
        >
          {node.children.map(c => (
            <Node key={c.id} node={c} depth={depth + 1} allUsers={allUsers} token={token} onRefresh={onRefresh} canEditOrg={canEditOrg} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const { user } = useUser();
  const cfg = useHrManagementGuard();
  const viewCfg = useMemo(() => getHrSubmoduleConfig(user, "orgchart"), [user]);
  const token = user?.token ?? "";

  const [roots, setRoots]     = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

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

  useEffect(() => { load(); }, [load]);

  const allUsers = flatten(roots);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title={viewCfg.title}
        subtitle={cfg.canAssign
          ? `${viewCfg.subtitle} Haz clic en ✎ en cualquier nodo para reasignar su manager.`
          : `${viewCfg.subtitle} Solo Dirección puede reasignar managers.`}
      />

      <HrModuleRail />

      {!loading && allUsers.length > 0 && (() => {
        const withManager = allUsers.filter((u) => !!u.managerId).length;
        const rootCount = roots.length;
        const maxDepth = (function calcDepth(nodes: OrgNode[], d: number): number {
          if (!nodes.length) return d;
          return Math.max(...nodes.map((n) => calcDepth(n.children ?? [], d + 1)));
        })(roots, 0);
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 18 }}>
            <KpiCard label="Total personas" value={allUsers.length} icon="👥" />
            <KpiCard label="Con manager" value={withManager} icon="🔗" variant={withManager === allUsers.length - rootCount ? "positive" : "warning"} />
            <KpiCard label="Sin manager" value={rootCount} icon="🏛️" variant="accent" hint="Raíces del org" />
            <KpiCard label="Niveles" value={maxDepth} icon="📊" />
          </div>
        );
      })()}

      {!loading && allUsers.length > 1 && (() => {
        const byDept: Record<string, number> = {};
        for (const u of allUsers) {
          const dept = u.department?.nombre ?? "Sin área";
          byDept[dept] = (byDept[dept] ?? 0) + 1;
        }
        const total = allUsers.length;
        const colors = ["var(--primary)", "var(--success)", "var(--warning)", "#a855f7", "#0ea5e9", "#f59e0b", "var(--danger)"];
        return (
          <div style={{ marginBottom: 18, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Por departamento</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([dept, count], i) => (
                <div key={dept} style={{ display: "grid", gridTemplateColumns: "120px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dept}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / total) * 100}%`, background: colors[i % colors.length], borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {error && (
        <div style={{
          padding: 12, borderRadius: 10, marginBottom: 12,
          background: "color-mix(in srgb, var(--danger) 10%, transparent)",
          color: "var(--danger)", fontSize: 13,
        }}>
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
          <div style={{ overflowX: "auto", paddingBottom: 8 }}>
            {roots.map(root => (
              <Node
                key={root.id}
                node={root}
                allUsers={allUsers}
                token={token}
                onRefresh={load}
                canEditOrg={cfg.canAssign}
              />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
