"use client";

import { useState } from "react";
import { DashPage, DashHero, DashPanel, ListRow } from "@/components/dashboard/DashKit";
import { btnPrimary, inputStyle, integraApi } from "../_lib";

export default function IntegraAlarmsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      const data = await integraApi<any>("integra/alarms/search", {
        method: "POST",
        body: JSON.stringify({
          pageNo: 1,
          pageSize: 50,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        }),
      });
      const list = data?.list || data?.data?.list || (Array.isArray(data) ? data : []);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="P3"
        title="Alarmas"
        subtitle="eventService · eventRecords/page (licencia del sitio)."
        actions={
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => void search()}>
            {busy ? "…" : "Buscar 24 h"}
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <DashPanel title="Registros" subtitle={`${items.length}`}>
        {items.map((a, i) => (
          <ListRow
            key={a.eventId || a.id || i}
            title={a.eventTypeName || a.eventType || a.title || "Alarma"}
            sub={[a.srcName, a.happenTime || a.eventTime, a.eventId]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
        {items.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Sin resultados o licencia eventService no disponible.
          </p>
        )}
      </DashPanel>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
        Body editable vía API <code>POST /api/integra/alarms/search</code>.
      </p>
      <textarea
        readOnly
        value='{ "pageNo": 1, "pageSize": 50, "startTime", "endTime" }'
        style={{ ...inputStyle, maxWidth: "100%", height: 48, opacity: 0.6 }}
      />
    </DashPage>
  );
}
