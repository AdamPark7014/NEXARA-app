"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import styles from "./page.module.css";

type Viatic = {
  id: number;
  usuarioId?: number | null;
  montoSolicitado?: number | null;
  estatusPago?: string | null;
  razonGasto?: string | null;
  createdAt?: string | null;
  usuario?: { id?: number; nombre: string } | null;
};

type Vehicle = {
  id: number;
  solicitanteId?: number | null;
  penalizacionMonto?: number | null;
  penalizacionNotas?: string | null;
  estatusAprobacion?: string | null;
  fechaInicio?: string | null;
  fechaSolicitud?: string | null;
  createdAt?: string | null;
  solicitante?: { id?: number; nombre: string } | null;
  vehiculo?: { nombre?: string | null; placas?: string | null } | null;
};

type AttendanceSummary = {
  totalMinutesAll?: number;
  totalUsers?: number;
  rangeEnd?: string;
  users?: {
    userId: number;
    userName?: string;
    totalMinutes?: number;
    attendances?: { type: string; timestamp: string }[];
  }[];
};

type Project = {
  id: number;
  title: string;
  clientName?: string | null;
  status?: string | null;
  budgetTotal?: string | number | null;
  budgetUsed?: string | number | null;
  createdAt?: string | null;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(
  /[\/.]+$/,
  ""
);
const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("es-MX") : "";

export default function ContabilidadDashboard() {
  const { user } = useUser();
  const [viatics, setViatics] = useState<Viatic[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekRange = useMemo(() => {
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return {
      start,
      end,
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }, []);

  useEffect(() => {
    if (user?.id && selectedUserId === null) {
      setSelectedUserId(user.id);
    }
  }, [user?.id, selectedUserId]);

  useEffect(() => {
    if (!user?.token) return;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = { Authorization: `Bearer ${user.token}` };
        const rangeParams = new URLSearchParams({
          from: weekRange.from,
          to: weekRange.to,
        });

        const canManageAttendance = hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE);
        const canViewAttendance = hasPermission(user, PERMISSIONS.ATTENDANCE_VIEW);

        const [viaticsRes, vehiclesRes, attendanceRes, projectsRes] = await Promise.all([
          fetch(buildApiUrl("viatics"), { headers }),
          fetch(buildApiUrl("vehicles"), { headers }),
          canManageAttendance
            ? fetch(buildApiUrl(`attendance/hierarchy/range?${rangeParams.toString()}`), { headers })
            : canViewAttendance
              ? fetch(buildApiUrl(`attendance/range?${rangeParams.toString()}`), { headers })
              : Promise.resolve(null),
          fetch(buildApiUrl("work-projects"), { headers }),
        ]);

        const viaticsData = viaticsRes.ok ? ((await viaticsRes.json()) as Viatic[]) : [];
        const vehiclesData = vehiclesRes.ok ? ((await vehiclesRes.json()) as Vehicle[]) : [];
        const attendancePayload = attendanceRes && attendanceRes.ok ? await attendanceRes.json() : null;
        const projectsData = projectsRes.ok ? ((await projectsRes.json()) as Project[]) : [];

        setViatics(Array.isArray(viaticsData) ? viaticsData : []);
        setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
        if (canManageAttendance && attendancePayload) {
          setAttendance(attendancePayload);
        } else if (attendancePayload && user?.id) {
          setAttendance({
            totalMinutesAll: attendancePayload.totalMinutes || 0,
            totalUsers: 1,
            rangeEnd: weekRange.to,
            users: [
              {
                userId: user.id,
                userName: user.nombre,
                totalMinutes: attendancePayload.totalMinutes || 0,
              },
            ],
          });
        } else {
          setAttendance(null);
        }
        setProjects(Array.isArray(projectsData) ? projectsData : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [user, weekRange.from, weekRange.to]);

  const activeUserId = selectedUserId ?? user?.id ?? null;

  const isWithinWeek = (value?: string | null) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date >= weekRange.start && date <= weekRange.end;
  };

  const filteredViatics = useMemo(() => {
    return viatics.filter((item) => {
      if (!isWithinWeek(item.createdAt)) return false;
      if (!activeUserId) return true;
      const userId = item.usuario?.id ?? item.usuarioId ?? null;
      return userId === activeUserId;
    });
  }, [viatics, activeUserId, weekRange.start, weekRange.end]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((item) => {
      const dateRef = item.fechaInicio || item.fechaSolicitud || item.createdAt || null;
      if (!isWithinWeek(dateRef)) return false;
      if (!activeUserId) return true;
      const userId = item.solicitante?.id ?? item.solicitanteId ?? null;
      return userId === activeUserId;
    });
  }, [vehicles, activeUserId, weekRange.start, weekRange.end]);

  const filteredProjects = useMemo(() => {
    return projects.filter((item) => isWithinWeek(item.createdAt));
  }, [projects, weekRange.start, weekRange.end]);

  const viaticTotals = useMemo(() => {
    const total = filteredViatics.reduce((sum, item) => sum + (item.montoSolicitado || 0), 0);
    const pending = filteredViatics.filter((item) => item.estatusPago === "Pendiente").length;
    const approved = filteredViatics.filter((item) => item.estatusPago === "Aprobado").length;
    return { total, pending, approved };
  }, [filteredViatics]);

  const penalties = useMemo(() => {
    const list = filteredVehicles.filter((item) => (item.penalizacionMonto || 0) > 0);
    const total = list.reduce((sum, item) => sum + (item.penalizacionMonto || 0), 0);
    return { list, total };
  }, [filteredVehicles]);

  const totalHours = useMemo(() => {
    const rangeEnd = attendance?.rangeEnd
      ? new Date(`${attendance.rangeEnd}T23:59:59`)
      : weekRange.end;

    const users = attendance?.users || [];
    const scopedUsers = users.length && activeUserId
      ? users.filter((item) => item.userId === activeUserId)
      : users;

    const reportedMinutes = scopedUsers.reduce(
      (sum, item) => sum + (item.totalMinutes || 0),
      0,
    );

    if (reportedMinutes > 0) {
      return Math.round((reportedMinutes / 60) * 10) / 10;
    }

    const fallbackMinutes = scopedUsers.reduce((sum, user) => {
      const events = (user.attendances || [])
        .map((item) => ({
          type: item.type,
          timestamp: new Date(item.timestamp),
        }))
        .filter((item) => !Number.isNaN(item.timestamp.getTime()))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      let total = 0;
      let openEntryTime: number | null = null;

      events.forEach((event) => {
        if (event.type === "entrada") {
          openEntryTime = event.timestamp.getTime();
        } else if (event.type === "salida" && openEntryTime !== null) {
          const minutes = Math.max(0, Math.floor((event.timestamp.getTime() - openEntryTime) / 60000));
          total += minutes;
          openEntryTime = null;
        }
      });

      if (openEntryTime !== null) {
        const minutes = Math.max(0, Math.floor((rangeEnd.getTime() - openEntryTime) / 60000));
        total += minutes;
      }

      return sum + total;
    }, 0);

    return Math.round((fallbackMinutes / 60) * 10) / 10;
  }, [attendance, activeUserId, weekRange.end]);

  const latestViatics = useMemo(() => {
    return [...filteredViatics]
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 3);
  }, [filteredViatics]);

  const latestProjects = useMemo(() => {
    return [...filteredProjects]
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 3);
  }, [filteredProjects]);

  const capitalMax = useMemo(() => {
    return Math.max(viaticTotals.total, penalties.total, totalHours);
  }, [viaticTotals.total, penalties.total, totalHours]);

  const toCapitalPercent = (value: number) => {
    if (!capitalMax) return 0;
    return Math.min(100, Math.round((value / capitalMax) * 100));
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Panel Contable</p>
          <h1 className={styles.title}>Dashboard financiero</h1>
          <p className={styles.subtitle}>
            Controla viaticos, multas, horas trabajadas y salud financiera en una sola vista.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryButton} href="/viaticos">
            Revisar viáticos
          </Link>
          <Link className={styles.secondaryButton} href="/capital">
            Ajustar capital
          </Link>
        </div>
      </header>

      <div className={styles.filters}>
        <div className={styles.filterMeta}>
          Semana actual: {formatDate(weekRange.from)} - {formatDate(weekRange.to)}
        </div>
        {hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE) && attendance?.users?.length ? (
          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Usuario</span>
            <select
              className="input"
              value={activeUserId ?? ""}
              onChange={(event) => setSelectedUserId(Number(event.target.value))}
            >
              {attendance.users.map((item) => (
                <option key={item.userId} value={item.userId}>
                  {item.userName || `Usuario ${item.userId}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error && <p>{error}</p>}

      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Viáticos activos</p>
          <h2 className={styles.metricValue}>{formatCurrency(viaticTotals.total)}</h2>
          <p className={styles.metricMeta}>
            {viaticTotals.pending} pendientes · {viaticTotals.approved} aprobados
          </p>
        </div>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Multas registradas</p>
          <h2 className={styles.metricValue}>{formatCurrency(penalties.total)}</h2>
          <p className={styles.metricMeta}>{penalties.list.length} cargos recientes</p>
        </div>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Horas trabajadas</p>
          <h2 className={styles.metricValue}>{totalHours} h</h2>
          <p className={styles.metricMeta}>
            {attendance?.users?.length ? `${attendance.users.length} usuarios` : "Sin permisos"}
          </p>
        </div>
        <div className={styles.metricCard}>
          <p className={styles.metricLabel}>Proyectos activos</p>
          <h2 className={styles.metricValue}>{filteredProjects.length}</h2>
          <p className={styles.metricMeta}>En seguimiento contable</p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.panelCard}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Movimientos recientes</h3>
              <p className={styles.cardSubtitle}>
                Lo último en viáticos y multas para reaccionar rápido.
              </p>
            </div>
            <span className={styles.badge}>{latestViatics.length + penalties.list.length} items</span>
          </div>
          <div className={styles.activityList}>
            {latestViatics.map((item) => (
              <div key={`viatic-${item.id}`} className={styles.activityItem}>
                <div>
                  <span className={styles.activityLabel}>Viatico</span>
                  <p className={styles.activityTitle}>{item.razonGasto || "Sin descripción"}</p>
                  <p className={styles.activityMeta}>
                    {item.usuario?.nombre || "Sin usuario"} · {formatCurrency(item.montoSolicitado || 0)}
                  </p>
                </div>
                <p className={styles.activityMeta}>{formatDate(item.createdAt)}</p>
              </div>
            ))}
            {penalties.list.slice(0, 2).map((item) => (
              <div key={`penalty-${item.id}`} className={styles.activityItem}>
                <div>
                  <span className={styles.activityLabel}>Multa</span>
                  <p className={styles.activityTitle}>
                    {item.vehiculo?.nombre || "Vehiculo"} {item.vehiculo?.placas ? `(${item.vehiculo?.placas})` : ""}
                  </p>
                  <p className={styles.activityMeta}>
                    {item.solicitante?.nombre || "Sin asignar"} · {formatCurrency(item.penalizacionMonto || 0)}
                  </p>
                </div>
                <p className={styles.activityMeta}>{formatDate(item.fechaInicio)}</p>
              </div>
            ))}
            {!loading && latestViatics.length === 0 && penalties.list.length === 0 && (
              <p className={styles.activityMeta}>Sin movimientos recientes.</p>
            )}
          </div>
        </div>

        <div className={styles.panelCard}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Mapa de capital</h3>
              <p className={styles.cardSubtitle}>Distribucion rapida del gasto operativo.</p>
            </div>
          </div>
          <div className={styles.miniChart}>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Viáticos</span>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${toCapitalPercent(viaticTotals.total)}%` }}
                />
              </div>
            </div>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Multas</span>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${toCapitalPercent(penalties.total)}%` }}
                />
              </div>
            </div>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Horas</span>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${toCapitalPercent(totalHours)}%` }}
                />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <h4 className={styles.cardTitle}>Proyectos prioritarios</h4>
            <div className={styles.activityList}>
              {latestProjects.map((project) => (
                <div key={project.id} className={styles.activityItem}>
                  <div>
                    <span className={styles.activityLabel}>Proyecto</span>
                    <p className={styles.activityTitle}>{project.title}</p>
                    <p className={styles.activityMeta}>
                      {project.clientName || "Sin cliente"} · {project.status || "Sin estatus"}
                    </p>
                  </div>
                  <p className={styles.activityMeta}>{formatDate(project.createdAt)}</p>
                </div>
              ))}
              {!loading && latestProjects.length === 0 && (
                <p className={styles.activityMeta}>No hay proyectos registrados.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


