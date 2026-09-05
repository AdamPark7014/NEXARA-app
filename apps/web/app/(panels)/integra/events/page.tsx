"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AccountBoxIcon from "@mui/icons-material/AccountBox";
import BlockIcon from "@mui/icons-material/Block";
import DownloadIcon from "@mui/icons-material/Download";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import HistoryIcon from "@mui/icons-material/History";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import RefreshIcon from "@mui/icons-material/Refresh";
import SensorsIcon from "@mui/icons-material/Sensors";
import SensorsOffIcon from "@mui/icons-material/SensorsOff";
import TimelineIcon from "@mui/icons-material/Timeline";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
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
import soc from "../_soc.module.css";
import { SocCardsSkeleton, SocEmpty } from "../_SocBits";
import { SocSequenceList } from "../_SocSequence";
import { correlateEvents, SEQUENCE_WINDOW_MS } from "../_soc";
import { useUrlFilters } from "../_useUrlFilters";
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

/** Los iconos de MUI vienen a 24 px; dentro de un botón de texto cantan. */
const ICON = { width: 14, height: 14, verticalAlign: "-2px" } as const;

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

const FILTER_DEFAULTS = {
  vista: "hoy",
  puerta: "",
  persona: "",
  pid: "",
  modo: "correlado",
  evento: "",
} as const;

function isQuickFilter(v: string): v is QuickFilter {
  return v === "hoy" || v === "denegados" || v === "todos" || v === "ruido";
}

