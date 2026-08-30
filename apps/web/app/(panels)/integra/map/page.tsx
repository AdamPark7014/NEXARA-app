"use client";

import { useCallback, useEffect, useState } from "react";
import {
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgPage,
  IgPanel,
  IgToolbar,
} from "../_Console";
import { inputStyle, integraApi, selectStyle } from "../_lib";
import EmptyState from "@/components/ui/EmptyState";

type Pin = {
  id: number;
  entityType: string;
  entityId: string;
  label?: string | null;
  xPct: number;
  yPct: number;
};

type Floorplan = {
  id: number;
  name: string;
  imageData: string;
  pins: Pin[];
};

type EntityOpt = { id: string; name: string };

export default function IntegraMapPage() {
  const [plans, setPlans] = useState<Floorplan[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Planta baja");
  const [pinType, setPinType] = useState<"CAMERA" | "DOOR">("DOOR");
  const [entityId, setEntityId] = useState("");
  const [doors, setDoors] = useState<EntityOpt[]>([]);
  const [cams, setCams] = useState<EntityOpt[]>([]);

  const load = useCallback(async () => {
    try {
      const [fp, d, c] = await Promise.all([
        integraApi<{ items: Floorplan[] }>("integra/floorplans"),
        integraApi<{ items: EntityOpt[] }>("integra/doors").catch(() => ({ items: [] })),
        integraApi<{ items: EntityOpt[] }>("integra/cameras").catch(() => ({ items: [] })),
      ]);
      setPlans(fp.items || []);
      setDoors(d.items || []);
      setCams(c.items || []);
      if (!activeId && fp.items?.[0]) setActiveId(fp.items[0].id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [activeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = plans.find((p) => p.id === activeId) || null;
  const entities = pinType === "DOOR" ? doors : cams;

  const onUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imageData = String(reader.result || "");
        const created = await integraApi<{ id: number }>("integra/floorplans", {
          method: "POST",
          body: JSON.stringify({ name, imageData }),
        });
        setActiveId(created.id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error upload");
      }
    };
    reader.readAsDataURL(file);
  };

  const placePin = async (xPct: number, yPct: number) => {
    if (!active || !entityId) {
      setError("Selecciona puerta o cámara antes de pinchar el plano");
      return;
    }
    try {
      await integraApi(`integra/floorplans/${active.id}/pins`, {
        method: "POST",
        body: JSON.stringify({
          entityType: pinType,
          entityId,
          label: entities.find((e) => e.id === entityId)?.name,
          xPct,
          yPct,
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error pin");
    }
  };

  return (
    <IgPage>
      <IgToolbar title="Plano del sitio" meta={`${plans.length} planos`} />
      <IgError>{error}</IgError>

      {plans.length === 0 && (
        <IgPanel title="Sin plano">
          <div style={{ padding: 16 }}>
            <EmptyState
              title="Sin plano del sitio"
              description="Sube una imagen de planta para colocar cámaras y puertas. Mientras no haya plano, el mapa permanece vacío."
              icon="🗺️"
            />
          </div>
        </IgPanel>
      )}

      <IgFilters>
        <IgField label="Nombre del plano">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        </IgField>
        <IgField label="Subir imagen">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
        </IgField>
        <IgField label="Plano activo">
          <select
            value={activeId ?? ""}
            onChange={(e) => setActiveId(Number(e.target.value) || null)}
            style={selectStyle}
          >
            <option value="">—</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </IgField>
        <IgField label="Pin">
          <select
            value={pinType}
            onChange={(e) => {
              setPinType(e.target.value as "CAMERA" | "DOOR");
              setEntityId("");
            }}
            style={selectStyle}
          >
            <option value="DOOR">Puerta</option>
            <option value="CAMERA">Cámara</option>
          </select>
        </IgField>
        <IgField label="Entidad">
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            style={selectStyle}
          >
            <option value="">—</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </IgField>
      </IgFilters>

      <IgPanel title={active?.name || "Sin plano"}>
        {!active && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Sube una imagen de planta para colocar pines de puertas y cámaras.
          </p>
        )}
        {active && (
          <div
            style={{ position: "relative", maxWidth: 900, cursor: entityId ? "crosshair" : "default" }}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const xPct = ((e.clientX - rect.left) / rect.width) * 100;
              const yPct = ((e.clientY - rect.top) / rect.height) * 100;
              void placePin(xPct, yPct);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.imageData}
              alt={active.name}
              style={{ width: "100%", display: "block", borderRadius: 8 }}
            />
            {active.pins.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.label || p.entityId}
                style={{
                  position: "absolute",
                  left: `${p.xPct}%`,
                  top: `${p.yPct}%`,
                  transform: "translate(-50%, -50%)",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "2px solid #fff",
                  background: p.entityType === "CAMERA" ? "#0e7490" : "#b45309",
                  cursor: "pointer",
                  padding: 0,
                }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  void integraApi(`integra/map-pins/${p.id}`, { method: "DELETE" }).then(load);
                }}
              />
            ))}
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
          Clic en el plano coloca el pin seleccionado. Clic en un pin lo elimina.
        </p>
        <IgBtn onClick={() => void load()}>Actualizar</IgBtn>
      </IgPanel>
    </IgPage>
  );
}
