"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { getCachedProvider, subscribeProvider } from "../_caps";
import { inputStyle, selectStyle } from "../_lib";
import { toast } from "@/components/Toast";
import styles from "../integra.module.css";
import {
  ACCESS_PRESETS,
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
  type SchedulesCatalog,
  WEEK_DAYS,
} from "../_schedulesApi";

type ViewMode = "person" | "door" | "matrix";

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
  return <span className={styles.schedWeekSummary}>{summary}</span>;
}

function WeekGridPreview({
  planId,
  catalog,
}: {
  planId: string;
  catalog: SchedulesCatalog;
}) {
  const tpl = catalog.templates.find((t) => t.id === planId);
  if (!tpl || planId === "0") {
    return (
      <div className={styles.schedWeekEmpty}>
        Sin acceso en esta puerta — no abre en ningún horario.
      </div>
    );
  }
  if (tpl.days?.length) {
    return (
      <div className={styles.schedWeekGrid} role="table" aria-label="Horario semanal">
        {WEEK_DAYS.map((d) => {
          const day = tpl.days?.find((x) => x.week === d.key);
          const segs =
            day?.segments.filter((s) => s.enable).map((s) => {
              const a = (s.beginTime || "").slice(0, 5);
              const b = (s.endTime || "").slice(0, 5);
              return `${a}–${b}`;
            }) || [];
          return (
            <div key={d.key} className={styles.schedWeekRow} role="row">
              <span className={styles.schedWeekDay}>{d.short}</span>
              <span className={styles.schedWeekRanges}>
                {segs.length ? segs.join(" · ") : "—"}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className={styles.schedWeekGrid} role="table" aria-label="Resumen horario">
      {WEEK_DAYS.map((d) => {
        const office = planId === "2" || planId === "3";
        const always = planId === "1";
        const weekend = d.key === "Saturday" || d.key === "Sunday";
        let label = "—";
        if (always) label = "00:00–24:00";
        else if (office && !weekend) {
          label = planId === "3" ? "08:00–20:00" : "09:00–18:00";
        }
        return (
          <div key={d.key} className={styles.schedWeekRow} role="row">
            <span className={styles.schedWeekDay}>{d.short}</span>
            <span className={styles.schedWeekRanges} data-off={label === "—" ? "1" : undefined}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function IntegraSchedulesPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [provider, setProvider] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? sessionStorage.getItem("nexara_integra_provider")
      : null,
  );
  const [view, setView] = useState<ViewMode>(
    () => (search.get("view") as ViewMode) || "person",
  );
  const [catalog, setCatalog] = useState<SchedulesCatalog | null>(null);
  const [people, setPeople] = useState<Array<{ id: string; name: string; code?: string }>>(
    [],
  );
  const [personId, setPersonId] = useState(search.get("person") || "");
  const [doorId, setDoorId] = useState(search.get("door") || "");
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

  const matrix = useMemo(() => {
    if (!catalog || view !== "matrix") return null;
    // Matriz ligera: reutiliza personas del directorio + RightPlan via door fetch es caro;
    // mostramos por puerta seleccionada + selector de puerta, y filas de personas.
    return { doors: catalog.doors, people: doorPeople };
  }, [catalog, doorPeople, view]);

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
      const r = await savePersonSchedule(draft);
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
            <IgBtn onClick={() => router.push("/integra/people")}>Personas</IgBtn>
            <IgBtn onClick={() => router.push("/integra/access")}>Puertas</IgBtn>
            <IgBtn onClick={() => void loadCatalog()}>Actualizar</IgBtn>
          </>
        }
      />

      <IgError>{error}</IgError>

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
        {(
          [
            ["person", "Por persona"],
            ["door", "Por puerta"],
            ["matrix", "Matriz puerta"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={styles.schedTab}
            data-on={view === id ? "1" : undefined}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "person" && (
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

          {!people.length && !busy && (
            <div className={styles.igEmpty}>
              <strong className={styles.igEmptyTitle}>Sin personas en el sitio</strong>
              <span className={styles.igEmptyHint}>
                Da de alta en Personas o sincroniza el directorio ACS.
              </span>
              <IgBtn variant="primary" onClick={() => router.push("/integra/people")}>
                Ir a Personas
              </IgBtn>
            </div>
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
                  <div className={styles.schedValidGrid}>
                    <label className={styles.personCheck}>
                      <input
                        type="checkbox"
                        checked={draft.validEnable}
                        onChange={(e) => {
                          setActivePreset(null);
                          setDraft({ ...draft, validEnable: e.target.checked });
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
                            validTo: on
                              ? "2037-12-31T23:59:59"
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
                    <div className={styles.igEmpty}>
                      <strong className={styles.igEmptyTitle}>Sin puertas</strong>
                      <span className={styles.igEmptyHint}>
                        Sincroniza el sitio para cargar el inventario ACS.
                      </span>
                    </div>
                  ) : (
                    <ul className={styles.schedDoorList}>
                      {draft.doorPlans.map((dp) => (
                        <li
                          key={dp.doorId}
                          className={styles.schedDoorRow}
                          data-on={dp.planTemplateNo !== "0" ? "1" : undefined}
                          data-active={previewDoorId === dp.doorId ? "1" : undefined}
                        >
                          <button
                            type="button"
                            className={styles.schedDoorName}
                            onClick={() => setPreviewDoorId(dp.doorId)}
                          >
                            <strong>{dp.doorName || dp.doorId}</strong>
                            <span>{dp.doorId}</span>
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
                      ))}
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
                  <p
                    className={styles.personNote}
                    data-tone={opOk ? "ok" : "warn"}
                  >
                    {opNote}
                  </p>
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
                    La plantilla se asigna por puerta (`RightPlan.planTemplateNo`). El
                    detalle de franjas vive en el calendario del terminal.
                  </p>
                </IgPanel>
              </aside>
            </div>
          )}
        </>
      )}

      {view === "door" && catalog && (
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
            <IgBtn onClick={() => void loadDoor()}>Actualizar lista</IgBtn>
          </IgFilters>

          {doorNote && <IgNotice>{doorNote}</IgNotice>}

          <IgPanel
            title={selectedDoor?.name || "Puerta"}
            count={`${doorPeople.length} con acceso`}
          >
            {!doorPeople.length && !busy ? (
              <div className={styles.igEmpty}>
                <strong className={styles.igEmptyTitle}>Nadie asignado</strong>
                <span className={styles.igEmptyHint}>
                  Nadie tiene horario activo en esta puerta, o el espejo aún no trae
                  RightPlan. Asigna desde la vista Por persona.
                </span>
              </div>
            ) : (
              <ul className={styles.schedDoorPeople}>
                {doorPeople.map((p) => (
                  <li key={p.personId}>
                    <div>
                      <strong>{p.name}</strong>
                      <span className={styles.schedMeta}>
                        {p.code || p.personId}
                        {" · "}
                        {formatValidityLabel(p)}
                      </span>
                    </div>
                    <div className={styles.schedDoorPeopleRight}>
                      <IgBadge>{p.planName || templateLabel(catalog.templates, p.planTemplateNo)}</IgBadge>
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
                ))}
              </ul>
            )}
          </IgPanel>
        </>
      )}

      {view === "matrix" && catalog && (
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
