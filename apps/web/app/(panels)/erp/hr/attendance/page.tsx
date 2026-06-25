"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getAttendanceViewMode } from "@/lib/user-access";

const AttendanceForm = dynamic(() => import("@/components/AttendanceForm"), { ssr: false });

interface AttendanceRecord {
  id: number;
  user?: { nombre?: string };
  checkIn?: string;
  checkOut?: string;
  fecha?: string;
  horasTrabajadas?: number;
  estado?: string;
  location?: string;
}

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function AttendanceManagementTable({ token, dateFilter }: { token: string; dateFilter: string }) {
  const [items, setItems] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(`attendance/hierarchy/range?from=${dateFilter}&to=${dateFilter}`, token);
      const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : data?.data ?? [];
      const rows: AttendanceRecord[] = users.map((u: {
        user?: { id?: number; nombre?: string };
        userId?: number;
        nombre?: string;
        attendances?: { type: string; timestamp: string }[];
        totalMinutes?: number;
      }, idx: number) => {
        const checkIn = u.attendances?.find((a) => a.type === "CHECK_IN")?.timestamp;
        const checkOut = u.attendances?.find((a) => a.type === "CHECK_OUT")?.timestamp;
        return {
          id: u.user?.id ?? u.userId ?? idx,
          user: { nombre: u.user?.nombre ?? u.nombre },
          checkIn,
          checkOut,
          horasTrabajadas: u.totalMinutes ? u.totalMinutes / 60 : undefined,
          estado: checkIn && checkOut ? "COMPLETO" : checkIn ? "PRESENTE" : "AUSENTE",
        };
      });
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, dateFilter]);

  useEffect(() => { load(); }, [load]);

  const presentes = items.filter((a) => a.checkIn && !a.checkOut).length;
  const completados = items.filter((a) => a.checkIn && a.checkOut).length;
  const ausentes = items.filter((a) => !a.checkIn).length;

  const columns: Column<AttendanceRecord>[] = [
    { key: "user", label: "Empleado", render: (a) => <span style={{ fontWeight: 600, fontSize: 13 }}>{a.user?.nombre ?? "—"}</span>, width: 160 },
    { key: "checkIn", label: "Entrada", accessor: (a) => a.checkIn ? new Date(a.checkIn).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—", width: 100 },
    { key: "checkOut", label: "Salida", accessor: (a) => a.checkOut ? new Date(a.checkOut).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—", width: 100 },
    { key: "horasTrabajadas", label: "Horas", accessor: (a) => a.horasTrabajadas ? `${a.horasTrabajadas.toFixed(1)}h` : "—", width: 80 },
    { key: "location", label: "Ubicación", accessor: (a) => a.location ?? "—" },
    { key: "estado", label: "Estado", render: (a) => (
      <Tag variant={a.estado === "COMPLETO" ? "neutral" : a.estado === "PRESENTE" ? "accent" : "danger"}>
        {a.checkIn && a.checkOut ? "Completo" : a.checkIn ? "Presente" : "Ausente"}
      </Tag>
    ), width: 100 },
  ];

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Presentes" value={presentes} />
        <KpiCard label="Jornada completa" value={completados} />
        <KpiCard label="Ausentes" value={ausentes} />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} registros — ${new Date(dateFilter + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={(a) => a.id} emptyTitle="Sin registros" emptyDescription="No hay check-ins registrados para esta fecha." />
        )}
      </Section>
    </>
  );
}

export default function AttendancePage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const viewMode = useMemo(() => getAttendanceViewMode(user), [user]);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));

  const headerCopy = useMemo(() => {
    if (viewMode === "manage") {
      return {
        title: "Asistencia · Gestión",
        subtitle: "Supervisión de jornadas del equipo. El CEO y dirección revisan sin registrar su propia entrada aquí.",
      };
    }
    if (viewMode === "manage_register") {
      return {
        title: "Asistencia · Gestión",
        subtitle: "Registra tu jornada y supervisa al equipo desde la misma sección.",
      };
    }
    return {
      title: "Mi asistencia",
      subtitle: "Registra tu entrada y salida del día. Para ingenieros de campo, geolocalizado al sitio de la OT.",
    };
  }, [viewMode]);

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title={headerCopy.title}
        subtitle={headerCopy.subtitle}
        actions={
          viewMode !== "register" ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}
              />
            </div>
          ) : undefined
        }
      />

      {(viewMode === "register" || viewMode === "manage_register") && (
        <div style={{ marginBottom: 24 }}>
          <Section title="Registro personal">
            <AttendanceForm />
          </Section>
        </div>
      )}

      {(viewMode === "manage" || viewMode === "manage_register") && token && (
        <AttendanceManagementTable token={token} dateFilter={dateFilter} />
      )}
    </>
  );
}
