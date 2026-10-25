"use client";

import { useEffect, useState, useCallback, useDeferredValue, useMemo, useRef } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import MetricStrip from "@/components/ui/MetricStrip";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { SkeletonList, Skeleton } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl, parseResponseJson } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { canAccessHrManagement, getAttendanceSectionConfig } from "@/lib/user-access";
import { attendanceMapUrl } from "@/lib/gps-map-links";
import AttendanceGpsDayPanel from "@/components/AttendanceGpsDayPanel";
import HybridAttendancePanel from "@/components/HybridAttendancePanel";
import { EnSitioStrip } from "@/components/presence/EnSitioStrip";
import OpsAttendanceRail from "@/components/ops/OpsAttendanceRail";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import ListExportActions from "@/components/ui/ListExportActions";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { isNonEmployeeEmail } from "@/lib/platform-accounts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttendanceDay {
  isOpen?: boolean;
  lastEntryAt?: string | null;
  totalMinutes?: number;
}

type Estado = "PRESENTE" | "COMPLETO" | "AUSENTE";

interface TeamMember {
  userId: number;
  nombre: string;
  email?: string;
  department?: string;
  roleName?: string;
  attendances?: { type: string; timestamp: string; photoUrl?: string; entryLatitude?: number; entryLongitude?: number; exitLatitude?: number; exitLongitude?: number }[];
  totalMinutes?: number;
  checkIn?: string;
  checkOut?: string;
  entryMapUrl?: string | null;
  exitMapUrl?: string | null;
  estado?: Estado;
}

interface HierarchyRangeResponse {
  users?: ApiAttendanceUser[];
  totalUsers?: number;
}

interface ApiAttendanceUser {
  userId: number;
  userName?: string;
  email?: string;
  department?: string;
  roleName?: string;
  totalMinutes?: number;
  days?: { date: string; totalMinutes?: number; isOpen?: boolean }[];
  attendances?: { type: string; timestamp: string; photoUrl?: string; entryLatitude?: number; entryLongitude?: number; exitLatitude?: number; exitLongitude?: number }[];
}

