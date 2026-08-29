"use client";

import { useState } from "react";
import { DashPage, DashHero, DashPanel, ListRow } from "@/components/dashboard/DashKit";
import { btnPrimary, integraApi } from "../_lib";

export default function IntegraAnprPage() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      const data = await integraApi<any>("integra/anpr/cross-records", {
        method: "POST",
        body: JSON.stringify({
          pageNo: 1,
          pageSize: 50,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        }),
      });
      const list = data?.list || data?.data?.list || [];
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error — requiere licencia PMS");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="P4"
        title="ANPR / PMS"
        subtitle="crossRecords Artemis. Adapter HCT documentado en ADR-0019."
        actions={
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => void search()}>
            {busy ? "…" : "Cruces 24 h"}
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <DashPanel title="Cruces" subtitle={`${items.length}`}>
        {items.map((r, i) => (
          <ListRow
            key={r.crossRecordSyscode || r.plateNo || i}
            title={r.plateNo || "—"}
            sub={[r.crossTime, r.entranceName, r.vehicleType].filter(Boolean).join(" · ")}
          />
        ))}
        {items.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Sin cruces o PMS no licenciado en el sitio.
          </p>
        )}
      </DashPanel>
    </DashPage>
  );
}
