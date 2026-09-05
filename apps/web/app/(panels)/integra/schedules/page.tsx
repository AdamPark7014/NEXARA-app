"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import DoorFrontIcon from "@mui/icons-material/DoorFront";
import GridOnIcon from "@mui/icons-material/GridOn";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  IgBadge,
  IgBtn,
  IgField,
  IgFilters,
  IgNotice,
  IgPage,
  IgPanel,
  IgToolbar,
} from "../_Console";
import {
  OpResult as OpResultCard,
  PanelEmpty,
  PanelError,
  PanelSkeleton,
  TabPanel,
  Trunc,
  useTabIds,
} from "../_PanelKit";
import { getCachedProvider, subscribeProvider } from "../_caps";
import { inputStyle, selectStyle } from "../_lib";
import { toast } from "@/components/Toast";
import styles from "../integra.module.css";
import css from "../_panels.module.css";
import {
  ACCESS_PRESETS,
  ISAPI_INDEFINITE_END,
  applyPreset,
  fetchDoorAccess,
  fetchPersonSchedule,
  fetchSchedulesCatalog,
  formatValidityLabel,
  listPeopleBrief,
  savePersonSchedule,
  templateLabel,
  type AccessPresetId,
  type DoorAccessRow,
  type OpResult,
  type PersonSchedule,
  type ScheduleDayPlan,
  type ScheduleSegment,
  type SchedulesCatalog,
  WEEK_DAYS,
} from "../_schedulesApi";

type ViewMode = "person" | "door" | "matrix";

const VIEWS: Array<{ id: ViewMode; label: string }> = [
  { id: "person", label: "Por persona" },
  { id: "door", label: "Por puerta" },
  { id: "matrix", label: "Matriz puerta" },
];

function asViewMode(raw: string | null): ViewMode {
  return raw === "door" || raw === "matrix" || raw === "person" ? raw : "person";
}

/* ── Geometría de la barra de 24 h ──────────────────────────────────── */

/** Minutos desde medianoche de un `HH:MM[:SS]` del ACS. */
function minutesOfDay(value: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return Math.min(1440, h * 60 + min);
}

/**
 * Una franja como porcentaje del día. Un fin en `00:00` es la medianoche
 * siguiente, no el mismo instante que el principio: el terminal escribe así
 * el 24 h completo y sin esto la banda salía de ancho cero.
 */
function bandGeometry(seg: ScheduleSegment): { start: number; width: number } | null {
  const a = minutesOfDay(seg.beginTime);
  const rawEnd = minutesOfDay(seg.endTime);
  if (a == null || rawEnd == null) return null;
  const b = rawEnd <= a ? 1440 : rawEnd;
  return { start: (a / 1440) * 100, width: Math.max(1, ((b - a) / 1440) * 100) };
}

function segmentLabel(seg: ScheduleSegment): string {
  const a = (seg.beginTime || "").slice(0, 5) || "??:??";
  const b = (seg.endTime || "").slice(0, 5) || "??:??";
  return `${a}–${b}`;
}

function enabledSegments(days: ScheduleDayPlan[] | undefined, key: string): ScheduleSegment[] {
  return days?.find((d) => d.week === key)?.segments.filter((s) => s.enable !== false) || [];
}

/** Barra de 24 h de un día con sus franjas dibujadas encima. */
function DayBar({ segments, dayLabel }: { segments: ScheduleSegment[]; dayLabel: string }) {
  if (!segments.length) {
    return <span className={css.dayOff}>Cerrado</span>;
  }
  const text = segments.map(segmentLabel).join(" · ");
  return (
    <div className={css.dayCell}>
      <div className={css.dayTrack} title={`${dayLabel}: ${text}`}>
        {segments.map((s, i) => {
          const g = bandGeometry(s);
          if (!g) return null;
          return (
            <span
              key={`${s.beginTime}-${s.endTime}-${i}`}
              className={css.dayBand}
              style={{
                ["--band-start" as string]: `${g.start}%`,
                ["--band-width" as string]: `${g.width}%`,
              }}
            />
          );
        })}
      </div>
      <span className={css.dayText}>{text}</span>
    </div>
  );
}

