"use client";

import { useMemo, useState } from "react";
import {
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgPage,
  IgPanel,
  IgTable,
  IgToolbar,
} from "../_Console";
import {
  defaultRangeHours,
  fromDatetimeLocalValue,
  inputStyle,
  integraApi,
} from "../_lib";

export default function IntegraAlarmsPage() {
  const range0 = useMemo(() => defaultRangeHours(24), []);
  const [items, setItems] = useState<any[]>([]);
  const [start, setStart] = useState(range0.start);
  const [end, setEnd] = useState(range0.end);
  const [pageSize, setPageSize] = useState(50);
  const [pageNo, setPageNo] = useState(1);
  const [eventTypes, setEventTypes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        pageNo,
        pageSize,
        startTime: fromDatetimeLocalValue(start),
        endTime: fromDatetimeLocalValue(end),
      };
      const types = eventTypes
        .split(/[,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n));
      if (types.length === 1) body.eventType = types[0];
      else if (types.length > 1) body.eventTypes = types;
      const data = await integraApi<any>("integra/alarms/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setItems(data?.list || data?.data?.list || (Array.isArray(data) ? data : []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("es-MX", { hour12: false }) : "—";

  return (
    <IgPage>
      <IgToolbar
        title="Alarmas"
        meta={`eventService · ${items.length}`}
        actions={
          <IgBtn variant="primary" disabled={busy} onClick={() => void search()}>
            {busy ? "…" : "Buscar"}
          </IgBtn>
        }
      />
      <IgError>{error}</IgError>
      <IgFilters>
        <IgField label="Desde">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
        </IgField>
        <IgField label="Hasta">
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
        </IgField>
        <IgField label="Por página">
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ ...inputStyle, maxWidth: 80 }}>
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </IgField>
        <IgField label="Página">
          <input type="number" min={1} value={pageNo} onChange={(e) => setPageNo(Math.max(1, Number(e.target.value) || 1))} style={{ ...inputStyle, maxWidth: 70 }} />
        </IgField>
        <IgField label="Tipos de alarma">
          <input value={eventTypes} onChange={(e) => setEventTypes(e.target.value)} placeholder="códigos, opc." style={inputStyle} title="eventType Artemis" />
        </IgField>
        <IgField label="Preset">
          <div style={{ display: "flex", gap: 4 }}>
            <IgBtn onClick={() => { const r = defaultRangeHours(1); setStart(r.start); setEnd(r.end); }}>1h</IgBtn>
            <IgBtn onClick={() => { const r = defaultRangeHours(24); setStart(r.start); setEnd(r.end); }}>24h</IgBtn>
          </div>
        </IgField>
      </IgFilters>
      <IgPanel title="Registros" count={items.length} flush>
        <IgTable
          columns={[
            { key: "t", label: "Hora", mono: true, width: "22%" },
            { key: "ty", label: "Tipo" },
            { key: "s", label: "Fuente" },
            { key: "id", label: "Id", mono: true },
          ]}
          rows={items.map((a, i) => ({
            key: String(a.eventId || a.id || i),
            cells: {
              t: fmt(a.happenTime || a.eventTime),
              ty: a.eventTypeName || a.eventType || "—",
              s: a.srcName || "—",
              id: a.eventId || a.id || "—",
            },
          }))}
          empty="Sin alarmas / sin licencia eventService"
        />
      </IgPanel>
    </IgPage>
  );
}
