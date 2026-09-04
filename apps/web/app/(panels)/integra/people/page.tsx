"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IgBadge,
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgPage,
  IgPanel,
  IgSplit,
  IgToolbar,
} from "../_Console";
import { getCachedProvider, subscribeProvider } from "../_caps";
import {
  inputStyle,
  integraApi,
  integraPersonFaceBlob,
  selectStyle,
} from "../_lib";
import styles from "../integra.module.css";

type Person = {
  id: string;
  name: string;
  code?: string;
  orgId?: string;
  orgName?: string;
  userType?: string;
  gender?: string;
  validEnable?: boolean;
  validFrom?: string;
  validTo?: string;
  doorRight?: string;
  rightPlan?: unknown;
  numOfFace?: number;
  numOfFP?: number;
  numOfCard?: number;
  faceUrl?: string | null;
  hasFace?: boolean;
  sourceIp?: string;
  sourceName?: string;
  doorNames?: string[];
};

type Org = { id: string; name: string; parentId?: string };

type OpResult = { deviceIp: string; ok: boolean; error?: string };

type ValidityFilter = "" | "ok" | "warn" | "expired" | "off" | "face" | "noface";

type MutKind = "save" | "photo" | "faceDel" | "delete" | "create" | null;

function genderLabel(g?: string) {
  const v = String(g || "").toLowerCase();
  if (v === "male" || v === "1" || v === "m") return "Hombre";
  if (v === "female" || v === "2" || v === "f") return "Mujer";
  if (!g) return null;
  return String(g);
}

function validityOf(p: Person): {
  key: "ok" | "warn" | "expired" | "off" | "unknown";
  label: string;
  tone: "ok" | "warn" | "danger" | "neutral";
} {
  if (p.validEnable === false) return { key: "off", label: "Deshabilitada", tone: "danger" };
  if (!p.validTo) return { key: "unknown", label: "Sin vigencia", tone: "neutral" };
  const end = Date.parse(p.validTo);
  if (!Number.isFinite(end)) return { key: "unknown", label: p.validTo, tone: "neutral" };
  const days = (end - Date.now()) / 86_400_000;
  if (days < 0) return { key: "expired", label: "Vencida", tone: "danger" };
  if (days < 30) return { key: "warn", label: "Por vencer", tone: "warn" };
  return { key: "ok", label: "Vigente", tone: "ok" };
}

