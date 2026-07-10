"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";

interface EmployeeDetail {
  id: number;
  nombre: string;
  email: string;
  employeeNumber?: string | null;
  avatarUrl?: string | null;
  puesto?: string | null;
  tipoContrato?: string | null;
  estadoRRHH?: string | null;
  isActive?: boolean;
  fechaIngreso?: string | null;
  createdAt?: string | null;
  department?: { id: number; nombre: string } | null;
  role?: { id: number; nombre: string } | null;
}

interface AttendanceRow {
  id: number;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  totalMinutes?: number;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  return res.json();
}

const TIPO_CONTRATO = ["Planta", "Honorarios", "Contratista"] as const;
const ESTADOS_RRHH = ["Activo", "Vacaciones", "Incidencia", "Baja"] as const;

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useUser();
  const token = user?.token ?? "";

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ puesto: "", tipoContrato: "Planta" as string, estadoRRHH: "Activo" as string, fechaIngreso: "" });

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [empData, attData] = await Promise.allSettled([
        apiFetch(`users/${id}`, token),
        apiFetch(`attendance?userId=${id}&limit=10`, token),
      ]);
      if (empData.status === "fulfilled" && empData.value) {
        setEmployee(empData.value);
      } else if (empData.status === "rejected") {
        throw empData.reason;
      }
      if (attData.status === "fulfilled") {
        const arr = Array.isArray(attData.value) ? attData.value : (attData.value?.data ?? []);
        setAttendance(arr.slice(0, 10));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el empleado");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { void load(); }, [load]);

  const openEdit = () => {
    if (!employee) return;
    setForm({
      puesto: employee.puesto ?? "",
      tipoContrato: employee.tipoContrato ?? "Planta",
      estadoRRHH: employee.estadoRRHH ?? "Activo",
      fechaIngreso: employee.fechaIngreso ? employee.fechaIngreso.slice(0, 10) : "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!token || !id) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`users/${id}/hr`, token, {
        method: "PATCH",
        body: JSON.stringify({ puesto: form.puesto || undefined, tipoContrato: form.tipoContrato, estadoRRHH: form.estadoRRHH, fechaIngreso: form.fechaIngreso || undefined }),
      });
      if (updated) setEmployee((prev) => prev ? { ...prev, ...updated } : prev);
      else setEmployee((prev) => prev ? { ...prev, ...form } : prev);
      setEditing(false);
      toast.success("Cambios guardados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally { setSaving(false); }
  };

  const contractColor = (t?: string | null) =>
    t === "Planta" ? "positive" : t === "Honorarios" ? "accent" : "warning";
  const stateColor = (s?: string | null) =>
    s === "Activo" ? "positive" : s === "Vacaciones" ? "accent" : s === "Incidencia" ? "warning" : "danger";

  const yearsAtCompany = useMemo(() => {
    const d = employee?.fechaIngreso ?? employee?.createdAt;
    if (!d) return null;
    const years = (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return years >= 1 ? `${Math.floor(years)} año${Math.floor(years) !== 1 ? "s" : ""}` : `${Math.round(years * 12)} meses`;
  }, [employee]);

  if (loading) return <EmptyState icon="⏳" title="Cargando perfil…" description="Consultando datos del empleado." />;
  if (error) return <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />;
  if (!employee) return null;

  const employeeId = employee.employeeNumber ?? `EMP-${String(employee.id).padStart(3, "0")}`;

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title={employee.nombre}
        subtitle={[employee.puesto, employee.department?.nombre].filter(Boolean).join(" · ") || "Colaborador"}
        meta={
          <>
            <Tag variant={stateColor(employee.estadoRRHH)} dot>{employee.estadoRRHH ?? "Activo"}</Tag>
            <Tag variant={contractColor(employee.tipoContrato)}>{employee.tipoContrato ?? "Planta"}</Tag>
            <code style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "2px 6px", borderRadius: 5, background: "var(--surface-2)" }}>{employeeId}</code>
          </>
        }
        actions={
          <>
            <Link href="/erp/hr" style={{ textDecoration: "none" }}>
              <Button variant="ghost">← Volver a RH</Button>
            </Link>
            <Button variant="primary" iconLeft="✎" onClick={openEdit}>Editar</Button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Estado" value={employee.isActive !== false ? "Activo" : "Inactivo"} variant={employee.isActive !== false ? "positive" : "warning"} icon="👤" />
        <KpiCard label="Área" value={employee.department?.nombre ?? "—"} icon="🏢" />
        <KpiCard label="Rol" value={employee.role?.nombre ?? "—"} icon="🎭" />
        <KpiCard label="Antigüedad" value={yearsAtCompany ?? "—"} icon="📅" />
      </div>

      {editing ? (
        <Section title="Editar ficha de empleado">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Puesto / cargo</label>
              <input value={form.puesto} onChange={(e) => setForm((f) => ({ ...f, puesto: e.target.value }))} placeholder="Ej: Ingeniero de Campo" style={inp} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tipo de contrato</label>
              <select value={form.tipoContrato} onChange={(e) => setForm((f) => ({ ...f, tipoContrato: e.target.value }))} style={inp}>
                {TIPO_CONTRATO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado RRHH</label>
              <select value={form.estadoRRHH} onChange={(e) => setForm((f) => ({ ...f, estadoRRHH: e.target.value }))} style={inp}>
                {ESTADOS_RRHH.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha de ingreso</label>
              <input type="date" value={form.fechaIngreso} onChange={(e) => setForm((f) => ({ ...f, fechaIngreso: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveEdit()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </Section>
      ) : (
        <Section title="Información del colaborador" actions={<Button size="sm" variant="ghost" iconLeft="✎" onClick={openEdit}>Editar</Button>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "Email", value: employee.email },
              { label: "Puesto", value: employee.puesto },
              { label: "Departamento", value: employee.department?.nombre },
              { label: "Rol / acceso", value: employee.role?.nombre },
              { label: "Tipo de contrato", value: employee.tipoContrato },
              { label: "Estado", value: employee.estadoRRHH ?? "Activo" },
              { label: "Fecha de ingreso", value: employee.fechaIngreso ? new Date(employee.fechaIngreso).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) : null },
              { label: "ID empleado", value: employeeId },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>{value ?? "—"}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {attendance.length > 0 && (
        <Section
          eyebrow="Asistencia"
          title="Registros recientes"
          subtitle="Últimas 10 entradas de checador"
          actions={<Link href="/erp/hr/attendance" style={{ fontSize: 12, color: "var(--primary)" }}>Ver todo →</Link>}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {attendance.map((a) => {
              const mins = a.totalMinutes ?? 0;
              const hrs = Math.floor(mins / 60);
              const rem = mins % 60;
              return (
                <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {new Date(a.date).toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" })}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {a.checkIn ? new Date(a.checkIn).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    {" – "}
                    {a.checkOut ? new Date(a.checkOut).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </span>
                  {mins > 0 && (
                    <Tag variant={mins >= 480 ? "positive" : mins >= 360 ? "warning" : "danger"}>
                      {hrs > 0 ? `${hrs}h` : ""}{rem > 0 ? ` ${rem}m` : ""}
                    </Tag>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}
