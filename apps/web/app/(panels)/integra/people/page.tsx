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
};

type Org = { id: string; name: string; parentId?: string };

type ValidityFilter = "" | "ok" | "warn" | "expired" | "off" | "face" | "noface";

function genderLabel(g?: string) {
  const v = String(g || "").toLowerCase();
  if (v === "male" || v === "1" || v === "m") return "Hombre";
  if (v === "female" || v === "2" || v === "f") return "Mujer";
  if (!g) return null;
  return String(g);
}

function validityOf(p: Person): { key: "ok" | "warn" | "expired" | "off" | "unknown"; label: string; tone: "ok" | "warn" | "danger" | "muted" | "neutral" } {
  if (p.validEnable === false) return { key: "off", label: "Deshabilitada", tone: "danger" };
  if (!p.validTo) return { key: "unknown", label: "Sin vigencia", tone: "muted" };
  const end = Date.parse(p.validTo);
  if (!Number.isFinite(end)) return { key: "unknown", label: p.validTo, tone: "muted" };
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

function PersonAvatar({ person, large }: { person: Person; large?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!person.hasFace && !(person.numOfFace && person.numOfFace > 0) && !person.faceUrl) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void integraPersonFaceBlob(person.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [person.id, person.hasFace, person.numOfFace, person.faceUrl]);

  return (
    <div className={large ? styles.personAvatarLg : styles.personAvatar} data-empty={!src ? "1" : undefined}>
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
      <span className={styles.personChip} data-on={(person.numOfFace ?? 0) > 0 || person.hasFace ? "1" : undefined}>
        Rostro {person.numOfFace ?? (person.hasFace ? "·" : "0")}
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

export default function IntegraPeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [detail, setDetail] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [orgId, setOrgId] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [validityFilter, setValidityFilter] = useState<ValidityFilter>("");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [provider, setProvider] = useState<string | null>(() => getCachedProvider());
  const isArtemis = !provider || provider === "ARTEMIS";
  const isIsapi = provider === "ISAPI";

  useEffect(() => subscribeProvider(setProvider), []);

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

  return (
    <IgPage>
      <IgToolbar
        title="Personas"
        meta={`${filtered.length}/${people.length}${withFace ? ` · ${withFace} con rostro` : ""}${orgs.length ? ` · ${orgs.length} orgs` : ""} · ${live ? "live" : "espejo"}`}
        actions={
          <>
            <IgBtn onClick={() => setLive((v) => !v)}>{live ? "Live" : "Espejo"}</IgBtn>
            {isIsapi && (
              <IgBtn variant="primary" disabled={syncing} onClick={() => void syncNow()}>
                {syncing ? "Sincronizando…" : "Sincronizar terminales"}
              </IgBtn>
            )}
            <IgBtn onClick={() => void load()}>Actualizar</IgBtn>
          </>
        }
      />
      <IgError>{error}</IgError>

      <IgFilters>
        {isArtemis && (
          <IgField label="Org">
            <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} style={selectStyle}>
              <option value="">Todas</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
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
              <option value="face">Con rostro</option>
              <option value="noface">Sin rostro</option>
            </select>
          </IgField>
        )}
        <IgField label="Buscar">
          <input value={q} onChange={(e) => setQ(e.target.value)} style={inputStyle} placeholder="nombre / código / id" />
        </IgField>
      </IgFilters>

      <IgSplit
        leftWidth="56%"
        left={
          <IgPanel title="Directorio" count={filtered.length} flush>
            <div className={styles.personDirectory}>
              {filtered.map((p) => {
                const v = validityOf(p);
                const sel = selected?.id === p.id;
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
                        {(p.userType || p.orgName) && (
                          <span>{p.userType || p.orgName}</span>
                        )}
                        {genderLabel(p.gender) && <span>{genderLabel(p.gender)}</span>}
                      </div>
                      {isIsapi && <CredChips person={p} />}
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className={styles.igEmpty}>
                  {isArtemis
                    ? "Sin personas"
                    : "Sin personas en espejo — pulsa «Sincronizar terminales»"}
                </p>
              )}
            </div>
          </IgPanel>
        }
        right={
          <IgPanel title={isArtemis ? "Detalle / alta" : "Ficha"} count={selected?.name || "—"}>
            {detailPerson && selected ? (
              <div className={styles.personCard}>
                <div className={styles.personCardHead}>
                  <PersonAvatar person={detailPerson} large />
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
                      {genderLabel(detailPerson.gender) && (
                        <IgBadge tone="neutral">{genderLabel(detailPerson.gender)}</IgBadge>
                      )}
                    </div>
                  </div>
                </div>

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
                        <dd className={styles.personMono}>{detailPerson.doorRight || "—"}</dd>
                      </div>
                      {detailPerson.sourceIp && (
                        <div>
                          <dt>Terminal</dt>
                          <dd className={styles.personMono}>{detailPerson.sourceIp}</dd>
                        </div>
                      )}
                    </dl>
                    <CredChips person={detailPerson} />
                    {detailPerson.rightPlan != null && (
                      <details className={styles.personRaw}>
                        <summary>Plan de puertas (RightPlan)</summary>
                        <pre>{JSON.stringify(detailPerson.rightPlan, null, 2)}</pre>
                      </details>
                    )}
                    <p className={styles.personNote}>
                      Alta y edición facial/tarjeta se hacen en el terminal. Esta ficha es el
                      espejo ISAPI del sitio.
                    </p>
                  </>
                )}

                {busy && <IgBadge>Cargando detalle…</IgBadge>}

                {isArtemis && detail != null && (
                  <pre className={styles.personRawPre}>
                    {JSON.stringify(detail, null, 2)}
                  </pre>
                )}

                {isArtemis && (
                  <IgBtn
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
            ) : (
              <p className={styles.personEmptyHint}>
                {isArtemis
                  ? "Selecciona una persona del directorio"
                  : "Selecciona una persona para ver foto, vigencia y credenciales del terminal."}
              </p>
            )}

            {isArtemis && (
              <>
                <hr className={styles.personDivider} />
                <div className={styles.personCreate}>
                  <IgField label="Nombre">
                    <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                  </IgField>
                  <IgField label="Código">
                    <input value={code} onChange={(e) => setCode(e.target.value)} style={{ ...inputStyle, maxWidth: "100%" }} />
                  </IgField>
                  <IgField label="Org">
                    <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ ...selectStyle, maxWidth: "100%" }}>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </IgField>
                  <IgBtn
                    variant="primary"
                    disabled={!name || !orgId}
                    onClick={async () => {
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
                      }
                    }}
                  >
                    Alta persona
                  </IgBtn>
                </div>
              </>
            )}
          </IgPanel>
        }
      />
    </IgPage>
  );
}
