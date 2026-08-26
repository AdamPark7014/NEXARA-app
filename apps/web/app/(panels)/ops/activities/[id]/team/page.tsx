"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { listActivityTeam, type ActivityTeamMember } from "@/lib/ops-activities-api";

export default function ActivityTeamPage() {
  const { activity, error, reload } = useActivityDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const [team, setTeam] = useState<ActivityTeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !activity?.id) return;
    setLoading(true);
    try {
      const rows = await listActivityTeam(token, activity.id);
      setTeam(Array.isArray(rows) ? rows : []);
    } catch {
      setTeam([]);
    } finally {
      setLoading(false);
    }
  }, [token, activity?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  return (
    <DetailSection title="Equipo asignado">
      <div style={{ marginBottom: 12, fontSize: 12.5, color: "var(--text-secondary)" }}>
        Responsable principal: <strong>{activity.responsable?.nombre ?? "—"}</strong>
      </div>

      {loading && <EmptyState icon="⏳" title="Cargando equipo…" description="" />}
      {!loading && team.length === 0 && (
        <EmptyState
          icon="👥"
          title="Sin equipo adicional"
          description="Solo el responsable principal está asignado a esta actividad."
        />
      )}

      {!loading && team.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {team.map((m) => (
            <li
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--surface)",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{m.user?.nombre ?? "Técnico"}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {m.user?.email}
                </div>
              </div>
              <Tag variant="neutral">{m.rol ?? "TECNICO"}</Tag>
              {m.horasPlan != null && (
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                  {m.horasReales ?? 0}h / {m.horasPlan}h plan
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 16 }}>
        <Button size="sm" variant="ghost" onClick={() => void load()}>Actualizar</Button>
      </div>
    </DetailSection>
  );
}