function formatWhen(iso?: string) {
  if (!iso) return "—";
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return iso;
  return new Date(d).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * `enrolled` = el terminal dice tener rostro; `unavailable` = lo tiene, pero no
 * lo entrega (modelo biométrico DS-K1T, faceURL 404).
 */
type FaceState = "none" | "enrolled" | "unavailable" | "ok";

function PersonAvatar({
  person,
  large,
  onState,
}: {
  person: Person;
  large?: boolean;
  onState?: (s: FaceState) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const enrolled = person.hasFace || (person.numOfFace ?? 0) > 0 || Boolean(person.faceUrl);
    if (!enrolled) {
      setSrc(null);
      onState?.("none");
      return;
    }
    onState?.("enrolled");
    let objectUrl: string | null = null;
    let cancelled = false;
    void integraPersonFaceBlob(person.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        onState?.("ok");
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
          onState?.("unavailable");
        }
      });
    return () => {
      cancelled = true;
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id, person.hasFace, person.numOfFace, person.faceUrl]);

  return (
    <div
      className={large ? styles.personAvatarLg : styles.personAvatar}
      data-empty={!src ? "1" : undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        <span aria-hidden>{(person.name || "?").slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

function CredChips({ person }: { person: Person }) {
  return (
    <div className={styles.personChips}>
      <span
        className={styles.personChip}
        data-on={(person.numOfFace ?? 0) > 0 || person.hasFace ? "1" : undefined}
      >
        Face ID {person.numOfFace ?? (person.hasFace ? "·" : "0")}
      </span>
      <span className={styles.personChip} data-on={(person.numOfFP ?? 0) > 0 ? "1" : undefined}>
        Huella {person.numOfFP ?? 0}
      </span>
      <span className={styles.personChip} data-on={(person.numOfCard ?? 0) > 0 ? "1" : undefined}>
        Tarjeta {person.numOfCard ?? 0}
      </span>
    </div>
  );
}

function OpFanout({ results }: { results: OpResult[] | null }) {
  if (!results?.length) return null;
  return (
    <ul className={styles.personOpList}>
      {results.map((r) => (
        <li key={r.deviceIp} data-ok={r.ok ? "1" : "0"}>
          {r.deviceIp}: {r.ok ? "OK" : r.error || "falló"}
        </li>
      ))}
    </ul>
  );
}

export default function IntegraPeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [faceState, setFaceState] = useState<FaceState>("none");
  const [detail, setDetail] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [autoCode, setAutoCode] = useState(true);
  const [orgId, setOrgId] = useState("");
  const [editName, setEditName] = useState("");
  const [editValidFrom, setEditValidFrom] = useState("");
  const [editValidTo, setEditValidTo] = useState("");
  const [editValidEnable, setEditValidEnable] = useState(true);
  const [opNote, setOpNote] = useState<string | null>(null);
  const [opOk, setOpOk] = useState<boolean | null>(null);
  const [opResults, setOpResults] = useState<OpResult[] | null>(null);
  const [mutKind, setMutKind] = useState<MutKind>(null);
  const [orgFilter, setOrgFilter] = useState("");
  const [validityFilter, setValidityFilter] = useState<ValidityFilter>("");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [provider, setProvider] = useState<string | null>(() => getCachedProvider());
  /** panel derecho: alta vs ficha */
  const [mode, setMode] = useState<"alta" | "ficha">("alta");
  const isArtemis = !provider || provider === "ARTEMIS";
  const isIsapi = provider === "ISAPI";
  const mutating = mutKind != null;

  useEffect(() => subscribeProvider(setProvider), []);

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.name);
    setEditValidFrom(selected.validFrom?.slice(0, 19) || "");
    setEditValidTo(selected.validTo?.slice(0, 19) || "");
    setEditValidEnable(selected.validEnable !== false);
    setOpNote(null);
    setOpOk(null);
    setOpResults(null);
    setMode("ficha");
  }, [selected?.id]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, o] = await Promise.all([
        integraApi<{ items: Person[] }>(live ? "integra/people?live=1" : "integra/people"),
        integraApi<{ items: Org[] }>("integra/orgs").catch(() => ({ items: [] })),
      ]);
      setPeople(p.items);
      setOrgs(o.items);
      setOrgId((prev) => prev || o.items[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [live]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      people.filter((p) => {
        if (orgFilter && p.orgId !== orgFilter) return false;
        if (validityFilter === "face") {
          if (!p.hasFace && !(p.numOfFace && p.numOfFace > 0)) return false;
        } else if (validityFilter === "noface") {
          if (p.hasFace || (p.numOfFace && p.numOfFace > 0)) return false;
        } else if (validityFilter) {
          if (validityOf(p).key !== validityFilter) return false;
        }
        if (!q) return true;
        const qq = q.toLowerCase();
        return (
          p.name.toLowerCase().includes(qq) ||
          (p.code || "").toLowerCase().includes(qq) ||
          p.id.toLowerCase().includes(qq)
        );
      }),
    [people, q, orgFilter, validityFilter],
  );

  const openDetail = async (p: Person) => {
    setSelected(p);
    setDetail(null);
    setMode("ficha");
    setBusy(true);
    try {
      setDetail(await integraApi(`integra/people/${encodeURIComponent(p.id)}`));
    } catch (e) {
      if (!isArtemis) {
        setDetail({
          source: provider || "ISAPI",
          note: "Detalle desde el listado (espejo local).",
          person: p,
        });
      } else {
        setDetail({ error: e instanceof Error ? e.message : "Sin detalle" });
      }
    } finally {
      setBusy(false);
    }
  };

  const startAlta = () => {
    setSelected(null);
    setDetail(null);
    setMode("alta");
    setOpNote(null);
    setOpOk(null);
    setOpResults(null);
    setError(null);
    setName("");
    setCode("");
    setAutoCode(true);
  };

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      await integraApi("integra/sync", { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error sync");
    } finally {
      setSyncing(false);
    }
  };

  const detailPerson: Person | null = useMemo(() => {
    if (!detail || typeof detail !== "object") return selected;
    const d = detail as { person?: Person };
    return d.person || selected;
  }, [detail, selected]);

  const withFace = people.filter((p) => p.hasFace || (p.numOfFace ?? 0) > 0).length;

  const applyOp = (r: {
    success?: boolean;
    note?: string;
    results?: OpResult[];
  }) => {
    setOpResults(r.results || null);
    setOpNote(r.note || (r.success ? "Listo" : "No se completó"));
    setOpOk(r.success === true);
    if (!r.success) {
      setError(r.note || "Revisa el resultado por terminal.");
    }
  };

  return (
    <IgPage>
      <IgToolbar
        title="Control de personal"
        meta={`${filtered.length}/${people.length}${withFace ? ` · ${withFace} Face ID terminal` : ""}${
          orgs.length ? ` · ${orgs.length} orgs` : ""
        } · ${live ? "live" : "espejo"}`}
        actions={
          <>
            {isIsapi && (
              <IgBtn variant="primary" onClick={startAlta}>
                + Nueva persona
              </IgBtn>
            )}
            <IgBtn onClick={() => setLive((v) => !v)}>{live ? "Live ACS" : "Espejo"}</IgBtn>
            {isIsapi && (
              <IgBtn disabled={syncing} onClick={() => void syncNow()}>
                {syncing ? "Sincronizando…" : "Sincronizar"}
              </IgBtn>
            )}
            <IgBtn onClick={() => void load()}>Actualizar</IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>
      <p className={styles.personLead}>
        Alta, foto Face ID y baja se empujan a <strong>todos los terminales ACS</strong> del
        sitio. Face ID vive en el lector — las cámaras de oficina no identifican rostros.
      </p>

      <IgFilters>
        {isArtemis && (
          <IgField label="Org">
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="">Todas</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </IgField>
        )}
        {isIsapi && (
          <IgField label="Filtro">
            <select
              value={validityFilter}
              onChange={(e) => setValidityFilter(e.target.value as ValidityFilter)}
              style={selectStyle}
            >
              <option value="">Todas</option>
              <option value="ok">Vigentes</option>
              <option value="warn">Por vencer</option>
              <option value="expired">Vencidas</option>
              <option value="off">Deshabilitadas</option>
              <option value="face">Con Face ID</option>
              <option value="noface">Sin Face ID</option>
            </select>
          </IgField>
        )}
        <IgField label="Buscar">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={inputStyle}
            placeholder="nombre / código"
          />
        </IgField>
      </IgFilters>

      <IgSplit
        leftWidth="52%"
        left={
          <IgPanel title="Directorio" count={filtered.length} flush>
            <div className={styles.personDirectory}>
              {filtered.map((p) => {
                const v = validityOf(p);
                const sel = selected?.id === p.id && mode === "ficha";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.personRow}
                    data-selected={sel ? "1" : undefined}
                    onClick={() => void openDetail(p)}
                  >
                    <PersonAvatar person={p} />
                    <div className={styles.personRowMain}>
                      <div className={styles.personRowTop}>
                        <strong>{p.name}</strong>
                        <IgBadge tone={v.tone}>{v.label}</IgBadge>
                      </div>
                      <div className={styles.personRowMeta}>
                        <span className={styles.personMono}>{p.code || p.id}</span>
                        {(p.userType || p.orgName) && <span>{p.userType || p.orgName}</span>}
                        {genderLabel(p.gender) && <span>{genderLabel(p.gender)}</span>}
                      </div>
                      {isIsapi && <CredChips person={p} />}
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className={styles.personEmptyBox}>
                  <strong>Sin personas</strong>
                  <p>
                    {isArtemis
                      ? "No hay coincidencias en el directorio."
                      : "El espejo está vacío o el filtro no deja nada. Sincroniza terminales o da de alta a alguien."}
                  </p>
                  {isIsapi && (
                    <IgBtn variant="primary" onClick={startAlta}>
                      + Nueva persona
                    </IgBtn>
                  )}
                </div>
              )}
            </div>
          </IgPanel>
        }
        right={
          <IgPanel
            title={
              mode === "alta"
                ? "Alta nueva persona"
                : selected
                  ? "Ficha"
                  : "Selecciona o da de alta"
            }
            count={mode === "ficha" ? selected?.name || "—" : autoCode ? "código auto" : "código manual"}
          >
            {/* ── ALTA ─────────────────────────────────────────────── */}
            {mode === "alta" && isIsapi && (
              <div className={styles.personCrud}>
                <section className={styles.personSection} data-tone="accent">
                  <header className={styles.personSectionHead}>
                    <strong>1 · Datos</strong>
                    <span>se propaga a todos los ACS</span>
                  </header>
                  <IgField label="Nombre completo">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{ ...inputStyle, maxWidth: "100%" }}
                      placeholder="Ej. Ariadna Sierra"
                      autoFocus
                    />
                  </IgField>
                  <label className={styles.personCheck}>
                    <input
                      type="checkbox"
                      checked={autoCode}
                      onChange={(e) => {
                        setAutoCode(e.target.checked);
                        if (e.target.checked) setCode("");
                      }}
                    />
                    Generar código de empleado automáticamente
                  </label>
                  {!autoCode && (
                    <IgField label="Código empleado (manual)">
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        style={{ ...inputStyle, maxWidth: "100%" }}
                        placeholder="máx. 32 caracteres"
                      />
                    </IgField>
                  )}
                  {autoCode && (
                    <p className={styles.personNote}>
                      El código se asigna al dar de alta (siguiente número libre del
                      espejo, o marca de tiempo si no hay numéricos).
                    </p>
                  )}
                  <IgBtn
                    variant="primary"
                    disabled={!name.trim() || mutating || (!autoCode && !code.trim())}
                    onClick={async () => {
                      setMutKind("create");
                      setError(null);
                      setOpOk(null);
                      try {
                        const r = await integraApi<{
                          success?: boolean;
                          note?: string;
                          employeeNo?: string;
                          results?: OpResult[];
                        }>("integra/people", {
                          method: "POST",
                          body: JSON.stringify({
                            personName: name.trim(),
                            autoCode,
                            ...(autoCode
                              ? {}
                              : {
                                  employeeNo: code.trim(),
                                  personCode: code.trim(),
                                }),
                          }),
                        });
                        applyOp(r);
                        if (r.success) {
                          setName("");
                          setCode("");
                          setAutoCode(true);
                          await load();
                          if (r.employeeNo) {
                            const created = (
                              await integraApi<{ items: Person[] }>("integra/people")
                            ).items.find((p) => p.id === r.employeeNo);
                            if (created) void openDetail(created);
                          }
                        }
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Error al dar de alta");
                        setOpOk(false);
                      } finally {
                        setMutKind(null);
                      }
                    }}
                  >
                    {mutKind === "create" ? "Dando de alta…" : "Dar de alta en terminales"}
                  </IgBtn>
                  {opNote && mode === "alta" && (
                    <p className={styles.personNote} data-tone={opOk ? "ok" : "warn"}>
                      {opNote}
                    </p>
                  )}
                  {mode === "alta" && <OpFanout results={opResults} />}
                </section>
              </div>
            )}

            {mode === "alta" && isArtemis && (
              <div className={styles.personCrud}>
                <section className={styles.personSection}>
                  <IgField label="Nombre">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{ ...inputStyle, maxWidth: "100%" }}
                    />
                  </IgField>
                  <IgField label="Código">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      style={{ ...inputStyle, maxWidth: "100%" }}
                    />
                  </IgField>
                  <IgField label="Org">
                    <select
                      value={orgId}
                      onChange={(e) => setOrgId(e.target.value)}
                      style={{ ...selectStyle, maxWidth: "100%" }}
                    >
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </IgField>
                  <IgBtn
                    variant="primary"
                    disabled={!name || !orgId || mutating}
                    onClick={async () => {
                      setMutKind("create");
                      try {
                        await integraApi("integra/people", {
                          method: "POST",
                          body: JSON.stringify({
                            personName: name,
                            personCode: code || undefined,
                            orgIndexCode: orgId,
                          }),
                        });
                        setName("");
                        setCode("");
                        await load();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Error");
                      } finally {
                        setMutKind(null);
                      }
                    }}
                  >
                    Alta persona
                  </IgBtn>
                </section>
              </div>
            )}

            {/* ── FICHA ────────────────────────────────────────────── */}
            {mode === "ficha" && detailPerson && selected ? (
              <div className={styles.personCrud}>
                <div className={styles.personCardHead}>
                  <PersonAvatar person={detailPerson} large onState={setFaceState} />
                  <div>
                    <h3 className={styles.personCardName}>{detailPerson.name}</h3>
                    <p className={styles.personCardCode}>{detailPerson.code || detailPerson.id}</p>
                    <div className={styles.personChips}>
                      <IgBadge tone={validityOf(detailPerson).tone}>
                        {validityOf(detailPerson).label}
                      </IgBadge>
                      {(detailPerson.userType || detailPerson.orgName) && (
                        <IgBadge>{detailPerson.userType || detailPerson.orgName}</IgBadge>
                      )}
                    </div>
                  </div>
                </div>

                {busy && <IgBadge>Cargando detalle…</IgBadge>}

                {isIsapi && (
                  <>
                    <dl className={styles.personFacts}>
                      <div>
                        <dt>Vigencia</dt>
                        <dd>
                          {formatWhen(detailPerson.validFrom)} → {formatWhen(detailPerson.validTo)}
                        </dd>
                      </div>
                      <div>
                        <dt>Puertas</dt>
                        <dd>
                          {detailPerson.doorNames?.length
                            ? detailPerson.doorNames.join(" · ")
                            : detailPerson.doorRight || "—"}
                        </dd>
                      </div>
                      {(detailPerson.sourceName || detailPerson.sourceIp) && (
                        <div>
                          <dt>Terminal</dt>
                          <dd>
                            {detailPerson.sourceName || detailPerson.sourceIp}
                            {detailPerson.sourceName && detailPerson.sourceIp && (
                              <span className={styles.personFactSub}>{detailPerson.sourceIp}</span>
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <CredChips person={detailPerson} />

                    {faceState === "unavailable" && (
                      <p className={styles.personNote} data-tone="warn">
                        Face ID enrolado en terminal, pero el equipo no entrega JPEG (modelo
                        biométrico). Sube una foto desde aquí para actualizarla en todos los
                        lectores.
                      </p>
                    )}

                    <section className={styles.personSection}>
                      <header className={styles.personSectionHead}>
                        <strong>2 · Editar ficha</strong>
                        <span>UserInfo/Modify</span>
                      </header>
                      <IgField label="Nombre">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ ...inputStyle, maxWidth: "100%" }}
                        />
                      </IgField>
                      <IgField label="Vigencia desde">
                        <input
                          value={editValidFrom}
                          onChange={(e) => setEditValidFrom(e.target.value)}
                          style={{ ...inputStyle, maxWidth: "100%" }}
                          placeholder="2020-01-01T00:00:00"
                        />
                      </IgField>
                      <IgField label="Vigencia hasta">
                        <input
                          value={editValidTo}
                          onChange={(e) => setEditValidTo(e.target.value)}
                          style={{ ...inputStyle, maxWidth: "100%" }}
                          placeholder="2037-12-31T23:59:59"
                        />
                      </IgField>
                      <label className={styles.personCheck}>
                        <input
                          type="checkbox"
                          checked={editValidEnable}
                          onChange={(e) => setEditValidEnable(e.target.checked)}
                        />
                        Vigencia activa
                      </label>
                      <IgBtn
                        variant="primary"
                        disabled={mutating || !editName.trim()}
                        onClick={async () => {
                          setMutKind("save");
                          setError(null);
                          try {
                            const r = await integraApi<{
                              success?: boolean;
                              note?: string;
                              results?: OpResult[];
                            }>(`integra/people/${encodeURIComponent(selected.id)}`, {
                              method: "PATCH",
                              body: JSON.stringify({
                                personName: editName.trim(),
                                validFrom: editValidFrom || undefined,
                                validTo: editValidTo || undefined,
                                validEnable: editValidEnable,
                              }),
                            });
                            applyOp({
                              ...r,
                              note: r.success
                                ? "Ficha guardada en todos los terminales."
                                : r.note || "Guardado incompleto.",
                            });
                            await load();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Error al guardar");
                            setOpOk(false);
                          } finally {
                            setMutKind(null);
                          }
                        }}
                      >
                        {mutKind === "save" ? "Guardando…" : "Guardar en terminales"}
                      </IgBtn>
                    </section>

                    <section className={styles.personSection}>
                      <header className={styles.personSectionHead}>
                        <strong>3 · Face ID del terminal</strong>
                        <span>FaceDataRecord · no es video</span>
                      </header>
                      <p className={styles.personNote}>
                        La foto se empuja a cada ACS. El terminal guarda un modelo biométrico;
                        no se puede descargar de vuelta.
                      </p>
                      <div className={styles.personBtnRow}>
                        <label className={styles.personFileBtn} data-busy={mutKind === "photo" ? "1" : undefined}>
                          {mutKind === "photo" ? "Subiendo…" : "Subir foto JPEG"}
                          <input
                            type="file"
                            accept="image/jpeg,image/jpg,image/png"
                            hidden
                            disabled={mutating}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (!file) return;
                              setMutKind("photo");
                              setError(null);
                              try {
                                const buf = await file.arrayBuffer();
                                const bytes = new Uint8Array(buf);
                                let binary = "";
                                for (let i = 0; i < bytes.length; i++) {
                                  binary += String.fromCharCode(bytes[i]);
                                }
                                const imageBase64 = btoa(binary);
                                const r = await integraApi<{
                                  success?: boolean;
                                  note?: string;
                                  results?: OpResult[];
                                }>(`integra/people/${encodeURIComponent(selected.id)}/face`, {
                                  method: "POST",
                                  body: JSON.stringify({ imageBase64 }),
                                });
                                applyOp(r);
                                await load();
                                await openDetail(selected);
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Error foto");
                                setOpOk(false);
                              } finally {
                                setMutKind(null);
                              }
                            }}
                          />
                        </label>
                        <IgBtn
                          disabled={mutating}
                          onClick={async () => {
                            if (
                              !confirm(
                                `¿Quitar el Face ID biométrico de ${selected.name} en todos los terminales?`,
                              )
                            ) {
                              return;
                            }
                            setMutKind("faceDel");
                            setError(null);
                            try {
                              const r = await integraApi<{
                                success?: boolean;
                                note?: string;
                                results?: OpResult[];
                              }>(`integra/people/${encodeURIComponent(selected.id)}/face`, {
                                method: "DELETE",
                              });
                              applyOp({
                                ...r,
                                note: r.success ? "Face ID quitado." : r.note || "No se quitó del todo.",
                                success: r.results ? r.results.every((x) => x.ok) : r.success,
                              });
                              await load();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Error");
                              setOpOk(false);
                            } finally {
                              setMutKind(null);
                            }
                          }}
                        >
                          {mutKind === "faceDel" ? "Quitando…" : "Quitar Face ID"}
                        </IgBtn>
                      </div>
                    </section>

                    <section className={styles.personSection} data-tone="danger">
                      <header className={styles.personSectionHead}>
                        <strong>4 · Eliminar persona</strong>
                        <span>DeleteProcess + verificación</span>
                      </header>
                      <p className={styles.personNote}>
                        Borra rostro y ficha en cada ACS, espera DeleteProcess y comprueba
                        que ya no aparece en UserInfo. Solo entonces limpia el espejo — si un
                        terminal falla, la persona se queda y verás el error por IP.
                      </p>
                      <IgBtn
                        variant="danger"
                        disabled={mutating}
                        onClick={async () => {
                          if (
                            !confirm(
                              `¿Eliminar a ${selected.name} (${selected.code || selected.id}) de TODOS los terminales?\n\nEsta acción no se puede deshacer desde aquí.`,
                            )
                          ) {
                            return;
                          }
                          setMutKind("delete");
                          setError(null);
                          try {
                            const r = await integraApi<{
                              success?: boolean;
                              partial?: boolean;
                              note?: string;
                              results?: OpResult[];
                            }>(`integra/people/${encodeURIComponent(selected.id)}`, {
                              method: "DELETE",
                            });
                            applyOp(r);
                            if (r.success) {
                              const gone = selected.id;
                              setPeople((prev) => prev.filter((p) => p.id !== gone));
                              setSelected(null);
                              setDetail(null);
                              setMode("alta");
                              setOpNote(r.note || "Eliminado de todos los terminales.");
                              setOpOk(true);
                            }
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Error al eliminar");
                            setOpOk(false);
                          } finally {
                            setMutKind(null);
                          }
                        }}
                      >
                        {mutKind === "delete"
                          ? "Eliminando (esperando terminales)…"
                          : "Eliminar de todos los terminales"}
                      </IgBtn>
                    </section>

                    {opNote && mode === "ficha" && (
                      <p className={styles.personNote} data-tone={opOk ? "ok" : "warn"}>
                        {opNote}
                      </p>
                    )}
                    {mode === "ficha" && <OpFanout results={opResults} />}
                  </>
                )}

                {isArtemis && detail != null && (
                  <pre className={styles.personRawPre}>{JSON.stringify(detail, null, 2)}</pre>
                )}
                {isArtemis && (
                  <IgBtn
                    variant="danger"
                    onClick={async () => {
                      if (!confirm("¿Eliminar esta persona del directorio?")) return;
                      await integraApi(`integra/people/${encodeURIComponent(selected.id)}`, {
                        method: "DELETE",
                      });
                      setSelected(null);
                      setDetail(null);
                      await load();
                    }}
                  >
                    Eliminar
                  </IgBtn>
                )}
              </div>
            ) : null}

            {mode === "ficha" && !selected && (
              <div className={styles.personEmptyBox}>
                <strong>Ninguna ficha abierta</strong>
                <p>Elige a alguien del directorio o da de alta a una persona nueva.</p>
                {isIsapi && (
                  <IgBtn variant="primary" onClick={startAlta}>
                    + Nueva persona
                  </IgBtn>
                )}
              </div>
            )}
          </IgPanel>
        }
      />
    </IgPage>
  );
}
