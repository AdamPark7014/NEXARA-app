"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl, parseResponseJson } from "@/lib/api-base";
import { getAttendanceSectionConfig } from "@/lib/user-access";
import { attendanceMapUrl } from "@/lib/gps-map-links";
import AttendanceGpsDayPanel from "@/components/AttendanceGpsDayPanel";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";

const AttendanceForm = dynamic(() => import("@/components/AttendanceForm"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttendanceDay {
  isOpen?: boolean;
  lastEntryAt?: string | null;
  totalMinutes?: number;
}

interface TeamMember {
  userId: number;
  nombre: string;
  email?: string;
  department?: string;
  roleName?: string;
  attendances?: { type: string; timestamp: string; entryLatitude?: number; entryLongitude?: number; exitLatitude?: number; exitLongitude?: number }[];
  totalMinutes?: number;
  checkIn?: string;
  checkOut?: string;
  entryMapUrl?: string | null;
  exitMapUrl?: string | null;
  estado?: "PRESENTE" | "COMPLETO" | "AUSENTE";
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
  attendances?: { type: string; timestamp: string; entryLatitude?: number; entryLongitude?: number; exitLatitude?: number; exitLongitude?: number }[];
}

interface WeekDay {
  date?: string;
  totalMinutes?: number;
  isOpen?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T = unknown>(path: string, token: string): Promise<T | null> {
  const res = await fetch(buildApiUrl(path), {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return parseResponseJson<T>(res);
}

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function fmtMinutes(m?: number): string {
  if (!m) return "0h";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h${min > 0 ? ` ${min}m` : ""}` : `${min}m`;
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
): "PRESENTE" | "COMPLETO" | "AUSENTE" {
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
    nombre: raw.userName?.trim() || raw.email || `Usuario #${raw.userId}`,
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

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600).toString().padStart(2, "0");
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

function getWeekDates(): string[] {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - dow + i);
    return d.toLocaleDateString("sv-SE");
  });
}

// ─── Employee Status Hero ─────────────────────────────────────────────────────

function EmployeeStatusHero({ token, gpsConsent }: { token: string; gpsConsent: boolean }) {
  const [day, setDay] = useState<AttendanceDay | null>(null);
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
      setLoadErr(e instanceof Error ? e.message : "No se pudo cargar tu jornada");
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

  const labelStyle: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 600, color: "var(--text-tertiary)",
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5,
  };

  return (
    <>
      {loadErr && (
        <div role="alert" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 10, fontSize: 12.5, color: "var(--danger)" }}>
          {loadErr}
        </div>
      )}
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
      padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center",
      gap: 32, flexWrap: "wrap",
    }}>
      <div>
        <div style={labelStyle}>Estado hoy</div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "5px 14px", borderRadius: 999, fontSize: 11.5, fontWeight: 700,
          background: isOpen ? "#dcfce7" : "var(--surface-2)",
          color: isOpen ? "#15803d" : "var(--text-secondary)",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: isOpen ? "#22c55e" : "#94a3b8", display: "inline-block" }} />
          {isOpen ? "EN JORNADA" : day ? "JORNADA CERRADA" : "SIN REGISTRO HOY"}
        </div>
      </div>

      <div>
        <div style={labelStyle}>Tiempo transcurrido</div>
        <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 800, letterSpacing: "0.05em", color: isOpen ? "var(--foreground)" : "var(--text-tertiary)" }}>
          {isOpen ? fmtElapsed(elapsed) : day?.totalMinutes ? fmtMinutes(day.totalMinutes) : "—"}
        </div>
        {!isOpen && day?.totalMinutes ? (
          <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 1 }}>Total del dia</div>
        ) : null}
      </div>

      <div>
        <div style={labelStyle}>Entrada</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtTime(day?.lastEntryAt)}</div>
      </div>

      <div style={{ marginLeft: "auto" }}>
        <div style={labelStyle}>GPS</div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "5px 14px", borderRadius: 999, fontSize: 11.5, fontWeight: 700,
          background: gpsConsent && isOpen ? "#eff6ff" : "var(--surface-2)",
          color: gpsConsent && isOpen ? "#1d4ed8" : "var(--text-secondary)",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: gpsConsent && isOpen ? "#3b82f6" : "#94a3b8", display: "inline-block" }} />
          {gpsConsent && isOpen ? "Activo · Compartiendo" : "Inactivo"}
        </div>
      </div>
    </div>
    </>
  );
}

