"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DashPage,
  DashHero,
  DashPanel,
  ListRow,
  DashGrid,
  DashCol,
} from "@/components/dashboard/DashKit";
import styles from "../integra.module.css";
import { btnGhost, btnPrimary, inputStyle, integraApi, selectStyle } from "../_lib";

type Vehicle = { id: string; plate: string; personId?: string; personName?: string };
type Person = { id: string; name: string; code?: string };

export default function IntegraVehiclesPage() {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [plate, setPlate] = useState("");
  const [personId, setPersonId] = useState("");
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editPlate, setEditPlate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [v, p] = await Promise.all([
        integraApi<{ items: Vehicle[] }>("integra/vehicles"),
        integraApi<{ items: Person[] }>("integra/people").catch(() => ({ items: [] })),
      ]);
      setItems(v.items);
      setPeople(p.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      items.filter((v) => {
        if (!q) return true;
        const qq = q.toLowerCase();
        return (
          v.plate.toLowerCase().includes(qq) ||
          (v.personName || "").toLowerCase().includes(qq) ||
          (v.personId || "").toLowerCase().includes(qq)
        );
      }),
    [items, q],
  );

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

  const saveEdit = async () => {
    if (!editId || !editPlate.trim()) return;
    try {
      await integraApi(`integra/vehicles/${encodeURIComponent(editId)}`, {
        method: "PATCH",
        body: JSON.stringify({ plateNo: editPlate.trim() }),
      });
      setEditId(null);
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
        subtitle="CRUD Artemis · vínculo a persona del directorio · búsqueda placa."
        actions={
          <button type="button" style={btnGhost} onClick={() => void load()}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <DashGrid>
        <DashCol span={4}>
          <DashPanel title="Alta">
            <div style={{ display: "grid", gap: 8 }}>
              <input
                placeholder="Placa *"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                style={{ ...inputStyle, maxWidth: "100%" }}
              />
              <select
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                style={{ ...selectStyle, maxWidth: "100%" }}
              >
                <option value="">Sin persona vinculada</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.code ? ` (${p.code})` : ""}
                  </option>
                ))}
              </select>
              <button type="button" style={btnPrimary} onClick={() => void add()}>
                Agregar
              </button>
            </div>
          </DashPanel>
        </DashCol>
        <DashCol span={8}>
          <DashPanel title="Inventario" subtitle={`${filtered.length} / ${items.length}`}>
            <input
              placeholder="Buscar placa / persona…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8, maxWidth: 320 }}
            />
            <div className={styles.tableScroll}>
              {filtered.map((v) => (
                <ListRow
                  key={v.id}
                  title={
                    editId === v.id ? (
                      <input value={editPlate} onChange={(e) => setEditPlate(e.target.value)} style={inputStyle} />
                    ) : (
                      v.plate
                    )
                  }
                  sub={[v.personName, v.personId, v.id].filter(Boolean).join(" · ")}
                  trail={
                    <div style={{ display: "flex", gap: 6 }}>
                      {editId === v.id ? (
                        <>
                          <button type="button" style={btnPrimary} onClick={() => void saveEdit()}>
                            Guardar
                          </button>
                          <button type="button" style={btnGhost} onClick={() => setEditId(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            style={btnGhost}
                            onClick={() => {
                              setEditId(v.id);
                              setEditPlate(v.plate);
                            }}
                          >
                            Editar
                          </button>
                          <button type="button" style={btnGhost} onClick={() => void remove(v.id)}>
                            Borrar
                          </button>
                        </>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
