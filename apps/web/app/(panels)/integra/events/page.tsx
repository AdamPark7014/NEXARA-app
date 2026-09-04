"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IgBadge,
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgNotice,
  IgPage,
  IgPanel,
  IgToolbar,
} from "../_Console";
import { subscribePushEvents, type PushEvent } from "../_DetectionOverlay";
import { PersonFaceThumb, prefetchPersonFace } from "../_PersonFace";
import { integraApi, inputStyle, selectStyle } from "../_lib";
import styles from "../integra.module.css";
import { EnSitioStrip } from "@/components/presence/EnSitioStrip";

/**
 * Eventos ACS de negocio: accesos concedidos/denegados con foto, puerta y hora.
 * Fuente primaria = empuje local (rápido + foto). No heartBeat/VMD en la vista default.
 */

type Device = { id: string | number; name: string; ip?: string | null; kind?: string };

type Stats = {
  day: string;
  entradas: number;
  denegados: number;
  unicos: number;
  enSitio: number;
  ms?: number;
};

type Feed = {
  items: PushEvent[];
  total: number;
  ms?: number;
  hasMore?: boolean;
  nextBeforeId?: number | null;
  newestId?: number | null;
};

type QuickFilter = "hoy" | "denegados" | "todos" | "ruido";

const PAGE = 60;

function fmt(iso?: string | null) {
  return iso
    ? new Date(iso).toLocaleString("es-MX", { hour12: false })
    : "—";
}

function relAge(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "—";
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
  return fmt(iso);
}

function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function outcomeTone(
  outcome?: string | null,
  label?: string | null,
): "ok" | "danger" | "neutral" | "accent" {
  if (outcome === "granted" || /concedido/i.test(label || "")) return "ok";
  if (outcome === "denied" || /denegado/i.test(label || "")) return "danger";
  return "neutral";
}

function isAcsBusiness(ev: PushEvent): boolean {
  if (ev.eventType === "AccessControllerEvent") return true;
  if (ev.personName?.trim()) return true;
  return false;
}