function OpFanout({ results }: { results: OpResult[] | null }) {
  if (!results?.length) return null;
  return (
    <ul className={styles.schedOpList}>
      {results.map((r) => (
        <li key={r.deviceIp} data-ok={r.ok ? "1" : "0"}>
          <span className={styles.schedOpIp}>{r.deviceIp}</span>
          <span>{r.ok ? "Guardado OK" : r.error || "Falló"}</span>
        </li>
      ))}
    </ul>
  );
}

function WeekStrip({ summary }: { summary?: string }) {
  if (!summary) {
    return <span className={styles.schedWeekMuted}>Sin franjas publicadas</span>;
  }
  return (
    <Trunc text={summary} className={styles.schedWeekSummary} inline />
  );
}

/**
 * Vista semanal de la plantilla asignada a una puerta.
 *
 * Hasta `b4ea923` nada poblaba `days` y esto pintaba un heurístico cableado
 * por id de plantilla (id 2 = 08:00–18:00, id 4 = 18:00–08:00…). Ese mapa
 * describía el catálogo local de respaldo, no el terminal: en cuanto alguien
 * reprogramaba el WeekPlanCfg del ACS, la pantalla seguía enseñando el horario
 * viejo con toda la confianza. Ahora los días llegan del ACS y el heurístico
 * sobra: cuando no hay detalle se dice, y se enseña el resumen que sí publica
 * la API en vez de inventarse franjas.
 */