// ─── Weekly Bar ───────────────────────────────────────────────────────────────

function WeeklyBar({ token }: { token: string }) {
  const [days, setDays] = useState<WeekDay[]>([]);
  const [totalMin, setTotalMin] = useState(0);
  const [weekErr, setWeekErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const week = getWeekDates();
    apiFetch<{ totalMinutes?: number; days?: WeekDay[] }>(
      `attendance/range?from=${week[0]}&to=${week[6]}`, token
    ).then(d => { setTotalMin(d?.totalMinutes ?? 0); setDays(d?.days ?? []); setWeekErr(null); })
      .catch((e) => setWeekErr(e instanceof Error ? e.message : "No se pudo cargar la semana"));
  }, [token]);

  const weekDates = getWeekDates();
  const today = new Date().toLocaleDateString("sv-SE");
  const maxMin = Math.max(...days.map(d => d.totalMinutes ?? 0), 1);

  return (
    <Section title={`Esta semana · ${fmtMinutes(totalMin)} registradas`}>
      {weekErr && (
        <div role="alert" style={{ padding: "8px 12px", marginBottom: 10, background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
          {weekErr}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", minHeight: 100, paddingBottom: 28, position: "relative" }}>
        {weekDates.map((dateStr, i) => {
          const found = days.find(d => d.date === dateStr);
          const min = found?.totalMinutes ?? 0;
          const pct = Math.min(96, (min / maxMin) * 96);
          const isToday = dateStr === today;
          const isFuture = dateStr > today;
          return (
            <div key={dateStr} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: 80 }}>
              <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{
                  width: "100%", height: min > 0 ? `${pct}%` : 4, minHeight: 4, borderRadius: 4,
                  background: isFuture ? "var(--surface-2)" : isToday ? "var(--primary, #3b82f6)" : min > 0 ? "#93c5fd" : "var(--surface-2)",
                  transition: "height 0.4s ease",
                }} />
              </div>
              <div style={{ fontSize: 10, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--primary, #3b82f6)" : "var(--text-tertiary)", marginTop: 4 }}>
                {DAY_LABELS[i]}
              </div>
              {min > 0 && <div style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>{fmtMinutes(min)}</div>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Team Card ────────────────────────────────────────────────────────────────

function TeamCard({ member, token, dateFilter }: { member: TeamMember; token: string; dateFilter: string }) {
  const name = member.nombre;
  const role = member.roleName ?? "";
  const dept = member.department ?? "";
  const estado = member.estado ?? "AUSENTE";
  const ci = member.checkIn;
  const co = member.checkOut;

  const colors: Record<string, { border: string; dot: string; text: string; bg: string }> = {
    PRESENTE: { border: "#3b82f6", dot: "#3b82f6", text: "#1d4ed8", bg: "#eff6ff" },
    COMPLETO: { border: "#22c55e", dot: "#16a34a", text: "#15803d", bg: "#f0fdf4" },
    AUSENTE:  { border: "var(--border)", dot: "#94a3b8", text: "var(--text-secondary)", bg: "var(--surface-2)" },
  };
  const c = colors[estado];

  return (
    <div style={{ background: "var(--surface)", border: `1.5px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
          {(role || dept) && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
              {[role, dept].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: c.bg, color: c.text }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
          {estado === "PRESENTE" ? "En jornada" : estado === "COMPLETO" ? "Completo" : "Ausente"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)" }}>
        <div><span style={{ marginRight: 3 }}>↓</span><span style={{ fontWeight: 600, color: "var(--foreground)" }}>{fmtTime(ci)}</span></div>
        <div><span style={{ marginRight: 3 }}>↑</span><span style={{ fontWeight: 600, color: "var(--foreground)" }}>{fmtTime(co)}</span></div>
        {(member.totalMinutes ?? 0) > 0 && (
          <div style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>{fmtMinutes(member.totalMinutes)}</div>
        )}
      </div>
      {(member.estado === "PRESENTE" || member.estado === "COMPLETO") && (
        <AttendanceGpsDayPanel
          token={token}
          userId={member.userId}
          date={dateFilter}
          attendances={member.attendances}
          hasCheckIn={Boolean(ci)}
        />
      )}
    </div>
  );
}

// ─── Team View ────────────────────────────────────────────────────────────────

function TeamAttendanceView({ token, dateFilter, visibilityHint }: { token: string; dateFilter: string; visibilityHint?: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamErr, setTeamErr] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [searchMember, setSearchMember] = useState("");
  const [filterEstado, setFilterEstado] = useState<"" | "PRESENTE" | "COMPLETO" | "AUSENTE">("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const raw = await apiFetch<HierarchyRangeResponse | ApiAttendanceUser[]>(
        `attendance/hierarchy/range?from=${dateFilter}&to=${dateFilter}`, token
      );
      const arr: ApiAttendanceUser[] = !raw ? [] : Array.isArray(raw) ? raw : (raw.users ?? []);
      const ORDER = { PRESENTE: 0, COMPLETO: 1, AUSENTE: 2 } as const;
      const mapped = arr.map((u) => mapApiUser(u, dateFilter));
      mapped.sort((a, b) => (ORDER[a.estado ?? "AUSENTE"] ?? 2) - (ORDER[b.estado ?? "AUSENTE"] ?? 2));
      setMembers(mapped);
      setTeamErr(null);
    } catch (e) {
      setMembers([]);
      setTeamErr(e instanceof Error ? e.message : "No se pudo cargar el equipo");
    }
    finally { setLoading(false); }
  }, [token, dateFilter]);

  useEffect(() => { void load(); }, [load]);

  const presentes = members.filter(m => m.estado === "PRESENTE").length;
  const completos = members.filter(m => m.estado === "COMPLETO").length;
  const ausentes  = members.filter(m => m.estado === "AUSENTE").length;

  const visibleMembers = useMemo(() => {
    let result = members;
    if (searchMember.trim()) {
      const q = searchMember.toLowerCase();
      result = result.filter((m) => m.nombre.toLowerCase().includes(q) || (m.department ?? "").toLowerCase().includes(q));
    }
    if (filterEstado) result = result.filter((m) => m.estado === filterEstado);
    return result;
  }, [members, searchMember, filterEstado]);

  const cols: Column<TeamMember>[] = [
    {
      key: "nombre", label: "Empleado",
      render: m => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{m.nombre}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {[m.roleName, m.department].filter(Boolean).join(" · ") || m.email || "—"}
          </div>
        </div>
      ),
    },
    { key: "checkIn",      label: "Entrada",  accessor: m => fmtTime(m.checkIn),        width: 90 },
    { key: "checkOut",     label: "Salida",   accessor: m => fmtTime(m.checkOut),       width: 90 },
    {
      key: "ubicacion", label: "Ubicación", width: 120,
      render: m => (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
          {m.entryMapUrl ? (
            <a href={m.entryMapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
              ↓ Entrada
            </a>
          ) : null}
          {m.exitMapUrl ? (
            <a href={m.exitMapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
              ↑ Salida
            </a>
          ) : null}
          {!m.entryMapUrl && !m.exitMapUrl ? "—" : null}
        </div>
      ),
    },
    { key: "totalMinutes", label: "Horas",    accessor: m => fmtMinutes(m.totalMinutes), width: 80 },
    {
      key: "estado", label: "Estado", width: 120,
      render: m => (
        <Tag variant={m.estado === "COMPLETO" ? "positive" : m.estado === "PRESENTE" ? "accent" : "danger"}>
          {m.estado === "COMPLETO" ? "Completo" : m.estado === "PRESENTE" ? "En jornada" : "Ausente"}
        </Tag>
      ),
    },
  ];

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 600,
    background: active ? "var(--primary, #3b82f6)" : "var(--surface-2)",
    color: active ? "#fff" : "var(--text-secondary)",
  });

  return (
    <Section title="Equipo del día" subtitle={visibilityHint}>
      {teamErr && (
        <div role="alert" style={{ padding: "8px 12px", marginBottom: 12, background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
          {teamErr}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Total equipo" value={members.length} icon="👥" />
        <KpiCard label="En jornada"   value={presentes} variant={presentes > 0 ? "accent" : "default"} icon="🟢" hint="Jornada abierta" />
        <KpiCard label="Completaron"  value={completos} variant={completos > 0 ? "positive" : "default"} icon="✅" hint="Jornada cerrada" />
        <KpiCard label="Ausentes"     value={ausentes} variant={ausentes > 0 ? "danger" : "positive"} icon="⚠️" hint={ausentes > 0 ? "Sin registro hoy" : "Todos presentes"} />
      </div>

      <FilterToolbar
        search={{ value: searchMember, onChange: setSearchMember, placeholder: "Buscar empleado…" }}
        selects={[{
          label: "Estado",
          value: filterEstado,
          onChange: (v) => setFilterEstado(v as "" | "PRESENTE" | "COMPLETO" | "AUSENTE"),
          options: [
            { value: "PRESENTE", label: "En jornada" },
            { value: "COMPLETO", label: "Completaron" },
            { value: "AUSENTE", label: "Ausentes" },
          ],
          allowAll: true,
        }]}
        onClear={() => { setSearchMember(""); setFilterEstado(""); }}
        resultCount={loading ? null : visibleMembers.length}
        rightActions={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {members.length > 0 && (
              <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleMembers, [
                { key: "nombre", label: "Nombre" },
                { key: "department", label: "Departamento" },
                { key: "roleName", label: "Rol" },
                { key: "estado", label: "Estado" },
                { key: "checkIn", label: "Entrada", format: (v) => v ? String(v).slice(11, 16) : "—" },
                { key: "checkOut", label: "Salida", format: (v) => v ? String(v).slice(11, 16) : "—" },
              ], `asistencia-${dateFilter}`)}>CSV</Button>
            )}
            <button style={btnStyle(view === "grid")}  onClick={() => setView("grid")}>Tarjetas</button>
            <button style={btnStyle(view === "table")} onClick={() => setView("table")}>Tabla</button>
          </div>
        }
      />

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Cargando asistencia…</div>
      ) : members.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Sin registros para esta fecha.</div>
      ) : view === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {visibleMembers.map((m) => <TeamCard key={m.userId} member={m} token={token} dateFilter={dateFilter} />)}
        </div>
      ) : (
        <DataTable<TeamMember>
          columns={cols}
          rows={visibleMembers}
          rowKey={(m) => m.userId}
          density="compact"
          emptyTitle="Sin registros"
          emptyDescription="No hay asistencia registrada para esta fecha."
        />
      )}
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const attCfg = useMemo(() => getAttendanceSectionConfig(user), [user]);
  const viewMode = attCfg.viewMode;
  const [dateFilter, setDateFilter] = useState(new Date().toLocaleDateString("sv-SE"));
  const [gpsConsent, setGpsConsent] = useState(false);

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
    fetch(buildApiUrl("gps/me"), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setGpsConsent(Boolean(d?.consent)))
      .catch(() => {});
  }, [token]);

  const isManager = attCfg.canManageTeam;
  const canRegister = attCfg.canRegisterSelf;

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title={attCfg.title}
        subtitle={attCfg.subtitle}
        actions={isManager ? (
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            max={new Date().toLocaleDateString("sv-SE")}
            style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
          />
        ) : undefined}
      />

      {canRegister && <EmployeeStatusHero token={token} gpsConsent={gpsConsent} />}

      {canRegister && (
        <Section title="Registrar jornada" subtitle="Captura foto y ubicacion quedan registradas automaticamente.">
          <AttendanceForm />
        </Section>
      )}

      {viewMode === "register" && <WeeklyBar token={token} />}

      {(viewMode === "manage" || viewMode === "manage_register") && (
        <TeamAttendanceView token={token} dateFilter={dateFilter} visibilityHint={attCfg.visibilityHint} />
      )}
    </>
  );
}
