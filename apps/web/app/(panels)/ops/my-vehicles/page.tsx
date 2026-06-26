"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getVehiclesSectionConfig } from "@/lib/section-views";
import { useOpsCanonicalRoute } from "@/lib/use-ops-canonical-route";

interface Vehicle {
  id: number;
  marca?: string;
  modelo?: string;
  placas?: string;
  year?: number;
  estado?: string;
  poliza?: string;
  verificacionVence?: string;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}

export default function MyVehiclesPage() {
  const { user } = useUser();
  useOpsCanonicalRoute(user, "vehicles");
  const cfg = useMemo(() => getVehiclesSectionConfig(user), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("vehicles", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tus vehículos");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const reportIncident = async (v: Vehicle) => {
    const desc = prompt("Describe el incidente o daño:");
    if (!desc || !token) return;
    try {
      await apiFetch(`vehicles/${v.id}`, token, { method: "PATCH", body: JSON.stringify({ estado: "Fuera_de_servicio", incidenteNotas: desc }) });
      alert("Incidente reportado a Administración.");
      void load();
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>}
      />

      {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando tus vehículos asignados." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
      {!loading && !error && items.length === 0 && <EmptyState icon="🚗" title="Sin vehículo asignado" description="Actualmente no tienes una unidad asignada." />}

      {!loading && !error && items.length > 0 && (
        <Section title="Tu unidad">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {items.map((v) => (
              <article key={v.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: "var(--nx-font-display)", fontWeight: 700, fontSize: 15 }}>{v.marca} {v.modelo}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>Placas {v.placas ?? "—"} · Año {v.year}</div>
                  </div>
                  <Tag variant={v.estado === "Fuera_de_servicio" ? "danger" : "positive"}>{(v.estado ?? "—").replace(/_/g, " ")}</Tag>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Póliza: {v.poliza ?? "—"} · Verificación: {v.verificacionVence ? new Date(v.verificacionVence).toLocaleDateString("es-MX") : "—"}
                </div>
                <Button size="sm" variant="danger" onClick={() => void reportIncident(v)}>⚠️ Reportar incidente</Button>
              </article>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
