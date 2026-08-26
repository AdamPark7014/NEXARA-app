"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import { Money, Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { listActivityMaterials, type ActivityMaterialRow } from "@/lib/ops-activities-api";

export default function ActivityMaterialsPage() {
  const { activity, error, reload } = useActivityDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const [rows, setRows] = useState<ActivityMaterialRow[]>([]);
  const [costoTotal, setCostoTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !activity?.id) return;
    setLoading(true);
    try {
      const data = await listActivityMaterials(token, activity.id);
      setRows(data.movimientos ?? []);
      setCostoTotal(Number(data.costoTotal ?? 0));
    } catch {
      setRows([]);
      setCostoTotal(0);
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
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Movimientos" value={rows.length} icon="📦" />
        <KpiCard label="Costo material" value={<Money value={costoTotal} compact />} icon="💰" variant={costoTotal > 0 ? "accent" : "default"} />
      </div>

      <DetailSection title="Material consumido">
        {loading && <EmptyState icon="⏳" title="Cargando materiales…" description="" />}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="📦"
            title="Sin consumo registrado"
            description="Los movimientos de almacén vinculados a esta actividad aparecerán aquí."
          />
        )}

        {!loading && rows.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {rows.map((m) => (
              <li
                key={m.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--surface)",
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{m.product?.name ?? "Producto"}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {m.product?.sku ?? ""} · {new Date(m.createdAt).toLocaleString("es-MX")}
                  </div>
                </div>
                <Tag variant="neutral">{m.movementType}</Tag>
                <div style={{ textAlign: "right" }}>
                  <div>{m.quantity} uds</div>
                  {m.totalCost != null && (
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                      <Money value={Number(m.totalCost)} compact />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: 16 }}>
          <Button size="sm" variant="ghost" onClick={() => void load()}>Actualizar</Button>
        </div>
      </DetailSection>
    </>
  );
}
