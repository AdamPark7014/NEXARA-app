"use client";

import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Section from "@/components/ui/Section";
import { useUser } from "@/components/UserContext";
import EvidenciaCamposEditor from "@/components/ops/EvidenciaCamposEditor";
import {
  definirCamposEvidencia,
  hayErrores,
  validarCampos,
  type CampoBorrador,
} from "@/lib/evidencia-campos";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getActivitiesSectionConfig } from "@/lib/section-views";
import {
  activitySubmitLabel,
  buildActivityPayload,
  EMPTY_ACTIVITY_FORM,
  formFromActivityRecord,
  type ActivityFormState,
  type ActivityProjectMode,
} from "@/lib/ops-activity-form";
import PrioritySemaforo from "@/components/ops/PrioritySemaforo";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import {
  apiErrorMessage,
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
import { listSalesClients } from "@/lib/sales-api";
import {
  clientSectorsForActivityKind,
  type ClientSector,
} from "@/lib/client-sectors";
import { TAREA_TIPOS, type ActivityKind } from "@/lib/activity-kinds";
import { createMyActivity } from "@/lib/my-activities-api";

type Props = {
  activityId?: number;
  requestId?: number;
  /** Prefill service-client filter when creating from client detail */
  initialClientId?: number;
  /** Prefill encargado (pizarra → asignar) */
  initialResponsableId?: number;
  /** Fija el tipo: tarea = sin proyecto, proyecto = con proyecto */
  forcedProjectMode?: ActivityProjectMode;
  /** Oculta el selector Con/Sin proyecto (cuando forcedProjectMode) */
  hideProjectModePicker?: boolean;
  /** Copy Core: sin jerga OT */
  tone?: "ops" | "core";
  /** Oculta el select de responsable (ya fijado desde pizarra) */
  hideResponsableSelect?: boolean;
  /** Prefija ticketType al montar (obra → INSTALACION, etc.) */
  forcedTicketType?: string;
  forcedTicketTypeCustom?: string;
  /** Exige día + hora (servicio / obra). */
  requireSchedule?: boolean;
  /** Tipo Core (tarea|proyecto|obra|servicio|comercial). */
  coreKind?: string;
  /** Encargo: ejecucion | despacho */
  assignmentCharge?: string;
  /** Fotos de evidencia 2–8 (default 4). */
  evidencePhotoRequired?: number;
  /** Auto-asignación de encargado: crea vía POST /me/activities (responsable = uno mismo). */
  selfAssign?: boolean;
  onSuccess?: (id: number) => void;
  onCancel?: () => void;
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

export default function OpsActivityForm({
  activityId,
  requestId,
  initialClientId,
  initialResponsableId,
  forcedProjectMode,
  hideProjectModePicker,
  tone = "ops",
  hideResponsableSelect = false,
  forcedTicketType,
  forcedTicketTypeCustom,
  requireSchedule = false,
  coreKind,
  assignmentCharge,
  evidencePhotoRequired = 4,
  selfAssign = false,
  onSuccess,
  onCancel,
}: Props) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const actCfg = getActivitiesSectionConfig(user);
  const canAssign =
    selfAssign ||
    (hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && actCfg.canCreate && actCfg.canAssign);
  const isEdit = activityId != null && activityId > 0;

  const [form, setForm] = useState<ActivityFormState>({
    ...EMPTY_ACTIVITY_FORM,
    projectMode: forcedProjectMode ?? EMPTY_ACTIVITY_FORM.projectMode,
    responsableId: initialResponsableId ? String(initialResponsableId) : "",
    coreKind: coreKind ?? "",
    assignmentCharge: assignmentCharge ?? "",
    evidencePhotoRequired: String(
      Math.min(8, Math.max(2, Math.round(Number(evidencePhotoRequired)) || 4)),
    ),
  });
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
  const [sectorClients, setSectorClients] = useState<
    Array<{ serviceClientId: number; name: string; salesClientId: number }>
  >([]);

  const [tareaOtroOpen, setTareaOtroOpen] = useState(false);

  // «Qué hay que fotografiar»: se definen al crear y se mandan en cuanto existe la actividad.
  // La API pide gestión de actividades para definirlos; editar va en el detalle de la actividad.
  const puedeDefinirCampos = !isEdit && hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE);
  const [campos, setCampos] = useState<CampoBorrador[]>([]);
  const [camposIntentado, setCamposIntentado] = useState(false);
  /** La actividad ya se creó pero el PUT de campos falló: no se vuelve a crear, se reintenta. */
  const [camposPendiente, setCamposPendiente] = useState<{ id: number; error: string } | null>(null);
  const erroresCampos = useMemo(() => validarCampos(campos), [campos]);
  const camposTituloId = useId();

  const needsClientPicker = coreKind === "servicio" || coreKind === "comercial";
  const filtersProjectsBySector = coreKind === "proyecto" || coreKind === "obra";

  // Tarea Core: subtipo obligatorio (Levantamiento, Junta… u Otro con texto libre).
  const isTareaCore = tone === "core" && coreKind === "tarea";
  const tareaPreset = TAREA_TIPOS.find((t) => t.id !== "otro" && t.label === form.ticketTypeCustom);
  const tareaTipo = tareaOtroOpen
    ? "otro"
    : tareaPreset?.id ?? (form.ticketType === "OTRO" && form.ticketTypeCustom.trim() ? "otro" : "");

  const activeProjects = useMemo(() => {
    const active = projects.filter((p) => p.status === "ACTIVE");
    if (!filtersProjectsBySector || sectorClients.length === 0) return active;
    const ok = new Set(sectorClients.map((c) => c.serviceClientId));
    return active.filter((p) => ok.has(p.client.id));
  }, [projects, filtersProjectsBySector, sectorClients]);

  const loadMeta = useCallback(async () => {
    if (!token) return;
    try {
      const [projs, assignable, next, tickets] = await Promise.all([
        // Auto-asignación: el encargado puede no tener permisos de OT; un 403 aquí no tumba el formulario.
        selfAssign ? listOperationalProjects(token).catch(() => []) : listOperationalProjects(token),
        canAssign && !selfAssign ? listAssignableUsers(token) : Promise.resolve([]),
        canAssign && !isEdit
          ? selfAssign
            ? fetchNextAnNumber(token).catch(() => ({ next: "" }))
            : fetchNextAnNumber(token)
          : Promise.resolve({ next: "" }),
        hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)
          ? listApprovedTicketRequests(token)
          : Promise.resolve([]),
      ]);
      setProjects(Array.isArray(projs) ? projs : []);
      setUsers(Array.isArray(assignable) ? assignable : []);
      setNextAn(typeof next?.next === "string" ? next.next : "");
      setNextAnLoaded(true);
      setTicketRequests(Array.isArray(tickets) ? tickets : []);

      if (coreKind && ["proyecto", "obra", "servicio", "comercial"].includes(coreKind)) {
        const sectors = clientSectorsForActivityKind(coreKind as ActivityKind, user?.email);
        if (sectors.length) {
          const batches = await Promise.all(
            sectors.map((s: ClientSector) => listSalesClients(token, { sector: s })),
          );
          const byId = new Map<number, { serviceClientId: number; name: string; salesClientId: number }>();
          for (const row of batches.flat()) {
            if (!row.serviceClientId) continue;
            byId.set(row.id, {
              salesClientId: row.id,
              serviceClientId: row.serviceClientId,
              name: row.legalName || row.name,
            });
          }
          setSectorClients([...byId.values()]);
        } else {
          setSectorClients([]);
        }
      }
    } catch {
      setNextAnLoaded(true);
    }
  }, [token, canAssign, isEdit, user, coreKind, selfAssign]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!initialClientId || isEdit || requestId) return;
    setForm((prev) => {
      if (prev.clientId) return prev;
      return { ...prev, clientId: String(initialClientId) };
    });
  }, [initialClientId, isEdit, requestId]);

  useEffect(() => {
    if (!initialResponsableId || isEdit) return;
    setForm((prev) => ({ ...prev, responsableId: String(initialResponsableId) }));
  }, [initialResponsableId, isEdit]);

  useEffect(() => {
    if (isEdit || !assignmentCharge) return;
    setForm((prev) => ({ ...prev, assignmentCharge }));
  }, [assignmentCharge, isEdit]);

  useEffect(() => {
    if (!forcedProjectMode || isEdit) return;
    setForm((prev) => ({
      ...prev,
      projectMode: forcedProjectMode,
      projectId: forcedProjectMode === "without_project" ? "" : prev.projectId,
    }));
  }, [forcedProjectMode, isEdit]);

  useEffect(() => {
    if (isEdit || !forcedTicketType) return;
    setForm((prev) => ({
      ...prev,
      ticketType: forcedTicketType,
      ticketTypeCustom: forcedTicketTypeCustom ?? "",
      workType: forcedTicketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : "ISSUE",
    }));
  }, [forcedTicketType, forcedTicketTypeCustom, isEdit]);

  useEffect(() => {
    if (!initialClientId || isEdit || requestId || !activeProjects.length) return;
    setForm((prev) => {
      if (prev.projectId) return prev;
      const matching = activeProjects.filter((p) => String(p.client.id) === String(initialClientId));
      if (matching.length !== 1) return prev;
      return { ...prev, clientId: String(initialClientId), projectId: String(matching[0].id) };
    });
  }, [initialClientId, isEdit, requestId, activeProjects]);

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
      prioridad: request.urgency === "HIGH" ? "ALTA" : request.urgency === "LOW" ? "BAJA" : "MEDIA",
      clientId,
      projectId: matching.length === 1 ? String(matching[0].id) : "",
      projectMode: "with_project",
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
    if (isTareaCore && !tareaTipo) {
      setError("Elige el tipo de tarea");
      return;
    }
    if (isTareaCore && tareaTipo === "otro" && !form.ticketTypeCustom.trim()) {
      setError("Especifica el tipo de tarea");
      return;
    }
    if (form.projectMode === "with_project" && !form.projectId) {
      setError("Selecciona un proyecto");
      return;
    }
    if (requireSchedule && (!form.fecha || !form.hora)) {
      setError("Indica día y hora de la agenda");
      return;
    }
    if (puedeDefinirCampos && campos.length > 0) {
      setCamposIntentado(true);
      if (hayErrores(erroresCampos)) {
        setError("Revisa «Qué hay que fotografiar»: hay puntos incompletos.");
        return;
      }
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
        setSuccess(tone === "core" ? "Actividad actualizada" : "OT actualizada");
        onSuccess?.(activityId);
      } else {
        const created = selfAssign
          ? await createMyActivity(token, payload)
          : await createActivity(token, payload);
        const newId = Number(created?.id);
        if (puedeDefinirCampos && campos.length > 0 && newId > 0) {
          try {
            await definirCamposEvidencia(token, newId, campos);
          } catch (e) {
            setCamposPendiente({
              id: newId,
              error: apiErrorMessage(e, "No se pudo guardar qué hay que fotografiar"),
            });
            return;
          }
        }
        await terminarCreacion(newId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  /** Lo que sigue a crear la actividad: ligar el ticket, avisar, limpiar y avisar al padre. */
  const terminarCreacion = async (newId: number) => {
    if (pendingRequestId && newId > 0) {
      try {
        await assignTicketRequest(token, pendingRequestId, newId);
        setPendingRequestId(null);
      } catch {
        setError(tone === "core" ? "Actividad creada pero no se pudo vincular al ticket" : "OT creada pero no se pudo vincular al ticket de soporte");
        return;
      }
    }
    setSuccess(
      tone === "core"
        ? form.responsableId
          ? "Actividad asignada"
          : "Actividad creada"
        : form.responsableId
          ? "OT asignada"
          : "OT creada",
    );
    setForm({ ...EMPTY_ACTIVITY_FORM });
    setCampos([]);
    setCamposIntentado(false);
    setTareaOtroOpen(false);
    const next = await fetchNextAnNumber(token);
    setNextAn(typeof next?.next === "string" ? next.next : "");
    if (newId > 0) onSuccess?.(newId);
  };

  /** La actividad ya existe: solo se reintenta guardar los puntos (nunca se crea otra). */
  const reintentarCampos = async () => {
    if (!camposPendiente || !token) return;
    const { id } = camposPendiente;
    if (hayErrores(erroresCampos)) {
      setCamposIntentado(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await definirCamposEvidencia(token, id, campos);
    } catch (e) {
      setCamposPendiente({ id, error: apiErrorMessage(e, "No se pudo guardar qué hay que fotografiar") });
      setSaving(false);
      return;
    }
    setCamposPendiente(null);
    try {
      await terminarCreacion(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const seguirSinCampos = async () => {
    if (!camposPendiente) return;
    const { id } = camposPendiente;
    setCamposPendiente(null);
    setSaving(true);
    setError(null);
    try {
      await terminarCreacion(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!canAssign) {
    return (
      <Section
        title="Sin permisos"
        subtitle={tone === "core" ? "No puedes asignar actividades." : "No tienes permiso para crear o asignar OT."}
      >
        <Link href={tone === "core" ? "/erp/pizarra" : "/ops/activities"}>← Volver</Link>
      </Section>
    );
  }

  if (loading) {
    return (
      <Section
        title={tone === "core" ? "Cargando…" : "Cargando OT…"}
        subtitle="Preparando formulario."
      >
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Un momento…</p>
      </Section>
    );
  }

  return (
    <Section
      title={
        isEdit
          ? tone === "core"
            ? `Editar actividad #${activityId}`
            : `Editar OT #${activityId}`
          : tone === "core"
            ? "Datos de la actividad"
            : "Nueva orden de trabajo"
      }
      subtitle={
        tone === "core"
          ? form.projectMode === "with_project"
            ? "Elige proyecto, prioridad y agenda. El cliente sale del proyecto."
            : "Título, prioridad semáforo y lo esencial — sin jerga técnica."
          : form.projectMode === "with_project"
            ? "OT con proyecto operativo: el cliente sale del proyecto."
            : "OT sin proyecto: trabajo interno o ad-hoc; no pide proyecto."
      }
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

      {!(hideProjectModePicker || forcedProjectMode) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {(
            [
              {
                mode: "with_project" as ActivityProjectMode,
                title: "Proyecto",
                help: "Actividad ligada a un proyecto; el cliente sale del proyecto.",
              },
              {
                mode: "without_project" as ActivityProjectMode,
                title: "Tarea",
                help: "Tarea del día sin proyecto ni cliente de servicio.",
              },
            ] as const
          ).map((opt) => {
            const selected = form.projectMode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    projectMode: opt.mode,
                    projectId: opt.mode === "without_project" ? "" : prev.projectId,
                    clientId: opt.mode === "without_project" ? "" : prev.clientId,
                  }))
                }
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: selected ? "color-mix(in srgb, var(--primary) 8%, var(--surface))" : "var(--surface)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{opt.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.35 }}>{opt.help}</div>
              </button>
            );
          })}
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
          placeholder={tone === "core" ? "Título de la actividad" : "Título de la OT"}
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        />
        {form.projectMode === "with_project" ? (
          <>
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
          </>
        ) : (
          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {tone === "core"
                ? needsClientPicker
                  ? "Elige el cliente de este padrón."
                  : "Trabajo del día sin proyecto."
                : "Sin proyecto: trabajo interno o ad-hoc. No se pide proyecto operativo."}
            </div>
            {isTareaCore ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 650 }}>Tipo de tarea *</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {TAREA_TIPOS.map((t) => {
                    const on = tareaTipo === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          const isOtro = t.id === "otro";
                          setTareaOtroOpen(isOtro);
                          setForm((prev) => ({
                            ...prev,
                            ticketType: "OTRO",
                            ticketTypeCustom: isOtro
                              ? tareaTipo === "otro"
                                ? prev.ticketTypeCustom
                                : ""
                              : t.label,
                            workType: "ISSUE",
                          }));
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 12px",
                          borderRadius: 999,
                          border: on ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                          background: on
                            ? "color-mix(in srgb, var(--primary) 12%, var(--surface))"
                            : "var(--surface)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          color: "inherit",
                          fontSize: 12.5,
                          fontWeight: on ? 750 : 600,
                        }}
                      >
                        <ActivityKindIcon kind={t.icon} size={18} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {tareaTipo === "otro" ? (
                  <input
                    className="input"
                    autoFocus
                    maxLength={120}
                    placeholder="Especifica el tipo (ej. Visita a proveedor)"
                    value={form.ticketTypeCustom}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, ticketType: "OTRO", ticketTypeCustom: e.target.value }))
                    }
                  />
                ) : null}
              </div>
            ) : null}
            {needsClientPicker ? (
              <select
                className="input"
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                required
              >
                <option value="">Seleccionar cliente…</option>
                {sectorClients.map((c) => (
                  <option key={c.salesClientId} value={c.serviceClientId}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        )}
        {!(tone === "core" && forcedTicketType) && (
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
        )}
        {!hideResponsableSelect && (
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
        )}
        <PrioritySemaforo
          value={form.prioridad || "MEDIA"}
          onChange={(prioridad) => setForm({ ...form, prioridad })}
        />
        <div>
          <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>
            {requireSchedule || tone === "core" ? "Día" : "Fecha"}
          </label>
          <input
            className="input"
            type="date"
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            required={requireSchedule}
          />
        </div>
        {(requireSchedule || tone === "core") && (
          <div>
            <label style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>
              Hora
            </label>
            <input
              className="input"
              type="time"
              value={form.hora || "09:00"}
              onChange={(e) => setForm({ ...form, hora: e.target.value })}
              required={requireSchedule}
            />
          </div>
        )}
        <input
          className="input"
          type="number"
          min={0}
          placeholder={tone === "core" ? "¿Cuántos minutos esperas que tome?" : "Tiempo esperado (min)"}
          value={form.tiempoEstimadoMin}
          onChange={(e) => setForm({ ...form, tiempoEstimadoMin: e.target.value })}
        />
        <input
          className="input"
          type="number"
          min={0}
          placeholder={tone === "core" ? "Tope máximo (min)" : "Tiempo máximo (min)"}
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
          placeholder={
            tone === "core"
              ? "Indicaciones generales (para todo el equipo)"
              : "Indicaciones para el responsable"
          }
          value={form.indicaciones}
          onChange={(e) => setForm({ ...form, indicaciones: e.target.value })}
          style={{ gridColumn: "1 / -1" }}
        />
        {tone === "core" ? (
          <label
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              fontWeight: 650,
              color: "var(--text-secondary)",
            }}
          >
            Fotos de evidencia por persona
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                className="btn"
                style={{ minWidth: 36, padding: "4px 10px" }}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    evidencePhotoRequired: String(
                      Math.max(2, Number(prev.evidencePhotoRequired || 4) - 1),
                    ),
                  }))
                }
              >
                −
              </button>
              <strong style={{ minWidth: 24, textAlign: "center", color: "var(--text)" }}>
                {form.evidencePhotoRequired}
              </strong>
              <button
                type="button"
                className="btn"
                style={{ minWidth: 36, padding: "4px 10px" }}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    evidencePhotoRequired: String(
                      Math.min(8, Number(prev.evidencePhotoRequired || 4) + 1),
                    ),
                  }))
                }
              >
                +
              </button>
            </span>
            <span style={{ fontWeight: 500, fontSize: 12 }}>(2–8)</span>
          </label>
        ) : null}
      </div>

      {puedeDefinirCampos ? (
        <section
          aria-labelledby={camposTituloId}
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            display: "grid",
            gap: 10,
          }}
        >
          <div>
            <h3 id={camposTituloId} style={{ margin: 0, fontSize: 14, fontWeight: 750 }}>
              Qué hay que fotografiar{" "}
              <span style={{ fontWeight: 500, fontSize: 12, color: "var(--text-tertiary)" }}>(opcional)</span>
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {campos.length
                ? "Quien la ejecute verá estos puntos en la app y no podrá avanzar sin la foto de cada momento marcado. Las fotos libres quedan como extra."
                : "Define cada cosa que se debe documentar (Cámara 1, Rack, Canalización…) y en qué momento se pide la foto: antes, en progreso o después. Si no defines nada, se piden fotos libres como hasta ahora."}
            </p>
          </div>
          <EvidenciaCamposEditor
            value={campos}
            onChange={setCampos}
            errores={camposIntentado ? erroresCampos : null}
            disabled={saving}
          />
        </section>
      ) : null}

      {camposPendiente ? (
        <div
          role="alert"
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid color-mix(in srgb, #d97706 45%, var(--border))",
            background: "color-mix(in srgb, #d97706 9%, var(--surface))",
            display: "grid",
            gap: 10,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <span>
            <strong>{tone === "core" ? "La actividad ya se creó" : "La OT ya se creó"}</strong>, pero no se guardó qué hay
            que fotografiar: {camposPendiente.error}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button size="sm" variant="primary" onClick={() => void reintentarCampos()} loading={saving}>
              Reintentar guardar los puntos
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void seguirSinCampos()} disabled={saving}>
              Seguir sin puntos
            </Button>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Si sigues sin puntos, puedes definirlos después desde el detalle de la actividad.
          </span>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 16 }}>
        {onCancel && !camposPendiente && (
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancelar</Button>
        )}
        {!camposPendiente ? (
          <Button
            size="sm"
            variant={tone === "core" ? "primary" : undefined}
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? "Guardando…" : activitySubmitLabel(form, isEdit, tone)}
          </Button>
        ) : null}
        {error && <span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>}
        {success && <span style={{ color: "var(--success)", fontSize: 13 }}>{success}</span>}
      </div>
    </Section>
  );
}
