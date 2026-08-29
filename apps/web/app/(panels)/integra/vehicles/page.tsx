"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashPage,
  DashHero,
  DashPanel,
  ListRow,
} from "@/components/dashboard/DashKit";
import { btnGhost, btnPrimary, inputStyle, integraApi } from "../_lib";

type Vehicle = { id: string; plate: string; personId?: string; personName?: string };

export default function IntegraVehiclesPage() {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [plate, setPlate] = useState("");
  const [personId, setPersonId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await integraApi<{ items: Vehicle[] }>("integra/vehicles");
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!plate.trim()) return;
    try {
      await integraApi("integra/vehicles", {
        method: "POST",
        body: JSON.stringify({ plateNo: plate.trim(), personId: personId || undefined }),
      });
      setPlate("");
      setPersonId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar vehículo?")) return;
    await integraApi(`integra/vehicles/${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Flota"
        title="Vehículos"
        subtitle="CRUD Artemis · espejo Prisma."
        actions={
          <button type="button" style={btnGhost} onClick={() => void load()}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashPanel title="Alta">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Placa" value={plate} onChange={(e) => setPlate(e.target.value)} style={inputStyle} />
          <input
            placeholder="personId (opcional)"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            style={inputStyle}
          />
          <button type="button" style={btnPrimary} onClick={() => void add()}>
            Agregar
          </button>
        </div>
      </DashPanel>

      <DashPanel title="Inventario" subtitle={`${items.length}`}>
        {items.map((v) => (
          <ListRow
            key={v.id}
            title={v.plate}
            sub={[v.personName, v.personId, v.id].filter(Boolean).join(" · ")}
            trail={
              <button type="button" style={btnGhost} onClick={() => void remove(v.id)}>
                Borrar
              </button>
            }
          />
        ))}
      </DashPanel>
    </DashPage>
  );
}
