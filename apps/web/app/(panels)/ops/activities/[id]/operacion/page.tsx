"use client";

import Link from "next/link";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { openExternalUrl } from "@/lib/open-external-url";

function mapsUrl(lat?: number | string | null, lng?: number | string | null) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return `https://www.google.com/maps?q=${a},${b}`;
}

export default function ActivityOperacionPage() {
  const { activity, error, reload } = useActivityDetail();
  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const due = activity.fechaEntregaEsperada ?? activity.fechaMaxima;
  const dueDate = due ? new Date(due) : null;
  const overdue =
    dueDate &&
    dueDate.getTime() < Date.now() &&
    !["Finalizada", "COMPLETADA", "Cancelada", "CANCELADA"].includes(activity.estatus);

  const maxMin = activity.tiempoMaximoMin ?? activity.tiempoEstimadoMin;
  const branchMaps = mapsUrl(activity.branchLatitude, activity.branchLongitude);
  const entryMaps = activity.activityEvidence
    ? mapsUrl(activity.activityEvidence.entryLatitude, activity.activityEvidence.entryLongitude)
    : null;
  const exitMaps = activity.activityEvidence
    ? mapsUrl(activity.activityEvidence.exitLatitude, activity.activityEvidence.exitLongitude)
    : null;

  const addressParts = [
    activity.branchName,
    activity.branchAddress,
    activity.branchCity,
    activity.branchState,
  ].filter(Boolean);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard
          label="SLA"
          value={overdue ? "Vencida" : dueDate ? dueDate.toLocaleDateString("es-MX") : "Sin fecha"}
          variant={overdue ? "danger" : dueDate ? "warning" : "default"}
          icon="⏱️"
        />
        <KpiCard label="Prioridad" value={activity.prioridad ?? "—"} icon="🎯" />
        <KpiCard label="Tiempo máx." value={maxMin ? `${maxMin} min` : "—"} icon="⌛" />
        <KpiCard
          label="Evidencia"
          value={activity.activityEvidence?.reviewStatus ?? "Pendiente"}
          variant={activity.activityEvidence?.reviewStatus === "APPROVED" ? "positive" : "default"}
          icon="📸"
        />
      </div>

      <DetailSection title="Ubicación y campo">
        <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
          {addressParts.length > 0 && (
            <div>
              <strong>Sitio:</strong> {addressParts.join(" · ")}
            </div>
          )}
          {activity.client && (
            <div>
              <strong>Cliente OPS:</strong> {activity.client.name}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {branchMaps && (
              <Button size="sm" variant="secondary" onClick={() => void openExternalUrl(branchMaps)}>
                Mapa sucursal
              </Button>
            )}
            {entryMaps && (
              <Button size="sm" variant="ghost" onClick={() => void openExternalUrl(entryMaps)}>
                GPS llegada
              </Button>
            )}
            {exitMaps && (
              <Button size="sm" variant="ghost" onClick={() => void openExternalUrl(exitMaps)}>
                GPS salida
              </Button>
            )}
            <Link href={`/ops/gps`} style={{ textDecoration: "none" }}>
              <Button size="sm" variant="ghost">Mapa operacional OPS</Button>
            </Link>
          </div>
        </div>
      </DetailSection>

      {activity.slaAlertedAt && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid var(--warning)", background: "color-mix(in srgb, var(--warning) 12%, transparent)" }}>
          <Tag variant="warning">SLA alertado</Tag>
          <span style={{ marginLeft: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
            {new Date(activity.slaAlertedAt).toLocaleString("es-MX")}
          </span>
        </div>
      )}
    </>
  );
}
