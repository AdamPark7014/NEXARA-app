"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IgBadge,
  IgBtn,
  IgError,
  IgField,
  IgFilters,
  IgNotice,
  IgPage,
  IgPanel,
  IgSplit,
  IgToolbar,
} from "../_Console";
import { PersonFaceThumb } from "../_PersonFace";
import { inputStyle, integraApi, selectStyle } from "../_lib";
import { getCachedCapabilities, subscribeCapabilities } from "../_caps";
import type { IntegraCapabilities } from "../_lib";
import styles from "../integra.module.css";

type AccessKind = "indefinite" | "timed" | "expired" | "off" | "unknown";

type Template = {
  key: string;
  label: string;
  description: string;
};

type LastAccess = {
  id: number;
  occurredAt: string;
  personId: string | null;
  personName: string | null;
  verifyMode: string | null;
  photoPath: string | null;
  granted: boolean;
  label: string | null;
};

type WindowRow = {
  id: number;
  title: string;
  hostName: string | null;
  hostPersonId: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  phase: "now" | "upcoming" | "past";
};

type SpaceCard = {
  id: string;
  name: string;
  regionName: string | null;
  online: boolean;
  doorState: string | null;
  policy: {
    templateKey: string;
    label: string;
    description: string;
    config: unknown;
  };
  accessCounts: {
    indefinite: number;
    timed: number;
    expired: number;
    off: number;
    unknown: number;
    total: number;
  };
  nextWindow: WindowRow | null;
  windowsOpen: number;
  lastAccess: LastAccess | null;
};

type Overview = {
  siteId: number;
  siteName: string;
  generatedAt: string;
  templates: Template[];
  siteAccess: {
    indefinite: number;
    timed: number;
    expired: number;
    off: number;
    unknown: number;
    total: number;
  };
  spaces: SpaceCard[];
  note?: string;
};

type SpaceDetail = SpaceCard & {
  people: Array<{
    personId: string;
    personName: string;
    kind: AccessKind;
    kindLabel: string;
    validFrom?: string;
    validTo?: string;
    validEnable?: boolean;
    hasFace?: boolean;
    sourceIp?: string;
  }>;
  windows: WindowRow[];
  recentAccess: LastAccess[];
};

type PersonOpt = { id: string; name: string };

function kindTone(kind: AccessKind | string): "ok" | "warn" | "danger" | "neutral" {
  if (kind === "indefinite") return "ok";
  if (kind === "timed") return "warn";
  if (kind === "expired" || kind === "off") return "danger";
  return "neutral";
}

