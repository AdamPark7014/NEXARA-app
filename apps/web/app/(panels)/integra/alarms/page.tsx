"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import VideocamIcon from "@mui/icons-material/Videocam";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import ViewAgendaIcon from "@mui/icons-material/ViewAgenda";
import FilterNoneIcon from "@mui/icons-material/FilterNone";

import {
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgPage,
  IgPanel,
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

import styles from "../_soc.module.css";
import {
  SocEmpty,
  SocRawRecord,
  SocRepeatChip,
  SocSeverityPill,
  SocSortableTable,
  SocStatusPill,
  SocTableSkeleton,
  type SocColumn,
  type SocRow,
} from "../_SocBits";
import { SocAlarmDetail } from "../_SocAlarmDetail";
import { useSocAlert } from "../_useSocAlert";
import { useUrlFilters } from "../_useUrlFilters";
import {
  SEVERITY_LABEL,
  SEVERITY_RANK,
  SOC_SEVERITIES,
  STATUS_FILTERS,
  asSingleGroups,
  fmtDateTime,
  groupDuplicateAlarms,
  isAlarmSortKey,
  isPending,
  matchesStatusFilter,
  normalizeSeverity,
  normalizeStatus,
  rawRecordTime,
  rawRecordTitle,
  relAge,
  sortAlarms,
  sourceLabel,
  type AlarmGroup,
  type AlarmItem,
  type AlarmQueueResponse,
  type AlarmSortKey,
  type SortDir,
  type StatusFilter,
} from "../_soc";

/**
 * Cola SOC. Lo que se pinta viene de `GET integra/alarms/queue`, que mezcla dos
 * orígenes (ver `integra.controller.ts:alarmQueue`): la cola push ACS —con
 * foto, persona y contador de repeticiones— y los registros de Artemis.
 *
 * La severidad real del backend es alta / media / baja. No hay «crítica» ni
 * «informativa»: el aviso sonoro se dispara con `alta`, que es el techo.
 */

type ColKey = "sev" | "title" | "src" | "dups" | "time" | "status" | "act";

/** Ventana de fusión en cliente para duplicados que el backend no agrupó. */
const GROUP_WINDOW_MS = 5 * 60_000;

const FILTER_DEFAULTS = {
  estado: "PENDIENTES",
  sev: "todas",
  orden: "time",
  dir: "desc",
  agrupar: "1",
  alarma: "",
} as const;

function isStatusFilter(v: string): v is StatusFilter {
  return STATUS_FILTERS.some((f) => f.value === v);
}

export default function IntegraAlarmsPage() {
  const { user } = useUser();
  // `useUser()` no expone `userJson`: se serializa aquí, como en el resto de
  // páginas que hacen handoff entre paneles (erp/analytics/bi, crm/projects…).
  const userJson = useMemo(() => (user ? JSON.stringify(user) : null), [user]);

  const [filters, setFilters] = useUrlFilters<Record<string, string>>({ ...FILTER_DEFAULTS });
  const statusFilter: StatusFilter = isStatusFilter(filters.estado) ? filters.estado : "PENDIENTES";
  const sevFilter = filters.sev;
  const sortKey: AlarmSortKey = isAlarmSortKey(filters.orden) ? filters.orden : "time";
  const sortDir: SortDir = filters.dir === "asc" ? "asc" : "desc";
  const grouping = filters.agrupar !== "0";
  const selectedId = filters.alarma || null;

  const [items, setItems] = useState<AlarmItem[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [playback, setPlayback] = useState<{ cameraId: string; at: string } | null>(null);
  const [provider, setProvider] = useState<string | null>(() => getCachedProvider());
  const [liveMessage, setLiveMessage] = useState("");
  const isHct = provider === "HCT";

  const alertSound = useSocAlert();
  /** Ids ya vistos: sirve para saber qué alarma es nueva de verdad. */
  const seenIdsRef = useRef<Set<string> | null>(null);

  // Histórico Artemis (colapsable)
  const range0 = useMemo(() => defaultRangeHours(24), []);
  const [showSearch, setShowSearch] = useState(false);
  const [searchItems, setSearchItems] = useState<unknown[]>([]);
  const [searched, setSearched] = useState(false);
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

  /** Anuncia y —si el operador lo encendió— pita cuando entra algo grave y nuevo. */
  const announceNew = useCallback(
    (rows: AlarmItem[]) => {
      const prev = seenIdsRef.current;
      const ids = new Set(rows.map((r) => r.id));
      if (!prev) {
        // Primera carga: no se anuncia el histórico como si acabara de pasar.
        seenIdsRef.current = ids;
        return;
      }
      const fresh = rows.filter((r) => !prev.has(r.id) && isPending(normalizeStatus(r.status)));
      seenIdsRef.current = ids;
      if (!fresh.length) return;

      const graves = fresh.filter((r) => normalizeSeverity(r.severity) === "alta");
      const parts = [
        `${fresh.length} alarma${fresh.length === 1 ? "" : "s"} nueva${fresh.length === 1 ? "" : "s"}`,
        graves.length ? `${graves.length} de severidad alta` : "",
        fresh[0]?.title || "",
      ].filter(Boolean);
      setLiveMessage(parts.join(". "));
      if (graves.length) alertSound.alert();
    },
    [alertSound],
  );

  const loadQueue = useCallback(async () => {
    try {
      const data = await integraApi<AlarmQueueResponse>("integra/alarms/queue?hours=24");
      const rows = Array.isArray(data.items) ? data.items : [];
      setItems(rows);
      setOpenCount(data.openCount ?? 0);
      setError(null);
      announceNew(rows);
    } catch (e) {
      // Un solo aviso: `IgError`. Nada de `setError` + `toast.error` con el
      // mismo texto, que es cómo salen dos alertas por el mismo fallo.
      setError(e instanceof Error ? e.message : "No se pudo cargar la cola de alarmas");
    } finally {
      setLoaded(true);
    }
  }, [announceNew]);

  useEffect(() => {
    void loadQueue();
    const t = window.setInterval(() => void loadQueue(), 7000);
    return () => window.clearInterval(t);
  }, [loadQueue]);

  /* ── Filtrado, agrupación y orden ───────────────────────────────────── */

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (!matchesStatusFilter(normalizeStatus(i.status), statusFilter)) return false;
        if (sevFilter !== "todas") {
          const min = SEVERITY_RANK[normalizeSeverity(sevFilter)];
          if (SEVERITY_RANK[normalizeSeverity(i.severity)] < min) return false;
        }
        return true;
      }),
    [items, statusFilter, sevFilter],
  );

  const groups = useMemo<AlarmGroup[]>(() => {
    const base = grouping ? groupDuplicateAlarms(filtered, GROUP_WINDOW_MS) : asSingleGroups(filtered);
    return sortAlarms(base, sortKey, sortDir);
  }, [filtered, grouping, sortKey, sortDir]);

  const collapsed = useMemo(
    () => filtered.length - groups.length,
    [filtered.length, groups.length],
  );

  const selected = useMemo(
    () => groups.find((g) => g.id === selectedId) || null,
    [groups, selectedId],
  );

  /* ── Acciones ───────────────────────────────────────────────────────── */

  const act = useCallback(
    async (group: AlarmGroup, kind: "ack" | "clear") => {
      setBusy(true);
      try {
        // Si la fila representa varias alarmas fusionadas, se atienden todas:
        // cerrar la de arriba y dejar las gemelas abiertas es cómo vuelven.
        for (const member of group.members) {
          await integraApi(`integra/alarms/${encodeURIComponent(member.id)}/${kind}`, {
            method: "POST",
            body: JSON.stringify({ note: note.trim() || undefined }),
          });
        }
        setNote("");
        setLiveMessage(
          kind === "ack"
            ? `Alarma marcada como atendida: ${group.title}`
            : `Alarma cerrada: ${group.title}`,
        );
        await loadQueue();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar la alarma");
      } finally {
        setBusy(false);
      }
    },
    [loadQueue, note],
  );

  const openTicket = useCallback(
    async (group: AlarmGroup) => {
      const sid = getActiveIntegraSiteId();
      const title = `Alarma Integra: ${group.title}`;
      const description = [
        `Severidad: ${SEVERITY_LABEL[normalizeSeverity(group.severity)]}`,
        sourceLabel(group) ? `Origen: ${sourceLabel(group)}` : null,
        group.personName ? `Persona: ${group.personName}` : null,
        group.timestamp ? `Hora: ${group.timestamp}` : null,
        group.totalOccurrences > 1 ? `Repeticiones: ${group.totalOccurrences}` : null,
        group.note ? `Nota: ${group.note}` : null,
        siteLabel ? `Sitio: ${siteLabel}` : null,
        sid ? `siteId=${sid}` : null,
        `alarmId=${group.id}`,
      ]
        .filter(Boolean)
        .join("\n");
      try {
        const q = sid ? `?siteId=${sid}` : "";
        await integraApi(`integra/alarms/${encodeURIComponent(group.id)}/ticket${q}`, {
          method: "POST",
          body: JSON.stringify({ title, description, severity: group.severity }),
        });
        setLiveMessage(`Ticket creado desde la alarma ${group.title}`);
        await loadQueue();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo crear el ticket";
        if (/cliente operativo|sin cliente|no tiene cliente/i.test(msg)) {
          const qs = new URLSearchParams({ title, description });
          if (sid) qs.set("siteId", String(sid));
          if (siteLabel) qs.set("clientHint", siteLabel);
          window.location.href = resolveCrossPanelHref(`/ops/support/new?${qs.toString()}`, userJson);
          return;
        }
        setError(msg);
      }
    },
    [loadQueue, siteLabel, userJson],
  );

  const onSort = useCallback(
    (key: ColKey) => {
      if (key === "act" || !isAlarmSortKey(key)) return;
      if (key === sortKey) {
        setFilters({ dir: sortDir === "asc" ? "desc" : "asc" });
        return;
      }
      // Severidad, repeticiones y hora se leen mejor de mayor a menor; los
      // textos, alfabéticos.
      const naturalDesc = key === "sev" || key === "dups" || key === "time" || key === "status";
      setFilters({ orden: key, dir: naturalDesc ? "desc" : "asc" });
    },
    [setFilters, sortDir, sortKey],
  );

  /* ── Tabla ──────────────────────────────────────────────────────────── */

  const columns: ReadonlyArray<SocColumn<ColKey>> = [
    { key: "sev", label: "Severidad", width: "128px", sortable: true },
    { key: "title", label: "Alarma", sortable: true },
    { key: "src", label: "Puerta / origen", width: "190px", sortable: true },
    { key: "dups", label: "Reps.", width: "76px", sortable: true, align: "right" },
    { key: "time", label: "Última vez", width: "160px", sortable: true },
    { key: "status", label: "Estado", width: "150px", sortable: true },
    { key: "act", label: "Acciones", width: "220px", align: "right" },
  ];

  const rows: Array<SocRow<ColKey>> = groups.map((g) => {
    const status = normalizeStatus(g.status);
    const canAck = status === "OPEN";
    const canClear = status !== "CLEARED";
    return {
      key: g.id,
      severity: normalizeSeverity(g.severity),
      attended: !isPending(status),
      cells: {
        sev: <SocSeverityPill severity={g.severity} />,
        title: (
          <span className={styles.cellMain}>
            <span className={styles.cellTitle}>{g.title}</span>
            {g.personName && <span className={styles.cellSub}>{g.personName}</span>}
          </span>
        ),
        src: <span className={styles.cellSub}>{sourceLabel(g) || "—"}</span>,
        dups: (
          <SocRepeatChip
            count={g.totalOccurrences}
            hint={
              g.members.length > 1
                ? `${g.members.length} alarmas fusionadas · ${g.totalOccurrences} repeticiones en total`
                : `El backend contó ${g.totalOccurrences} repeticiones con la misma huella`
            }
          />
        ),
        time: (
          <span className={styles.cellMain}>
            <span className={styles.cellMono}>{relAge(g.timestamp || "")}</span>
            <span className={styles.cellSub}>{fmtDateTime(g.timestamp)}</span>
          </span>
        ),
        status: <SocStatusPill status={g.status} />,
        act: (
          <span className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
            {canAck && (
              <button
                type="button"
                className={styles.iconBtn}
                disabled={busy}
                onClick={() => void act(g, "ack")}
                aria-label={`Marcar como atendida: ${g.title}`}
                title="Atender — queda registrada como vista, sigue en la cola"
              >
                <HowToRegIcon aria-hidden />
                Atender
              </button>
            )}
            {canClear && (
              <button
                type="button"
                className={styles.iconBtn}
                disabled={busy}
                onClick={() => void act(g, "clear")}
                aria-label={`Cerrar alarma: ${g.title}`}
                title="Cerrar — sale de la cola"
              >
                <DoneAllIcon aria-hidden />
                Cerrar
              </button>
            )}
            {!isHct && g.cameraIndexCode && g.timestamp && (
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() =>
                  setPlayback({ cameraId: String(g.cameraIndexCode), at: String(g.timestamp) })
                }
                aria-label={`Ver video de la alarma: ${g.title}`}
                title="Saltar al video en el momento de la alarma"
              >
                <VideocamIcon aria-hidden />
              </button>
            )}
            <button
              type="button"
              className={styles.iconBtn}
              disabled={busy || g.ticketRequestId != null}
              onClick={() => void openTicket(g)}
              aria-label={
                g.ticketRequestId != null
                  ? `Ya tiene ticket #${g.ticketRequestId}`
                  : `Crear ticket desde la alarma: ${g.title}`
              }
              title={
                g.ticketRequestId != null
                  ? `Ya escalada al ticket #${g.ticketRequestId}`
                  : "Escalar a ticket de operaciones"
              }
            >
              <ConfirmationNumberIcon aria-hidden />
            </button>
          </span>
        ),
      },
    };
  });

  const pendientes = groups.filter((g) => isPending(normalizeStatus(g.status))).length;

  return (
    <IgPage>
      <IgToolbar
        title="Alarmas"
        meta={
          <>
            {openCount} pendiente{openCount === 1 ? "" : "s"} en el sitio · cola SOC
            {collapsed > 0 && ` · ${collapsed} duplicada${collapsed === 1 ? "" : "s"} agrupada${collapsed === 1 ? "" : "s"}`}
          </>
        }
        actions={
          <>
            <button
              type="button"
              className={styles.toggle}
              data-on={alertSound.enabled ? "1" : undefined}
              onClick={alertSound.toggle}
              aria-pressed={alertSound.enabled}
              aria-label={
                alertSound.enabled
                  ? "Desactivar aviso sonoro de alarmas de severidad alta"
                  : "Activar aviso sonoro de alarmas de severidad alta"
              }
              title={
                alertSound.unsupported
                  ? "Este navegador no deja reproducir el aviso"
                  : "Pita cuando entra una alarma nueva de severidad alta. Se recuerda entre sesiones."
              }
            >
              {alertSound.enabled ? <VolumeUpIcon aria-hidden /> : <VolumeOffIcon aria-hidden />}
              Aviso sonoro {alertSound.enabled ? "activo" : "apagado"}
            </button>
            <IgBtn onClick={() => void loadQueue()} disabled={busy} aria-label="Actualizar la cola">
              <RefreshIcon aria-hidden style={{ width: 14, height: 14, verticalAlign: "-2px" }} />{" "}
              Actualizar
            </IgBtn>
          </>
        }
      />

      {/* La cola es en vivo: lo nuevo se anuncia sin robar el foco. */}
      <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>

      <IgError>{error}</IgError>

      {alertSound.unsupported && (
        <p className={styles.hint}>
          El navegador no permite reproducir el aviso sonoro. La cola sigue actualizándose en
          pantalla.
        </p>
      )}

      <IgFilters>
        <IgField label="Estado">
          <select
            value={statusFilter}
            onChange={(e) => setFilters({ estado: e.target.value })}
            style={{ ...inputStyle, maxWidth: 240 }}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </IgField>
        <IgField label="Severidad mínima">
          <select
            value={sevFilter}
            onChange={(e) => setFilters({ sev: e.target.value })}
            style={{ ...inputStyle, maxWidth: 160 }}
          >
            <option value="todas">Todas</option>
            {SOC_SEVERITIES.filter((s) => s !== "desconocida").map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]} o más
              </option>
            ))}
          </select>
        </IgField>
        <IgField label="Nota al atender o cerrar">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="opcional"
            style={inputStyle}
          />
        </IgField>
      </IgFilters>

      <div className={styles.utilBar}>
        <button
          type="button"
          className={styles.toggle}
          data-on={grouping ? "1" : undefined}
          onClick={() => setFilters({ agrupar: grouping ? "0" : "1" })}
          aria-pressed={grouping}
          aria-label={
            grouping
              ? "Desagrupar duplicados y ver una fila por alarma"
              : "Agrupar duplicados en una fila con contador"
          }
          title="Misma puerta, misma persona y mismo tipo en 5 minutos = una fila con contador"
        >
          {grouping ? <FilterNoneIcon aria-hidden /> : <ViewAgendaIcon aria-hidden />}
          {grouping ? "Duplicados agrupados" : "Una fila por alarma"}
        </button>
        <span className={styles.utilSpacer} />
        <span className={styles.cellMono}>
          {groups.length} fila{groups.length === 1 ? "" : "s"} · {pendientes} pendiente
          {pendientes === 1 ? "" : "s"}
        </span>
      </div>

      <IgPanel title="Cola" count={String(groups.length)}>
        {!loaded ? (
          <SocTableSkeleton rows={6} />
        ) : (
          <SocSortableTable<ColKey>
            caption="Alarmas de la cola SOC. Ordenable por severidad, alarma, puerta, repeticiones, hora y estado."
            columns={columns}
            rows={rows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            selectedKey={selectedId}
            onRowClick={(key) => setFilters({ alarma: key === selectedId ? "" : key })}
            empty={
              statusFilter === "PENDIENTES" || statusFilter === "OPEN" ? (
                <SocEmpty
                  tone="ok"
                  icon={<VerifiedUserIcon aria-hidden />}
                  title="Ninguna alarma pendiente"
                  hint="El sitio está tranquilo en las últimas 24 h. Cuando un terminal deniegue un acceso o alguien entre fuera de horario, aparecerá aquí sola."
                  actions={
                    <IgBtn onClick={() => setFilters({ estado: "TODAS" })}>
                      Ver también las atendidas
                    </IgBtn>
                  }
                />
              ) : (
                <SocEmpty
                  icon={<SearchIcon aria-hidden />}
                  title="Sin alarmas en este filtro"
                  hint={
                    statusFilter === "CLEARED"
                      ? "La cola del backend descarta las alarmas cerradas de origen push (listQueue filtra status ≠ CLEARED), así que aquí solo pueden salir las cerradas de Artemis."
                      : "Prueba con «Todas» o baja la severidad mínima."
                  }
                  actions={<IgBtn onClick={() => setFilters({ estado: "TODAS", sev: "todas" })}>Quitar filtros</IgBtn>}
                />
              )
            }
          />
        )}
      </IgPanel>

      {selected && (
        <IgPanel
          title="Detalle de la alarma"
          count={selected.id}
          actions={
            <IgBtn onClick={() => setFilters({ alarma: "" })} aria-label="Cerrar el detalle">
              Cerrar detalle
            </IgBtn>
          }
        >
          <SocAlarmDetail
            group={selected}
            actions={
              <>
                {normalizeStatus(selected.status) === "OPEN" && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    disabled={busy}
                    onClick={() => void act(selected, "ack")}
                    aria-label={`Marcar como atendida: ${selected.title}`}
                  >
                    <HowToRegIcon aria-hidden />
                    Atender
                  </button>
                )}
                {normalizeStatus(selected.status) !== "CLEARED" && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    disabled={busy}
                    onClick={() => void act(selected, "clear")}
                    aria-label={`Cerrar alarma: ${selected.title}`}
                  >
                    <DoneAllIcon aria-hidden />
                    Cerrar
                  </button>
                )}
                {!isHct && selected.cameraIndexCode && selected.timestamp && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() =>
                      setPlayback({
                        cameraId: String(selected.cameraIndexCode),
                        at: String(selected.timestamp),
                      })
                    }
                    aria-label={`Ver video de la alarma: ${selected.title}`}
                  >
                    <VideocamIcon aria-hidden />
                    Ver video
                  </button>
                )}
                <button
                  type="button"
                  className={styles.iconBtn}
                  disabled={busy || selected.ticketRequestId != null}
                  onClick={() => void openTicket(selected)}
                  aria-label={
                    selected.ticketRequestId != null
                      ? `Ya tiene ticket #${selected.ticketRequestId}`
                      : `Crear ticket desde la alarma: ${selected.title}`
                  }
                >
                  <ConfirmationNumberIcon aria-hidden />
                  {selected.ticketRequestId != null
                    ? `Ticket #${selected.ticketRequestId}`
                    : "Crear ticket"}
                </button>
              </>
            }
          />
        </IgPanel>
      )}

      {!isHct && (
        <details
          style={{ marginTop: 16 }}
          open={showSearch}
          onToggle={(e) => setShowSearch((e.target as HTMLDetailsElement).open)}
        >
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 650 }}>
            Búsqueda histórica (avanzado)
          </summary>
          <IgFilters>
            <IgField label="Desde">
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                style={inputStyle}
              />
            </IgField>
            <IgField label="Hasta">
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                style={inputStyle}
              />
            </IgField>
            <IgBtn
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const data = await integraApi<{
                    list?: unknown[];
                    data?: { list?: unknown[] };
                  }>("integra/alarms/search", {
                    method: "POST",
                    body: JSON.stringify({
                      pageNo: 1,
                      pageSize: 50,
                      startTime: fromDatetimeLocalValue(start),
                      endTime: fromDatetimeLocalValue(end),
                    }),
                  });
                  setSearchItems(data?.list || data?.data?.list || []);
                  setSearched(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "No se pudo buscar en el histórico");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <SearchIcon aria-hidden style={{ width: 14, height: 14, verticalAlign: "-2px" }} />{" "}
              Buscar
            </IgBtn>
          </IgFilters>

          {searchItems.length > 0 ? (
            <div className={styles.recordGrid}>
              {searchItems.slice(0, 20).map((row, i) => (
                <SocRawRecord
                  key={i}
                  title={rawRecordTitle(row)}
                  meta={<span className={styles.cellMono}>{fmtDateTime(rawRecordTime(row))}</span>}
                  raw={row}
                />
              ))}
            </div>
          ) : searched ? (
            <SocEmpty
              icon={<SearchIcon aria-hidden />}
              title="Sin registros en ese rango"
              hint="Artemis no devolvió eventos entre esas dos fechas. Amplía el rango o revisa que el sitio tenga conexión."
            />
          ) : null}

          {searchItems.length > 20 && (
            <p className={styles.hint}>
              Se muestran 20 de {searchItems.length} registros. Afina el rango para ver el resto.
            </p>
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
