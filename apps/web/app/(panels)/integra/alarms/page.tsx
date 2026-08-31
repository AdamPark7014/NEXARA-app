"use client";

import { useEffect, useMemo, useState } from "react";
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
  getActiveIntegraSiteId,
  inputStyle,
  integraApi,
  toDatetimeLocalValue,
} from "../_lib";
import { PlaybackJumpModal } from "../_PlaybackJumpModal";
import { resolveCrossPanelHref } from "@/lib/cross-panel-handoff";
import { useUser } from "@/components/UserContext";
import { getCachedProvider, subscribeProvider } from "../_caps";

type AlarmItem = {
  id: string;
  status: "OPEN" | "ACK" | "CLEARED" | string;
  title: string;
  severity: string;
  timestamp?: string;
  srcName?: string;
  cameraIndexCode?: string | null;
  doorIndexCode?: string | null;
  eventType?: string | null;
  note?: string | null;
};

export default function IntegraAlarmsPage() {
  const { user } = useUser();
  // `useUser()` no expone `userJson`: se serializa aquí, como en el resto de
  // páginas que hacen handoff entre paneles (erp/analytics/bi, crm/projects…).
  const userJson = useMemo(() => (user ? JSON.stringify(user) : null), [user]);
  const [items, setItems] = useState<AlarmItem[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "ACK" | "CLEARED">("OPEN");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [playback, setPlayback] = useState<{ cameraId: string; at: string } | null>(null);
  const [provider, setProvider] = useState<string | null>(() => getCachedProvider());
  const isHct = provider === "HCT";

  // Histórico Artemis (colapsable)
  const range0 = useMemo(() => defaultRangeHours(24), []);
  const [showSearch, setShowSearch] = useState(false);
  const [searchItems, setSearchItems] = useState<any[]>([]);
  const [start, setStart] = useState(range0.start);
  const [end, setEnd] = useState(range0.end);
  const [siteLabel, setSiteLabel] = useState<string>("");

  useEffect(() => subscribeProvider(setProvider), []);

  useEffect(() => {
    const sid = getActiveIntegraSiteId();
    if (!sid) return;
    void integraApi<Array<{ id: number; name?: string; label?: string | null }>>("integra/sites")
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        const site = list.find((s) => Number(s.id) === sid);
        if (site) setSiteLabel(String(site.label || site.name || `sitio ${sid}`));
      })
      .catch(() => undefined);
  }, []);

  const loadQueue = async () => {
    try {
      const data = await integraApi<{ items: AlarmItem[]; openCount: number }>(
        "integra/alarms/queue?hours=24",
      );
      setItems(data.items || []);
      setOpenCount(data.openCount ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cola");
    }
  };

  useEffect(() => {
    void loadQueue();
    const t = window.setInterval(() => void loadQueue(), 7000);
    return () => window.clearInterval(t);
  }, []);

  const filtered = items.filter(
    (i) => statusFilter === "ALL" || i.status === statusFilter,
  );

  const act = async (id: string, kind: "ack" | "clear") => {
    setBusy(true);
    try {
      await integraApi(`integra/alarms/${encodeURIComponent(id)}/${kind}`, {
        method: "POST",
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      setNote("");
      await loadQueue();
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
        meta={`${openCount} abiertas · cola SOC`}
        actions={
          <IgBtn onClick={() => void loadQueue()} disabled={busy}>
            Actualizar
          </IgBtn>
        }
      />
      <IgError>{error}</IgError>

      <IgFilters>
        <IgField label="Estado">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{ ...inputStyle, maxWidth: 140 }}
          >
            <option value="OPEN">Abiertas</option>
            <option value="ACK">Reconocidas</option>
            <option value="CLEARED">Cerradas</option>
            <option value="ALL">Todas</option>
          </select>
        </IgField>
        <IgField label="Nota al ack/clear">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="opcional"
            style={inputStyle}
          />
        </IgField>
      </IgFilters>

      <IgPanel title={`Cola (${filtered.length})`}>
        <IgTable
          columns={[
            { key: "sev", label: "Severidad", width: "90px" },
            { key: "title", label: "Alarma" },
            { key: "src", label: "Origen" },
            { key: "time", label: "Hora", width: "140px" },
            { key: "status", label: "Estado", width: "90px" },
            { key: "act", label: "", width: "240px" },
          ]}
          rows={filtered.map((a) => ({
            key: a.id,
            tone: a.status === "OPEN" ? "danger" : a.status === "ACK" ? "warn" : "muted",
            cells: {
              sev: a.severity,
              title: a.title,
              src: a.srcName || a.doorIndexCode || "—",
              time: fmt(a.timestamp),
              status: a.status,
              act: (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {a.status === "OPEN" && (
                    <IgBtn disabled={busy} onClick={() => void act(a.id, "ack")}>
                      Ack
                    </IgBtn>
                  )}
                  {a.status !== "CLEARED" && (
                    <IgBtn disabled={busy} onClick={() => void act(a.id, "clear")}>
                      Clear
                    </IgBtn>
                  )}
                  {!isHct && a.cameraIndexCode && a.timestamp && (
                    <IgBtn
                      onClick={() =>
                        setPlayback({ cameraId: a.cameraIndexCode!, at: a.timestamp! })
                      }
                    >
                      Video
                    </IgBtn>
                  )}
                  <IgBtn
                    onClick={async () => {
                      const sid = getActiveIntegraSiteId();
                      const title = `Alarma Integra: ${a.title}`;
                      const description = [
                        `Severidad: ${a.severity}`,
                        a.srcName ? `Origen: ${a.srcName}` : null,
                        a.timestamp ? `Hora: ${a.timestamp}` : null,
                        a.note ? `Nota: ${a.note}` : null,
                        siteLabel ? `Sitio: ${siteLabel}` : null,
                        sid ? `siteId=${sid}` : null,
                        `alarmId=${a.id}`,
                      ]
                        .filter(Boolean)
                        .join("\n");
                      try {
                        const q = sid ? `?siteId=${sid}` : "";
                        await integraApi(`integra/alarms/${encodeURIComponent(String(a.id))}/ticket${q}`, {
                          method: "POST",
                          body: JSON.stringify({ title, description, severity: a.severity }),
                        });
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : "Error";
                        if (/cliente operativo|sin cliente|no tiene cliente/i.test(msg)) {
                          const qs = new URLSearchParams({ title, description });
                          if (sid) qs.set("siteId", String(sid));
                          if (siteLabel) qs.set("clientHint", siteLabel);
                          window.location.href = resolveCrossPanelHref(
                            `/ops/support/new?${qs.toString()}`,
                            userJson,
                          );
                          return;
                        }
                        setError(msg);
                      }
                    }}
                  >
                    Ticket
                  </IgBtn>
                </div>
              ),
            },
          }))}
          empty="Sin alarmas en este filtro."
        />
      </IgPanel>

      {!isHct && (
      <details style={{ marginTop: 16 }} open={showSearch} onToggle={(e) => setShowSearch((e.target as HTMLDetailsElement).open)}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 650 }}>
          Búsqueda histórica (avanzado)
        </summary>
        <IgFilters>
          <IgField label="Desde">
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
          </IgField>
          <IgField label="Hasta">
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
          </IgField>
          <IgBtn
            variant="primary"
            onClick={async () => {
              setBusy(true);
              try {
                const data = await integraApi<any>("integra/alarms/search", {
                  method: "POST",
                  body: JSON.stringify({
                    pageNo: 1,
                    pageSize: 50,
                    startTime: fromDatetimeLocalValue(start),
                    endTime: fromDatetimeLocalValue(end),
                  }),
                });
                setSearchItems(data?.list || data?.data?.list || []);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Buscar
          </IgBtn>
        </IgFilters>
        {searchItems.length > 0 && (
          <pre style={{ fontSize: 11, maxHeight: 240, overflow: "auto" }}>
            {JSON.stringify(searchItems.slice(0, 20), null, 2)}
          </pre>
        )}
      </details>
      )}

      {!isHct && (
      <PlaybackJumpModal
        open={Boolean(playback)}
        cameraId={playback?.cameraId || ""}
        atIso={playback?.at || toDatetimeLocalValue(new Date())}
        onClose={() => setPlayback(null)}
      />
      )}
    </IgPage>
  );
}
