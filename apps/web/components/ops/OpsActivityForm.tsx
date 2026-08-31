"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Section from "@/components/ui/Section";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getActivitiesSectionConfig } from "@/lib/section-views";
import {
  buildActivityPayload,
  EMPTY_ACTIVITY_FORM,
  formFromActivityRecord,
  PRIORIDAD_LIST,
  type ActivityFormState,
} from "@/lib/ops-activity-form";
import {
  assignTicketRequest,
  createActivity,
  fetchNextAnNumber,
  getActivity,
  getTicketRequest,
  listAssignableUsers,
  listApprovedTicketRequests,
  listOperationalProjects,
  updateActivity,
  type ClientTicketRequestRow,
  type OperationalProjectRow,
} from "@/lib/ops-activities-api";

type Props = {
  activityId?: number;
  requestId?: number;
  onSuccess?: (id: number) => void;
  onCancel?: () => void;
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

export default function OpsActivityForm({ activityId, requestId, onSuccess, onCancel }: Props) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const actCfg = getActivitiesSectionConfig(user);
  const canAssign =
    hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && actCfg.canCreate && actCfg.canAssign;
  const isEdit = activityId != null && activityId > 0;

  const [form, setForm] = useState<ActivityFormState>({ ...EMPTY_ACTIVITY_FORM });
  const [projects, setProjects] = useState<OperationalProjectRow[]>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listAssignableUsers>>>([]);
  const [ticketRequests, setTicketRequests] = useState<ClientTicketRequestRow[]>([]);
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(requestId ?? null);
  const [nextAn, setNextAn] = useState("");
  const [nextAnLoaded, setNextAnLoaded] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showOtroModal, setShowOtroModal] = useState(false);
  const [otroInput, setOtroInput] = useState("");

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "ACTIVE"),
    [projects],
  );

  const loadMeta = useCallback(async () => {
    if (!token) return;
    try {
      const [projs, assignable, next, tickets] = await Promise.all([
        listOperationalProjects(token),
        canAssign ? listAssignableUsers(token) : Promise.resolve([]),
        canAssign && !isEdit ? fetchNextAnNumber(token) : Promise.resolve({ next: "" }),
        hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)
          ? listApprovedTicketRequests(token)
          : Promise.resolve([]),
      ]);
      setProjects(Array.isArray(projs) ? projs : []);
      setUsers(Array.isArray(assignable) ? assignable : []);
      setNextAn(typeof next?.next === "string" ? next.next : "");
      setNextAnLoaded(true);
      setTicketRequests(Array.isArray(tickets) ? tickets : []);
    } catch {
      setNextAnLoaded(true);
    }
  }, [token, canAssign, isEdit, user]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!token || !isEdit || !activityId) return;
    setLoading(true);
    setError(null);
    getActivity(token, activityId)
      .then((row) => setForm(formFromActivityRecord(row as unknown as Record<string, unknown>)))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la OT"))
      .finally(() => setLoading(false));
  }, [token, isEdit, activityId]);

  const prefillFromRequest = useCallback((request: ClientTicketRequestRow) => {
    const isPreventiveInventory = request.requestType === "PREVENTIVE_INVENTORY";
    const clientId = request.client?.id ? String(request.client.id) : "";
    const matching = activeProjects.filter(
      (p) => !clientId || String(p.client.id) === clientId,
    );
    setPendingRequestId(request.id);
    setForm((prev) => ({
      ...prev,
      titulo: request.branchName
        ? `${isPreventiveInventory ? "Mantenimiento e inventario" : "Ticket"} ${request.branchName}`
        : isPreventiveInventory
          ? "Mantenimiento e inventario cliente"
          : "Ticket cliente",
      indicaciones: request.description || prev.indicaciones,
      prioridad: request.urgency === "HIGH" ? "Alta" : request.urgency === "LOW" ? "Baja" : "Media",
      clientId,
      projectId: matching.length === 1 ? String(matching[0].id) : "",
      branchName: request.branchName || prev.branchName,
      branchNumber: request.branchNumber || prev.branchNumber,
      branchCity: request.city || prev.branchCity,
      branchState: request.state || prev.branchState,
      branchAddress: request.address || prev.branchAddress,
      ticketType: isPreventiveInventory ? "PREVENTIVO" : "CORRECTIVO",
      workType: isPreventiveInventory ? "PREVENTIVE_INVENTORY" : "ISSUE",
    }));
    setSuccess("Solicitud precargada");
  }, [activeProjects]);

  useEffect(() => {
    if (!requestId || !token) return;
    const fromList = ticketRequests.find((r) => r.id === requestId);
    if (fromList) {
      prefillFromRequest(fromList);
      return;
    }
    let cancelled = false;
    void getTicketRequest(token, requestId)
      .then((req) => {
        if (!cancelled && req) prefillFromRequest(req);
      })
      .catch(() => {
        /* list APPROVED may not include NEW; GET by id is the handoff path */
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, ticketRequests, token, prefillFromRequest]);

  const handleSubmit = async () => {
    if (!token || !user) return;
    setError(null);
    setSuccess(null);

    if (!form.titulo.trim() || !form.responsableId) {
      setError("Título y responsable son obligatorios");
      return;
    }
    if (!form.projectId) {
      setError("Selecciona un proyecto");
      return;
    }

    const project = activeProjects.find((p) => String(p.id) === form.projectId);
    const payload = buildActivityPayload(form, project, {
      userId: user.id,
      isEdit,
    });

    setSaving(true);
    try {
      if (isEdit && activityId) {
        await updateActivity(token, activityId, payload);
        setSuccess("OT actualizada");
        onSuccess?.(activityId);
      } else {
        const created = await createActivity(token, payload);
        const newId = Number(created?.id);
        if (pendingRequestId && newId > 0) {
          try {
            await assignTicketRequest(token, pendingRequestId, newId);
            setPendingRequestId(null);
          } catch {
            setError("OT creada pero no se pudo vincular al ticket de soporte");
            return;
          }
        }
        setSuccess("OT asignada");
        setForm({ ...EMPTY_ACTIVITY_FORM });
        const next = await fetchNextAnNumber(token);
        setNextAn(typeof next?.next === "string" ? next.next : "");
        if (newId > 0) onSuccess?.(newId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!canAssign) {
    return (
      <Section title="Sin permisos" subtitle="No tienes permiso para crear o asignar OT.">
        <Link href="/ops/activities">← Volver a bandeja</Link>
      </Section>
    );
  }

  if (loading) {
    return (
      <Section title="Cargando OT…" subtitle="Preparando formulario.">
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Un momento…</p>
      </Section>
    );
  }

  return (
    <Section
      title={isEdit ? `Editar OT #${activityId}` : "Nueva orden de trabajo"}
      subtitle="Proyecto, responsable, fecha y tiempos estimados."
      actions={
        !isEdit ? (
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            AN sugerido: {nextAn || (nextAnLoaded ? "No disponible" : "Calculando…")}
          </span>
        ) : null
      }
    >
      {showOtroModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "var(--card-bg, #fff)",
              borderRadius: 12,
              padding: "24px 28px",
              minWidth: 320,
              maxWidth: 420,
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>Tipo personalizado</h3>
            <input
              className="input"
              autoFocus
              placeholder="Ej: Auditoría de red…"
              value={otroInput}
              onChange={(e) => setOtroInput(e.target.value)}
              style={{ width: "100%", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="secondary" size="sm" onClick={() => setShowOtroModal(false)}>Cancelar</Button>
              <Button
                size="sm"
                disabled={!otroInput.trim()}
                onClick={() => {
                  setForm({ ...form, ticketTypeCustom: otroInput.trim() });
                  setShowOtroModal(false);
                }}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div style={gridStyle}>
        {!isEdit && (
          <input
            className="input"
            placeholder="AN (automático)"
            value={nextAn || (nextAnLoaded ? "No disponible" : "Calculando…")}
            disabled
          />
        )}
        <input
          className="input"
          placeholder="Título de la actividad"
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        />
        <select
          className="input"
          value={form.projectId}
          onChange={(e) => {
            const projectId = e.target.value;
            const project = activeProjects.find((p) => String(p.id) === projectId);
            setForm({
              ...form,
              projectId,
              clientId: project ? String(project.client.id) : "",
            });
          }}
        >
          <option value="">Seleccionar proyecto…</option>
          {activeProjects
            .filter((p) => !form.clientId || String(p.client.id) === form.clientId)
            .map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
        </select>
        <input
          className="input"
          placeholder="Cliente (automático)"
          value={activeProjects.find((p) => String(p.id) === form.projectId)?.client.name ?? ""}
          disabled
        />
        <select
          className="input"
          value={form.ticketType}
          onChange={(e) => {
            const t = e.target.value;
            if (t === "OTRO") {
              setForm({ ...form, ticketType: "OTRO", workType: "ISSUE" });
              setOtroInput(form.ticketTypeCustom || "");
              setShowOtroModal(true);
            } else {
              setForm({
                ...form,
                ticketType: t,
                ticketTypeCustom: "",
                workType: t === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
              });
            }
          }}
        >
          <option value="PREVENTIVO">Tipo: Preventivo</option>
          <option value="CORRECTIVO">Tipo: Correctivo</option>
          <option value="EMERGENCIA">Tipo: Emergencia</option>
          <option value="INSTALACION">Tipo: Instalación</option>
          <option value="INVENTARIO">Tipo: Inventario</option>
          <option value="OTRO">Tipo: Otro</option>
        </select>
        <select
          className="input"
          value={form.responsableId}
          onChange={(e) => setForm({ ...form, responsableId: e.target.value })}
        >
          <option value="">Responsable</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}{u.email ? ` · ${u.email}` : ""}{u.role?.nombre ? ` (${u.role.nombre})` : ""}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={form.prioridad}
          onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
        >
          {PRIORIDAD_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Fecha</label>
          <input
            className="input"
            type="date"
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          />
        </div>
        <input
          className="input"
          type="number"
          min={0}
          placeholder="Tiempo esperado (min)"
          value={form.tiempoEstimadoMin}
          onChange={(e) => setForm({ ...form, tiempoEstimadoMin: e.target.value })}
        />
        <input
          className="input"
          type="number"
          min={0}
          placeholder="Tiempo máximo (min)"
          value={form.tiempoMaximoMin}
          onChange={(e) => setForm({ ...form, tiempoMaximoMin: e.target.value })}
        />
        {pendingRequestId && (
          <>
            <input className="input" placeholder="Sucursal" value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} />
            <input className="input" placeholder="Número sucursal" value={form.branchNumber} onChange={(e) => setForm({ ...form, branchNumber: e.target.value })} />
            <input className="input" placeholder="Ciudad" value={form.branchCity} onChange={(e) => setForm({ ...form, branchCity: e.target.value })} />
            <input className="input" placeholder="Estado" value={form.branchState} onChange={(e) => setForm({ ...form, branchState: e.target.value })} />
            <input className="input" placeholder="Dirección sucursal" value={form.branchAddress} onChange={(e) => setForm({ ...form, branchAddress: e.target.value })} />
          </>
        )}
        <input
          className="input"
          placeholder="Indicaciones para el responsable"
          value={form.indicaciones}
          onChange={(e) => setForm({ ...form, indicaciones: e.target.value })}
          style={{ gridColumn: "1 / -1" }}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 16 }}>
        {onCancel && (
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancelar</Button>
        )}
        <Button size="sm" onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Asignar OT"}
        </Button>
        {error && <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>}
        {success && <span style={{ color: "var(--success)", fontSize: 13 }}>{success}</span>}
      </div>
    </Section>
  );
}
