"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

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

export default function AttendancePage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [items, setItems] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch(`attendance/day?date=${dateFilter}`, token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token, dateFilter]);

  useEffect(() => { load(); }, [load]);

  const presentes = items.filter(a => a.checkIn && !a.checkOut).length;
  const completados = items.filter(a => a.checkIn && a.checkOut).length;
  const ausentes = items.filter(a => !a.checkIn).length;

  const columns: Column<AttendanceRecord>[] = [
    { key: "user", label: "Empleado", render: a => <span style={{ fontWeight: 600, fontSize: 13 }}>{a.user?.nombre ?? "—"}</span>, width: 160 },
    { key: "checkIn", label: "Entrada", accessor: a => a.checkIn ? new Date(a.checkIn).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—", width: 100 },
    { key: "checkOut", label: "Salida", accessor: a => a.checkOut ? new Date(a.checkOut).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—", width: 100 },
    { key: "horasTrabajadas", label: "Horas", accessor: a => a.horasTrabajadas ? `${a.horasTrabajadas.toFixed(1)}h` : "—", width: 80 },
    { key: "location", label: "Ubicación", accessor: a => a.location ?? "—" },
    { key: "estado", label: "Estado", render: a => (
      <Tag variant={a.estado === "COMPLETO" ? "neutral" : a.estado === "PRESENTE" ? "accent" : "danger"}>
        {a.checkIn && a.checkOut ? "Completo" : a.checkIn ? "Presente" : "Ausente"}
      </Tag>
    ), width: 100 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title="Asistencia"
        subtitle="Check-in y check-out diario del equipo. Para ingenieros de campo, geolocalizado al sitio de la OT."
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }} />
            <Button variant="ghost" onClick={load}>Actualizar</Button>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Presentes" value={presentes} />
        <KpiCard label="Jornada completa" value={completados} />
        <KpiCard label="Ausentes" value={ausentes} />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} registros — ${new Date(dateFilter + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={a => a.id} emptyTitle="Sin registros" emptyDescription="No hay check-ins registrados para esta fecha." />
        )}
      </Section>
    </>
  );
}
