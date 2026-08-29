"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashPage,
  DashHero,
  DashPanel,
  ListRow,
  DashPill,
} from "@/components/dashboard/DashKit";
import { buildApiUrl } from "@/lib/api-base";

type Cam = { id: string; name: string; region?: string; status?: string | number };

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.message === "string" ? body.message : `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}

export default function IntegraVideoPage() {
  const [items, setItems] = useState<Cam[]>([]);
  const [preview, setPreview] = useState<{ id: string; url: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiJson<{ items: Cam[] }>("integra/cameras");
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const getPreview = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const data = await apiJson<{ url: string | null }>(
        `integra/cameras/${encodeURIComponent(id)}/preview`,
        { method: "POST" },
      );
      setPreview({ id, url: data.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error preview");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Video"
        title="Cámaras"
        subtitle="Inventario Artemis + URL RTSP (abrir en VLC o media gateway). Sin player HTML5 en P0."
      />
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <DashPanel title="Inventario" subtitle={`${items.length} cámaras`}>
        {items.map((c) => (
          <ListRow
            key={c.id}
            title={c.name}
            sub={[c.region, c.id].filter(Boolean).join(" · ")}
            trail={
              <button
                type="button"
                disabled={busy === c.id}
                onClick={() => void getPreview(c.id)}
                style={btn}
              >
                {busy === c.id ? "…" : "URL live"}
              </button>
            }
          />
        ))}
        {items.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin cámaras o Artemis sin config.</p>
        )}
      </DashPanel>

      {preview && (
        <DashPanel title={`Preview · ${preview.id}`} subtitle="protocol rtsp_s">
          {preview.url ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code style={{ fontSize: 12, wordBreak: "break-all" }}>{preview.url}</code>
              <button type="button" style={btn} onClick={() => void copy(preview.url!)}>
                Copiar
              </button>
              <DashPill tone="accent">VLC / gateway</DashPill>
            </div>
          ) : (
            <p style={{ fontSize: 13 }}>Artemis no devolvió URL.</p>
          )}
        </DashPanel>
      )}
    </DashPage>
  );
}

const btn: React.CSSProperties = {
  border: "none",
  background: "var(--accent, #1d4ed8)",
  color: "#fff",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
};
