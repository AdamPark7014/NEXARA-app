"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip from "@/components/ui/MetricStrip";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import { FormField, FormGrid } from "@/components/ui/FormField";
import { Tag } from "@/components/ui/DataTable";
import { SkeletonList, Skeleton } from "@/components/PageState";
import { Avatar } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
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

const HTTP_FALLBACK: Record<number, string> = {
  401: "Tu sesión expiró. Vuelve a iniciar sesión.",
  403: "No tienes permiso para ver esta ficha.",
  404: "No encontramos a esta persona. Puede que se haya eliminado.",
};

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const readable = text.trim().startsWith("<") ? "" : text;
    throw new Error(readable || HTTP_FALLBACK[res.status] || "El servidor no respondió. Intenta de nuevo en unos minutos.");
  }
  if (res.status === 204) return null;
  return res.json();
}

const TIPO_CONTRATO = ["Planta", "Honorarios", "Contratista"] as const;
const ESTADOS_RRHH = ["Activo", "Vacaciones", "Incidencia", "Baja"] as const;

const inp: React.CSSProperties = {
  width: "100%", minHeight: 40, padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--foreground)", boxSizing: "border-box",
};

const PUNCH_LABEL: Record<string, string> = { entrada: "Entrada", salida: "Salida" };

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user } = useUser();
  const token = user?.token ?? "";

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [punches, setPunches] = useState<AttendancePunch[]>([]);
  const [punchesError, setPunchesError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [form, setForm] = useState({ puesto: "", tipoContrato: "Planta" as string, estadoRRHH: "Activo" as string, fechaIngreso: "" });

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
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
        setPunchesError(false);
      } else {
        setPunchesError(true);
      }
      setError(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar la ficha de esta persona."));
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
    setSaveErr(null);
    setFormDirty(false);
    setEditing(true);
  };

  const patchForm = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setFormDirty(true);
  };

  const saveEdit = async () => {
    if (!token || !id) return;
    setSaving(true);
    setSaveErr(null);
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
      setSaveErr(formatApiError(e, "No se pudieron guardar los cambios."));
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
    if (years >= 1) return `${Math.floor(years)} año${Math.floor(years) !== 1 ? "s" : ""}`;
    const months = Math.max(0, Math.round(years * 12));
    return months < 1 ? "Menos de 1 mes" : `${months} ${months === 1 ? "mes" : "meses"}`;
  }, [employee]);

  const punchStats = useMemo(() => {
    let entradas = 0, salidas = 0, conFoto = 0;
    for (const p of punches) {
      if (p.type === "entrada") entradas++;
      else if (p.type === "salida") salidas++;
      if (p.photoUrl) conFoto++;
    }
    return { entradas, salidas, conFoto, total: punches.length };
  }, [punches]);

  if (loading && !employee) {
    return (
      <div aria-busy="true" aria-label="Cargando ficha">
        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "8px 0 24px" }}>
          <Skeleton width={56} height={56} radius={999} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton width="40%" height={22} />
            <Skeleton width="25%" height={14} />
          </div>
        </div>
        <SkeletonList rows={4} />
      </div>
    );
  }
  if (!employee) {
    return (
      <EmptyState
        icon="⚠️"
        title="No se pudo cargar la ficha"
        description={error ?? "No encontramos a esta persona."}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>
            <Button size="sm" variant="ghost" onClick={() => router.push("/erp/hr")}>Volver a Plantilla</Button>
          </div>
        }
      />
    );
  }

  const employeeId = employee.employeeNumber ?? `EMP-${String(employee.id).padStart(3, "0")}`;
  const infoRows: { label: string; value?: string | null }[] = [
    { label: "Correo", value: employee.email },
    { label: "Puesto", value: employee.puesto },
    { label: "Departamento", value: employee.department?.nombre },
    { label: "Rol", value: employee.role?.nombre },
    { label: "Tipo de contrato", value: employee.tipoContrato },
    { label: "Situación laboral", value: employee.estadoRRHH ?? "Activo" },
    { label: "Fecha de ingreso", value: employee.fechaIngreso ? new Date(employee.fechaIngreso).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) : null },
    { label: "No. empleado", value: employeeId },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos · Ficha"
        title={employee.nombre}
        subtitle={[employee.puesto, employee.department?.nombre].filter(Boolean).join(" · ") || "Colaborador"}
        meta={
          <>
            <Avatar url={employee.avatarUrl} name={employee.nombre} size={28} />
            <Tag variant={stateColor(employee.estadoRRHH)} dot>{employee.estadoRRHH ?? "Activo"}</Tag>
            <Tag variant={contractColor(employee.tipoContrato)}>{employee.tipoContrato ?? "Planta"}</Tag>
            <Tag variant="default" size="sm">{employeeId}</Tag>
          </>
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => router.push("/erp/hr")}>← Plantilla</Button>
            <Button variant="primary" onClick={openEdit}>Editar ficha</Button>
          </>
        }
      />

      {error && (
        <InlineAlert
          variant="warning"
          title="No se pudo actualizar"
          message={`${error} Mostramos la última información cargada.`}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 12 }}
        />
      )}

      <div style={{ marginBottom: 20 }}>
        <MetricStrip
          ariaLabel="Resumen de la ficha"
          metrics={[
            { label: "Cuenta", value: employee.isActive !== false ? "Activa" : "Inactiva", tone: employee.isActive !== false ? "success" : "warning" },
            { label: "Área", value: employee.department?.nombre ?? "Sin área" },
            { label: "Rol", value: employee.role?.nombre ?? "Sin rol" },
            { label: "Antigüedad", value: yearsAtCompany ?? "Sin fecha" },
          ]}
        />
      </div>

      <Section title="Datos laborales" actions={<Button size="sm" variant="ghost" onClick={openEdit}>Editar</Button>}>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 16, margin: 0 }}>
          {infoRows.map(({ label, value }) => (
            <div key={label}>
              <dt style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</dt>
              <dd style={{ margin: 0, fontSize: 14, color: value ? "var(--text-primary)" : "var(--text-tertiary)", overflowWrap: "anywhere" }}>{value || "Sin registrar"}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        eyebrow="Asistencia"
        title="Últimas checadas"
        subtitle={punchStats.total > 0
          ? `${punchStats.entradas} ${punchStats.entradas === 1 ? "entrada" : "entradas"} · ${punchStats.salidas} ${punchStats.salidas === 1 ? "salida" : "salidas"} · ${punchStats.conFoto} con foto`
          : "Entradas y salidas registradas desde la app, con foto cuando exista."}
        actions={<Link href="/erp/hr/attendance" style={{ fontSize: 13, color: "var(--primary)", padding: "8px 0", display: "inline-block" }}>Ver asistencia del equipo →</Link>}
      >
        {punchesError && (
          <InlineAlert
            variant="warning"
            dense
            message={punches.length ? "No se pudieron actualizar las checadas. Mostramos las últimas cargadas." : "No se pudieron cargar las checadas."}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
            style={{ marginBottom: 12 }}
          />
        )}
        {punches.length === 0 ? (
          !punchesError && (
            <EmptyState
              icon="📷"
              title="Sin checadas recientes"
              description="Cuando registre entrada o salida con la app, aquí verás la hora y la foto."
            />
          )
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))", gap: 12 }}>
            {punches.map((p) => {
              const src = p.photoUrl ? resolveAssetUrl(p.photoUrl) : "";
              const label = PUNCH_LABEL[p.type] ?? "Checada";
              const when = new Date(p.timestamp).toLocaleString("es-MX", {
                weekday: "short",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <li
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
                      alt={`Foto de ${label.toLowerCase()}, ${when}`}
                      loading="lazy"
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
                        fontSize: 13,
                      }}
                    >
                      Sin foto
                    </div>
                  )}
                  <div style={{ padding: "8px 10px" }}>
                    <Tag size="sm" variant={p.type === "entrada" ? "positive" : "accent"}>{label}</Tag>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
                      {when}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        dirty={formDirty && !saving}
        maxWidth={520}
        title="Editar ficha"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveEdit()} loading={saving} disabled={!formDirty}>Guardar cambios</Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Puesto" fullWidth optional>
            <input value={form.puesto} onChange={(e) => patchForm({ puesto: e.target.value })} placeholder="Ej. Ingeniero de campo" style={inp} />
          </FormField>
          <FormField label="Tipo de contrato">
            <select value={form.tipoContrato} onChange={(e) => patchForm({ tipoContrato: e.target.value })} style={inp}>
              {TIPO_CONTRATO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Situación laboral">
            <select value={form.estadoRRHH} onChange={(e) => patchForm({ estadoRRHH: e.target.value })} style={inp}>
              {ESTADOS_RRHH.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </FormField>
          <FormField label="Fecha de ingreso" optional>
            <input type="date" value={form.fechaIngreso} onChange={(e) => patchForm({ fechaIngreso: e.target.value })} style={inp} />
          </FormField>
        </FormGrid>
        {saveErr && <InlineAlert message={saveErr} style={{ marginTop: 14 }} />}
      </Modal>
    </>
  );
}
