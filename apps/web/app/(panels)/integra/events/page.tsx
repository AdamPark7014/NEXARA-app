"use client";

import { useCallback, useEffect, useState } from "react";
import { DashPage, DashHero, DashPanel, ListRow } from "@/components/dashboard/DashKit";
import { buildApiUrl } from "@/lib/api-base";

type Ev = {
  id: string;
  doorId: string;
  doorName?: string;
  personName?: string;
  cardNo?: string;
  eventType?: string;
  timestamp?: string;
};

async function apiJson<T>(path: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body?.message === "string" ? body.message : `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function IntegraEventsPage() {
  const [items, setItems] = useState<Ev[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiJson<{ items: Ev[] }>("integra/events?limit=80");
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashPage>
      <DashHero
        eyebrow="Eventos"
        title="Eventos ACS"
        subtitle="Últimas 24 horas desde Artemis door/events."
        actions={
          <button type="button" onClick={() => void load()} style={btn}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <DashPanel title="Timeline" subtitle={`${items.length} eventos`}>
        {items.map((e) => (
          <ListRow
            key={e.id || `${e.doorId}-${e.timestamp}`}
            title={e.personName || e.cardNo || e.eventType || "Evento"}
            sub={[e.doorName || e.doorId, e.timestamp ? new Date(e.timestamp).toLocaleString() : ""]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
        {items.length === 0 && !error && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin eventos.</p>
        )}
      </DashPanel>
    </DashPage>
  );
}

const btn: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "transparent",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};
