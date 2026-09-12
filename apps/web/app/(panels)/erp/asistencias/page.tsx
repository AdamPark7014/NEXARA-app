"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import PanelTabs from "@/components/ui/PanelTabs";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import AttendanceGpsDayPanel from "@/components/AttendanceGpsDayPanel";
import GpsTrajectoryPreview from "@/components/GpsTrajectoryPreview";
import { useUser } from "@/components/UserContext";
import { buildApiUrl, getSocketBaseUrl, parseResponseJson } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { attendanceMapUrl } from "@/lib/gps-map-links";
import { getAttendanceSectionConfig } from "@/lib/user-access";
import { erpFetch } from "@/lib/erp-api";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

const AttendanceForm = dynamic(() => import("@/components/AttendanceForm"), { ssr: false });
type TabId = "equipo" | "comidas" | "trayectoria";
type Estado = "PRESENTE" | "COMPLETO" | "AUSENTE";
type FilterEstado = "TODOS" | Estado;

interface ApiAttendanceUser {
  userId: number;
  userName?: string;
  email?: string;
  department?: string;
  roleName?: string;
  totalMinutes?: number;
  days?: { date: string; totalMinutes?: number; isOpen?: boolean }[];
  attendances?: {
    type: string;
    timestamp: string;
    photoUrl?: string;
    entryLatitude?: number;
    entryLongitude?: number;
    exitLatitude?: number;
    exitLongitude?: number;
  }[];
}

interface LunchBreak {
  id: number;
  checkinTime: string;
  checkoutTime?: string | null;
  status: "IN_PROGRESS" | "COMPLETED";
  isCheckinLate?: boolean;
  isCheckoutLate?: boolean;
  user?: { id: number; nombre: string; department?: { nombre: string } | null };
}

interface LocationRecord {
  id: number;
  usuarioId: number;
  latitud?: number | string | null;
  longitud?: number | string | null;
  velocidadKmh?: number | null;
  estaActivo?: boolean;
  ultimaActualizacion?: string;
  usuario?: { nombre: string; role?: { nombre?: string } | null; department?: { nombre?: string } | null } | null;
}

interface TrajectoryPoint {
  id: number;
  latitud?: number | string | null;
  longitud?: number | string | null;
  velocidadKmh?: number | null;
  estaActivo?: boolean;
  ultimaActualizacion?: string;
}

const ESTADO_META: Record<Estado, { label: string; color: string }> = {
  PRESENTE: { label: "En jornada", color: "#16a34a" },
  COMPLETO: { label: "Completó", color: "#2563eb" },
  AUSENTE: { label: "Sin checada", color: "#94a3b8" },
};

const ESTADO_ORDER: Record<Estado, number> = { PRESENTE: 0, COMPLETO: 1, AUSENTE: 2 };

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return (await parseResponseJson<T>(res)) as T;
}

function todayIso() {
  return new Date().toLocaleDateString("sv-SE");
}

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/** Duración legible con segundos: 0:00:00 · 1:05:09 · 12:03:44 */
function fmtHms(totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs < 0) return "0:00:00";
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

function elapsedMs(
  checkIn?: string | null,
  checkOut?: string | null,
  nowMs: number = Date.now(),
): number {
  if (!checkIn) return 0;
  const start = new Date(checkIn).getTime();
  if (!Number.isFinite(start)) return 0;
  const end = checkOut ? new Date(checkOut).getTime() : nowMs;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function latestByType(
  list: ApiAttendanceUser["attendances"],
  type: "entrada" | "salida",
): string | undefined {
  const filtered = (list ?? []).filter((a) => a.type === type);
  if (!filtered.length) return undefined;
  return filtered.reduce((max, a) => (a.timestamp > max.timestamp ? a : max)).timestamp;
}

function FilterChip({
  active,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        border: active ? `1.5px solid ${color ?? "var(--primary)"}` : "1px solid var(--border)",
        background: active
          ? `color-mix(in srgb, ${color ?? "var(--primary)"} 12%, var(--surface))`
          : "var(--surface)",
        color: active ? color ?? "var(--primary)" : "var(--text-secondary)",
        fontSize: 12,
        fontWeight: active ? 700 : 550,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {color ? (
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: "50%", background: color }}
        />
      ) : null}
      {label}
      <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </button>
  );
}

