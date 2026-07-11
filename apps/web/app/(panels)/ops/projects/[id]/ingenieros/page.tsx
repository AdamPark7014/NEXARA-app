"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useOpsProjectDetail } from "@/components/ops/OpsProjectDetailShell";
import { useUser } from "@/components/UserContext";
import { assignProjectEngineer, removeProjectEngineer } from "@/lib/ops-operational-api";
import { getActivitiesSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { DetailError } from "@/components/detail/DetailFrame";
import KpiCard from "@/components/ui/KpiCard";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

interface AssignableUser { id: number; nombre: string; }

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--foreground)", fontSize: 13,
};

export default function OpsProjectEngineersPage() {
  const { id, project, error, reload } = useOpsProjectDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const cfg = useMemo(() => getActivitiesSectionConfig(user), [user]);
  const canEdit = cfg.canCreate || user?.isSuperAdmin;

  const [engineers, setEngineers] = useState<AssignableUser[]>([]);
  const [pickId, setPickId] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoadingUsers(true);
    setUsersErr(null);
    try {
      const res = await fetch(buildApiUrl("users/assignable"), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      setEngineers(await res.json());
    } catch (e) {
      setEngineers([]);
      setUsersErr(e instanceof Error ? e.message : "No se pudieron cargar ingenieros");
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  useEffect(() => { if (canEdit) void loadUsers(); }, [canEdit, loadUsers]);

  const assigned = project?.engineers ?? [];
  const assignedIds = new Set(assigned.map((e) => e.engineer?.id ?? e.id));

  const assign = async () => {
    if (!token || !pickId) return;
    setBusy(true);
    setActionErr(null);
    try {
      await assignProjectEngineer(token, id, Number(pickId));
      setPickId("");
      reload();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Error al asignar");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (engineerId: number) => {
    if (!token) return;
    setConfirmState({ message: "¿Quitar este ingeniero del proyecto?", confirmLabel: "Quitar", fn: async () => {
    setBusy(true);
    setActionErr(null);
    try {
      await removeProjectEngineer(token, id, engineerId);
      reload();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Error al quitar ingeniero");
    } finally {
      setBusy(false);
    }
  } });
  };

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!project) return null;

  const available = engineers.filter((e) => !assignedIds.has(e.id));

  return (
    <>
    {assigned.length > 0 && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Asignados" value={assigned.length} icon="👷" variant="accent" />
        <KpiCard label="Disponibles" value={available.length} icon="👤" />
        <KpiCard label="Total equipo" value={assigned.length + available.length} icon="🏗️" />
      </div>
    )}
    {assigned.length > 0 && engineers.length > 0 && (() => {
      const total = engineers.length;
      return (
        <div style={{ marginBottom: 14, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Cobertura del equipo</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {([
              { label: "En proyecto", count: assigned.length, color: "var(--primary)" },
              { label: "Disponibles", count: available.length, color: "var(--success)" },
            ] as { label: string; count: number; color: string }[]).filter((r) => r.count > 0).map((r) => (
              <div key={r.label} style={{ display: "grid", gridTemplateColumns: "100px 1fr 36px", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(r.count / total) * 100}%`, background: r.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      );
    })()}
    <Section title={`${assigned.length} ingenieros asignados`}>
      {actionErr && (
        <p style={{ color: "var(--danger)", fontSize: 13, margin: "0 0 12px" }}>{actionErr}</p>
      )}

      {assigned.length === 0 ? (
        <EmptyState icon="👷" title="Sin ingenieros" description="Asigna ingenieros de campo a este proyecto." />
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 8 }}>
          {assigned.map((row) => {
            const engId = row.engineer?.id ?? row.id;
            const name = row.engineer?.nombre ?? `Ingeniero #${engId}`;
            return (
              <li key={engId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
                {canEdit && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(engId)}>Quitar</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Agregar ingeniero</span>
            <select value={pickId} onChange={(e) => setPickId(e.target.value)} style={inp} disabled={loadingUsers}>
              <option value="">— Seleccionar —</option>
              {engineers.filter((u) => !assignedIds.has(u.id)).map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </label>
          <Button variant="primary" disabled={busy || !pickId} onClick={() => void assign()}>Asignar</Button>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
        </div>
      )}
      {usersErr && (
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--danger)" }}>
          {usersErr}{" "}
          <button type="button" onClick={() => void loadUsers()} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}>
            Reintentar
          </button>
        </p>
      )}
    </Section>
    </>
  );
}
