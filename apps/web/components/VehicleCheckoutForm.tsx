"use client";

import { useRef, useState } from "react";

export type VehiclePhotoSet = {
  internas: string[];
  externas: string[];
  odometroFoto?: string;
  odometroKm?: number;
  combustiblePct?: number;
};

type SlotKey = "interna-0" | "interna-1" | "interna-2" | "interna-3" | "externa-0" | "externa-1" | "externa-2" | "externa-3" | "odometro";

const INTERNA_LABELS = ["Asiento conductor", "Tablero / consola", "Asientos traseros", "Maletero / carga"];
const EXTERNA_LABELS = ["Frente", "Trasera", "Lateral izquierdo", "Lateral derecho"];

type Props = {
  mode: "salida" | "devolucion";
  onSubmit: (payload: {
    files: Record<SlotKey, File | null>;
    odometroKm: number;
    combustiblePct: number;
  }) => Promise<void>;
  loading?: boolean;
};

export default function VehicleCheckoutForm({ mode, onSubmit, loading }: Props) {
  const [files, setFiles] = useState<Partial<Record<SlotKey, File>>>({});
  const [odometroKm, setOdometroKm] = useState("");
  const [combustiblePct, setCombustiblePct] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const refs = useRef<Partial<Record<SlotKey, HTMLInputElement | null>>>({});

  const setFile = (key: SlotKey, file: File | null) => {
    if (!file) return;
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const requiredKeys: SlotKey[] = [
    "interna-0", "interna-1", "interna-2", "interna-3",
    "externa-0", "externa-1", "externa-2", "externa-3", "odometro",
  ];

  const handleSubmit = async () => {
    setErr(null);
    const km = Number(odometroKm);
    const fuel = Number(combustiblePct);
    if (!Number.isFinite(km) || km <= 0) {
      setErr("Anota el kilometraje del odómetro");
      return;
    }
    if (!Number.isFinite(fuel) || fuel < 0 || fuel > 100) {
      setErr("Indica el nivel de combustible (0–100%)");
      return;
    }
    for (const key of requiredKeys) {
      if (!files[key]) {
        setErr("Debes subir las 4 fotos internas, 4 externas y la foto del odómetro");
        return;
      }
    }
    const payload: Record<SlotKey, File | null> = {} as Record<SlotKey, File | null>;
    for (const key of requiredKeys) payload[key] = files[key] ?? null;
    await onSubmit({ files: payload, odometroKm: km, combustiblePct: fuel });
  };

  const renderSlot = (key: SlotKey, label: string) => (
    <div
      key={key}
      onClick={() => refs.current[key]?.click()}
      style={{
        border: `1px dashed ${files[key] ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 10,
        padding: 10,
        textAlign: "center",
        cursor: "pointer",
        background: files[key] ? "var(--surface-2)" : "var(--surface)",
        minHeight: 72,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 11, marginTop: 4, color: files[key] ? "var(--primary)" : "var(--text-tertiary)" }}>
        {files[key]?.name ?? "Clic o arrastra"}
      </div>
      <input
        ref={(el) => { refs.current[key] = el; }}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => setFile(key, e.target.files?.[0] ?? null)}
      />
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>
        {mode === "salida" ? "Registro al recibir el vehículo" : "Registro al entregar el vehículo"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>Kilometraje (manual) *</span>
          <input type="number" min={0} value={odometroKm} onChange={(e) => setOdometroKm(e.target.value)} style={inp} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>Combustible (% tanque) *</span>
          <input type="number" min={0} max={100} value={combustiblePct} onChange={(e) => setCombustiblePct(e.target.value)} style={inp} />
        </label>
      </div>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>4 fotos internas *</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          {INTERNA_LABELS.map((label, i) => renderSlot(`interna-${i}` as SlotKey, label))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>4 fotos externas (cada extremo) *</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          {EXTERNA_LABELS.map((label, i) => renderSlot(`externa-${i}` as SlotKey, label))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Foto del odómetro *</div>
        {renderSlot("odometro", "Odómetro / tablero")}
      </div>
      {err && <div style={{ fontSize: 12, color: "var(--danger)" }}>{err}</div>}
      <button
        type="button"
        disabled={loading}
        onClick={() => void handleSubmit()}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "none",
          background: "var(--primary)",
          color: "#fff",
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? "Enviando…" : mode === "salida" ? "Confirmar recepción" : "Confirmar entrega"}
      </button>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface-2)",
  color: "var(--foreground)",
  fontSize: 13,
};
