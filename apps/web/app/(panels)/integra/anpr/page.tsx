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

export default function IntegraAnprPage() {
  const range0 = useMemo(() => defaultRangeHours(24), []);
  const [items, setItems] = useState<any[]>([]);
  const [start, setStart] = useState(range0.start);
  const [end, setEnd] = useState(range0.end);
  const [pageSize, setPageSize] = useState(50);
  const [pageNo, setPageNo] = useState(1);
  const [plateQ, setPlateQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await integraApi<any>("integra/anpr/cross-records", {
        method: "POST",
        body: JSON.stringify({
          pageNo,
          pageSize,
          startTime: fromDatetimeLocalValue(start),
          endTime: fromDatetimeLocalValue(end),
        }),
      });
      let list: any[] = data?.list || data?.data?.list || [];
      if (plateQ.trim()) {
        const q = plateQ.trim().toLowerCase();
        list = list.filter((r) => String(r.plateNo || "").toLowerCase().includes(q));
      }
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error — licencia PMS");
    } finally {
      setBusy(false);
    }
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("es-MX", { hour12: false }) : "—";

  return (
    <IgPage>
      <IgToolbar
        title="ANPR / PMS"
        meta={`crossRecords · ${items.length}`}
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
        <IgField label="pageSize">
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ ...inputStyle, maxWidth: 80 }}>
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </IgField>
        <IgField label="pageNo">
          <input type="number" min={1} value={pageNo} onChange={(e) => setPageNo(Math.max(1, Number(e.target.value) || 1))} style={{ ...inputStyle, maxWidth: 70 }} />
        </IgField>
        <IgField label="Placa">
          <input value={plateQ} onChange={(e) => setPlateQ(e.target.value.toUpperCase())} style={inputStyle} />
        </IgField>
      </IgFilters>
      <IgPanel title="Cruces" count={items.length} flush>
        <IgTable
          columns={[
            { key: "p", label: "Placa" },
            { key: "t", label: "Hora", mono: true },
            { key: "e", label: "Entrada" },
            { key: "ty", label: "Tipo" },
          ]}
          rows={items.map((r, i) => ({
            key: String(r.crossRecordSyscode || `${r.plateNo}-${i}`),
            cells: {
              p: r.plateNo || "—",
              t: fmt(r.crossTime),
              e: r.entranceName || "—",
              ty: r.vehicleType || "—",
            },
          }))}
          empty="Sin cruces / PMS no licenciado"
        />
      </IgPanel>
    </IgPage>
  );
}