interface WeekDay {
  date?: string;
  totalMinutes?: number;
  isOpen?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ESTADO_LABEL: Record<Estado, string> = {
  PRESENTE: "En jornada",
  COMPLETO: "Jornada completa",
  AUSENTE: "Sin registro",
};

const ESTADO_VARIANT: Record<Estado, "accent" | "positive" | "danger"> = {
  PRESENTE: "accent",
  COMPLETO: "positive",
  AUSENTE: "danger",
};

async function apiFetch<T = unknown>(path: string, token: string): Promise<T | null> {
  const res = await fetch(buildApiUrl(path), {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const readable = text.trim().startsWith("<") ? "" : text;
    throw new Error(readable || (res.status === 403 ? "No tienes permiso para ver esta asistencia." : "El servidor no respondió."));
  }
  return parseResponseJson<T>(res);
}

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function fmtMinutes(m?: number): string {
  if (!m) return "0 h";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h} h${min > 0 ? ` ${min} min` : ""}` : `${min} min`;
}

function fmtDayLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function getLatestByType(
  list: { type: string; timestamp: string; entryLatitude?: number; entryLongitude?: number; exitLatitude?: number; exitLongitude?: number }[] | undefined,
  type: "entrada" | "salida",
): string | undefined {
  const filtered = (list ?? []).filter((a) => a.type === type);
  if (filtered.length === 0) return undefined;
  return filtered.reduce((max, a) => (a.timestamp > max.timestamp ? a : max)).timestamp;
}

function getLatestMapUrl(
  list: TeamMember["attendances"],
  type: "entrada" | "salida",
): string | null {
  return attendanceMapUrl(list, type);
}

function resolveEstado(
  checkIn?: string,
  checkOut?: string,
  isOpen?: boolean,
): Estado {
  if (isOpen) return "PRESENTE";
  if (checkIn && checkOut) return "COMPLETO";
  if (checkIn) return "PRESENTE";
  return "AUSENTE";
}

function mapApiUser(raw: ApiAttendanceUser, dateFilter: string): TeamMember {
  const checkIn = getLatestByType(raw.attendances, "entrada");
  const checkOut = getLatestByType(raw.attendances, "salida");
  const dayInfo = raw.days?.find((d) => d.date === dateFilter);
  const totalMinutes = dayInfo?.totalMinutes ?? raw.totalMinutes ?? 0;
  return {
    userId: raw.userId,
    nombre: raw.userName?.trim() || raw.email || "Persona sin nombre",
    email: raw.email,
    department: raw.department,
    roleName: raw.roleName,
    attendances: raw.attendances,
    totalMinutes,
    checkIn,
    checkOut,
    entryMapUrl: getLatestMapUrl(raw.attendances, "entrada"),
    exitMapUrl: getLatestMapUrl(raw.attendances, "salida"),
    estado: resolveEstado(checkIn, checkOut, dayInfo?.isOpen),
  };
}

function unaFrase(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const end = clean.search(/[.!?](\s|$)/);
  return end === -1 ? clean : clean.slice(0, end + 1);
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600).toString().padStart(2, "0");
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function getWeekDates(): string[] {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - dow + i);
    return d.toLocaleDateString("sv-SE");
  });
}

function StatusPill({ tone, children }: { tone: "success" | "info" | "neutral"; children: React.ReactNode }) {
  const palette = {
    success: { bg: "var(--state-success-bg)", text: "var(--state-success-text)", dot: "var(--success)" },
    info: { bg: "var(--state-info-bg)", text: "var(--state-info-text)", dot: "var(--primary)" },
    neutral: { bg: "var(--surface-2)", text: "var(--text-secondary)", dot: "var(--text-tertiary)" },
  }[tone];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700,
      background: palette.bg, color: palette.text,
    }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: palette.dot, display: "inline-block" }} />
      {children}
    </span>
  );
}

// ─── Employee Status Hero ─────────────────────────────────────────────────────

function EmployeeStatusHero({ token, gpsConsent }: { token: string; gpsConsent: boolean }) {
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDay = useCallback(async () => {
    if (!token) return;
    try {
      const d = await apiFetch<AttendanceDay>("attendance/current", token);
      setDay(d ?? null);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(formatApiError(e, "No se pudo consultar tu jornada."));
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => { void loadDay(); }, [loadDay]);

  useEffect(() => {
    const onUpdate = () => void loadDay();
    window.addEventListener("attendance:updated", onUpdate);
    return () => window.removeEventListener("attendance:updated", onUpdate);
  }, [loadDay]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (day?.isOpen && day.lastEntryAt) {
      const start = new Date(day.lastEntryAt).getTime();
      timerRef.current = setInterval(() => setElapsed(Date.now() - start), 1000);
      setElapsed(Date.now() - start);
    } else {
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [day?.isOpen, day?.lastEntryAt]);

  const isOpen = Boolean(day?.isOpen);
  const gpsActive = gpsConsent && isOpen;

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)",
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
  };

  return (
    <>
      {loadErr && (
        <InlineAlert
          variant={day ? "warning" : "danger"}
          message={unaFrase(loadErr)}
          action={<Button size="sm" variant="secondary" onClick={() => void loadDay()}>Reintentar</Button>}
          style={{ marginBottom: 12 }}
        />
      )}
      <section
        className="nx-att-hero"
        aria-label="Tu jornada de hoy"
        aria-busy={!loaded}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
          padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center",
          gap: 28, flexWrap: "wrap",
        }}
      >
        <div>
          <div style={labelStyle}>Hoy</div>
          {!loaded ? (
            <Skeleton width={140} height={30} radius={999} />
          ) : (
            <StatusPill tone={isOpen ? "success" : "neutral"}>
              {isOpen ? "En jornada" : day ? "Jornada cerrada" : "Sin registro hoy"}
            </StatusPill>
          )}
        </div>

        <div>
          <div style={labelStyle}>{isOpen ? "Tiempo transcurrido" : "Total del día"}</div>
          <div
            role={isOpen ? "timer" : undefined}
            style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em", color: isOpen ? "var(--foreground)" : "var(--text-tertiary)" }}
          >
            {isOpen ? fmtElapsed(elapsed) : day?.totalMinutes ? fmtMinutes(day.totalMinutes) : "—"}
          </div>
        </div>

        <div>
          <div style={labelStyle}>Entrada</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtTime(day?.lastEntryAt)}</div>
        </div>

        <div style={{ marginLeft: "auto" }}>
          <div style={labelStyle}>Ubicación</div>
          <StatusPill tone={gpsActive ? "info" : "neutral"}>
            {gpsActive ? "Compartiendo ubicación" : "Sin compartir"}
          </StatusPill>
        </div>
      </section>
    </>
  );
}

// ─── Weekly Bar ───────────────────────────────────────────────────────────────

function WeeklyBar({ token }: { token: string }) {
  const [days, setDays] = useState<WeekDay[]>([]);
  const [totalMin, setTotalMin] = useState(0);
  const [weekErr, setWeekErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const weekDates = useMemo(() => getWeekDates(), []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch<{ totalMinutes?: number; days?: WeekDay[] }>(
      `attendance/range?from=${weekDates[0]}&to=${weekDates[6]}`, token
    ).then(d => {
      if (cancelled) return;
      setTotalMin(d?.totalMinutes ?? 0);
      setDays(d?.days ?? []);
      setWeekErr(null);
    }).catch((e) => {
      if (!cancelled) setWeekErr(formatApiError(e, "No se pudo cargar tu semana."));
    });
    return () => { cancelled = true; };
  }, [token, weekDates, reloadKey]);

  const today = new Date().toLocaleDateString("sv-SE");
  const maxMin = Math.max(...days.map(d => d.totalMinutes ?? 0), 1);

  return (
    <Section title="Tu semana" subtitle={`${fmtMinutes(totalMin)} registradas`}>
      {weekErr && (
        <InlineAlert
          variant="warning"
          message={unaFrase(weekErr)}
          action={<Button size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>Reintentar</Button>}
          style={{ marginBottom: 10 }}
        />
      )}
      <ol style={{ listStyle: "none", margin: 0, padding: "0 0 8px", display: "flex", gap: 10, alignItems: "flex-end", minHeight: 100 }}>
        {weekDates.map((dateStr, i) => {
          const found = days.find(d => d.date === dateStr);
          const min = found?.totalMinutes ?? 0;
          const pct = Math.min(96, (min / maxMin) * 96);
          const isToday = dateStr === today;
          const isFuture = dateStr > today;
          return (
            <li
              key={dateStr}
              aria-label={`${DAY_NAMES[i]}${isToday ? " (hoy)" : ""}: ${isFuture ? "aún no llega" : fmtMinutes(min)}`}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: 96 }}
            >
              <div aria-hidden="true" style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{
                  width: "100%", height: min > 0 ? `${pct}%` : 4, minHeight: 4, borderRadius: 4,
                  background: isFuture ? "var(--surface-2)" : isToday ? "var(--primary)" : min > 0 ? "var(--state-info-border)" : "var(--surface-2)",
                  transition: "height 0.4s ease",
                }} />
              </div>
              <div aria-hidden="true" style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--primary)" : "var(--text-tertiary)", marginTop: 4 }}>
                {DAY_LABELS[i]}
              </div>
              <div aria-hidden="true" style={{ fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums", minHeight: 14 }}>
                {min > 0 ? fmtMinutes(min) : ""}
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

// ─── Team Card ────────────────────────────────────────────────────────────────

const CARD_BORDER: Record<Estado, string> = {
  PRESENTE: "var(--state-info-border)",
  COMPLETO: "var(--state-success-border)",
  AUSENTE: "var(--border)",
};

function TeamCard({ member, token, dateFilter, highlighted }: { member: TeamMember; token: string; dateFilter: string; highlighted?: boolean }) {
  const name = member.nombre;
  const role = member.roleName ?? "";
  const dept = member.department ?? "";
  const estado = member.estado ?? "AUSENTE";
  const ci = member.checkIn;
  const co = member.checkOut;
  const entryPhoto = useMemo(() => [...(member.attendances ?? [])].filter((a) => a.type === "entrada" && a.photoUrl).pop(), [member.attendances]);
  const exitPhoto = useMemo(() => [...(member.attendances ?? [])].filter((a) => a.type === "salida" && a.photoUrl).pop(), [member.attendances]);

  return (
    <article
      aria-label={`${name}: ${ESTADO_LABEL[estado]}`}
      style={{ background: "var(--surface)", border: `1.5px solid ${highlighted ? "var(--primary)" : CARD_BORDER[estado]}`, borderRadius: 12, padding: "14px 16px" }}
    >
      <div className="nx-att-card-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/erp/hr/${member.userId}`} style={{ fontWeight: 700, fontSize: 14, color: "var(--foreground)", textDecoration: "none" }}>{name}</Link>
          {(role || dept) && (
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 1 }}>
              {[role, dept].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <Tag size="sm" dot variant={ESTADO_VARIANT[estado]}>{ESTADO_LABEL[estado]}</Tag>
      </div>
      <dl className="nx-att-times nx-att-times-col">
        <div>
          <dt>Entrada</dt>
          <dd>{fmtTime(ci)}</dd>
        </div>
        <div>
          <dt>Salida</dt>
          <dd>{fmtTime(co)}</dd>
        </div>
        {(member.totalMinutes ?? 0) > 0 && (
          <div>
            <dt>Horas</dt>
            <dd>{fmtMinutes(member.totalMinutes)}</dd>
          </div>
        )}
      </dl>
      {(entryPhoto?.photoUrl || exitPhoto?.photoUrl) && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {entryPhoto?.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveAssetUrl(entryPhoto.photoUrl)}
              alt={`Foto de entrada de ${name}`}
              loading="lazy"
              style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
            />
          )}
          {exitPhoto?.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveAssetUrl(exitPhoto.photoUrl)}
              alt={`Foto de salida de ${name}`}
              loading="lazy"
              style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
            />
          )}
        </div>
      )}
      {(member.estado === "PRESENTE" || member.estado === "COMPLETO") && (
        <AttendanceGpsDayPanel
          token={token}
          userId={member.userId}
          date={dateFilter}
          attendances={member.attendances}
          hasCheckIn={Boolean(ci)}
        />
      )}
    </article>
  );
}