export default function IntegraEventsPage() {
  const router = useRouter();

  // Los filtros viven en la URL: una vista filtrada se comparte pegando el
  // enlace, que es como un operador le pasa un caso a otro.
  const [filters, setFilters] = useUrlFilters<Record<string, string>>({ ...FILTER_DEFAULTS });
  const quick: QuickFilter = isQuickFilter(filters.vista) ? filters.vista : "hoy";
  const deviceIp = filters.puerta;
  const personName = filters.persona;
  const personId = filters.pid;
  const correlated = filters.modo !== "rejilla";
  const selectedId = Number(filters.evento) || null;

  // Borrador de los campos de texto. Antes cada tecla disparaba una consulta
  // al API (`load` dependía del valor en vivo) pese a haber un botón «Filtrar».
  // Ahora se escribe en local y se confirma al enviar.
  const [draftName, setDraftName] = useState(personName);
  const [draftId, setDraftId] = useState(personId);
  useEffect(() => setDraftName(personName), [personName]);
  useEffect(() => setDraftId(personId), [personId]);

  const [items, setItems] = useState<PushEvent[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [queryMs, setQueryMs] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const newestIdRef = useRef(0);
  const [, setTick] = useState(0);

  const selected = useMemo(
    () => items.find((e) => e.id === selectedId) || null,
    [items, selectedId],
  );
  const setSelected = useCallback(
    (ev: PushEvent | null) => setFilters({ evento: ev ? String(ev.id) : "" }),
    [setFilters],
  );

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
        // Un único aviso, el de `IgError`. Nada de `setError` + `toast.error`
        // con el mismo texto: son dos ventanas para el mismo fallo.
        setError(e instanceof Error ? e.message : "Error al cargar eventos");
      } finally {
        setBusy(false);
        setLoaded(true);
      }
    },
    [buildQuery],
  );

  useEffect(() => {
    void load();
    void loadStats();
  }, [load, loadStats]);

  /**
   * Lo que entra en vivo se dice en voz alta para quien no mira la pantalla.
   * Es `polite`: anuncia al terminar la frase en curso, sin robar el foco ni
   * interrumpir lo que el operador esté leyendo.
   */
  const announce = useCallback((fresh: PushEvent[]) => {
    if (!fresh.length) return;
    const denied = fresh.filter(
      (e) => e.outcome === "denied" || /denegado/i.test(e.label || ""),
    );
    const last = fresh[fresh.length - 1];
    const quien = last?.personName?.trim() || "sin identidad ACS";
    const donde = last?.deviceName || last?.deviceIp || "puerta";
    setLiveMessage(
      denied.length
        ? `${denied.length} acceso${denied.length === 1 ? "" : "s"} denegado${denied.length === 1 ? "" : "s"}. Último: ${quien} en ${donde}`
        : `${fresh.length} evento${fresh.length === 1 ? "" : "s"} nuevo${fresh.length === 1 ? "" : "s"}. Último: ${quien} en ${donde}`,
    );
  }, []);

  // Live: SSE fan-out + afterId barato (solo ACS de negocio).
  useEffect(() => {
    return subscribePushEvents((events: PushEvent[]) => {
      const fresh = events.filter(isAcsBusiness);
      if (!fresh.length) return;
      for (const e of fresh) {
        if (e.personId) prefetchPersonFace(e.personId);
        if (e.id > newestIdRef.current) newestIdRef.current = e.id;
      }
      let shown: PushEvent[];
      if (quick === "denegados") {
        const denied = fresh.filter(
          (e) =>
            e.outcome === "denied" || /denegado/i.test(e.label || ""),
        );
        if (!denied.length) return;
        shown = denied;
        setItems((prev) => mergeFresh(prev, denied));
      } else if (quick === "ruido") {
        return;
      } else {
        shown = fresh;
        setItems((prev) => mergeFresh(prev, fresh));
      }
      announce(shown);
      void loadStats();
    });
  }, [quick, loadStats, announce]);

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
        announce(list);
        if (typeof data.ms === "number") setQueryMs(data.ms);
      } catch {
        /* silencioso: SSE puede estar sano */
      }
    };
    const id = window.setInterval(() => void tick(), 4000);
    return () => window.clearInterval(id);
  }, [auto, quick, buildQuery, announce]);

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

  /**
   * Un denegado, un reintento y una entrada concedida en la misma puerta y el
   * mismo minuto son la misma historia. Se agrupan por puerta y ventana; la
   * lógica está en `correlateEvents()`, que es pura y tiene pruebas.
   */
  const sequences = useMemo(() => correlateEvents(items, SEQUENCE_WINDOW_MS), [items]);
  const multiEventSequences = useMemo(
    () => sequences.filter((s) => s.events.length > 1).length,
    [sequences],
  );

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
              onClick={() => router.push("/integra/people")}
              aria-label="Ir a Personas para dar de alta y enrolar Face ID"
              title="Alta y Face ID en terminales"
            >
              <PersonAddIcon aria-hidden style={ICON} /> Alta persona
            </IgBtn>
            <IgBtn
              onClick={() => setAuto((v) => !v)}
              aria-pressed={auto}
              aria-label={
                auto
                  ? "Desactivar la actualización en vivo de eventos"
                  : "Activar la actualización en vivo de eventos"
              }
              title="Con «vivo» los eventos entran solos por SSE, sin recargar"
            >
              {auto ? (
                <SensorsIcon aria-hidden style={ICON} />
              ) : (
                <SensorsOffIcon aria-hidden style={ICON} />
              )}{" "}
              Vivo {auto ? "ON" : "OFF"}
            </IgBtn>
            <IgBtn
              onClick={exportCsv}
              disabled={!items.length}
              aria-label="Exportar a CSV los eventos que se están viendo"
            >
              <DownloadIcon aria-hidden style={ICON} /> Exportar CSV
            </IgBtn>
            <IgBtn
              disabled={busy}
              onClick={() => {
                void load();
                void loadStats();
              }}
              aria-label="Volver a cargar los eventos"
            >
              <RefreshIcon aria-hidden style={ICON} /> {busy ? "…" : "Actualizar"}
            </IgBtn>
          </>
        }
      />

      {/* La lista es en vivo: lo que entra se anuncia sin robar el foco. */}
      <p className={soc.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>

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
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} role="group" aria-label="Vista rápida">
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
                onClick={() => setFilters({ vista: k, evento: "" })}
                aria-pressed={quick === k}
              >
                {label}
              </IgBtn>
            ))}
          </div>
        </IgField>
        <IgField label="Puerta / terminal">
          <select
            value={deviceIp}
            onChange={(e) => setFilters({ puerta: e.target.value })}
            style={selectStyle}
            aria-label="Filtrar por puerta o terminal"
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
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setFilters({ persona: draftName, pid: draftId });
            }}
            placeholder="contiene…"
            style={inputStyle}
            aria-label="Filtrar por nombre de persona; pulsa Intro para aplicar"
          />
        </IgField>
        <IgField label="ID persona">
          <input
            value={draftId}
            onChange={(e) => setDraftId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setFilters({ persona: draftName, pid: draftId });
            }}
            placeholder="opcional"
            style={inputStyle}
            aria-label="Filtrar por identificador de persona; pulsa Intro para aplicar"
          />
        </IgField>
        <IgField label=" ">
          <IgBtn
            variant="primary"
            disabled={busy}
            onClick={() => setFilters({ persona: draftName, pid: draftId })}
            aria-label="Aplicar los filtros de persona"
          >
            Filtrar
          </IgBtn>
        </IgField>
      </IgFilters>

      {/* Modo de lectura de la lista. Correlado agrupa por puerta y minuto. */}
      <div className={soc.utilBar}>
        <button
          type="button"
          className={soc.toggle}
          data-on={correlated ? "1" : undefined}
          onClick={() => setFilters({ modo: correlated ? "rejilla" : "correlado" })}
          aria-pressed={correlated}
          aria-label={
            correlated
              ? "Ver los eventos sueltos en rejilla, sin correlacionar"
              : "Agrupar los eventos por puerta y ventana de un minuto"
          }
          title="Misma puerta y menos de un minuto de silencio entre eventos = una sola historia"
        >
          {correlated ? <TimelineIcon aria-hidden /> : <ViewModuleIcon aria-hidden />}
          {correlated ? "Correlado por puerta" : "Rejilla suelta"}
        </button>
        <span className={soc.utilSpacer} />
        <span className={soc.cellMono}>
          {correlated
            ? `${sequences.length} secuencia${sequences.length === 1 ? "" : "s"}${
                multiEventSequences > 0 ? ` · ${multiEventSequences} con varios eventos` : ""
              }`
            : `${items.length} evento${items.length === 1 ? "" : "s"}`}
        </span>
      </div>

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
        {!loaded ? (
          <SocCardsSkeleton cards={8} />
        ) : items.length === 0 ? (
          quick === "denegados" ? (
            /* Cero denegados es la noticia buena: tras corregir los códigos ACS
               (minor 21/22/23/24 no son denegaciones) lo normal es que esté
               vacío. Denegaciones reales en tres meses: una. */
            <SocEmpty
              tone="ok"
              icon={<BlockIcon aria-hidden />}
              title="Ningún acceso denegado"
              hint="Nadie se ha quedado fuera en este rango. Antes esta lista se llenaba con la puerta abriéndose y el botón de salida; ya no se cuentan como denegación, así que vacía es lo esperable."
              actions={
                <IgBtn onClick={() => setFilters({ vista: "hoy" })}>Ver todos los accesos de hoy</IgBtn>
              }
            />
          ) : quick === "ruido" ? (
            <SocEmpty
              icon={<SensorsOffIcon aria-hidden />}
              title="Sin ruido de equipos"
              hint="Ningún heartBeat ni detección de cámara en las últimas 6 horas."
              actions={<IgBtn onClick={() => setFilters({ vista: "hoy" })}>Volver a accesos</IgBtn>}
            />
          ) : (
            <SocEmpty
              icon={<HistoryIcon aria-hidden />}
              title={quick === "hoy" ? "Todavía no hay accesos hoy" : "Sin eventos en este filtro"}
              hint={
                quick === "hoy"
                  ? "O aún no ha pasado nadie, o el empuje del terminal no está llegando. Prueba «7 días»: si ahí tampoco hay nada, el problema es el empuje, no la jornada."
                  : "Ninguna combinación de puerta y persona coincide en este rango."
              }
              actions={
                <>
                  <IgBtn variant="primary" onClick={() => setFilters({ vista: "todos" })}>
                    Buscar en 7 días
                  </IgBtn>
                  <IgBtn
                    onClick={() => setFilters({ puerta: "", persona: "", pid: "" })}
                    aria-label="Quitar los filtros de puerta y persona"
                  >
                    <FilterAltOffIcon aria-hidden style={ICON} /> Quitar filtros
                  </IgBtn>
                  <IgBtn onClick={() => router.push("/integra/people")}>
                    <AccountBoxIcon aria-hidden style={ICON} /> Ir a Personas
                  </IgBtn>
                </>
              }
            />
          )
        ) : correlated ? (
          <SocSequenceList
            sequences={sequences}
            selectedId={selectedId}
            onSelect={(ev) => setSelected(ev)}
          />
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
                  aria-label={`${e.personName || e.personId || "Sin identidad ACS"}, ${
                    e.label || (denied ? "acceso denegado" : "acceso concedido")
                  }, ${e.deviceName || e.deviceIp || "puerta"}, ${fmt(e.occurredAt)}. Ver detalle`}
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
            aria-label="Cargar eventos más antiguos"
          >
            <HistoryIcon aria-hidden style={ICON} /> Más antiguos
          </IgBtn>
          <span className={styles.evPagerMeta}>
            {hasMore ? "Hay más en el historial" : "Fin de página"}
            {queryMs != null ? ` · consulta ${queryMs} ms` : ""}
          </span>
        </div>
      </IgPanel>

      {selected && (
        <IgPanel
          title="Detalle"
          count={String(selected.id)}
          actions={
            <IgBtn onClick={() => setSelected(null)} aria-label="Cerrar el detalle del evento">
              Cerrar detalle
            </IgBtn>
          }
        >
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