export default function IntegraEventsPage() {
  const router = useRouter();
  const [items, setItems] = useState<PushEvent[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [quick, setQuick] = useState<QuickFilter>("hoy");
  const [deviceIp, setDeviceIp] = useState("");
  const [personName, setPersonName] = useState("");
  const [personId, setPersonId] = useState("");
  const [selected, setSelected] = useState<PushEvent | null>(null);
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queryMs, setQueryMs] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const newestIdRef = useRef(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    void integraApi<{ items: Device[] }>("integra/devices")
      .then((d) => {
        const acs = (d.items || []).filter(
          (x) => (x.kind || "").toUpperCase() === "ACS" && x.ip,
        );
        setDevices(acs.length ? acs : (d.items || []).filter((x) => x.ip));
      })
      .catch(() => setDevices([]));
  }, []);

  const buildQuery = useCallback(
    (extra: Record<string, string> = {}) => {
      const q = new URLSearchParams();
      q.set("limit", String(PAGE));
      if (deviceIp) q.set("deviceIp", deviceIp);
      if (personName.trim()) q.set("personName", personName.trim());
      if (personId.trim()) q.set("personId", personId.trim());

      if (quick === "hoy") {
        q.set("scope", "acs");
        q.set("from", startOfTodayLocal().toISOString());
      } else if (quick === "denegados") {
        q.set("scope", "acs");
        q.set("outcome", "denied");
        q.set("from", startOfTodayLocal().toISOString());
      } else if (quick === "ruido") {
        q.set("scope", "noise");
        q.set("from", new Date(Date.now() - 6 * 3600_000).toISOString());
      } else {
        q.set("scope", "acs");
        q.set("from", new Date(Date.now() - 7 * 86_400_000).toISOString());
      }

      for (const [k, v] of Object.entries(extra)) q.set(k, v);
      return q;
    },
    [deviceIp, personName, personId, quick],
  );

  const loadStats = useCallback(async () => {
    try {
      const s = await integraApi<Stats>("integra/push/events/stats");
      setStats(s);
    } catch {
      /* KPIs opcionales */
    }
  }, []);

  const load = useCallback(
    async (opts: { beforeId?: number | null; append?: boolean } = {}) => {
      setBusy(true);
      setError(null);
      try {
        const extra: Record<string, string> = {};
        if (opts.beforeId) extra.beforeId = String(opts.beforeId);
        const data = await integraApi<Feed>(
          `integra/push/events?${buildQuery(extra)}`,
        );
        const list = data.items || [];
        for (const e of list) {
          if (e.personId) prefetchPersonFace(e.personId);
        }
        setQueryMs(typeof data.ms === "number" ? data.ms : null);
        setHasMore(Boolean(data.hasMore));
        setNextBeforeId(data.nextBeforeId ?? null);
        const maxId = list.reduce((m, e) => Math.max(m, e.id), 0);
        if (maxId > newestIdRef.current) newestIdRef.current = maxId;
        setItems((prev) => {
          if (!opts.append) return list;
          const map = new Map(prev.map((x) => [x.id, x]));
          for (const e of list) map.set(e.id, e);
          return [...map.values()].sort(
            (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
          );
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar eventos");
      } finally {
        setBusy(false);
      }
    },
    [buildQuery],
  );

  useEffect(() => {
    void load();
    void loadStats();
  }, [load, loadStats]);

  // Live: SSE fan-out + afterId barato (solo ACS de negocio).
  useEffect(() => {
    return subscribePushEvents((events: PushEvent[]) => {
      const fresh = events.filter(isAcsBusiness);
      if (!fresh.length) return;
      for (const e of fresh) {
        if (e.personId) prefetchPersonFace(e.personId);
        if (e.id > newestIdRef.current) newestIdRef.current = e.id;
      }
      if (quick === "denegados") {
        const denied = fresh.filter(
          (e) =>
            e.outcome === "denied" || /denegado/i.test(e.label || ""),
        );
        if (!denied.length) return;
        setItems((prev) => mergeFresh(prev, denied));
      } else if (quick === "ruido") {
        return;
      } else {
        setItems((prev) => mergeFresh(prev, fresh));
      }
      void loadStats();
    });
  }, [quick, loadStats]);

  // Poll incremental afterId (respaldo SSE) — scope=acs, live=1.
  useEffect(() => {
    if (!auto || quick === "ruido") return;
    const tick = async () => {
      const after = newestIdRef.current;
      if (!after) return;
      try {
        const q = buildQuery({
          afterId: String(after),
          live: "1",
          limit: "80",
        });
        // afterId ignora from en la práctica vía id gt; scope sigue filtrando.
        const data = await integraApi<Feed>(`integra/push/events?${q}`);
        const list = data.items || [];
        if (!list.length) return;
        for (const e of list) {
          if (e.personId) prefetchPersonFace(e.personId);
          if (e.id > newestIdRef.current) newestIdRef.current = e.id;
        }
        setItems((prev) => mergeFresh(prev, list));
        if (typeof data.ms === "number") setQueryMs(data.ms);
      } catch {
        /* silencioso: SSE puede estar sano */
      }
    };
    const id = window.setInterval(() => void tick(), 4000);
    return () => window.clearInterval(id);
  }, [auto, quick, buildQuery]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const onSite = useMemo(() => {
    // Personas con acceso concedido reciente en la lista (hint ops).
    const seen = new Map<string, PushEvent>();
    for (const e of items) {
      if (!e.personId || e.outcome === "denied") continue;
      if (e.outcome !== "granted" && !/concedido/i.test(e.label || "")) continue;
      if (!seen.has(e.personId)) seen.set(e.personId, e);
    }
    return [...seen.values()].slice(0, 12);
  }, [items]);

  const exportCsv = () => {
    const rows = [
      ["id", "hora", "persona", "personId", "puerta", "ip", "resultado", "etiqueta", "modo"].join(
        ",",
      ),
      ...items.map((e) =>
        [
          e.id,
          e.occurredAt,
          csv(e.personName),
          csv(e.personId),
          csv(e.deviceName),
          csv(e.deviceIp),
          e.outcome || "",
          csv(e.label),
          csv(e.verifyMode),
        ].join(","),
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eventos-acs-${stats?.day || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <IgPage>
      <IgToolbar
        title="Eventos Face ACS"
        meta={
          busy
            ? "Cargando…"
            : `${items.length} eventos${queryMs != null ? ` · ${queryMs} ms` : ""}${auto ? " · vivo" : ""}`
        }
        actions={
          <>
            <IgBtn
              variant="primary"
              onClick={() => setQuick("hoy")}
              title="Accesos de hoy (default de negocio)"
            >
              Hoy
            </IgBtn>
            <IgBtn onClick={() => router.push("/integra/people")} title="Alta y Face ID en terminales">
              Alta persona
            </IgBtn>
            <IgBtn onClick={() => setAuto((v) => !v)}>
              Vivo {auto ? "ON" : "OFF"}
            </IgBtn>
            <IgBtn onClick={exportCsv} disabled={!items.length}>
              Exportar CSV
            </IgBtn>
            <IgBtn
              disabled={busy}
              onClick={() => {
                void load();
                void loadStats();
              }}
            >
              {busy ? "…" : "Actualizar"}
            </IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>

      <div className={styles.contextKpis} aria-label="KPIs del día" style={{ marginBottom: 10 }}>
        <span className={styles.kpiChip}>
          Entradas hoy <strong>{stats?.entradas ?? "—"}</strong>
        </span>
        <span className={styles.kpiChip}>
          Denegados <strong>{stats?.denegados ?? "—"}</strong>
        </span>
        <span className={styles.kpiChip}>
          Personas únicas <strong>{stats?.unicos ?? "—"}</strong>
        </span>
        <span className={styles.kpiChip}>
          En sitio <strong>{stats?.enSitio ?? "—"}</strong>
        </span>
        {stats?.day && (
          <span className={styles.kpiChip}>
            Día <strong>{stats.day}</strong>
          </span>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <EnSitioStrip variant="compact" title="En sitio · ACS" pollMs={15_000} />
      </div>

      <IgNotice>
        Solo los <strong>terminales ACS</strong> dan nombre + foto del pase. El ruido de cámara
        (heartBeat / VMD) queda fuera salvo «Ruido». Si falta alguien, da de alta en Personas —
        no es Face ID sobre cámaras de oficina.
      </IgNotice>

      <IgFilters>
        <IgField label="Vista">
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(
              [
                ["hoy", "Hoy"],
                ["denegados", "Denegados"],
                ["todos", "7 días"],
                ["ruido", "Ruido"],
              ] as const
            ).map(([k, label]) => (
              <IgBtn
                key={k}
                variant={quick === k ? "primary" : undefined}
                onClick={() => setQuick(k)}
              >
                {label}
              </IgBtn>
            ))}
          </div>
        </IgField>
        <IgField label="Puerta / terminal">
          <select
            value={deviceIp}
            onChange={(e) => setDeviceIp(e.target.value)}
            style={selectStyle}
          >
            <option value="">Todas</option>
            {devices.map((d) => (
              <option key={d.id} value={d.ip || ""}>
                {d.name}
                {d.ip ? ` · ${d.ip}` : ""}
              </option>
            ))}
          </select>
        </IgField>
        <IgField label="Persona">
          <input
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            placeholder="contiene…"
            style={inputStyle}
          />
        </IgField>
        <IgField label="ID persona">
          <input
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            placeholder="opcional"
            style={inputStyle}
          />
        </IgField>
        <IgField label=" ">
          <IgBtn
            variant="primary"
            disabled={busy}
            onClick={() => {
              void load();
              void loadStats();
            }}
          >
            Filtrar
          </IgBtn>
        </IgField>
      </IgFilters>

      {onSite.length > 0 && quick !== "denegados" && quick !== "ruido" && (
        <IgPanel title="Quién entró (reciente)" count={onSite.length}>
          <div className={styles.evGrid}>
            {onSite.map((e) => (
              <article key={`on-${e.id}`} className={styles.evCard} data-live="1">
                <PersonFaceThumb
                  className={styles.evPhoto}
                  size="xl"
                  personId={e.personId}
                  personName={e.personName}
                  photoPath={e.photoPath}
                />
                <div className={styles.evBody}>
                  <strong className={styles.evName}>
                    {e.personName || e.personId || "Sin nombre"}
                  </strong>
                  <span className={styles.evMeta}>
                    {e.deviceName || e.deviceIp || "Puerta"}
                  </span>
                  <span className={styles.evTime}>{relAge(e.occurredAt)}</span>
                  <div className={styles.evChips}>
                    <IgBadge tone="ok">{e.label || "Acceso concedido"}</IgBadge>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </IgPanel>
      )}

      <IgPanel
        title={
          quick === "denegados"
            ? "Accesos denegados"
            : quick === "ruido"
              ? "Ruido de equipos"
              : "Timeline de accesos"
        }
        count={String(items.length)}
      >
        {items.length === 0 && !busy ? (
          <div className={styles.igEmpty}>
            <strong className={styles.igEmptyTitle}>Sin eventos</strong>
            <span className={styles.igEmptyHint}>
              {quick === "hoy"
                ? "Aún no hay accesos ACS hoy, o el empuje del terminal no está activo."
                : quick === "denegados"
                  ? "No hay denegados en el rango. Eso puede ser bueno."
                  : "Prueba «Hoy», otro terminal o da de alta la persona."}
            </span>
            <div className={styles.focusActions} style={{ marginTop: 10, justifyContent: "center" }}>
              <IgBtn variant="primary" onClick={() => setQuick("hoy")}>
                Ver hoy
              </IgBtn>
              <IgBtn onClick={() => setQuick("denegados")}>Denegados</IgBtn>
              <IgBtn onClick={() => router.push("/integra/people")}>Ir a Personas</IgBtn>
            </div>
          </div>
        ) : (
          <div className={styles.evGrid}>
            {items.map((e) => {
              const tone = outcomeTone(e.outcome, e.label);
              const fresh =
                Date.now() - Date.parse(e.occurredAt) < 8000 ? "1" : undefined;
              const denied = tone === "danger";
              return (
                <button
                  key={e.id}
                  type="button"
                  className={styles.evCard}
                  data-selected={selected?.id === e.id ? "1" : undefined}
                  data-fresh={fresh}
                  data-denied={denied ? "1" : undefined}
                  onClick={() => setSelected(e)}
                >
                  <PersonFaceThumb
                    className={styles.evPhoto}
                    size="xl"
                    personId={e.personId}
                    personName={e.personName || null}
                    photoPath={e.photoPath}
                  />
                  <div className={styles.evBody}>
                    <strong className={styles.evName}>
                      {e.personName || e.personId || "Sin identidad ACS"}
                    </strong>
                    <span className={styles.evMeta}>
                      {e.deviceName || e.deviceIp || "Puerta"}
                      {e.doorNo != null ? ` · puerta ${e.doorNo}` : ""}
                    </span>
                    <span className={styles.evTime}>{relAge(e.occurredAt)}</span>
                    <div className={styles.evChips}>
                      <IgBadge tone={tone}>
                        {e.label ||
                          (tone === "danger"
                            ? "Acceso denegado"
                            : tone === "ok"
                              ? "Acceso concedido"
                              : e.eventType)}
                      </IgBadge>
                      {e.verifyMode && (
                        <IgBadge tone="accent">{e.verifyMode}</IgBadge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className={styles.evPager}>
          <IgBtn
            disabled={busy || !hasMore || !nextBeforeId}
            onClick={() => void load({ beforeId: nextBeforeId, append: true })}
          >
            Más antiguos →
          </IgBtn>
          <span className={styles.evPagerMeta}>
            {hasMore ? "Hay más en el historial" : "Fin de página"}
            {queryMs != null ? ` · consulta ${queryMs} ms` : ""}
          </span>
        </div>
      </IgPanel>

      {selected && (
        <IgPanel title="Detalle" count={String(selected.id)}>
          <div className={styles.evDetail}>
            <PersonFaceThumb
              className={styles.evDetailPhoto}
              size="xl"
              personId={selected.personId}
              personName={selected.personName || null}
              photoPath={selected.photoPath}
            />
            <div className={styles.evDetailBody}>
              <strong>{selected.personName || "Sin persona ACS"}</strong>
              <span>{fmt(selected.occurredAt)}</span>
              <span>
                Puerta: {selected.deviceName || "—"} ({selected.deviceIp})
              </span>
              <span>
                Resultado:{" "}
                <IgBadge tone={outcomeTone(selected.outcome, selected.label)}>
                  {selected.label || selected.outcome || selected.eventType}
                </IgBadge>
              </span>
              <span>Modo: {selected.verifyMode || "—"}</span>
              <span className={styles.doorCellMeta}>
                ID {selected.personId || "—"} · major/minor{" "}
                {selected.major ?? "—"}/{selected.minor ?? "—"}
              </span>
              {!selected.personId && (
                <IgBtn variant="primary" onClick={() => router.push("/integra/people")}>
                  Dar de alta persona →
                </IgBtn>
              )}
            </div>
          </div>
        </IgPanel>
      )}
    </IgPage>
  );
}

function mergeFresh(prev: PushEvent[], fresh: PushEvent[]): PushEvent[] {
  const map = new Map(prev.map((h) => [h.id, h]));
  for (const h of fresh) {
    const old = map.get(h.id);
    map.set(
      h.id,
      old ? { ...old, ...h, photoPath: h.photoPath || old.photoPath } : h,
    );
  }
  return [...map.values()]
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 240);
}

function csv(v: string | null | undefined): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
