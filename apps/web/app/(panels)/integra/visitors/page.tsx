"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IgBadge,
  IgBtn,
  IgEmptyState,
  IgError,
  IgField,
  IgFilters,
  IgNotice,
  IgPage,
  IgPanel,
  IgSplit,
  IgTable,
  IgToolbar,
} from "../_Console";
import {
  defaultRangeHours,
  fromDatetimeLocalValue,
  inputStyle,
  integraApi,
  selectStyle,
} from "../_lib";
import { toast } from "@/components/Toast";
import styles from "../integra.module.css";
import {
  WEEK_DAYS,
  cancelRecurringVisitor,
  createRecurringVisitor,
  defaultRecurringDraft,
  fileToJpegBase64,
  listHostEmployees,
  listRecurringVisitors,
  listVisitorDoors,
  statusUi,
  weekdaysLabel,
  type HostEmployee,
  type RecurringVisitor,
  type ScheduleDoor,
  type WeekDay,
} from "../_visitorsApi";

type Tab = "once" | "recurring";

export default function IntegraVisitorsPage() {
  const range0 = useMemo(() => defaultRangeHours(8), []);
  const [tab, setTab] = useState<Tab>("recurring");

  // ── Visita única (Artemis / QR) ────────────────────────────────────
  const [visitorName, setVisitorName] = useState("");
  const [phoneNo, setPhoneNo] = useState("");
  const [gender, setGender] = useState("1");
  const [visitStart, setVisitStart] = useState(range0.start);
  const [visitEnd, setVisitEnd] = useState(range0.end);
  const [receptionistId, setReceptionistId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [orderId, setOrderId] = useState("");
  const [qrOut, setQrOut] = useState<string | null>(null);
  const [inbox, setInbox] = useState<any[]>([]);
  const [inboxNote, setInboxNote] = useState<string | null>(null);
  const [onceBusy, setOnceBusy] = useState(false);

  // ── Recurrente ─────────────────────────────────────────────────────
  const draft0 = useMemo(() => defaultRecurringDraft(), []);
  const [doors, setDoors] = useState<ScheduleDoor[]>([]);
  const [hosts, setHosts] = useState<HostEmployee[]>([]);
  const [recurring, setRecurring] = useState<RecurringVisitor[]>([]);
  const [apiReady, setApiReady] = useState(true);
  const [apiNote, setApiNote] = useState<string | null>(null);
  const [catalogNote, setCatalogNote] = useState<string | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [savingRec, setSavingRec] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [rName, setRName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [rHostId, setRHostId] = useState("");
  const [rDoorIds, setRDoorIds] = useState<string[]>([]);
  const [rTimeFrom, setRTimeFrom] = useState(draft0.timeFrom);
  const [rTimeTo, setRTimeTo] = useState(draft0.timeTo);
  const [rWeekdays, setRWeekdays] = useState<WeekDay[]>(draft0.weekdays);
  const [rValidFrom, setRValidFrom] = useState(draft0.validFrom);
  const [rValidTo, setRValidTo] = useState(draft0.validTo);
  const [rFaceB64, setRFaceB64] = useState<string | null>(null);
  const [rFacePreview, setRFacePreview] = useState<string | null>(null);
  const [rFaceName, setRFaceName] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setInboxNote(null);
    try {
      const data = await integraApi<any>("integra/visitors/search", {
        method: "POST",
        body: JSON.stringify({
          pageNo: 1,
          pageSize: 40,
          visitStartTime: fromDatetimeLocalValue(range0.start),
          visitEndTime: fromDatetimeLocalValue(range0.end),
        }),
      });
      const list = data?.list || data?.data?.list || (Array.isArray(data) ? data : []);
      setInbox(list);
      if (!list.length) {
        setInboxNote(
          "Sin citas en el rango (módulo Artemis) o sitio ISAPI sin visitas cloud.",
        );
      }
    } catch (e) {
      setInbox([]);
      setInboxNote(e instanceof Error ? e.message : "Inbox no disponible");
    }
  }, [range0.end, range0.start]);

  const loadRecurring = useCallback(async () => {
    setLoadingRec(true);
    setError(null);
    try {
      const [list, doorPack, hostList] = await Promise.all([
        listRecurringVisitors(),
        listVisitorDoors(),
        listHostEmployees(),
      ]);
      setRecurring(list.items);
      setApiReady(list.apiReady);
      setApiNote(list.note || null);
      setDoors(doorPack.doors);
      setCatalogNote(doorPack.note || null);
      setHosts(hostList);

      setRDoorIds((cur) => {
        if (cur.length) return cur;
        const prefer = doorPack.doors.filter((d) =>
          /junta|general|acceso|meeting/i.test(d.name),
        );
        const seed = prefer.length ? prefer : doorPack.doors.slice(0, 2);
        return seed.map((d) => d.id);
      });
      setRHostId((cur) => cur || hostList[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar visitas");
    } finally {
      setLoadingRec(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "once") void loadInbox();
    else void loadRecurring();
  }, [tab, loadInbox, loadRecurring]);

  const hostName = useMemo(
    () => hosts.find((h) => h.id === rHostId)?.name,
    [hosts, rHostId],
  );

  const canSubmitRec =
    rName.trim().length > 1 &&
    rDoorIds.length > 0 &&
    rWeekdays.length > 0 &&
    Boolean(rValidFrom && rValidTo) &&
    rTimeFrom < rTimeTo;

  const toggleDoor = (id: string) => {
    setRDoorIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  };

  const toggleDay = (day: WeekDay) => {
    setRWeekdays((cur) =>
      cur.includes(day) ? cur.filter((x) => x !== day) : [...cur, day],
    );
  };

  const onFaceFile = async (file: File | null) => {
    if (!file) {
      setRFaceB64(null);
      setRFacePreview(null);
      setRFaceName(null);
      return;
    }
    try {
      const b64 = await fileToJpegBase64(file);
      setRFaceB64(b64);
      setRFacePreview(URL.createObjectURL(file));
      setRFaceName(file.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Foto inválida");
      setRFaceB64(null);
      setRFacePreview(null);
      setRFaceName(null);
    }
  };

  const submitRecurring = async () => {
    if (!canSubmitRec) return;
    setSavingRec(true);
    setError(null);
    try {
      const created = await createRecurringVisitor({
        visitorName: rName.trim(),
        phone: rPhone.trim() || undefined,
        hostEmployeeId: rHostId || undefined,
        hostEmployeeName: hostName,
        doorIds: rDoorIds,
        timeFrom: rTimeFrom,
        timeTo: rTimeTo,
        weekdays: rWeekdays,
        validFrom: rValidFrom,
        validTo: rValidTo,
        faceBase64: rFaceB64 || undefined,
      });
      toast.success(
        created.status === "synced"
          ? `${created.visitorName} en terminales`
          : `${created.visitorName} registrada — sincronizando`,
      );
      setRName("");
      setRPhone("");
      setRFaceB64(null);
      setRFacePreview(null);
      setRFaceName(null);
      await loadRecurring();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo crear la visita";
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingRec(false);
    }
  };

  const onCancel = async (row: RecurringVisitor) => {
    if (row.status === "cancelled") return;
    const ok = window.confirm(
      `¿Cancelar la recurrencia de «${row.visitorName}»?\nSe deshabilitará su acceso en los terminales ACS.`,
    );
    if (!ok) return;
    setCancellingId(row.id);
    setError(null);
    try {
      const r = await cancelRecurringVisitor(row.id);
      toast.success(r.note || "Acceso deshabilitado");
      await loadRecurring();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo cancelar";
      setError(msg);
      toast.error(msg);
    } finally {
      setCancellingId(null);
    }
  };

  const upcoming = useMemo(() => {
    const rank = (s: string) => {
      const n = statusUi(s).tone;
      if (n === "ok") return 0;
      if (n === "warn") return 1;
      if (n === "danger") return 2;
      return 3;
    };
    return [...recurring].sort((a, b) => {
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      return (a.validTo || "").localeCompare(b.validTo || "");
    });
  }, [recurring]);

  return (
    <IgPage>
      <IgToolbar
        title="Visitas"
        meta={
          <div className={styles.segGroup} role="tablist" aria-label="Tipo de visita">
            <button
              type="button"
              role="tab"
              className={styles.segBtn}
              data-on={tab === "once" ? "1" : undefined}
              aria-selected={tab === "once"}
              onClick={() => setTab("once")}
            >
              Única
            </button>
            <button
              type="button"
              role="tab"
              className={styles.segBtn}
              data-on={tab === "recurring" ? "1" : undefined}
              aria-selected={tab === "recurring"}
              onClick={() => setTab("recurring")}
            >
              Recurrente
            </button>
          </div>
        }
        actions={
          tab === "recurring" ? (
            <IgBtn onClick={() => void loadRecurring()} disabled={loadingRec}>
              {loadingRec ? "Actualizando…" : "Actualizar"}
            </IgBtn>
          ) : (
            <IgBtn onClick={() => void loadInbox()}>Actualizar inbox</IgBtn>
          )
        }
      />
      <IgError>{error}</IgError>

      {tab === "recurring" && (
        <>
          {!apiReady && apiNote && <IgNotice tone="warn">{apiNote}</IgNotice>}
          {apiReady && apiNote && <IgNotice>{apiNote}</IgNotice>}
          {catalogNote && <IgNotice>{catalogNote}</IgNotice>}

          <IgSplit
            leftWidth="46%"
            left={
              <IgPanel
                title="Nueva visita recurrente"
                actions={
                  <IgBadge tone="accent">Acceso limitado ACS</IgBadge>
                }
              >
                <p className={styles.visitLead}>
                  El visitante tendrá acceso solo los días y horas que indiques,
                  en las puertas marcadas. Al vencer o cancelar, se apaga en
                  terminales.
                </p>
                <IgFilters>
                  <IgField label="Nombre *">
                    <input
                      value={rName}
                      onChange={(e) => setRName(e.target.value)}
                      placeholder="Nombre completo"
                      style={{ ...inputStyle, maxWidth: "100%" }}
                      autoComplete="name"
                    />
                  </IgField>
                  <IgField label="Teléfono">
                    <input
                      value={rPhone}
                      onChange={(e) => setRPhone(e.target.value)}
                      placeholder="Opcional"
                      inputMode="tel"
                      style={{ ...inputStyle, maxWidth: "100%" }}
                    />
                  </IgField>
                  <IgField label="Empleado anfitrión">
                    <select
                      value={rHostId}
                      onChange={(e) => setRHostId(e.target.value)}
                      style={{ ...selectStyle, maxWidth: "100%" }}
                    >
                      <option value="">— Sin anfitrión —</option>
                      {hosts.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                          {h.code ? ` · ${h.code}` : ""}
                        </option>
                      ))}
                    </select>
                  </IgField>
                </IgFilters>

                <div className={styles.visitBlock}>
                  <div className={styles.visitBlockLabel}>Puertas con acceso</div>
                  {doors.length === 0 ? (
                    <IgEmptyState
                      title="Sin puertas en el sitio"
                      hint="Sincroniza el sitio ISAPI o elige otro sitio activo."
                    />
                  ) : (
                    <ul className={styles.visitDoorList}>
                      {doors.map((d) => {
                        const on = rDoorIds.includes(d.id);
                        return (
                          <li key={d.id}>
                            <label className={styles.visitDoorRow} data-on={on ? "1" : undefined}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggleDoor(d.id)}
                              />
                              <span className={styles.visitDoorName}>{d.name}</span>
                              {d.location && (
                                <span className={styles.visitDoorMeta}>{d.location}</span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className={styles.visitBlock}>
                  <div className={styles.visitBlockLabel}>Horario del día</div>
                  <div className={styles.visitTimeRow}>
                    <IgField label="Desde">
                      <input
                        type="time"
                        value={rTimeFrom}
                        onChange={(e) => setRTimeFrom(e.target.value)}
                        style={inputStyle}
                      />
                    </IgField>
                    <IgField label="Hasta">
                      <input
                        type="time"
                        value={rTimeTo}
                        onChange={(e) => setRTimeTo(e.target.value)}
                        style={inputStyle}
                      />
                    </IgField>
                  </div>
                </div>

                <div className={styles.visitBlock}>
                  <div className={styles.visitBlockLabel}>Días de la semana</div>
                  <div className={styles.visitWeekRow} role="group" aria-label="Días">
                    {WEEK_DAYS.map((d) => {
                      const on = rWeekdays.includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          className={styles.visitDayChip}
                          data-on={on ? "1" : undefined}
                          aria-pressed={on}
                          title={d.label}
                          onClick={() => toggleDay(d.key)}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.visitWeekHints}>
                    <button
                      type="button"
                      className={styles.visitHintBtn}
                      onClick={() =>
                        setRWeekdays([
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                        ])
                      }
                    >
                      Lun–Vie
                    </button>
                    <button
                      type="button"
                      className={styles.visitHintBtn}
                      onClick={() => setRWeekdays(WEEK_DAYS.map((d) => d.key))}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      className={styles.visitHintBtn}
                      onClick={() => setRWeekdays([])}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div className={styles.visitBlock}>
                  <div className={styles.visitBlockLabel}>Vigencia</div>
                  <div className={styles.visitTimeRow}>
                    <IgField label="Desde">
                      <input
                        type="date"
                        value={rValidFrom}
                        onChange={(e) => setRValidFrom(e.target.value)}
                        style={inputStyle}
                      />
                    </IgField>
                    <IgField label="Hasta">
                      <input
                        type="date"
                        value={rValidTo}
                        onChange={(e) => setRValidTo(e.target.value)}
                        style={inputStyle}
                      />
                    </IgField>
                  </div>
                </div>

                <div className={styles.visitBlock}>
                  <div className={styles.visitBlockLabel}>Foto (opcional)</div>
                  <div className={styles.visitPhotoRow}>
                    <div className={styles.visitPhotoPrev}>
                      {rFacePreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={rFacePreview} alt="Vista previa" />
                      ) : (
                        <span>JPEG</span>
                      )}
                    </div>
                    <div className={styles.visitPhotoActions}>
                      <input
                        type="file"
                        accept="image/jpeg,.jpg,.jpeg"
                        onChange={(e) => void onFaceFile(e.target.files?.[0] || null)}
                      />
                      {rFaceName && (
                        <span className={styles.visitDoorMeta}>{rFaceName}</span>
                      )}
                      {rFaceB64 && (
                        <IgBtn
                          onClick={() => {
                            setRFaceB64(null);
                            setRFacePreview(null);
                            setRFaceName(null);
                          }}
                        >
                          Quitar foto
                        </IgBtn>
                      )}
                      <span className={styles.visitDoorMeta}>
                        Face ID en terminales DS-K1T · solo JPEG
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.visitActions}>
                  <IgBtn
                    variant="primary"
                    disabled={!canSubmitRec || savingRec}
                    onClick={() => void submitRecurring()}
                  >
                    {savingRec
                      ? "Creando acceso…"
                      : apiReady
                        ? "Crear visita recurrente"
                        : "Crear (API pendiente)"}
                  </IgBtn>
                  {!canSubmitRec && (
                    <span className={styles.visitDoorMeta}>
                      Completa nombre, al menos una puerta, un día y horario
                      válido.
                    </span>
                  )}
                </div>
              </IgPanel>
            }
            right={
              <IgPanel
                title="Próximas recurrentes"
                count={upcoming.length}
                actions={
                  loadingRec ? <IgBadge>Cargando…</IgBadge> : undefined
                }
              >
                {upcoming.length === 0 ? (
                  <IgEmptyState
                    title={
                      apiReady
                        ? "Sin visitas recurrentes"
                        : "Esperando API de recurrentes"
                    }
                    hint={
                      apiReady
                        ? "Crea la primera a la izquierda: nombre, puertas, horario y vigencia."
                        : "Cuando el sibling despliegue el endpoint, esta lista se llenará sola."
                    }
                  />
                ) : (
                  <IgTable
                    empty="Sin visitas"
                    columns={[
                      { key: "n", label: "Visitante" },
                      { key: "w", label: "Ritmo" },
                      { key: "v", label: "Vigencia" },
                      { key: "s", label: "Estado" },
                      { key: "a", label: "", width: "88px" },
                    ]}
                    rows={upcoming.map((row) => {
                      const st = statusUi(row.status);
                      const doorsLabel =
                        row.doorNames?.length
                          ? row.doorNames.join(", ")
                          : row.doorIds
                              .map(
                                (id) =>
                                  doors.find((d) => d.id === id)?.name || id,
                              )
                              .filter(Boolean)
                              .slice(0, 3)
                              .join(", ") || "—";
                      return {
                        key: row.id,
                        tone:
                          st.tone === "ok"
                            ? "ok"
                            : st.tone === "warn"
                              ? "warn"
                              : st.tone === "danger"
                                ? "danger"
                                : "muted",
                        cells: {
                          n: (
                            <div className={styles.visitCellStack}>
                              <strong>{row.visitorName}</strong>
                              <span className={styles.visitDoorMeta}>
                                {[row.hostEmployeeName, row.phone, doorsLabel]
                                  .filter(Boolean)
                                  .join(" · ") || "—"}
                              </span>
                            </div>
                          ),
                          w: (
                            <div className={styles.visitCellStack}>
                              <span>{weekdaysLabel(row.weekdays)}</span>
                              <span className={styles.visitDoorMeta}>
                                {row.timeFrom}–{row.timeTo}
                              </span>
                            </div>
                          ),
                          v: (
                            <span className={styles.visitDoorMeta}>
                              {(row.validFrom || "—").slice(0, 10)} →{" "}
                              {(row.validTo || "—").slice(0, 10)}
                            </span>
                          ),
                          s: <IgBadge tone={st.tone}>{st.label}</IgBadge>,
                          a:
                            row.status === "cancelled" ||
                            row.status === "expired" ? (
                              "—"
                            ) : (
                              <IgBtn
                                variant="danger"
                                disabled={cancellingId === row.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void onCancel(row);
                                }}
                              >
                                {cancellingId === row.id
                                  ? "…"
                                  : "Cancelar"}
                              </IgBtn>
                            ),
                        },
                      };
                    })}
                  />
                )}
              </IgPanel>
            }
          />
        </>
      )}

      {tab === "once" && (
        <>
          <IgNotice>
            Cita puntual vía Artemis / QR. En sitios solo ISAPI use la pestaña
            Recurrente (acceso ACS en terminales).
          </IgNotice>
          <IgPanel title={`Inbox (${inbox.length})`}>
            {inboxNote && (
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {inboxNote}
              </p>
            )}
            {inbox.length > 0 && (
              <IgTable
                columns={[
                  { key: "n", label: "Visitante" },
                  { key: "t", label: "Ventana" },
                  { key: "id", label: "ID", mono: true },
                ]}
                rows={inbox.slice(0, 40).map((row, i) => {
                  const name =
                    row.visitorName ||
                    row.visitorInfoList?.[0]?.visitorName ||
                    row.personName ||
                    "—";
                  const id = String(
                    row.orderId || row.appointRecordId || row.id || i,
                  );
                  return {
                    key: id,
                    cells: {
                      n: String(name),
                      t:
                        [row.visitStartTime, row.visitEndTime]
                          .filter(Boolean)
                          .join(" → ") || "—",
                      id,
                    },
                  };
                })}
                onRowClick={(key) => setOrderId(key)}
              />
            )}
          </IgPanel>

          <IgSplit
            left={
              <IgPanel title="Registrar cita">
                <IgFilters>
                  <IgField label="Nombre *">
                    <input
                      value={visitorName}
                      onChange={(e) => setVisitorName(e.target.value)}
                      style={{ ...inputStyle, maxWidth: "100%" }}
                    />
                  </IgField>
                  <IgField label="Teléfono">
                    <input
                      value={phoneNo}
                      onChange={(e) => setPhoneNo(e.target.value)}
                      style={{ ...inputStyle, maxWidth: "100%" }}
                    />
                  </IgField>
                  <IgField label="Género">
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="1">M</option>
                      <option value="2">F</option>
                      <option value="0">?</option>
                    </select>
                  </IgField>
                  <IgField label="Inicio">
                    <input
                      type="datetime-local"
                      value={visitStart}
                      onChange={(e) => setVisitStart(e.target.value)}
                      style={inputStyle}
                    />
                  </IgField>
                  <IgField label="Fin">
                    <input
                      type="datetime-local"
                      value={visitEnd}
                      onChange={(e) => setVisitEnd(e.target.value)}
                      style={inputStyle}
                    />
                  </IgField>
                  <IgField label="Recepcionista (ID)">
                    <input
                      value={receptionistId}
                      onChange={(e) => setReceptionistId(e.target.value)}
                      placeholder="opcional"
                      style={{ ...inputStyle, maxWidth: "100%" }}
                    />
                  </IgField>
                  <IgField label="Propósito">
                    <input
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      style={{ ...inputStyle, maxWidth: "100%" }}
                    />
                  </IgField>
                </IgFilters>
                <IgBtn
                  variant="primary"
                  disabled={!visitorName.trim() || onceBusy}
                  onClick={async () => {
                    setError(null);
                    setOnceBusy(true);
                    try {
                      const body: Record<string, unknown> = {
                        visitorInfoList: [
                          {
                            visitorName,
                            phoneNo,
                            gender: Number(gender) || 1,
                          },
                        ],
                      };
                      const st = fromDatetimeLocalValue(visitStart);
                      const et = fromDatetimeLocalValue(visitEnd);
                      if (st) body.visitStartTime = st;
                      if (et) body.visitEndTime = et;
                      if (receptionistId.trim()) {
                        body.receptionistId = receptionistId.trim();
                      }
                      if (purpose.trim()) body.visitPurpose = purpose.trim();
                      const data = await integraApi<any>(
                        "integra/visitors/register",
                        {
                          method: "POST",
                          body: JSON.stringify(body),
                        },
                      );
                      setResult(JSON.stringify(data, null, 2));
                      const oid =
                        data?.orderId ||
                        data?.data?.orderId ||
                        data?.appointRecordId ||
                        data?.data?.appointRecordId;
                      if (oid) setOrderId(String(oid));
                      toast.success("Cita registrada");
                      void loadInbox();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    } finally {
                      setOnceBusy(false);
                    }
                  }}
                >
                  {onceBusy ? "Registrando…" : "Registrar"}
                </IgBtn>
                {result && (
                  <pre
                    style={{
                      fontSize: 10,
                      marginTop: 8,
                      maxHeight: 180,
                      overflow: "auto",
                    }}
                  >
                    {result}
                  </pre>
                )}
              </IgPanel>
            }
            right={
              <IgPanel title="Código QR">
                <IgField label="ID de cita">
                  <input
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    style={{ ...inputStyle, maxWidth: "100%" }}
                  />
                </IgField>
                <IgBtn
                  onClick={async () => {
                    setError(null);
                    try {
                      const data = await integraApi<any>(
                        "integra/visitors/qr",
                        {
                          method: "POST",
                          body: JSON.stringify(
                            orderId.trim() ? { orderId: orderId.trim() } : {},
                          ),
                        },
                      );
                      setQrOut(JSON.stringify(data, null, 2));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Error");
                    }
                  }}
                >
                  Obtener QR
                </IgBtn>
                {qrOut && (
                  <pre
                    style={{
                      fontSize: 10,
                      marginTop: 8,
                      maxHeight: 280,
                      overflow: "auto",
                    }}
                  >
                    {qrOut}
                  </pre>
                )}
              </IgPanel>
            }
          />
        </>
      )}
    </IgPage>
  );
}
