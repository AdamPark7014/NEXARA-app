"use client";

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
import { buildApiUrl, parseResponseJson } from "@/lib/api-base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { attendanceMapUrl } from "@/lib/gps-map-links";
import { getAttendanceSectionConfig } from "@/lib/user-access";

type TabId = "equipo" | "comidas" | "trayectoria";

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

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
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
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function fmtMinutes(m?: number) {
  if (!m) return "0h";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h${min > 0 ? ` ${min}m` : ""}` : `${min}m`;
}

function latestByType(
  list: ApiAttendanceUser["attendances"],
  type: "entrada" | "salida",
): string | undefined {
  const filtered = (list ?? []).filter((a) => a.type === type);
  if (!filtered.length) return undefined;
  return filtered.reduce((max, a) => (a.timestamp > max.timestamp ? a : max)).timestamp;
}

export default function ErpAsistenciasPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const attCfg = useMemo(() => getAttendanceSectionConfig(user), [user]);
  const isManager = attCfg.canManageTeam;

  const [tab, setTab] = useState<TabId>("equipo");
  const [dateFilter, setDateFilter] = useState(todayIso());

  const [members, setMembers] = useState<ApiAttendanceUser[]>([]);
  const [lunches, setLunches] = useState<LunchBreak[]>([]);
  const [teamGps, setTeamGps] = useState<LocationRecord[]>([]);
  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);
  const [dayAttendances, setDayAttendances] = useState<
    { type: string; timestamp: string; entryLatitude?: unknown; entryLongitude?: unknown; exitLatitude?: unknown; exitLongitude?: unknown }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEquipo = useCallback(async () => {
    if (!token) return;
    if (!isManager) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const raw = await apiFetch<{ users?: ApiAttendanceUser[] } | ApiAttendanceUser[]>(
        `attendance/hierarchy/range?from=${dateFilter}&to=${dateFilter}&scope=subtree`,
        token,
      );
      setMembers(Array.isArray(raw) ? raw : (raw.users ?? []));
    } catch (e) {
      setMembers([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar el equipo");
    } finally {
      setLoading(false);
    }
  }, [token, dateFilter, isManager]);

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
      if (isManager) {
        const team = await apiFetch<LocationRecord[]>("gps/team", token);
        setTeamGps(Array.isArray(team) ? team : []);
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
  }, [token, dateFilter, isManager]);

  useEffect(() => {
    if (tab === "equipo") void loadEquipo();
    else if (tab === "comidas") void loadComidas();
    else void loadTrayectoria();
  }, [tab, loadEquipo, loadComidas, loadTrayectoria]);

  const mapped = useMemo(() => {
    return members.map((raw) => {
      const checkIn = latestByType(raw.attendances, "entrada");
      const checkOut = latestByType(raw.attendances, "salida");
      const dayInfo = raw.days?.find((d) => d.date === dateFilter);
      const estado = dayInfo?.isOpen
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
    });
  }, [members, dateFilter]);

  const presentes = mapped.filter((m) => m.estado === "PRESENTE").length;
  const completos = mapped.filter((m) => m.estado === "COMPLETO").length;
  const ausentes = mapped.filter((m) => m.estado === "AUSENTE").length;

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title="Asistencias"
        subtitle="Equipo del día, comidas y trayectoria GPS — alcance CEO o subtree del manager."
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
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {tab === "equipo" && (
        <>
          {!isManager ? (
            <EmptyState
              icon="👥"
              title="Vista de equipo"
              description="Disponible para managers (CEO / subtree). Tu checador personal sigue en RRHH → Asistencia."
              action={
                <a href="/erp/hr/attendance" style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13 }}>
                  Ir a mi asistencia →
                </a>
              }
            />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
                <KpiCard label="Total equipo" value={mapped.length} />
                <KpiCard label="En jornada" value={presentes} variant={presentes > 0 ? "accent" : "default"} />
                <KpiCard label="Completaron" value={completos} variant={completos > 0 ? "positive" : "default"} />
                <KpiCard label="Ausentes" value={ausentes} variant={ausentes > 0 ? "danger" : "positive"} />
              </div>
              <Section title="Equipo del día" subtitle={attCfg.visibilityHint ?? "scope=subtree"}>
                {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando asistencia del subtree." />}
                {!loading && mapped.length === 0 && (
                  <EmptyState icon="👥" title="Sin registros" description="Nadie en el alcance para esta fecha." />
                )}
                {!loading && mapped.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                    {mapped.map((m) => {
                      const entryPhoto = [...(m.attendances ?? [])].filter((a) => a.type === "entrada" && a.photoUrl).pop();
                      const exitPhoto = [...(m.attendances ?? [])].filter((a) => a.type === "salida" && a.photoUrl).pop();
                      return (
                        <article
                          key={m.userId}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            padding: "14px 16px",
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{m.nombre}</div>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>
                            {[m.roleName, m.department].filter(Boolean).join(" · ") || "—"}
                          </div>
                          <div style={{ display: "flex", gap: 14, fontSize: 12, marginBottom: 8 }}>
                            <span>↓ {fmtTime(m.checkIn)}</span>
                            <span>↑ {fmtTime(m.checkOut)}</span>
                            <span style={{ marginLeft: "auto", color: "var(--text-tertiary)" }}>{fmtMinutes(m.totalMinutes)}</span>
                          </div>
                          {(entryPhoto?.photoUrl || exitPhoto?.photoUrl) && (
                            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                              {entryPhoto?.photoUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={resolveAssetUrl(entryPhoto.photoUrl)} alt="Entrada" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8 }} />
                              )}
                              {exitPhoto?.photoUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={resolveAssetUrl(exitPhoto.photoUrl)} alt="Salida" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8 }} />
                              )}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 10, fontSize: 11, marginBottom: 6 }}>
                            {m.entryMapUrl && (
                              <a href={m.entryMapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                                Geo entrada
                              </a>
                            )}
                            {m.exitMapUrl && (
                              <a href={m.exitMapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)" }}>
                                Geo salida
                              </a>
                            )}
                          </div>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {lunches.map((b) => (
                <article
                  key={b.id}
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{b.user?.nombre ?? "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>
                    {b.user?.department?.nombre ?? ""}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    {fmtTime(b.checkinTime)}
                    {b.checkoutTime ? ` → ${fmtTime(b.checkoutTime)}` : " → en curso"}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 6, color: b.status === "IN_PROGRESS" ? "var(--warning)" : "var(--success)" }}>
                    {b.status === "IN_PROGRESS" ? "En comida" : "Completada"}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>
      )}

      {tab === "trayectoria" && (
        <>
          {isManager && (
            <Section title="GPS del equipo" subtitle="Unidades con jornada abierta (gps/team).">
              {loading && <EmptyState icon="⏳" title="Cargando…" description="Telemetría del equipo." />}
              {!loading && teamGps.length === 0 && (
                <EmptyState icon="📡" title="Sin ubicaciones" description="Nadie comparte GPS ahora." />
              )}
              {!loading && teamGps.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
                  {teamGps.map((item) => (
                    <article
                      key={item.id}
                      style={{
                        background: "var(--surface)",
                        border: `1.5px solid ${item.estaActivo ? "#3b82f6" : "var(--border)"}`,
                        borderRadius: 12,
                        padding: 14,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.usuario?.nombre ?? "—"}</div>
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
