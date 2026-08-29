"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashPage,
  DashHero,
  DashPanel,
  ListRow,
  DashPill,
} from "@/components/dashboard/DashKit";
import { btnGhost, btnPrimary, inputStyle, integraApi } from "../_lib";

type Ev = {
  id: string;
  doorId?: string;
  doorName?: string;
  personName?: string;
  eventType?: string;
  timestamp?: string;
  picUri?: string;
};

export default function IntegraEventsPage() {
  const [items, setItems] = useState<Ev[]>([]);
  const [doorFilter, setDoorFilter] = useState("");
  const [thumb, setThumb] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = doorFilter ? `?limit=80&doorId=${encodeURIComponent(doorFilter)}` : "?limit=80";
      const data = await integraApi<{ items: Ev[] }>(`integra/events${q}`);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [doorFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadPic = async (picUri: string) => {
    try {
      const data = await integraApi<{ picUri?: string; url?: string; picture?: string }>(
        "integra/events/picture",
        { method: "POST", body: JSON.stringify({ picUri }) },
      );
      const src =
        (data as any).picUrl ||
        data.url ||
        (typeof (data as any).picture === "string" && (data as any).picture.startsWith("data:")
          ? (data as any).picture
          : null);
      setThumb(src || JSON.stringify(data).slice(0, 200));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error foto");
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Eventos"
        title="ACS · 24 h"
        subtitle="Filtro por puerta · thumbs vía proxy API (no directo a HikCentral)."
        actions={
          <button type="button" style={btnGhost} onClick={() => void load()}>
            Actualizar
          </button>
        }
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          placeholder="doorIndexCode…"
          value={doorFilter}
          onChange={(e) => setDoorFilter(e.target.value)}
          style={inputStyle}
        />
        <button type="button" style={btnPrimary} onClick={() => void load()}>
          Filtrar
        </button>
      </div>

      <DashPanel title="Timeline" subtitle={`${items.length} eventos`}>
        {items.map((e) => (
          <ListRow
            key={e.id || `${e.timestamp}-${e.doorId}`}
            title={e.personName || e.eventType || "Evento"}
            sub={[e.doorName || e.doorId, e.eventType, e.timestamp]
              .filter(Boolean)
              .join(" · ")}
            trail={
              e.picUri ? (
                <button type="button" style={btnGhost} onClick={() => void loadPic(e.picUri!)}>
                  Foto
                </button>
              ) : (
                <DashPill tone="neutral">sin foto</DashPill>
              )
            }
          />
        ))}
      </DashPanel>

      {thumb && (
        <DashPanel title="Foto evento">
          {thumb.startsWith("http") || thumb.startsWith("data:") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="evento" style={{ maxWidth: "100%", borderRadius: 8 }} />
          ) : (
            <code style={{ fontSize: 11, wordBreak: "break-all" }}>{thumb}</code>
          )}
        </DashPanel>
      )}
    </DashPage>
  );
}