function WeekGridPreview({ planId, catalog }: { planId: string; catalog: SchedulesCatalog }) {
  const tpl = catalog.templates.find((t) => t.id === planId);
  if (!tpl || planId === "0") {
    return (
      <div className={styles.schedWeekEmpty}>
        Sin acceso en esta puerta — no abre en ningún horario.
      </div>
    );
  }
  if (!tpl.days?.length) {
    return (
      <div className={styles.schedWeekEmpty}>
        <p className={css.matrixNoDetail}>
          <InfoOutlinedIcon className={css.icon} fontSize="small" aria-hidden />
          El terminal no publica el detalle semanal de «{tpl.name}».
        </p>
        {tpl.summary ? (
          <p className={css.dayText}>Resumen del catálogo: {tpl.summary}</p>
        ) : null}
      </div>
    );
  }
  return (
    <table className={css.weekTable}>
      <caption>Horario semanal · {tpl.name}</caption>
      <tbody>
        {WEEK_DAYS.map((d) => {
          const segs = enabledSegments(tpl.days, d.key);
          return (
            <tr key={d.key}>
              <th scope="row" title={d.label}>
                {d.short}
              </th>
              <td>
                <DayBar segments={segs} dayLabel={d.label} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * `useSearchParams` obliga a un límite de Suspense para que Next no falle al
 * prerenderizar. El envoltorio existe solo para eso.
 */
export default function IntegraSchedulesPage() {
  return (
    <Suspense
      fallback={
        <IgPage>
          <IgToolbar title="Horarios de acceso" meta="Cargando…" />
          <PanelSkeleton rows={5} />
        </IgPage>
      }
    >
      <SchedulesConsole />
    </Suspense>
  );
}

function SchedulesConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [provider, setProvider] = useState<string | null>(() => getCachedProvider());
  const initialQ = useMemo(
    () => ({
      person: searchParams.get("person") || "",
      door: searchParams.get("door") || "",
      view: asViewMode(searchParams.get("view")),
    }),
    // Solo la lectura inicial: a partir de ahí manda el estado y la URL lo sigue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const tabIds = useTabIds("sched");
  const [view, setView] = useState<ViewMode>(initialQ.view);
  const [catalog, setCatalog] = useState<SchedulesCatalog | null>(null);
  const [people, setPeople] = useState<Array<{ id: string; name: string; code?: string }>>(
    [],
  );
  const [personId, setPersonId] = useState(initialQ.person);
  const [doorId, setDoorId] = useState(initialQ.door);
  const [draft, setDraft] = useState<PersonSchedule | null>(null);
  const [doorPeople, setDoorPeople] = useState<DoorAccessRow[]>([]);
  const [doorNote, setDoorNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opNote, setOpNote] = useState<string | null>(null);
  const [opOk, setOpOk] = useState<boolean | null>(null);
  const [opResults, setOpResults] = useState<OpResult[] | null>(null);
  const [activePreset, setActivePreset] = useState<AccessPresetId | null>(null);
  const [previewDoorId, setPreviewDoorId] = useState<string | null>(null);

  useEffect(() => subscribeProvider(setProvider), []);

  /**
   * Vista, persona y puerta viven en la URL: así una incidencia se comparte
   * pegando el enlace en vez de explicando qué hay que seleccionar. `replace`
   * y no `push` para no llenar el historial con cada cambio de selector.
   */
  useEffect(() => {
    const next = new URLSearchParams();
    next.set("view", view);
    if (personId) next.set("person", personId);
    if (doorId) next.set("door", doorId);
    const qs = next.toString();
    if (qs !== window.location.search.replace(/^\?/, "")) {
      router.replace(`/integra/schedules?${qs}`, { scroll: false });
    }
  }, [router, view, personId, doorId]);

  const isIsapi = provider === "ISAPI";

  const loadCatalog = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [cat, plist] = await Promise.all([
        fetchSchedulesCatalog(),
        listPeopleBrief(),
      ]);
      setCatalog(cat);
      setPeople(plist);
      setDoorId((cur) => cur || cat.meetingRoomDoorId || cat.doors[0]?.id || "");
      setPersonId((cur) => cur || plist[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar horarios");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const loadPerson = useCallback(async () => {
    if (!catalog || !personId) {
      setDraft(null);
      return;
    }
    setBusy(true);
    setError(null);
    setOpNote(null);
    setOpResults(null);
    setActivePreset(null);
    try {
      const s = await fetchPersonSchedule(personId, catalog);
      setDraft(s);
      setPreviewDoorId(s.doorPlans.find((d) => d.planTemplateNo !== "0")?.doorId || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el horario");
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }, [catalog, personId]);

  useEffect(() => {
    if (view === "person") void loadPerson();
  }, [view, loadPerson]);

  const loadDoor = useCallback(async () => {
    if (!catalog || !doorId) {
      setDoorPeople([]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetchDoorAccess(doorId, catalog);
      setDoorPeople(r.people);
      setDoorNote(r.note || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la puerta");
      setDoorPeople([]);
    } finally {
      setBusy(false);
    }
  }, [catalog, doorId]);

  useEffect(() => {
    if (view === "door" || view === "matrix") void loadDoor();
  }, [view, loadDoor]);

  /**
   * Filas de la matriz: una persona con acceso a la puerta elegida y, por día
   * de la semana, las franjas reales de su plantilla. Leer RightPlan de todas
   * las puertas a la vez es caro, así que la matriz es persona × día para UNA
   * puerta; el selector de arriba cambia de columna activa.
   */
  const matrixRows = useMemo(() => {
    if (!catalog || view !== "matrix") return [];
    return doorPeople.map((p) => {
      const tpl = catalog.templates.find((t) => t.id === p.planTemplateNo);
      const noAccess = !p.planTemplateNo || p.planTemplateNo === "0";
      return {
        row: p,
        planName: p.planName || templateLabel(catalog.templates, p.planTemplateNo),
        noAccess,
        days: noAccess ? undefined : tpl?.days,
      };
    });
  }, [catalog, doorPeople, view]);

  const matrixHasDetail = matrixRows.some((r) => r.days?.length);

  const onPreset = (id: AccessPresetId) => {
    if (!catalog || !draft) return;
    const next = applyPreset(id, catalog, draft);
    setDraft(next);
    setActivePreset(id);
    setPreviewDoorId(next.doorPlans.find((d) => d.planTemplateNo !== "0")?.doorId || null);
    toast.info(`Preset «${ACCESS_PRESETS.find((p) => p.id === id)?.title}» aplicado — revisa y guarda`);
  };

  const setDoorPlan = (doorKey: string, planTemplateNo: string) => {
    if (!catalog || !draft) return;
    setActivePreset(null);
    setDraft({
      ...draft,
      doorPlans: draft.doorPlans.map((d) =>
        d.doorId === doorKey
          ? {
              ...d,
              planTemplateNo,
              planName: templateLabel(catalog.templates, planTemplateNo),
            }
          : d,
      ),
    });
    setPreviewDoorId(doorKey);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setOpNote(null);
    setOpResults(null);
    try {
      const r = await savePersonSchedule(draft, { preset: activePreset });
      setOpOk(r.success);
      setOpNote(
        r.success
          ? r.note || "Horario guardado en los terminales."
          : r.note || "Guardado incompleto — revisa el detalle por terminal.",
      );
      setOpResults(r.results || null);
      if (r.success) {
        toast.success("Horario guardado");
      } else {
        toast.error("Guardado incompleto");
      }
      await loadPerson();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo guardar";
      setError(msg);
      setOpOk(false);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const selectedDoor = catalog?.doors.find((d) => d.id === doorId) || null;
  const previewPlan =
    draft?.doorPlans.find((d) => d.doorId === previewDoorId)?.planTemplateNo || "0";

  return (
    <IgPage>
      <IgToolbar
        title="Horarios de acceso"
        meta={
          catalog
            ? `${catalog.doors.length} puertas · ${people.length} personas · ${
                catalog.source === "live" ? "API live" : "modo compatibilidad"
              }`
            : busy
              ? "Cargando…"
              : "—"
        }
        actions={
          <>
            <IgBtn onClick={() => router.push("/integra/people")}>
              <span className={css.iconBtnLabel}>
                <PeopleAltIcon className={css.icon} fontSize="small" aria-hidden />
                Personas
              </span>
            </IgBtn>
            <IgBtn onClick={() => router.push("/integra/access")}>
              <span className={css.iconBtnLabel}>
                <DoorFrontIcon className={css.icon} fontSize="small" aria-hidden />
                Puertas
              </span>
            </IgBtn>
            <IgBtn onClick={() => void loadCatalog()} disabled={busy}>
              <span className={css.iconBtnLabel}>
                <RefreshIcon className={css.icon} fontSize="small" aria-hidden />
                {busy ? "Actualizando…" : "Actualizar"}
              </span>
            </IgBtn>
          </>
        }
      />

      {error && (
        <PanelError
          title="No se pudieron cargar los horarios"
          message={error}
          onRetry={() => {
            setError(null);
            void loadCatalog();
          }}
        />
      )}

      {catalog?.note && (
        <IgNotice tone="warn">{catalog.note}</IgNotice>
      )}

      {!isIsapi && provider && (
        <IgNotice tone="warn">
          Los horarios semanales ISAPI (RightPlan / Valid) aplican en sitios ISAPI.
          Provider actual: {provider}.
        </IgNotice>
      )}

      <div className={styles.schedTabs} role="tablist" aria-label="Vistas de horario">
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={tabIds.tabId(id)}
            aria-selected={view === id}
            aria-controls={tabIds.panelId(id)}
            tabIndex={view === id ? 0 : -1}
            className={styles.schedTab}
            data-on={view === id ? "1" : undefined}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <TabPanel
        id={tabIds.panelId("person")}
        labelledBy={tabIds.tabId("person")}
        active={view === "person"}
      >
        <>
          <IgFilters>
            <IgField label="Persona">
              <select
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
                style={selectStyle}
              >
                {!people.length && <option value="">— sin personas —</option>}
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.code ? ` · ${p.code}` : ""}
                  </option>
                ))}
              </select>
            </IgField>
            {draft && (
              <IgBadge tone={draft.validEnable === false ? "danger" : draft.indefinite ? "ok" : "warn"}>
                {formatValidityLabel(draft)}
              </IgBadge>
            )}
          </IgFilters>

          {busy && !draft && <PanelSkeleton rows={4} />}

          {!people.length && !busy && (
            <PanelEmpty
              icon={<PeopleAltIcon fontSize="small" />}
              title="Sin personas en el sitio"
              hint="Da de alta en Personas o sincroniza el directorio ACS para que aparezcan aquí."
              action={
                <>
                  <IgBtn variant="primary" onClick={() => router.push("/integra/people")}>
                    Ir a Personas
                  </IgBtn>
                  <IgBtn onClick={() => void loadCatalog()}>Reintentar carga</IgBtn>
                </>
              }
            />
          )}

          {draft && catalog && (
            <div className={styles.schedLayout}>
              <div className={styles.schedMain}>
                <IgPanel title="Presets" count="un clic · revisa · guarda">
                  <div className={styles.schedPresets}>
                    {ACCESS_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={styles.schedPreset}
                        data-tone={p.tone}
                        data-on={activePreset === p.id ? "1" : undefined}
                        onClick={() => onPreset(p.id)}
                      >
                        <strong>{p.title}</strong>
                        <span>{p.blurb}</span>
                      </button>
                    ))}
                  </div>
                </IgPanel>

                <IgPanel title="Vigencia" count="UserInfo.Valid">
                  <p className={styles.personNote}>
                    <strong>Indefinido</strong> = sin fecha fin (terminal guarda
                    2037-12-31). <strong>Temporal</strong> = desmarca «Sin fecha
                    fin» y elige Desde/Hasta. El horario semanal se elige por
                    puerta abajo (plantilla), no en la vigencia.
                  </p>
                  <div className={styles.schedValidGrid}>
                      <label className={styles.personCheck}>
                        <input
                          type="checkbox"
                          checked={draft.validEnable}
                          onChange={(e) => {
                            setActivePreset(null);
                            const on = e.target.checked;
                            setDraft({
                              ...draft,
                              validEnable: on,
                              validMode: on
                                ? draft.indefinite
                                  ? "indefinite"
                                  : "window"
                                : "disabled",
                            });
                          }}
                        />
                        Acceso habilitado
                      </label>
                    <label className={styles.personCheck}>
                      <input
                        type="checkbox"
                        checked={draft.indefinite}
                        onChange={(e) => {
                          setActivePreset(null);
                          const on = e.target.checked;
                          setDraft({
                            ...draft,
                            indefinite: on,
                            validMode: on ? "indefinite" : "window",
                            validTo: on
                              ? ISAPI_INDEFINITE_END
                              : draft.validTo.startsWith("2037")
                                ? `${new Date().toISOString().slice(0, 10)}T23:59:59`
                                : draft.validTo,
                          });
                        }}
                      />
                      Sin fecha fin (indefinido)
                    </label>
                    <IgField label="Desde">
                      <input
                        type="datetime-local"
                        value={toLocalInput(draft.validFrom)}
                        onChange={(e) => {
                          setActivePreset(null);
                          setDraft({
                            ...draft,
                            validFrom: fromLocalInput(e.target.value),
                          });
                        }}
                        style={{ ...inputStyle, maxWidth: "100%" }}
                      />
                    </IgField>
                    <IgField label="Hasta">
                      <input
                        type="datetime-local"
                        value={toLocalInput(draft.validTo)}
                        disabled={draft.indefinite}
                        onChange={(e) => {
                          setActivePreset(null);
                          setDraft({
                            ...draft,
                            indefinite: false,
                            validTo: fromLocalInput(e.target.value),
                          });
                        }}
                        style={{ ...inputStyle, maxWidth: "100%" }}
                      />
                    </IgField>
                  </div>
                  {draft.indefinite && (
                    <p className={styles.personNote}>
                      En el terminal se guarda fin <code>2037-12-31</code> (convención
                      Hikvision para acceso indefinido).
                    </p>
                  )}
                </IgPanel>

                <IgPanel
                  title="Puertas y horario"
                  count={`${draft.doorPlans.filter((d) => d.planTemplateNo !== "0").length}/${draft.doorPlans.length} con acceso`}
                >
                  {!catalog.doors.length ? (
                    <PanelEmpty
                      icon={<DoorFrontIcon fontSize="small" />}
                      title="Sin puertas"
                      hint="Sincroniza el sitio para cargar el inventario ACS."
                      action={<IgBtn onClick={() => void loadCatalog()}>Reintentar</IgBtn>}
                    />
                  ) : (
                    <ul className={styles.schedDoorList}>
                      {draft.doorPlans.map((dp) => {
                        const doorTitle = dp.doorName || dp.doorId;
                        const doorMeta = [
                          dp.deviceIp,
                          dp.present === false ? "no enrolado" : null,
                          dp.error || null,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                        <li
                          key={dp.doorId || dp.deviceIp}
                          className={styles.schedDoorRow}
                          data-on={dp.planTemplateNo !== "0" ? "1" : undefined}
                          data-active={previewDoorId === dp.doorId ? "1" : undefined}
                        >
                          <button
                            type="button"
                            className={styles.schedDoorName}
                            onClick={() => setPreviewDoorId(dp.doorId)}
                            title={`${doorTitle} — ${doorMeta}`}
                          >
                            <strong className={css.trunc}>{doorTitle}</strong>
                            <span className={css.trunc}>{doorMeta}</span>
                          </button>
                          <select
                            value={dp.planTemplateNo}
                            onChange={(e) => setDoorPlan(dp.doorId, e.target.value)}
                            style={{ ...selectStyle, maxWidth: 220 }}
                            aria-label={`Plantilla para ${dp.doorName || dp.doorId}`}
                          >
                            {catalog.templates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          <WeekStrip
                            summary={
                              catalog.templates.find((t) => t.id === dp.planTemplateNo)
                                ?.summary
                            }
                          />
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </IgPanel>

                <div className={styles.schedSaveBar}>
                  <IgBtn
                    variant="primary"
                    disabled={saving || !draft}
                    onClick={() => void save()}
                  >
                    {saving ? "Guardando en terminales…" : "Guardar horario"}
                  </IgBtn>
                  <IgBtn disabled={saving} onClick={() => void loadPerson()}>
                    Descartar cambios
                  </IgBtn>
                </div>

                {opNote && (
                  <OpResultCard
                    tone={opOk ? "ok" : "danger"}
                    title={opOk ? "Horario guardado" : "Guardado incompleto"}
                    hint={opNote}
                    facts={[
                      { label: "Persona", value: draft.name || draft.personId },
                      {
                        label: "Puertas con acceso",
                        value: `${draft.doorPlans.filter((d) => d.planTemplateNo !== "0").length} de ${draft.doorPlans.length}`,
                      },
                      { label: "Vigencia", value: formatValidityLabel(draft) },
                      ...(opResults?.length
                        ? [
                            {
                              label: "Terminales",
                              value: `${opResults.filter((r) => r.ok).length} de ${opResults.length} aceptaron`,
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
                <OpFanout results={opResults} />
              </div>

              <aside className={styles.schedSide}>
                <IgPanel
                  title="Vista semanal"
                  count={
                    previewDoorId
                      ? catalog.doors.find((d) => d.id === previewDoorId)?.name
                      : "elige una puerta"
                  }
                >
                  <WeekGridPreview planId={previewPlan} catalog={catalog} />
                  <p className={styles.personNote}>
                    La plantilla se asigna por puerta (`RightPlan.planTemplateNo`). Las
                    franjas son las que publica el WeekPlanCfg del terminal: si no
                    llegan, aquí se dice en vez de rellenarlas por convención.
                  </p>
                </IgPanel>
              </aside>
            </div>
          )}
        </>
      </TabPanel>

      <TabPanel
        id={tabIds.panelId("door")}
        labelledBy={tabIds.tabId("door")}
        active={view === "door"}
      >
        {!catalog ? (
          <PanelSkeleton rows={4} />
        ) : (
        <>
          <IgFilters>
            <IgField label="Puerta">
              <select
                value={doorId}
                onChange={(e) => setDoorId(e.target.value)}
                style={selectStyle}
              >
                {!catalog.doors.length && <option value="">— sin puertas —</option>}
                {catalog.doors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </IgField>
            <IgBtn onClick={() => void loadDoor()} disabled={busy}>
              <span className={css.iconBtnLabel}>
                <RefreshIcon className={css.icon} fontSize="small" aria-hidden />
                {busy ? "Actualizando…" : "Actualizar lista"}
              </span>
            </IgBtn>
          </IgFilters>

          {doorNote && <IgNotice>{doorNote}</IgNotice>}

          <IgPanel
            title={selectedDoor?.name || "Puerta"}
            count={`${doorPeople.length} con acceso`}
          >
            {busy && !doorPeople.length ? (
              <PanelSkeleton rows={4} />
            ) : !doorPeople.length ? (
              <PanelEmpty
                icon={<DoorFrontIcon fontSize="small" />}
                title="Nadie asignado a esta puerta"
                hint="Nadie tiene horario activo aquí, o el espejo aún no trae RightPlan. Se asigna desde la vista Por persona."
                action={
                  <>
                    <IgBtn variant="primary" onClick={() => setView("person")}>
                      Ir a Por persona
                    </IgBtn>
                    <IgBtn onClick={() => void loadDoor()}>Reintentar</IgBtn>
                  </>
                }
              />
            ) : (
              <ul className={styles.schedDoorPeople}>
                {doorPeople.map((p) => {
                  const meta = `${p.code || p.personId} · ${formatValidityLabel(p)}`;
                  return (
                    <li key={p.personId}>
                      <div>
                        <strong className={css.trunc} title={p.name}>
                          {p.name}
                        </strong>
                        <span className={`${styles.schedMeta} ${css.trunc}`} title={meta}>
                          {meta}
                        </span>
                      </div>
                      <div className={styles.schedDoorPeopleRight}>
                        <IgBadge>
                          {p.planName || templateLabel(catalog.templates, p.planTemplateNo)}
                        </IgBadge>
                        <WeekStrip summary={p.weekSummary} />
                        <IgBtn
                          onClick={() => {
                            setPersonId(p.personId);
                            setView("person");
                          }}
                        >
                          Editar
                        </IgBtn>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </IgPanel>
        </>
        )}
      </TabPanel>

      <TabPanel
        id={tabIds.panelId("matrix")}
        labelledBy={tabIds.tabId("matrix")}
        active={view === "matrix"}
      >
        {!catalog ? (
          <PanelSkeleton rows={5} />
        ) : (
        <>
          <IgFilters>
            <IgField label="Puerta (columna activa)">
              <select
                value={doorId}
                onChange={(e) => setDoorId(e.target.value)}
                style={selectStyle}
              >
                {catalog.doors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </IgField>
            <span className={styles.schedMeta}>
              Matriz persona × puerta: elige la puerta y edita desde la fila.
            </span>
          </IgFilters>

          <IgPanel title="Quién × cuándo" count={selectedDoor?.name}>
            {!matrix?.people.length && !busy ? (
              <div className={styles.igEmpty}>
                <strong className={styles.igEmptyTitle}>Vacío</strong>
                <span className={styles.igEmptyHint}>
                  No hay asignaciones visibles para esta puerta.
                </span>
              </div>
            ) : (
              <div className={styles.schedMatrixWrap}>
                <table className={styles.schedMatrix}>
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th>Vigencia</th>
                      <th>Plantilla</th>
                      <th>Horario</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(matrix?.people || []).map((p) => (
                      <tr key={p.personId}>
                        <td>
                          <strong>{p.name}</strong>
                          <div className={styles.schedMeta}>{p.code || p.personId}</div>
                        </td>
                        <td>{formatValidityLabel(p)}</td>
                        <td>
                          {p.planName ||
                            templateLabel(catalog.templates, p.planTemplateNo)}
                        </td>
                        <td>
                          <WeekStrip summary={p.weekSummary} />
                        </td>
                        <td>
                          <IgBtn
                            onClick={() => {
                              setPersonId(p.personId);
                              setView("person");
                            }}
                          >
                            Editar
                          </IgBtn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </IgPanel>

          <IgPanel title="Todas las puertas del sitio" count={catalog.doors.length}>
            <ul className={styles.schedAllDoors}>
              {catalog.doors.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={styles.schedAllDoorBtn}
                    data-on={d.id === doorId ? "1" : undefined}
                    onClick={() => {
                      setDoorId(d.id);
                      setView("door");
                    }}
                  >
                    <strong>{d.name}</strong>
                    <span>{d.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          </IgPanel>
        </>
      )}
    </IgPage>
  );
}

function toLocalInput(iso: string): string {
  if (!iso) return "";
  // datetime-local wants YYYY-MM-DDTHH:mm
  const cleaned = iso.replace(" ", "T");
  if (cleaned.length >= 16) return cleaned.slice(0, 16);
  if (cleaned.length === 10) return `${cleaned}T00:00`;
  return cleaned;
}

function fromLocalInput(v: string): string {
  if (!v) return "";
  // Persist with seconds like ISAPI Valid.*
  return v.length === 16 ? `${v}:00` : v;
}
