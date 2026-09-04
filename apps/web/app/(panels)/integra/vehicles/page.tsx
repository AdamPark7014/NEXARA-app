"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgPage,
  IgPanel,
  IgSplit,
  IgTable,
  IgToolbar,
} from "../_Console";
import { inputStyle, integraApi, selectStyle } from "../_lib";

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
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [v, p] = await Promise.all([
        integraApi<{ items: Vehicle[]; syncNote?: string }>("integra/vehicles"),
        integraApi<{ items: Person[] }>("integra/people").catch(() => ({ items: [] })),
      ]);
      setItems(v.items);
      setSyncNote(v.syncNote || null);
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

  return (
    <IgPage>
      <IgToolbar
        title="Vehículos / placas"
        meta={`${filtered.length}/${items.length}`}
        actions={<IgBtn onClick={() => void load()}>Refresh</IgBtn>}
      />
      <IgError>{error}</IgError>
      {syncNote && (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ig-muted)" }}>{syncNote}</p>
      )}
      <IgSplit
        leftWidth="32%"
        left={
          <IgPanel title="Alta">
            <div style={{ display: "grid", gap: 8 }}>
              <IgField label="Placa">
                <input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  style={{ ...inputStyle, maxWidth: "100%" }}
                />
              </IgField>
              <IgField label="Persona">
                <select
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  style={{ ...selectStyle, maxWidth: "100%" }}
                >
                  <option value="">—</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </IgField>
              <IgBtn
                variant="primary"
                disabled={!plate.trim()}
                onClick={async () => {
                  try {
                    await integraApi("integra/vehicles", {
                      method: "POST",
                      body: JSON.stringify({
                        plateNo: plate.trim(),
                        personId: personId || undefined,
                      }),
                    });
                    setPlate("");
                    setPersonId("");
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Error");
                  }
                }}
              >
                Agregar
              </IgBtn>
            </div>
          </IgPanel>
        }
        right={
          <IgPanel title="Inventario" count={filtered.length} flush>
            <IgFilters>
              <IgField label="Buscar">
                <input value={q} onChange={(e) => setQ(e.target.value)} style={inputStyle} />
              </IgField>
            </IgFilters>
            <IgTable
              columns={[
                { key: "p", label: "Placa" },
                { key: "n", label: "Persona" },
                { key: "id", label: "Id", mono: true },
                { key: "x", label: "", width: "140px" },
              ]}
              rows={filtered.map((v) => ({
                key: v.id,
                cells: {
                  p:
                    editId === v.id ? (
                      <input
                        value={editPlate}
                        onChange={(e) => setEditPlate(e.target.value)}
                        style={inputStyle}
                      />
                    ) : (
                      v.plate
                    ),
                  n: v.personName || v.personId || "—",
                  id: v.id,
                  x:
                    editId === v.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <IgBtn
                          variant="primary"
                          onClick={async () => {
                            await integraApi(`integra/vehicles/${encodeURIComponent(v.id)}`, {
                              method: "PATCH",
                              body: JSON.stringify({ plateNo: editPlate.trim() }),
                            });
                            setEditId(null);
                            await load();
                          }}
                        >
                          OK
                        </IgBtn>
                        <IgBtn onClick={() => setEditId(null)}>✕</IgBtn>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 4 }}>
                        <IgBtn
                          onClick={() => {
                            setEditId(v.id);
                            setEditPlate(v.plate);
                          }}
                        >
                          Edit
                        </IgBtn>
                        <IgBtn
                          onClick={async () => {
                            if (!confirm("¿Borrar?")) return;
                            await integraApi(`integra/vehicles/${encodeURIComponent(v.id)}`, {
                              method: "DELETE",
                            });
                            await load();
                          }}
                        >
                          Del
                        </IgBtn>
                      </div>
                    ),
                },
              }))}
              empty="Sin vehículos"
            />
          </IgPanel>
        }
      />
    </IgPage>
  );
}