function hhmm(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function dayTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("es-MX", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function relAge(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 36) return `hace ${h} h`;
  return dayTime(iso);
}

function toLocalInput(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function IntegraEspaciosPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<SpaceDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [peopleOpts, setPeopleOpts] = useState<PersonOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [filterKind, setFilterKind] = useState<"" | "indefinite" | "timed" | "booking">("");
  const [caps, setCaps] = useState<IntegraCapabilities | null>(null);

  const [templateKey, setTemplateKey] = useState("INDEFINITE");
  const [bookingTitle, setBookingTitle] = useState("");
  const [bookingHostId, setBookingHostId] = useState("");
  const [bookingStart, setBookingStart] = useState(() => toLocalInput());
  const [bookingEnd, setBookingEnd] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return toLocalInput(d);
  });
  const [bookingNotes, setBookingNotes] = useState("");

  useEffect(() => {
    setCaps(getCachedCapabilities());
    return subscribeCapabilities(setCaps);
  }, []);

  const canEdit = caps == null ? true : Boolean(caps.canControlDoors);

  const loadOverview = useCallback(async () => {
    setError(null);
    try {
      const [ov, pe] = await Promise.all([
        integraApi<Overview>("integra/spaces"),
        integraApi<{ items: PersonOpt[] }>("integra/people").catch(() => ({ items: [] })),
      ]);
      setOverview(ov);
      setPeopleOpts(pe.items || []);
      if (!selectedId && ov.spaces[0]) setSelectedId(ov.spaces[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar espacios");
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (doorId: string) => {
    try {
      const d = await integraApi<SpaceDetail>(`integra/spaces/${encodeURIComponent(doorId)}`);
      setDetail(d);
      setTemplateKey(d.policy.templateKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el espacio");
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    const id = window.setInterval(() => void loadOverview(), 30_000);
    return () => window.clearInterval(id);
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
    const id = window.setInterval(() => void loadDetail(selectedId), 15_000);
    return () => window.clearInterval(id);
  }, [selectedId, loadDetail]);

  const filtered = useMemo(() => {
    const spaces = overview?.spaces || [];
    return spaces.filter((s) => {
      if (q) {
        const hay = `${s.name} ${s.regionName || ""} ${s.id}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      if (filterKind === "indefinite" && s.accessCounts.indefinite === 0) return false;
      if (filterKind === "timed" && s.accessCounts.timed === 0) return false;
      if (filterKind === "booking" && s.windowsOpen === 0) return false;
      return true;
    });
  }, [overview, q, filterKind]);

  const savePolicy = async () => {
    if (!selectedId || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      await integraApi(`integra/spaces/${encodeURIComponent(selectedId)}/policy`, {
        method: "PUT",
        body: JSON.stringify({ templateKey }),
      });
      await Promise.all([loadOverview(), loadDetail(selectedId)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la plantilla");
    } finally {
      setBusy(false);
    }
  };

  const createBooking = async () => {
    if (!selectedId || !canEdit) return;
    const startsAt = fromLocalInput(bookingStart);
    const endsAt = fromLocalInput(bookingEnd);
    if (!bookingTitle.trim() || !startsAt || !endsAt) {
      setError("Completa título e intervalo de uso");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await integraApi("integra/spaces-bookings", {
        method: "POST",
        body: JSON.stringify({
          doorIndexCode: selectedId,
          title: bookingTitle.trim(),
          hostPersonId: bookingHostId || undefined,
          startsAt,
          endsAt,
          notes: bookingNotes.trim() || undefined,
        }),
      });
      setBookingTitle("");
      setBookingNotes("");
      setBookingHostId("");
      await Promise.all([loadOverview(), loadDetail(selectedId)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la ventana");
    } finally {
      setBusy(false);
    }
  };

  const cancelBooking = async (id: number) => {
    if (!canEdit || !selectedId) return;
    setBusy(true);
    try {
      await integraApi(`integra/spaces-bookings/${id}`, { method: "DELETE" });
      await Promise.all([loadOverview(), loadDetail(selectedId)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar");
    } finally {
      setBusy(false);
    }
  };

  const site = overview?.siteAccess;

  return (
    <IgPage>
      <IgToolbar
        title="Espacios / puertas"
        meta={
          overview
            ? `${overview.spaces.length} espacios · ${overview.siteName} · ${site?.indefinite ?? 0} indefinidos · ${site?.timed ?? 0} temporales`
            : "Política de vigencia ACS y uso planificado"
        }
        actions={
          <>
            <IgBtn onClick={() => void loadOverview()}>Actualizar</IgBtn>
            <IgBtn
              onClick={() => {
                const q = selectedId
                  ? `?view=door&door=${encodeURIComponent(selectedId)}`
                  : "?view=door";
                window.location.href = `/integra/schedules${q}`;
              }}
            >
              Horarios ACS
            </IgBtn>
            <IgBtn onClick={() => (window.location.href = "/integra/people")}>Personas</IgBtn>
            <IgBtn onClick={() => (window.location.href = "/integra/access")}>Accesos</IgBtn>
          </>
        }
      />

      <IgError>{error}</IgError>

      <IgNotice>
        Todas las puertas del sitio: quién tiene acceso <strong>indefinido</strong> vs{" "}
        <strong>temporal</strong> (Valid), plantilla por espacio, ventanas de uso planificadas y
        últimas entradas en vivo. Para empujar RightPlan / franjas semanales al terminal usa{" "}
        <Link href="/integra/schedules">Horarios</Link>.
      </IgNotice>

      {site && (
        <div className={styles.spaceKpis} aria-label="Resumen del sitio">
          <div className={styles.spaceKpi}>
            <strong>{site.total}</strong>
            <span>Personas espejo</span>
          </div>
          <div className={styles.spaceKpi} data-tone="ok">
            <strong>{site.indefinite}</strong>
            <span>Indefinido</span>
          </div>
          <div className={styles.spaceKpi} data-tone="warn">
            <strong>{site.timed}</strong>
            <span>Temporal</span>
          </div>
          <div className={styles.spaceKpi} data-tone="danger">
            <strong>{site.expired + site.off}</strong>
            <span>Vencido / off</span>
          </div>
        </div>
      )}

      <IgFilters>
        <IgField label="Buscar espacio">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={inputStyle}
            placeholder="Sala de juntas, Gerencia…"
          />
        </IgField>
        <IgField label="Filtrar">
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value as typeof filterKind)}
            style={selectStyle}
          >
            <option value="">Todos</option>
            <option value="indefinite">Con indefinidos</option>
            <option value="timed">Con temporales</option>
            <option value="booking">Con reserva activa</option>
          </select>
        </IgField>
      </IgFilters>

      <IgSplit
        left={
        <IgPanel title="Espacios" count={`${filtered.length} visibles`}>
          <ul className={styles.spaceList}>
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={styles.spaceRow}
                  data-active={selectedId === s.id ? "1" : "0"}
                  data-online={s.online === false ? "0" : "1"}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className={styles.spaceRowHead}>
                    <strong>{s.name}</strong>
                    <IgBadge tone={s.online === false ? "danger" : "ok"}>
                      {s.online === false ? "Offline" : "Online"}
                    </IgBadge>
                  </div>
                  <div className={styles.spaceRowMeta}>
                    <span>{s.policy.label}</span>
                    <span>
                      ∞ {s.accessCounts.indefinite} · ⏱ {s.accessCounts.timed} ·{" "}
                      {s.accessCounts.total} personas
                    </span>
                  </div>
                  {s.lastAccess && (
                    <div className={styles.spaceRowLive}>
                      Último: {s.lastAccess.personName || "Sin ID"} · {relAge(s.lastAccess.occurredAt)}
                    </div>
                  )}
                  {s.nextWindow && (
                    <div className={styles.spaceRowLive} data-phase={s.nextWindow.phase}>
                      {s.nextWindow.phase === "now" ? "En uso ahora" : "Próximo"}: {s.nextWindow.title}{" "}
                      ({hhmm(s.nextWindow.startsAt)}–{hhmm(s.nextWindow.endsAt)})
                    </div>
                  )}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className={styles.ptzHint}>Sin espacios en el espejo. Sincroniza el sitio.</li>
            )}
          </ul>
        </IgPanel>
        }
        right={
        <IgPanel
          title={detail?.name || "Detalle"}
          count={detail ? detail.policy.description : "Selecciona un espacio"}
        >
          {!detail && <p className={styles.ptzHint}>Elige una puerta a la izquierda.</p>}
          {detail && (
            <div className={styles.spaceDetail}>
              <section className={styles.spaceSection}>
                <header>
                  <h3>Plantilla por defecto</h3>
                  <Link
                    href={`/integra/schedules?view=door&door=${encodeURIComponent(detail.id)}`}
                    className={styles.spaceLink}
                  >
                    Empujar horario ACS
                  </Link>
                </header>
                <div className={styles.spacePolicyRow}>
                  <select
                    value={templateKey}
                    onChange={(e) => setTemplateKey(e.target.value)}
                    style={selectStyle}
                    disabled={!canEdit || busy}
                  >
                    {(overview?.templates || []).map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {canEdit && (
                    <IgBtn variant="primary" disabled={busy} onClick={() => void savePolicy()}>
                      Guardar plantilla
                    </IgBtn>
                  )}
                </div>
                <p className={styles.ptzHint}>
                  {(overview?.templates || []).find((t) => t.key === templateKey)?.description ||
                    detail.policy.description}
                </p>
              </section>

              <section className={styles.spaceSection}>
                <header>
                  <h3>Quién tiene acceso</h3>
                  <span>
                    ∞ {detail.accessCounts.indefinite} · ⏱ {detail.accessCounts.timed} ·{" "}
                    {detail.people.length} total
                  </span>
                </header>
                <ul className={styles.spacePeople}>
                  {detail.people.map((p) => (
                    <li key={p.personId}>
                      <PersonFaceThumb
                        size="sm"
                        personId={p.personId}
                        personName={p.personName}
                      />
                      <div>
                        <strong>{p.personName}</strong>
                        <span>
                          {p.validFrom ? dayTime(p.validFrom) : "—"} →{" "}
                          {p.validTo ? dayTime(p.validTo) : "—"}
                        </span>
                      </div>
                      <IgBadge tone={kindTone(p.kind)}>{p.kindLabel}</IgBadge>
                    </li>
                  ))}
                  {detail.people.length === 0 && (
                    <li className={styles.ptzHint}>
                      Nadie asignado a esta puerta en el espejo (RightPlan / doorRight).
                    </li>
                  )}
                </ul>
              </section>

              <section className={styles.spaceSection}>
                <header>
                  <h3>Ventanas de uso</h3>
                  <span>{detail.windows.filter((w) => w.phase !== "past").length} activas</span>
                </header>
                {canEdit && (
                  <div className={styles.spaceBookingForm}>
                    <IgField label="Motivo / reunión">
                      <input
                        value={bookingTitle}
                        onChange={(e) => setBookingTitle(e.target.value)}
                        style={inputStyle}
                        placeholder="Junta comercial, visita…"
                      />
                    </IgField>
                    <IgField label="Responsable ACS">
                      <select
                        value={bookingHostId}
                        onChange={(e) => setBookingHostId(e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">— opcional —</option>
                        {peopleOpts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </IgField>
                    <IgField label="Inicio">
                      <input
                        type="datetime-local"
                        value={bookingStart}
                        onChange={(e) => setBookingStart(e.target.value)}
                        style={inputStyle}
                      />
                    </IgField>
                    <IgField label="Fin">
                      <input
                        type="datetime-local"
                        value={bookingEnd}
                        onChange={(e) => setBookingEnd(e.target.value)}
                        style={inputStyle}
                      />
                    </IgField>
                    <IgField label="Notas">
                      <input
                        value={bookingNotes}
                        onChange={(e) => setBookingNotes(e.target.value)}
                        style={inputStyle}
                        placeholder="Opcional"
                      />
                    </IgField>
                    <IgBtn variant="primary" disabled={busy} onClick={() => void createBooking()}>
                      Programar uso
                    </IgBtn>
                  </div>
                )}
                <ul className={styles.spaceWindows}>
                  {detail.windows.map((w) => (
                    <li key={w.id} data-phase={w.phase}>
                      <div>
                        <strong>{w.title}</strong>
                        <span>
                          {dayTime(w.startsAt)} → {hhmm(w.endsAt)}
                          {w.hostName ? ` · ${w.hostName}` : ""}
                        </span>
                      </div>
                      <div className={styles.spaceWindowActions}>
                        <IgBadge
                          tone={
                            w.phase === "now" ? "ok" : w.phase === "upcoming" ? "warn" : "neutral"
                          }
                        >
                          {w.phase === "now" ? "En curso" : w.phase === "upcoming" ? "Próxima" : "Pasada"}
                        </IgBadge>
                        {canEdit && w.phase !== "past" && (
                          <IgBtn disabled={busy} onClick={() => void cancelBooking(w.id)}>
                            Cancelar
                          </IgBtn>
                        )}
                      </div>
                    </li>
                  ))}
                  {detail.windows.length === 0 && (
                    <li className={styles.ptzHint}>Sin ventanas planificadas.</li>
                  )}
                </ul>
              </section>

              <section className={styles.spaceSection}>
                <header>
                  <h3>Últimas entradas</h3>
                  <Link href="/integra/events" className={styles.spaceLink}>
                    Ver eventos
                  </Link>
                </header>
                <ul className={styles.spaceLive}>
                  {detail.recentAccess.map((r) => (
                    <li key={r.id}>
                      <PersonFaceThumb
                        size="sm"
                        personId={r.personId || ""}
                        personName={r.personName}
                        photoPath={r.photoPath}
                      />
                      <div>
                        <strong>{r.personName || "Sin ID"}</strong>
                        <span>
                          {relAge(r.occurredAt)}
                          {r.verifyMode ? ` · ${r.verifyMode}` : ""}
                        </span>
                      </div>
                      <IgBadge tone={r.granted ? "ok" : "danger"}>
                        {r.granted ? "Concedido" : "Denegado"}
                      </IgBadge>
                    </li>
                  ))}
                  {detail.recentAccess.length === 0 && (
                    <li className={styles.ptzHint}>Sin accesos recientes en esta puerta.</li>
                  )}
                </ul>
              </section>
            </div>
          )}
        </IgPanel>
        }
      />

      {overview?.note && <p className={styles.ptzHint}>{overview.note}</p>}
    </IgPage>
  );
}
