"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import EmptyState from "@/components/ui/EmptyState";
import { Tag, Money } from "@/components/ui/DataTable";
import { listViaticsForActivity, type ViaticoRow } from "@/lib/ops-activities-api";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";

export default function ActivityViaticsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { id, activity, error, reload } = useActivityDetail();
  const [viatics, setViatics] = useState<ViaticoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viaticError, setViaticError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    setViaticError(null);
    void listViaticsForActivity(token, id)
      .then(setViatics)
      .catch((e) => setViaticError(e instanceof Error ? e.message : "No se pudieron cargar viáticos"))
      .finally(() => setLoading(false));
  }, [token, id, activity]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;
  if (viaticError) return <DetailError message={viaticError} onRetry={reload} />;

  return (
    <DetailSection title="Viáticos vinculados">
      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>Cargando viáticos…</div>
      ) : viatics.length === 0 ? (
        <EmptyState icon="💳" title="Sin viáticos" description="No hay solicitudes de viático asociadas a esta actividad." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {viatics.map((v) => (
            <li
              key={v.id}
              style={{
                padding: 14,
                borderRadius: 10,
                border: "1px solid var(--border)",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Viático #{v.id}</span>
                <Tag variant={v.estatus === "APROBADO" ? "positive" : v.estatus === "RECHAZADO" ? "danger" : "warning"}>
                  {v.estatus.replace(/_/g, " ")}
                </Tag>
              </div>
              <div style={{ fontSize: 13 }}>
                <Money value={Number(v.montoSolicitado)} />
                {v.motivo && <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>· {v.motivo}</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                {v.User?.nombre ?? "—"} · {formatDateTime(v.fechaSolicitud)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