// ─── Team View ────────────────────────────────────────────────────────────────

function TeamAttendanceView({
  token,
  dateFilter,
  visibilityHint,
  highlightId,
}: {
  token: string;
  dateFilter: string;
  visibilityHint?: string;
  highlightId?: string | null;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [teamErr, setTeamErr] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [searchMember, setSearchMember] = useState("");
  const deferredSearch = useDeferredValue(searchMember);
  const [filterEstado, setFilterEstado] = useState<"" | Estado>("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const raw = await apiFetch<HierarchyRangeResponse | ApiAttendanceUser[]>(
        `attendance/hierarchy/range?from=${dateFilter}&to=${dateFilter}`, token
      );
      const rawArr: ApiAttendanceUser[] = !raw ? [] : Array.isArray(raw) ? raw : (raw.users ?? []);
      // Christian/Adam/Claudia/cuenta demo no son empleados: fuera de la lista de asistencia.
      const arr = rawArr.filter((u) => !isNonEmployeeEmail(u.email));
      const ORDER = { PRESENTE: 0, COMPLETO: 1, AUSENTE: 2 } as const;
      const mapped = arr.map((u) => mapApiUser(u, dateFilter));
      mapped.sort((a, b) => (ORDER[a.estado ?? "AUSENTE"] ?? 2) - (ORDER[b.estado ?? "AUSENTE"] ?? 2));
      setMembers(mapped);
      setLoadedFor(dateFilter);
      setTeamErr(null);
    } catch (e) {
      setTeamErr(formatApiError(e, "No se pudo cargar la asistencia del equipo."));
    }
    finally { setLoading(false); }
  }, [token, dateFilter]);

  useEffect(() => { void load(); }, [load]);

  const loaded = loadedFor !== null;
  const staleDate = loaded && loadedFor !== dateFilter;

  const counts = useMemo(() => {
    let presentes = 0, completos = 0, ausentes = 0;
    for (const m of members) {
      if (m.estado === "PRESENTE") presentes++;
      else if (m.estado === "COMPLETO") completos++;
      else ausentes++;
    }
    return { presentes, completos, ausentes };
  }, [members]);
  const { presentes, completos, ausentes } = counts;

  const visibleMembers = useMemo(() => {
    let result = members;
    const q = deferredSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((m) => m.nombre.toLowerCase().includes(q) || (m.department ?? "").toLowerCase().includes(q));
    }
    if (filterEstado) result = result.filter((m) => m.estado === filterEstado);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) result = [...result].sort((a, b) => (a.userId === id ? -1 : b.userId === id ? 1 : 0));
    }
    return result;
  }, [members, deferredSearch, filterEstado, highlightId]);

  const cols: Column<TeamMember>[] = [
    {
      key: "nombre", label: "Persona",
      render: m => (
        <div>
          <Link href={`/erp/hr/${m.userId}`} style={{ fontWeight: 700, fontSize: 13.5, color: "var(--primary)", textDecoration: "none" }}>{m.nombre}</Link>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {[m.roleName, m.department].filter(Boolean).join(" · ") || m.email || ""}
          </div>
        </div>
      ),
    },
    { key: "checkIn", label: "Entrada", render: m => <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTime(m.checkIn)}</span>, width: 100 },
    { key: "checkOut", label: "Salida", render: m => <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTime(m.checkOut)}</span>, width: 100 },
    {
      key: "ubicacion", label: "Ubicación", width: 150,
      render: m => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12.5 }}>
          {m.entryMapUrl ? (
            <a href={m.entryMapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", padding: "4px 0" }}>
              Ver entrada en mapa
            </a>
          ) : null}
          {m.exitMapUrl ? (
            <a href={m.exitMapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", padding: "4px 0" }}>
              Ver salida en mapa
            </a>
          ) : null}
          {!m.entryMapUrl && !m.exitMapUrl ? <span style={{ color: "var(--text-tertiary)" }}>Sin ubicación</span> : null}
        </div>
      ),
    },
    { key: "totalMinutes", label: "Horas", render: m => <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMinutes(m.totalMinutes)}</span>, width: 110, align: "right" },
    {
      key: "estado", label: "Estado", width: 150,
      render: m => {
        const e = m.estado ?? "AUSENTE";
        return <Tag size="sm" dot variant={ESTADO_VARIANT[e]}>{ESTADO_LABEL[e]}</Tag>;
      },
    },
  ];

  const hasFilters = Boolean(searchMember || filterEstado);
  const highlightNum = highlightId ? Number(highlightId) : NaN;
  const presentePct = members.length ? Math.round(((presentes + completos) / members.length) * 100) : 0;

  return (
    <Section
      title="Equipo del día"
      subtitle={[fmtDayLong(dateFilter), visibilityHint].filter(Boolean).join(" · ")}
      actions={
        <Button size="sm" variant="ghost" loading={loading && loaded} onClick={() => void load()}>Actualizar</Button>
      }
    >
      {teamErr && (loaded || !loading) && (
        <InlineAlert
          variant={loaded ? "warning" : "danger"}
          message={unaFrase(teamErr)}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 12 }}
        />
      )}

      {loaded && (
        <div className="nx-att-metrics" style={{ marginBottom: 14, opacity: staleDate ? 0.6 : 1 }}>
          <MetricStrip
            ariaLabel="Resumen de asistencia"
            metrics={[
              { label: "Equipo", value: members.length, onClick: () => setFilterEstado("") },
              { label: "En jornada", value: presentes, hint: "Jornada abierta", onClick: () => setFilterEstado("PRESENTE") },
              { label: "Completaron", value: completos, tone: completos > 0 ? "success" : "default", hint: "Jornada cerrada", onClick: () => setFilterEstado("COMPLETO") },
              {
                label: "Sin registro",
                value: ausentes,
                tone: ausentes > 0 ? "danger" : "success",
                hint: ausentes > 0 ? "No han checado" : "Todos checaron",
                onClick: () => setFilterEstado("AUSENTE"),
              },
            ]}
          />
        </div>
      )}

      {loaded && members.length > 0 && (
        <div style={{ marginBottom: 14, padding: "10px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, opacity: staleDate ? 0.6 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Cobertura de asistencia</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: presentePct >= 80 ? "var(--success)" : presentePct >= 50 ? "var(--primary)" : "var(--danger)" }}>{presentePct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Personas que checaron"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={presentePct}
            style={{ height: 8, borderRadius: 4, background: "var(--surface)", overflow: "hidden", position: "relative" }}
          >
            <div style={{ height: "100%", width: `${Math.round((completos / members.length) * 100)}%`, background: "var(--success)", borderRadius: 4, position: "absolute", left: 0, transition: "width .4s" }} />
            <div style={{ height: "100%", width: `${presentePct}%`, background: "var(--primary)", borderRadius: 4, position: "absolute", left: 0, opacity: 0.5, transition: "width .4s" }} />
          </div>
          <div className="nx-att-legend" style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "var(--text-tertiary)", flexWrap: "wrap" }}>
            <span><span aria-hidden="true" style={{ color: "var(--success)", fontWeight: 700 }}>■</span> Completaron ({completos})</span>
            <span><span aria-hidden="true" style={{ color: "var(--primary)", fontWeight: 700 }}>■</span> En jornada ({presentes})</span>
            <span><span aria-hidden="true" style={{ color: "var(--danger)", fontWeight: 700 }}>■</span> Sin registro ({ausentes})</span>
          </div>
        </div>
      )}

      <FilterToolbar
        search={{ value: searchMember, onChange: setSearchMember, placeholder: "Buscar por nombre o departamento…", ariaLabel: "Buscar persona" }}
        selects={[{
          label: "Estado",
          value: filterEstado,
          onChange: (v) => setFilterEstado(v as "" | Estado),
          options: [
            { value: "PRESENTE", label: "En jornada" },
            { value: "COMPLETO", label: "Completaron" },
            { value: "AUSENTE", label: "Sin registro" },
          ],
          allowAll: true,
        }]}
        onClear={() => { setSearchMember(""); setFilterEstado(""); }}
        resultCount={loaded ? visibleMembers.length : null}
        rightActions={
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <ListExportActions
              onExcel={
                members.length > 0
                  ? () =>
                      exportToExcel(
                        visibleMembers,
                        [
                          { key: "nombre", label: "Nombre" },
                          { key: "department", label: "Departamento" },
                          { key: "roleName", label: "Puesto" },
                          { key: "estado", label: "Estado", format: (v) => ESTADO_LABEL[(v as Estado) ?? "AUSENTE"] ?? "" },
                          { key: "checkIn", label: "Entrada", format: (v) => (v ? fmtTime(String(v)) : "—") },
                          { key: "checkOut", label: "Salida", format: (v) => (v ? fmtTime(String(v)) : "—") },
                          { key: "totalMinutes", label: "Horas", format: (v) => fmtMinutes(Number(v ?? 0)) },
                        ],
                        `asistencia-${dateFilter}`,
                        { title: "Asistencia", subtitle: fmtDayLong(dateFilter) },
                      )
                  : undefined
              }
            />
            <div role="group" aria-label="Vista" style={{ display: "flex", gap: 6 }}>
              <Button size="sm" variant={view === "grid" ? "primary" : "ghost"} aria-pressed={view === "grid"} onClick={() => setView("grid")}>Tarjetas</Button>
              <Button size="sm" variant={view === "table" ? "primary" : "ghost"} aria-pressed={view === "table"} onClick={() => setView("table")}>Tabla</Button>
            </div>
          </div>
        }
      />

      {!loaded && loading ? (
        <SkeletonList rows={4} tableLike={view === "table"} />
      ) : !loaded ? null : visibleMembers.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title={hasFilters && members.length > 0 ? "Nadie coincide con la búsqueda." : "Nadie tiene asistencia este día."}
          action={hasFilters && members.length > 0
            ? <Button size="sm" variant="secondary" onClick={() => { setSearchMember(""); setFilterEstado(""); }}>Quitar filtros</Button>
            : undefined}
        />
      ) : view === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: 12, opacity: staleDate ? 0.6 : 1 }}>
          {visibleMembers.map((m) => <TeamCard key={m.userId} member={m} token={token} dateFilter={dateFilter} highlighted={m.userId === highlightNum} />)}
        </div>
      ) : (
        <>
        <div className="nx-att-table" style={{ opacity: staleDate ? 0.6 : 1 }}>
          <DataTable<TeamMember>
            columns={cols}
            rows={visibleMembers}
            rowKey={(m) => m.userId}
            density="compact"
            ariaLabel="Asistencia del equipo"
            emptyTitle="No hay asistencia para esta fecha."
            emptyDescription=""
          />
        </div>
        <div className="nx-att-stack" style={{ opacity: staleDate ? 0.6 : 1 }}>
          {visibleMembers.map((m) => {
            const estado = m.estado ?? "AUSENTE";
            return (
              <article key={m.userId} className="nx-att-line" aria-label={`${m.nombre}: ${ESTADO_LABEL[estado]}`}>
                <Link href={`/erp/hr/${m.userId}`} style={{ fontWeight: 700, fontSize: 14, color: "var(--foreground)", textDecoration: "none" }}>{m.nombre}</Link>
                <dl className="nx-att-times nx-att-times-col">
                  <div><dt>Entrada</dt><dd>{fmtTime(m.checkIn)}</dd></div>
                  <div><dt>Salida</dt><dd>{fmtTime(m.checkOut)}</dd></div>
                  {(m.totalMinutes ?? 0) > 0 && (
                    <div><dt>Horas</dt><dd>{fmtMinutes(m.totalMinutes)}</dd></div>
                  )}
                  <div><dt>Estado</dt><dd>{ESTADO_LABEL[estado]}</dd></div>
                  <div>
                    <dt>Ubicación</dt>
                    <dd>{m.entryMapUrl || m.exitMapUrl ? "En mapa" : "Sin ubicación"}</dd>
                  </div>
                  {m.entryMapUrl ? (
                    <div><dt>Mapa de entrada</dt><dd><a href={m.entryMapUrl} target="_blank" rel="noopener noreferrer">Abrir</a></dd></div>
                  ) : null}
                  {m.exitMapUrl ? (
                    <div><dt>Mapa de salida</dt><dd><a href={m.exitMapUrl} target="_blank" rel="noopener noreferrer">Abrir</a></dd></div>
                  ) : null}
                </dl>
              </article>
            );
          })}
        </div>
        </>
      )}
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ATT_QUIET = `
.nx-att-times {
  display: flex;
  gap: 16px;
  margin: 0;
  font-size: 12.5px;
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.nx-att-times > div { display: flex; gap: 6px; align-items: baseline; }
.nx-att-times dd {
  margin: 0;
  font-weight: 600;
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}
.nx-att-times-col { flex-direction: column; align-items: stretch; gap: 8px; }
.nx-att-times-col > div { justify-content: space-between; }
.nx-att-stack { display: none; }
.nx-att-line {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  display: grid;
  gap: 8px;
}
.nx-att-line + .nx-att-line { margin-top: 12px; }
@media (max-width: 390px) {
  .nx-att-times { flex-direction: column; align-items: stretch; gap: 8px; }
  .nx-att-times > div { justify-content: space-between; }
  .nx-att-hero { flex-direction: column !important; align-items: stretch !important; }
  .nx-att-hero > div { margin-left: 0 !important; }
  .nx-att-metrics > * { grid-template-columns: 1fr !important; }
  .nx-att-legend { flex-direction: column !important; align-items: flex-start !important; }
  .nx-att-card-top { flex-direction: column !important; align-items: flex-start !important; }
  .nx-att-table { display: none; }
  .nx-att-stack { display: block; }
}
`;