export default function ErpAsistenciasPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const attCfg = useMemo(() => getAttendanceSectionConfig(user), [user]);
  const isManager = attCfg.canManageTeam;
  const canRegister = attCfg.canRegisterSelf;
  // GPS en vivo (gps/team): solo dirección / GPS_MANAGE. Encargados ven checadas.
  const canLiveGps = Boolean(user?.isSuperAdmin || hasPermission(user, PERMISSIONS.GPS_MANAGE));

  const [tab, setTab] = useState<TabId>("equipo");
  const [dateFilter, setDateFilter] = useState(todayIso());
  const [filterEstado, setFilterEstado] = useState<FilterEstado>("TODOS");

  const [members, setMembers] = useState<ApiAttendanceUser[]>([]);
  const [lunches, setLunches] = useState<LunchBreak[]>([]);
  const [teamGps, setTeamGps] = useState<LocationRecord[]>([]);
  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);
  const [dayAttendances, setDayAttendances] = useState<
    { type: string; timestamp: string; entryLatitude?: unknown; entryLongitude?: unknown; exitLatitude?: unknown; exitLongitude?: unknown }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // CEO / plataforma: company-wide (sin scope=subtree). Encargados: árbol managerId.
  const companyWideViewer = Boolean(
    user?.isSuperAdmin ||
      user?.roleKey === "ceo" ||
      (user?.email || "").toLowerCase() === "gerencia@nexara.com.mx" ||
      (user?.email || "").toLowerCase() === "developer@nexara.com.mx",
  );

  const loadEquipo = useCallback(
    async (quiet = false) => {
      if (!token) return;
      if (!isManager) {
        setMembers([]);
        setLoading(false);
        return;
      }
      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      try {
        const scopeQs = companyWideViewer ? "" : "&scope=subtree";
        const raw = await erpFetch<{ users?: ApiAttendanceUser[] } | ApiAttendanceUser[]>(
          `attendance/hierarchy/range?from=${dateFilter}&to=${dateFilter}${scopeQs}`,
          token,
        );
        setMembers(Array.isArray(raw) ? raw : (raw?.users ?? []));
      } catch (e) {
        setMembers([]);
        if (!quiet) setError(e instanceof Error ? e.message : "No se pudo cargar el equipo");
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [token, dateFilter, isManager, companyWideViewer],
  );

  const loadComidas = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        dateFilter === todayIso()
          ? "lunch-breaks/today"
          : `lunch-breaks?startDate=${dateFilter}&endDate=${dateFilter}`;
      const data = await apiFetch<LunchBreak[]>(endpoint, token);
      setLunches(Array.isArray(data) ? data : []);
    } catch (e) {
      setLunches([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar comidas");
    } finally {
      setLoading(false);
    }
  }, [token, dateFilter]);

  const loadTrayectoria = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (canLiveGps) {
        const team = await apiFetch<LocationRecord[]>("gps/team", token);
        setTeamGps(Array.isArray(team) ? team : []);
      } else {
        setTeamGps([]);
      }
      const [pts, hist] = await Promise.all([
        apiFetch<TrajectoryPoint[]>(`gps/trajectory?date=${dateFilter}`, token),
        apiFetch<typeof dayAttendances>(`attendance/history?date=${dateFilter}`, token).catch(() => []),
      ]);
      setTrajectory(Array.isArray(pts) ? pts : []);
      setDayAttendances(Array.isArray(hist) ? hist : []);
    } catch (e) {
      setTeamGps([]);
      setTrajectory([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar trayectoria");
    } finally {
      setLoading(false);
    }
  }, [token, dateFilter, canLiveGps]);

  useEffect(() => {
    if (tab === "equipo") void loadEquipo();
    else if (tab === "comidas") void loadComidas();
    else void loadTrayectoria();
  }, [tab, loadEquipo, loadComidas, loadTrayectoria]);

  // Live: CEO (manage-only) también debe ver checadas ajenas al instante.
  // Antes el poll/socket exigía canRegister → Christian nunca refrescaba.
  useEffect(() => {
    if (!isManager || !token || tab !== "equipo") return;
    const bump = () => void loadEquipo(true);
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    window.addEventListener("attendance:updated", bump);
    document.addEventListener("visibilitychange", onVis);

    const socket = createRealtimeSocket(getSocketBaseUrl(), {
      transports: ["polling", "websocket"],
    });
    socket.on("attendance:updated", bump);
    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "Attendance" || payload?.model === "AttendanceDay") bump();
    });

    const id = window.setInterval(bump, 15_000);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("attendance:updated", bump);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
      socket.disconnect();
    };
  }, [isManager, token, tab, loadEquipo]);

  const mapped = useMemo(() => {
    const meId = user?.id;
    return members
      .map((raw) => {
        const checkIn = latestByType(raw.attendances, "entrada");
        const checkOut = latestByType(raw.attendances, "salida");
        const dayInfo = raw.days?.find((d) => d.date === dateFilter || d.date?.startsWith(dateFilter));
        const estado: Estado = dayInfo?.isOpen
          ? "PRESENTE"
          : checkIn && checkOut
            ? "COMPLETO"
            : checkIn
              ? "PRESENTE"
              : "AUSENTE";
        return {
          ...raw,
          checkIn,
          checkOut,
          estado,
          entryMapUrl: attendanceMapUrl(raw.attendances, "entrada"),
          exitMapUrl: attendanceMapUrl(raw.attendances, "salida"),
          totalMinutes: dayInfo?.totalMinutes ?? raw.totalMinutes ?? 0,
          nombre: raw.userName?.trim() || raw.email || `Usuario #${raw.userId}`,
        };
      })
      .sort((a, b) => {
        if (meId != null) {
          if (a.userId === meId) return -1;
          if (b.userId === meId) return 1;
        }
        return ESTADO_ORDER[a.estado] - ESTADO_ORDER[b.estado] || a.nombre.localeCompare(b.nombre, "es");
      });
  }, [members, dateFilter, user?.id]);

  const presentes = mapped.filter((m) => m.estado === "PRESENTE").length;
  const completos = mapped.filter((m) => m.estado === "COMPLETO").length;
  const ausentes = mapped.filter((m) => m.estado === "AUSENTE").length;
  const hasOpenJornada = presentes > 0;

  useEffect(() => {
    if (!hasOpenJornada) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasOpenJornada]);

  const productividadMs = useMemo(
    () =>
      mapped.reduce(
        (sum, m) => sum + elapsedMs(m.checkIn, m.estado === "PRESENTE" ? null : m.checkOut, nowMs),
        0,
      ),
    [mapped, nowMs],
  );

  const filtered = useMemo(
    () => (filterEstado === "TODOS" ? mapped : mapped.filter((m) => m.estado === filterEstado)),
    [mapped, filterEstado],
  );

  const sectionTitle =
    filterEstado === "TODOS"
      ? `Equipo del día (${filtered.length})`
      : `${ESTADO_META[filterEstado].label} (${filtered.length})`;

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title="Asistencias"
        subtitle="Tu checada (foto + GPS) · equipo · comidas · trayectoria"
        actions={
          <input
            type="date"
            value={dateFilter}
            max={todayIso()}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{
              padding: "7px 10px",
              border: "1px solid var(--nx-panel-hairline)",
              borderRadius: 8,
              background: "var(--nx-panel-surface-overlay)",
              color: "var(--text-primary)",
              fontSize: 12.5,
              fontFamily: "inherit",
            }}
          />
        }
      />

      <PanelTabs
        ariaLabel="Asistencias unificadas"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "equipo", label: "Equipo del día" },
          { key: "comidas", label: "Comidas" },
          { key: "trayectoria", label: "Trayectoria" },
        ]}
      />

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {tab === "equipo" && (
        <>
          {canRegister ? (
            <Section
              dense
              tone="accent"
              title="Mi jornada"
              subtitle="Entrada o salida · foto + GPS"
            >
              <AttendanceForm compact />
            </Section>
          ) : null}

          {!isManager ? (
            canRegister ? null : (
              <EmptyState
                icon="👥"
                title="Vista de equipo"
                description="Disponible para managers (CEO / subtree)."
              />
            )
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 10,
                  marginBottom: 12,
                  marginTop: canRegister ? 16 : 0,
                }}
              >
                <KpiCard
                  label="Total equipo"
                  value={mapped.length}
                  onClick={() => setFilterEstado("TODOS")}
                />
                <KpiCard
                  label="En jornada"
                  value={presentes}
                  variant={presentes > 0 ? "accent" : "default"}
                  onClick={() => setFilterEstado("PRESENTE")}
                />
                <KpiCard
                  label="Completaron"
                  value={completos}
                  variant={completos > 0 ? "positive" : "default"}
                  onClick={() => setFilterEstado("COMPLETO")}
                />
                <KpiCard
                  label="Sin checada"
                  value={ausentes}
                  variant={ausentes > 0 ? "danger" : "positive"}
                  onClick={() => setFilterEstado("AUSENTE")}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12,
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "1px solid color-mix(in srgb, #16a34a 28%, var(--border))",
                  background: "color-mix(in srgb, #16a34a 8%, var(--surface))",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    Productividad del día
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    Suma de jornadas abiertas y cerradas · se actualiza cada segundo
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    color: "#16a34a",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {fmtHms(productividadMs)}
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                <FilterChip
                  active={filterEstado === "TODOS"}
                  label="Todos"
                  count={mapped.length}
                  onClick={() => setFilterEstado("TODOS")}
                />
                <FilterChip
                  active={filterEstado === "PRESENTE"}
                  label="En jornada"
                  count={presentes}
                  color={ESTADO_META.PRESENTE.color}
                  onClick={() => setFilterEstado("PRESENTE")}
                />
                <FilterChip
                  active={filterEstado === "COMPLETO"}
                  label="Completó"
                  count={completos}
                  color={ESTADO_META.COMPLETO.color}
                  onClick={() => setFilterEstado("COMPLETO")}
                />
                <FilterChip
                  active={filterEstado === "AUSENTE"}
                  label="Sin checada"
                  count={ausentes}
                  color={ESTADO_META.AUSENTE.color}
                  onClick={() => setFilterEstado("AUSENTE")}
                />
              </div>

              <Section title={sectionTitle} subtitle="Toca una tarjeta para abrir la pizarra de la persona.">
                {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando asistencia del subtree." />}
                {!loading && filtered.length === 0 && (
                  <EmptyState
                    icon="👥"
                    title={mapped.length === 0 ? "Sin registros" : "Nadie en este filtro"}
                    description={
                      mapped.length === 0
                        ? "Nadie en el alcance para esta fecha."
                        : "Prueba otro chip o el KPI de arriba."
                    }
                  />
                )}
                {!loading && filtered.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {filtered.map((m) => {
                      const meta = ESTADO_META[m.estado];
                      const entryPhoto = [...(m.attendances ?? [])]
                        .filter((a) => a.type === "entrada" && a.photoUrl)
                        .pop();
                      const exitPhoto = [...(m.attendances ?? [])]
                        .filter((a) => a.type === "salida" && a.photoUrl)
                        .pop();
                      return (
                        <article
                          key={m.userId}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderLeft: `3px solid ${meta.color}`,
                            borderRadius: 16,
                            padding: "14px 16px",
                            boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
                            opacity: m.estado === "AUSENTE" ? 0.88 : 1,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ position: "relative", flexShrink: 0 }}>
                              <div
                                aria-hidden
                                style={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: "50%",
                                  display: "grid",
                                  placeItems: "center",
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: "var(--primary)",
                                  background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
                                }}
                              >
                                {initials(m.nombre)}
                              </div>
                              <span
                                title={meta.label}
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  bottom: 0,
                                  width: 12,
                                  height: 12,
                                  borderRadius: "50%",
                                  background: meta.color,
                                  border: "2px solid var(--surface)",
                                  boxShadow: `0 0 0 2px color-mix(in srgb, ${meta.color} 25%, transparent)`,
                                }}
                              />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <Link
                                href={`/erp/pizarra/${m.userId}`}
                                style={{
                                  fontWeight: 750,
                                  fontSize: 14,
                                  color: "inherit",
                                  textDecoration: "none",
                                  display: "block",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {m.nombre}
                              </Link>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-tertiary)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {[m.roleName, m.department].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </div>
                            <span
                              style={{
                                flexShrink: 0,
                                fontSize: 11,
                                fontWeight: 700,
                                color: meta.color,
                                background: `color-mix(in srgb, ${meta.color} 12%, var(--surface))`,
                                padding: "4px 8px",
                                borderRadius: 999,
                              }}
                            >
                              {meta.label}
                            </span>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr auto",
                              gap: 10,
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: "var(--surface-2, color-mix(in srgb, var(--border) 35%, var(--surface)))",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 650,
                                  color: "var(--text-tertiary)",
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                }}
                              >
                                Entrada
                              </div>
                              <div
                                style={{
                                  fontSize: 16,
                                  fontWeight: 750,
                                  fontVariantNumeric: "tabular-nums",
                                  marginTop: 2,
                                }}
                              >
                                {fmtTime(m.checkIn)}
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 650,
                                  color: "var(--text-tertiary)",
                                  letterSpacing: "0.04em",
                                  textTransform: "uppercase",
                                }}
                              >
                                Salida
                              </div>
                              <div
                                style={{
                                  fontSize: 16,
                                  fontWeight: 750,
                                  fontVariantNumeric: "tabular-nums",
                                  marginTop: 2,
                                }}
                              >
                                {fmtTime(m.checkOut)}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", alignSelf: "center", minWidth: 88 }}>
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 650,
                                  color: "var(--text-tertiary)",
                                  textTransform: "uppercase",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  justifyContent: "flex-end",
                                }}
                              >
                                {m.estado === "PRESENTE" ? (
                                  <>
                                    <span
                                      aria-hidden
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        background: "#16a34a",
                                        boxShadow: "0 0 0 3px color-mix(in srgb, #16a34a 30%, transparent)",
                                      }}
                                    />
                                    En vivo
                                  </>
                                ) : m.estado === "COMPLETO" ? (
                                  "Jornada"
                                ) : (
                                  "Tiempo"
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: m.estado === "AUSENTE" ? 15 : 18,
                                  fontWeight: 800,
                                  fontVariantNumeric: "tabular-nums",
                                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                  marginTop: 2,
                                  color:
                                    m.estado === "PRESENTE"
                                      ? "#16a34a"
                                      : m.estado === "COMPLETO"
                                        ? "#2563eb"
                                        : "var(--text-tertiary)",
                                  letterSpacing: "-0.02em",
                                }}
                              >
                                {m.estado === "AUSENTE"
                                  ? "—"
                                  : fmtHms(
                                      elapsedMs(
                                        m.checkIn,
                                        m.estado === "PRESENTE" ? null : m.checkOut,
                                        nowMs,
                                      ),
                                    )}
                              </div>
                            </div>
                          </div>

                          {(entryPhoto?.photoUrl || exitPhoto?.photoUrl) && (
                            <div style={{ display: "flex", gap: 8 }}>
                              {entryPhoto?.photoUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={resolveAssetUrl(entryPhoto.photoUrl)}
                                  alt="Entrada"
                                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10 }}
                                />
                              )}
                              {exitPhoto?.photoUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={resolveAssetUrl(exitPhoto.photoUrl)}
                                  alt="Salida"
                                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10 }}
                                />
                              )}
                            </div>
                          )}

                          {(m.entryMapUrl || m.exitMapUrl) && (
                            <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                              {m.entryMapUrl && (
                                <a href={m.entryMapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontWeight: 600 }}>
                                  Mapa entrada
                                </a>
                              )}
                              {m.exitMapUrl && (
                                <a href={m.exitMapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontWeight: 600 }}>
                                  Mapa salida
                                </a>
                              )}
                            </div>
                          )}

                          {(m.estado === "PRESENTE" || m.estado === "COMPLETO") && (
                            <AttendanceGpsDayPanel
                              token={token}
                              userId={m.userId}
                              date={dateFilter}
                              attendances={m.attendances}
                              hasCheckIn={Boolean(m.checkIn)}
                            />
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </Section>
            </>
          )}
        </>
      )}

      {tab === "comidas" && (
        <Section
          title="Comidas del equipo"
          subtitle="Registros de lunch-breaks (misma API que RRHH)."
          actions={
            <Button size="sm" variant="ghost" onClick={() => void loadComidas()}>
              Actualizar
            </Button>
          }
        >
          {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando comidas." />}
          {!loading && lunches.length === 0 && (
            <EmptyState icon="🍽️" title="Sin registros" description="Nadie registró comida en esta fecha." />
          )}
          {!loading && lunches.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {lunches.map((b) => {
                const enCurso = b.status === "IN_PROGRESS";
                const color = enCurso ? "#d97706" : "#16a34a";
                return (
                  <article
                    key={b.id}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderLeft: `3px solid ${color}`,
                      borderRadius: 16,
                      padding: 14,
                      boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 750, fontSize: 13 }}>{b.user?.nombre ?? "—"}</div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {b.user?.department?.nombre ?? ""}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color,
                          background: `color-mix(in srgb, ${color} 12%, var(--surface))`,
                          padding: "4px 8px",
                          borderRadius: 999,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {enCurso ? "En comida" : "Completada"}
                      </span>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmtTime(b.checkinTime)}
                      <span style={{ opacity: 0.45, margin: "0 6px" }}>→</span>
                      {b.checkoutTime ? fmtTime(b.checkoutTime) : "en curso"}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {tab === "trayectoria" && (
        <>
          {canLiveGps && (
            <Section title="GPS del equipo" subtitle="Unidades con jornada abierta (gps/team).">
              {loading && <EmptyState icon="⏳" title="Cargando…" description="Telemetría del equipo." />}
              {!loading && teamGps.length === 0 && (
                <EmptyState icon="📡" title="Sin ubicaciones" description="Nadie comparte GPS ahora." />
              )}
              {!loading && teamGps.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  {teamGps.map((item) => (
                    <article
                      key={item.id}
                      style={{
                        background: "var(--surface)",
                        border: `1.5px solid ${item.estaActivo ? "#3b82f6" : "var(--border)"}`,
                        borderRadius: 16,
                        padding: 14,
                        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <div style={{ fontWeight: 750, fontSize: 13 }}>{item.usuario?.nombre ?? "—"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {item.usuario?.role?.nombre ?? item.usuario?.department?.nombre ?? ""}
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 11.5, marginTop: 8 }}>
                        {item.latitud != null && item.longitud != null
                          ? `${Number(item.latitud).toFixed(5)}, ${Number(item.longitud).toFixed(5)}`
                          : "Sin coordenadas"}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Section>
          )}
          <Section title={`Mi trayecto · ${trajectory.length} puntos`} subtitle="Entrada, GPS y salida del día.">
            {loading ? (
              <EmptyState icon="⏳" title="Cargando trayecto…" description="" />
            ) : (
              <GpsTrajectoryPreview trajectory={trajectory} attendances={dayAttendances} />
            )}
          </Section>
        </>
      )}
    </>
  );
}
