"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  DashPanel,
  ListRow,
  DashPill,
  StatStrip,
} from "@/components/dashboard/DashKit";
import { buildApiUrl } from "@/lib/api-base";
import chrome from "@/components/erp/erp-chrome.module.css";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";

type Door = {
  id: string;
  name: string;
  location?: string;
  isOnline?: boolean;
  status?: string;
};

type Health = {
  connected: boolean;
  status: string;
  config?: { baseUrl?: string; configured?: boolean };
};

type EventRow = {
  id: string;
  doorId: string;
  employeeId?: string;
  cardNumber?: string;
  timestamp: string;
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body?.message === "string"
        ? body.message
        : body?.message?.message || body?.detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const DOOR_STATUS: Record<string, string> = {
  locked: "Cerrada",
  unlocked: "Abierta",
  open: "Abierta",
  closed: "Cerrada",
};

export default function OfficesAccessPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [doors, setDoors] = useState<Door[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyDoor, setBusyDoor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await apiJson<Health>("access-control/health");
      setHealth(h);
      if (h.connected) {
        const [d, e] = await Promise.all([
          apiJson<Door[]>("access-control/doors"),
          apiJson<EventRow[]>("access-control/events?limit=30"),
        ]);
        setDoors(d);
        setEvents(e);
      } else {
        setDoors([]);
        setEvents([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar accesos");
      setDoors([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unlock = async (doorId: string) => {
    setBusyDoor(doorId);
    setError(null);
    try {
      await apiJson("access-control/doors/unlock", {
        method: "POST",
        body: JSON.stringify({ doorId, reason: "Apertura desde Core ERP" }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la puerta");
    } finally {
      setBusyDoor(null);
    }
  };

  const online = doors.filter((d) => d.isOnline).length;

  return (
    <DashPage>
      <DashHero
        eyebrow="ERP · Instalaciones"
        title="Accesos · oficinas NEXARA"
        subtitle="Puertas y eventos de sedes NEXARA. Para video, personas y ACS en vivo usa Integra."
      />

      <div className={chrome.hintBanner}>
        <span aria-hidden="true">ℹ️</span>
        <div>
          <strong>¿Buscas cámaras o personas ACS?</strong>{" "}
          Este módulo solo abre puertas de oficinas. Consola operativa:{" "}
          <Link href="/integra">abrir Integra →</Link>
        </div>
      </div>

      <StatStrip
        stats={[
          {
            label: "Plataforma",
            value: health?.connected
              ? "Conectada"
              : health?.config?.configured
                ? "Caída"
                : "Sin configurar",
            tone: health?.connected ? "positive" : "warning",
          },
          { label: "Puertas", value: String(doors.length) },
          { label: "En línea", value: String(online) },
          { label: "Eventos recientes", value: String(events.length) },
        ]}
      />

      {error && (
        <p style={{ color: "var(--danger, #b91c1c)", marginBottom: 16 }}>{error}</p>
      )}

      <DashGrid>
        <DashCol span={7}>
          <DashPanel
            title="Puertas"
            subtitle={loading ? "Cargando…" : health?.config?.baseUrl || "Sin host"}
            headExtra={
              <button type="button" onClick={() => void refresh()} style={btnGhost}>
                Actualizar
              </button>
            }
          >
            {doors.length === 0 && !loading && (
              <EmptyState
                variant="compact"
                title="Sin puertas"
                description={
                  health?.config?.configured
                    ? "El servidor no devolvió puertas. Revisa la integración de oficinas."
                    : "Falta configurar el acceso de oficinas en el servidor."
                }
                action={
                  <Link href="/integra" style={{ textDecoration: "none" }}>
                    <Button size="sm" variant="secondary">Ir a Integra</Button>
                  </Link>
                }
              />
            )}
            {doors.map((d) => (
              <ListRow
                key={d.id}
                title={d.name}
                sub={[d.location, d.id].filter(Boolean).join(" · ")}
                trail={
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <DashPill tone={d.isOnline ? "positive" : "neutral"}>
                      {d.isOnline ? "En línea" : "Fuera de línea"}
                    </DashPill>
                    <DashPill tone={d.status === "locked" || d.status === "closed" ? "warning" : "positive"}>
                      {DOOR_STATUS[d.status || ""] || d.status || "—"}
                    </DashPill>
                    <button
                      type="button"
                      disabled={busyDoor === d.id || !d.isOnline}
                      onClick={() => void unlock(d.id)}
                      style={btnPrimary}
                    >
                      {busyDoor === d.id ? "…" : "Abrir"}
                    </button>
                  </div>
                }
              />
            ))}
          </DashPanel>
        </DashCol>

        <DashCol span={5}>
          <DashPanel title="Eventos recientes" subtitle="Últimas lecturas">
            {events.length === 0 && !loading && (
              <EmptyState variant="compact" title="Sin eventos" description="No hay lecturas recientes en oficinas." />
            )}
            {events.map((e) => (
              <ListRow
                key={e.id || `${e.doorId}-${e.timestamp}`}
                title={e.cardNumber || e.employeeId || "Evento"}
                sub={`${e.doorId} · ${e.timestamp ? new Date(e.timestamp).toLocaleString("es-MX") : "—"}`}
              />
            ))}
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}

const btnGhost: React.CSSProperties = {
  border: "1px solid var(--border, #e2e8f0)",
  background: "transparent",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  border: "none",
  background: "var(--accent, #0ea5e9)",
  color: "#fff",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
};