export default function AttendancePage() {
  const { user } = useUser();
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const token = user?.token ?? "";
  const attCfg = useMemo(() => getAttendanceSectionConfig(user), [user]);
  const viewMode = attCfg.viewMode;
  const [dateFilter, setDateFilter] = useState(new Date().toLocaleDateString("sv-SE"));
  const [gpsConsent, setGpsConsent] = useState(false);

  useEffect(() => {
    setHighlightId(new URLSearchParams(window.location.search).get("highlight"));
  }, []);

  useEffect(() => {
    const onGps = (e: Event) => {
      const ce = e as CustomEvent<{ enabled: boolean }>;
      setGpsConsent(Boolean(ce.detail?.enabled));
    };
    window.addEventListener("gps:consent", onGps);
    return () => window.removeEventListener("gps:consent", onGps);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(buildApiUrl("gps/me"), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (!cancelled) setGpsConsent(Boolean(d?.consent)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const isManager = attCfg.canManageTeam;
  const canRegister = attCfg.canRegisterSelf;
  const puedeVolver = canAccessHrManagement(user);

  return (
    <>
      <style>{ATT_QUIET}</style>
      <PageHeader
        eyebrow="Recursos Humanos"
        title={attCfg.title}
        subtitle={attCfg.subtitle}
        backHref={puedeVolver ? "/erp/hr" : undefined}
        backLabel="Plantilla"
        actions={isManager ? (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
            Fecha
            <input
              type="date"
              value={dateFilter}
              onChange={e => e.target.value && setDateFilter(e.target.value)}
              max={new Date().toLocaleDateString("sv-SE")}
              style={{
                minHeight: 40,
                padding: "7px 10px",
                border: "1px solid var(--nx-panel-hairline)",
                borderRadius: 8,
                background: "var(--nx-panel-surface-overlay)",
                color: "var(--text-primary)",
                fontSize: 16,
                fontFamily: "inherit",
              }}
            />
          </label>
        ) : undefined}
      />

      <OpsAttendanceRail />

      {(viewMode === "manage" || viewMode === "manage_register") && (
        <div style={{ marginBottom: 16 }}>
          <EnSitioStrip variant="compact" title="En sitio · asistencia" />
        </div>
      )}

      {highlightId && (
        <InlineAlert
          variant="info"
          dense
          message="Abriste esta página desde una notificación: la persona indicada aparece primero."
          onDismiss={() => setHighlightId(null)}
          style={{ marginBottom: 12 }}
        />
      )}

      {canRegister && <EmployeeStatusHero token={token} gpsConsent={gpsConsent} />}

      {canRegister && (
        <Section
          title="Registrar jornada"
          subtitle="La jornada se registra en el teléfono y de esas checadas sale la nómina."
        />
      )}

      {viewMode === "register" && <WeeklyBar token={token} />}

      {(viewMode === "manage" || viewMode === "manage_register") && (
        <>
          <TeamAttendanceView token={token} dateFilter={dateFilter} visibilityHint={attCfg.visibilityHint} highlightId={highlightId} />
          <HybridAttendancePanel token={token} date={dateFilter} />
        </>
      )}

      {viewMode === "register" && token && (
        <HybridAttendancePanel token={token} date={new Date().toLocaleDateString("sv-SE")} />
      )}
    </>
  );
}
