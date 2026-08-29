"use client";

import { useCallback, useEffect, useState } from "react";
import { DashPage, DashHero, DashPanel, ListRow } from "@/components/dashboard/DashKit";
import { buildApiUrl } from "@/lib/api-base";

type Vehicle = { id: string; plate: string; personName?: string; personId?: string };

async function apiJson<T>(path: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body?.message === "string" ? body.message : `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function IntegraVehiclesPage() {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiJson<{ items: Vehicle[] }>("integra/vehicles");
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashPage>
      <DashHero
        eyebrow="Vehículos"
        title="Vehículos"
        subtitle="Listado Artemis vehicleList (CRUD completo en fases posteriores)."
        actions={
          <button type="button" onClick={() => void load()} style={btn}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <DashPanel title="Flota" subtitle={`${items.length} vehículos`}>
        {items.map((v) => (
          <ListRow
            key={v.id}
            title={v.plate || v.id}
            sub={[v.personName, v.id].filter(Boolean).join(" · ")}
          />
        ))}
        {items.length === 0 && !error && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin vehículos.</p>
        )}
      </DashPanel>
    </DashPage>
  );
}

const btn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "transparent",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};
