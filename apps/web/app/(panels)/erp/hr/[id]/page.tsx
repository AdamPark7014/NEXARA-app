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
import { resolveAssetUrl } from "@/lib/evidence-display";

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

interface AttendancePunch {
  id: number;
  type: string;
  timestamp: string;
  photoUrl?: string | null;
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
  const [punches, setPunches] = useState<AttendancePunch[]>([]);
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
        apiFetch(`attendance/for-user?userId=${id}&limit=20`, token),
      ]);
      if (empData.status === "fulfilled" && empData.value) {
        setEmployee(empData.value);
      } else if (empData.status === "rejected") {
        throw empData.reason;
      }
      if (attData.status === "fulfilled") {
        const arr = Array.isArray(attData.value) ? attData.value : [];
        setPunches(arr as AttendancePunch[]);
      } else {
        setPunches([]);
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

      {punches.length > 0 && (() => {
        const entradas = punches.filter((p) => p.type === "entrada").length;
        const salidas = punches.filter((p) => p.type === "salida").length;
        const conFoto = punches.filter((p) => Boolean(p.photoUrl)).length;
        const total = punches.length;
        return (
          <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Checadas recientes ({total})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {([
                { label: "Entradas", count: entradas, color: "var(--success)" },
                { label: "Salidas", count: salidas, color: "var(--primary)" },
                { label: "Con foto", count: conFoto, color: "var(--accent, var(--primary))" },
              ] as { label: string; count: number; color: string }[]).filter((r) => r.count > 0).map((r) => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: "100px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(r.count / total) * 100}%`, background: r.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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

      <Section
        eyebrow="Asistencia"
        title="Fotos de entrada y salida"
        subtitle="Últimas checadas del checador (con foto cuando exista)"
        actions={<Link href="/erp/hr/attendance" style={{ fontSize: 12, color: "var(--primary)" }}>Ver gestión →</Link>}
      >
        {punches.length === 0 ? (
          <EmptyState
            icon="📷"
            title="Sin checadas recientes"
            description="Cuando registre entrada o salida con la app, aquí verás la hora y la foto."
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {punches.map((p) => {
              const src = p.photoUrl ? resolveAssetUrl(p.photoUrl) : "";
              const label = p.type === "salida" ? "Salida" : p.type === "entrada" ? "Entrada" : p.type;
              return (
                <article
                  key={p.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "var(--surface)",
                  }}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={`Foto ${label}`}
                      style={{ width: "100%", height: 140, objectFit: "cover", display: "block", background: "var(--surface-2)" }}
                    />
                  ) : (
                    <div
                      style={{
                        height: 140,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--surface-2)",
                        color: "var(--text-tertiary)",
                        fontSize: 12,
                      }}
                    >
                      Sin foto
                    </div>
                  )}
                  <div style={{ padding: "8px 10px" }}>
                    <Tag variant={p.type === "entrada" ? "positive" : "accent"}>{label}</Tag>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
                      {new Date(p.timestamp).toLocaleString("es-MX", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
