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
  /**
   * Pin seleccionado. Antes NO existía: hacer clic en un pin lo borraba en el
   * acto, sin preguntar, y el texto de ayuda hasta lo anunciaba. Un pin es una
   * cámara o una puerta situada en el plano — perderlo de un clic accidental es
   * perder trabajo de configuración que nadie sabe rehacer.
   */
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  /**
   * Consultar y editar son cosas distintas. Fuera del modo edición el plano se
   * mira: ni se colocan pines ni se borran.
   */
  const [editMode, setEditMode] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Pin | null>(null);

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
            style={{
              position: "relative",
              maxWidth: 900,
              cursor: editMode && entityId ? "crosshair" : "default",
            }}
            onClick={(e) => {
              if (!editMode) return;
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
                  outline: selectedPin?.id === p.id ? "3px solid #22d3ee" : "none",
                  outlineOffset: 2,
                  cursor: "pointer",
                  padding: 0,
                }}
                aria-label={`${p.entityType === "CAMERA" ? "Cámara" : "Puerta"}: ${p.label || p.entityId}`}
                aria-pressed={selectedPin?.id === p.id}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelectedPin((prev) => (prev?.id === p.id ? null : p));
                }}
              />
            ))}
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
          {editMode
            ? entityId
              ? "Modo edición: clic en el plano coloca el pin de la entidad elegida."
              : "Modo edición: elige una entidad arriba para poder colocarla."
            : "Clic en un pin para ver qué es. Para colocar o quitar, entra en modo edición."}
        </p>

        {selectedPin && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 12px",
              border: "1px solid var(--nx-panel-hairline, #d8dfe8)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 13 }}>
              <strong>{selectedPin.label || selectedPin.entityId}</strong>{" "}
              <span style={{ color: "var(--text-secondary)" }}>
                · {selectedPin.entityType === "CAMERA" ? "Cámara" : "Puerta"}
              </span>
            </span>
            {editMode && (
              <IgBtn onClick={() => setPendingDelete(selectedPin)}>Quitar del plano</IgBtn>
            )}
            <IgBtn onClick={() => setSelectedPin(null)}>Cerrar</IgBtn>
          </div>
        )}

        {pendingDelete && (
          <div
            role="alertdialog"
            aria-label="Confirmar quitar pin"
            style={{
              marginTop: 8,
              padding: "10px 12px",
              border: "1px solid #b45309",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <p style={{ margin: "0 0 8px" }}>
              ¿Quitar <strong>{pendingDelete.label || pendingDelete.entityId}</strong> del plano?
              El equipo no se borra: solo deja de estar situado aquí.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <IgBtn
                onClick={() => {
                  const id = pendingDelete.id;
                  setPendingDelete(null);
                  setSelectedPin(null);
                  void integraApi(`integra/map-pins/${id}`, { method: "DELETE" })
                    .then(load)
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : "No se pudo quitar el pin"),
                    );
                }}
              >
                Sí, quitar
              </IgBtn>
              <IgBtn onClick={() => setPendingDelete(null)}>Cancelar</IgBtn>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <IgBtn
            onClick={() => {
              setEditMode((v) => !v);
              setPendingDelete(null);
            }}
          >
            {editMode ? "Salir de edición" : "Editar plano"}
          </IgBtn>
          <IgBtn onClick={() => void load()}>Actualizar</IgBtn>
        </div>
      </IgPanel>
    </IgPage>
  );
}
