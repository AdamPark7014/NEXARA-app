"use client";

import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Button from "@/components/ui/Button";
import Section from "@/components/ui/Section";
import { useUser } from "@/components/UserContext";
import EvidenciaCamposEditor from "@/components/ops/EvidenciaCamposEditor";
import HerramientasChecklistEditor from "@/components/ops/HerramientasChecklistEditor";
import {
  definirCamposEvidencia,
  hayErrores,
  validarCampos,
  type CampoBorrador,
} from "@/lib/evidencia-campos";
import {
  definirRequisitos,
  hayErroresRequisitos,
  validarRequisitos,
  type RequisitoBorrador,
} from "@/lib/herramientas-checklist";
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
import { ClienteTipoPicker } from "@/components/erp/DatosCliente";
import {
  getClientPermissions,
  listSalesClients,
  NO_CLIENT_PERMISSIONS,
  provisionSalesServiceClient,
  type SalesClient,
} from "@/lib/sales-api";
import {
  clientSectorsForActivityKind,
  clientSectorsForUser,
  type ClientSector,
} from "@/lib/client-sectors";
import { TAREA_TIPOS, type ActivityKind } from "@/lib/activity-kinds";
import { createMyActivity } from "@/lib/my-activities-api";
import { quickCreateOperationalProject } from "@/lib/ops-operational-api";
import { obtenerProgramacion, type EtapaPropuesta } from "@/lib/proyectos-api";
import { aInputFecha, hoyISO } from "@/lib/proyecto-plan";
import { fechaCorta, periodoPorOmision, resumenDelRango } from "@/lib/actividad-periodo";
import coreCss from "./OpsActivityFormCore.module.css";

type Props = {
  activityId?: number;
  requestId?: number;
  /** Prefill service-client filter when creating from client detail */
  initialClientId?: number;
  /** Prefill encargado (pizarra → asignar) */
  initialResponsableId?: number;
  /** Equipo extra elegido en el flujo de asignación (para selector de herramientas). */
  extraTeamIds?: number[];
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

/** Etiqueta visible arriba del campo (tono Core). */
const coreLabelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 650,
  color: "var(--text-secondary)",
};

export default function OpsActivityForm({
  activityId,
  requestId,
  initialClientId,
  initialResponsableId,
  extraTeamIds,
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
  const [clientesCorporativos, setClientesCorporativos] = useState<SalesClient[]>([]);
  const [salesServicioId, setSalesServicioId] = useState<number | null>(null);
  const [permisosCliente, setPermisosCliente] = useState(NO_CLIENT_PERMISSIONS);
  const [clientesProyecto, setClientesProyecto] = useState<SalesClient[]>([]);
  const [salesProyectoId, setSalesProyectoId] = useState<number | null>(null);
  const [altaProyectoAbierta, setAltaProyectoAbierta] = useState(false);
  const [nombreProyecto, setNombreProyecto] = useState("");
  const [creandoProyecto, setCreandoProyecto] = useState(false);

  const [tareaOtroOpen, setTareaOtroOpen] = useState(false);

  // Periodo: en una actividad de proyecto se propone la etapa que corre (o la ventana del
  // proyecto) para no tener que cargarla cada día. Mientras nadie toque las fechas, cambiar
  // de proyecto vuelve a proponer.
  const [etapas, setEtapas] = useState<EtapaPropuesta[] | null>(null);
  const [ventanaProyecto, setVentanaProyecto] = useState<{ inicio: string | null; fin: string | null } | null>(null);
  const [periodoAuto, setPeriodoAuto] = useState(true);

  // «Qué hay que fotografiar»: se definen al crear y se mandan en cuanto existe la actividad.
  // La API pide gestión de actividades para definirlos; editar va en el detalle de la actividad.
  const puedeDefinirCampos = !isEdit && hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE);
  const [campos, setCampos] = useState<CampoBorrador[]>([]);
  const [camposIntentado, setCamposIntentado] = useState(false);
  /** La actividad ya se creó pero el PUT de campos falló: no se vuelve a crear, se reintenta. */
  const [camposPendiente, setCamposPendiente] = useState<{ id: number; error: string } | null>(null);
  const erroresCampos = useMemo(() => validarCampos(campos), [campos]);
  const camposTituloId = useId();

  // «Herramientas a llevar»: mismo trato que los campos (misma condición, mismo permiso) y
  // el mismo baile: se juntan al crear y se mandan en cuanto la actividad tiene id.
  const [herramientas, setHerramientas] = useState<RequisitoBorrador[]>([]);
  const [herramientasIntentado, setHerramientasIntentado] = useState(false);
  const [herramientasPendiente, setHerramientasPendiente] = useState<{ id: number; error: string } | null>(null);
  const erroresHerramientas = useMemo(() => validarRequisitos(herramientas), [herramientas]);
  const herramientasTituloId = useId();
  const [usaKit, setUsaKit] = useState(false);

  const periodoId = useId();

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

      const [permisos, proyectoRows] = await Promise.all([
        getClientPermissions(token).catch(() => NO_CLIENT_PERMISSIONS),
        listSalesClients(token, { sector: "PROYECTO" }).catch(() => [] as SalesClient[]),
      ]);
      setPermisosCliente(permisos);
      setClientesProyecto([...proyectoRows].sort((a, b) => a.name.localeCompare(b.name, "es")));

      if (coreKind === "servicio") {
        const rows = await listSalesClients(token, { sector: "CORPORATIVO" }).catch(() => [] as SalesClient[]);
        setClientesCorporativos(rows);
      }

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
    if (coreKind !== "servicio" || !form.clientId) return;
    const hit = clientesCorporativos.find((c) => String(c.serviceClientId) === form.clientId);
    if (hit) setSalesServicioId(hit.id);
  }, [coreKind, form.clientId, clientesCorporativos]);

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

  // Etapas y ventana del proyecto elegido: de ahí sale el periodo por omisión.
  const proyectoElegido = form.projectMode === "with_project" ? form.projectId : "";
  useEffect(() => {
    if (!token || !proyectoElegido) {
      setEtapas(null);
      setVentanaProyecto(null);
      return;
    }
    let cancelado = false;
    const fila = projects.find((p) => String(p.id) === proyectoElegido);
    const ventanaDeFila = {
      inicio: fila?.startDate ? aInputFecha(fila.startDate) : null,
      fin: fila?.endDate ? aInputFecha(fila.endDate) : null,
    };
    void obtenerProgramacion(token, Number(proyectoElegido))
      .then((p) => ({ etapas: p.etapas, ventana: { inicio: p.proyecto.inicio, fin: p.proyecto.fin } }))
      // Sin permiso para leer el cronograma (o API vieja): basta la ventana del proyecto.
      .catch(() => ({ etapas: [] as EtapaPropuesta[], ventana: ventanaDeFila }))
      .then(({ etapas: lista, ventana }) => {
        if (cancelado) return;
        setEtapas(lista);
        setVentanaProyecto(ventana);
        if (isEdit || !periodoAuto) return;
        const propuesta = periodoPorOmision(lista, ventana, hoyISO());
        if (!propuesta) return;
        setForm((prev) => ({
          ...prev,
          fecha: propuesta.inicio,
          periodoFin: propuesta.fin,
          projectMilestoneId: propuesta.hitoId ? String(propuesta.hitoId) : "",
        }));
      });
    return () => {
      cancelado = true;
    };
    // `periodoAuto` se lee al llegar la respuesta; volver a pedir por él no aporta nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, proyectoElegido, projects, isEdit]);

  /** Elegir etapa pone su periodo (desde hoy si ya empezó); «todo el proyecto», la ventana. */
  const elegirEtapa = (hitoId: string) => {
    const hoy = hoyISO();
    const etapa = etapas?.find((e) => String(e.hitoId) === hitoId);
    // Una etapa que ya pasó se propone tal cual: quien asigna ve que quedó atrás.
    const propuesta = etapa
      ? (periodoPorOmision([etapa], {}, hoy) ?? { inicio: etapa.inicio, fin: etapa.fin })
      : periodoPorOmision([], ventanaProyecto ?? {}, hoy);
    setPeriodoAuto(false);
    setForm((prev) => ({
      ...prev,
      projectMilestoneId: etapa ? hitoId : "",
      ...(propuesta ? { fecha: propuesta.inicio, periodoFin: propuesta.fin } : {}),
    }));
  };

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

  const puedeClienteProyecto =
    permisosCliente.puedeAgregar && clientSectorsForUser(user).includes("PROYECTO");

  const crearProyectoRapido = async () => {
    if (!token) return;
    const title = nombreProyecto.trim();
    if (title.length < 3) {
      setError("El nombre del proyecto necesita al menos 3 caracteres");
      return;
    }
    if (!salesProyectoId) {
      setError("Elige o crea el cliente del proyecto");
      return;
    }
    setCreandoProyecto(true);
    setError(null);
    try {
      const creado = await quickCreateOperationalProject(token, { title, salesClientId: salesProyectoId });
      const client = creado.client;
      if (!client?.id) {
        setError("El proyecto se creó, pero no quedó ligado a un cliente");
        return;
      }
      const row: OperationalProjectRow = {
        id: creado.id,
        title: creado.title,
        status: creado.status || "ACTIVE",
        client: { id: client.id, name: client.name },
        startDate: creado.startDate,
        endDate: creado.endDate ?? null,
      };
      setProjects((prev) => [...prev.filter((p) => p.id !== row.id), row]);
      setSectorClients((prev) => {
        // Lista vacía = sin filtro de sector. Meter uno aquí ocultaría el resto de proyectos.
        if (prev.length === 0 || prev.some((c) => c.serviceClientId === client.id)) return prev;
        return [...prev, { serviceClientId: client.id, name: client.name, salesClientId: salesProyectoId }];
      });
      setForm((prev) => ({
        ...prev,
        projectMode: "with_project",
        projectId: String(row.id),
        clientId: String(client.id),
        projectMilestoneId: "",
      }));
      setAltaProyectoAbierta(false);
      setNombreProyecto("");
      setSuccess(tone === "core" ? "Proyecto creado y seleccionado" : "Proyecto creado");
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo crear el proyecto"));
    } finally {
      setCreandoProyecto(false);
    }
  };

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
    if (coreKind === "servicio" && form.projectMode !== "with_project" && !form.clientId) {
      setError("Elige o crea el cliente corporativo");
      return;
    }
    if (requireSchedule && (!form.fecha || !form.hora)) {
      setError("Indica día y hora de la agenda");
      return;
    }
    if (form.periodoFin && !form.fecha) {
      setError("Indica el primer día del periodo");
      return;
    }
    if (form.periodoFin && form.fecha && form.periodoFin < form.fecha) {
      setError("El último día del periodo no puede ser anterior al primero");
      return;
    }
    if (puedeDefinirCampos && campos.length > 0) {
      setCamposIntentado(true);
      if (hayErrores(erroresCampos)) {
        setError("Revisa «Qué hay que fotografiar»: hay puntos incompletos.");
        return;
      }
    }
    if (puedeDefinirCampos && herramientas.length > 0) {
      setHerramientasIntentado(true);
      if (hayErroresRequisitos(erroresHerramientas)) {
        setError("Revisa «Herramientas a llevar»: hay filas incompletas.");
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
      setError(
        tone === "core"
          ? apiErrorMessage(e, "No se pudo guardar la actividad. Intenta de nuevo.")
          : e instanceof Error
            ? e.message
            : "Error al guardar",
      );
    } finally {
      setSaving(false);
    }
  };

  /** El PUT de herramientas: `false` y deja el aviso cuando falla (la actividad ya existe). */
  const guardarHerramientas = async (newId: number) => {
    if (!puedeDefinirCampos || herramientas.length === 0 || !(newId > 0)) return true;
    try {
      await definirRequisitos(
        token,
        newId,
        herramientas.map((f) => ({
          descripcion: f.descripcion.trim(),
          cantidad: f.cantidad,
          ...(f.toolId ? { toolId: f.toolId } : {}),
          ...(f.source ? { source: f.source } : {}),
        })),
        [
          ...(form.responsableId ? [Number(form.responsableId)] : []),
          ...((extraTeamIds ?? []).filter((id) => !form.responsableId || id !== Number(form.responsableId))),
        ],
        usaKit,
      );
      return true;
    } catch (e) {
      setHerramientasPendiente({
        id: newId,
        error: apiErrorMessage(e, "No se pudieron guardar las herramientas a llevar"),
      });
      return false;
    }
  };

  /** Lo que sigue a crear la actividad: ligar el ticket, avisar, limpiar y avisar al padre. */
  const terminarCreacion = async (newId: number, omitirHerramientas = false) => {
    if (!omitirHerramientas && !(await guardarHerramientas(newId))) return;
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
    setPeriodoAuto(true);
    setCampos([]);
    setCamposIntentado(false);
    setHerramientas([]);
    setHerramientasIntentado(false);
    setTareaOtroOpen(false);
    // El folio siguiente no puede tumbar un alta que ya se guardó.
    try {
      const next = await fetchNextAnNumber(token);
      setNextAn(typeof next?.next === "string" ? next.next : "");
    } catch {
      setNextAn("");
    }
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

  /** Igual que los campos, pero con el checklist: la actividad ya existe, solo se reintenta. */
  const reintentarHerramientas = async () => {
    if (!herramientasPendiente || !token) return;
    const { id } = herramientasPendiente;
    if (hayErroresRequisitos(erroresHerramientas)) {
      setHerramientasIntentado(true);
      return;
    }
    setHerramientasPendiente(null);
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

  const seguirSinHerramientas = async () => {
    if (!herramientasPendiente) return;
    const { id } = herramientasPendiente;
    setHerramientasPendiente(null);
    setSaving(true);
    setError(null);
    try {
      await terminarCreacion(id, true);
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

  const isCore = tone === "core";

  return (
    <div className={isCore ? coreCss.core : undefined}>
    <Section
      title={
        isEdit
          ? isCore
            ? "Editar actividad"
            : `Editar OT #${activityId}`
          : isCore
            ? "Datos de la actividad"
            : "Nueva orden de trabajo"
      }
      subtitle={
        isCore
          ? form.projectMode === "with_project"
            ? "Elige proyecto, prioridad y agenda. El cliente sale del proyecto."
            : "Qué hay que hacer, qué tan urgente es y para cuándo."
          : form.projectMode === "with_project"
            ? "OT con proyecto operativo: el cliente sale del proyecto."
            : "OT sin proyecto: trabajo interno o ad-hoc; no pide proyecto."
      }
      actions={
        !isEdit && !isCore ? (
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
              background: "var(--surface)",
              color: "var(--text-primary, inherit)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "24px 28px",
              width: "min(420px, calc(100vw - 32px))",
              boxSizing: "border-box",
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
        {!isEdit && !isCore && (
          <input
            className="input"
            placeholder="AN (automático)"
            value={nextAn || (nextAnLoaded ? "No disponible" : "Calculando…")}
            disabled
          />
        )}
        {isCore ? (
          <label style={{ ...coreLabelStyle, gridColumn: "1 / -1" }}>
            ¿Qué hay que hacer? *
            <input
              className="input"
              placeholder="Ej. Revisar cámaras de la entrada principal"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              style={{ fontWeight: 400 }}
            />
          </label>
        ) : (
          <input
            className="input"
            placeholder="Título de la OT"
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
          />
        )}
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
                  // La etapa es de otro proyecto: se vuelve a proponer con el nuevo.
                  projectMilestoneId: "",
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
            <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
              <button
                type="button"
                onClick={() => setAltaProyectoAbierta((v) => !v)}
                style={{
                  justifySelf: "start",
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--primary)",
                  fontWeight: 650,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                }}
              >
                {altaProyectoAbierta ? "Cerrar alta de proyecto" : "¿No está el proyecto? Créalo aquí"}
              </button>
              {altaProyectoAbierta ? (
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <label style={coreLabelStyle}>
                    Nombre del proyecto *
                    <input
                      className="input"
                      value={nombreProyecto}
                      maxLength={200}
                      placeholder="Ej. Cámaras sucursal norte"
                      onChange={(e) => setNombreProyecto(e.target.value)}
                      style={{ fontWeight: 400 }}
                    />
                  </label>
                  <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text-secondary)" }}>Cliente *</div>
                  <ClienteTipoPicker
                    token={token}
                    tipo="PROYECTO"
                    salesClientId={salesProyectoId}
                    editable={!creandoProyecto}
                    puedeCrear
                    puedeEditar={puedeClienteProyecto}
                    altaSoloNombre={!puedeClienteProyecto}
                    clientes={clientesProyecto}
                    onCreado={(creado) => {
                      setClientesProyecto((prev) =>
                        [...prev.filter((c) => c.id !== creado.id), creado].sort((a, b) =>
                          a.name.localeCompare(b.name, "es"),
                        ),
                      );
                      setSalesProyectoId(creado.id);
                    }}
                    onSelect={(c) => setSalesProyectoId(c.id)}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={creandoProyecto || nombreProyecto.trim().length < 3 || !salesProyectoId}
                    onClick={() => void crearProyectoRapido()}
                  >
                    {creandoProyecto ? "Creando…" : "Crear y usar este proyecto"}
                  </Button>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
                    Fechas, alcance y equipo se completan después en Proyectos.
                  </p>
                </div>
              ) : null}
            </div>
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
            {needsClientPicker && coreKind === "servicio" ? (
              <ClienteTipoPicker
                token={token}
                tipo="CORPORATIVO"
                salesClientId={salesServicioId}
                editable
                puedeCrear={
                  (permisosCliente.puedeAgregar && clientSectorsForUser(user).includes("CORPORATIVO")) ||
                  Boolean(permisosCliente.puedeAltaRapidaCorporativa)
                }
                puedeEditar={permisosCliente.puedeEditar && clientSectorsForUser(user).includes("CORPORATIVO")}
                soloContacto={Boolean(permisosCliente.puedeAltaRapidaCorporativa) && !permisosCliente.puedeAgregar}
                clientes={clientesCorporativos}
                onCreado={(creado) => {
                  setClientesCorporativos((prev) =>
                    [...prev.filter((c) => c.id !== creado.id), creado].sort((a, b) => a.name.localeCompare(b.name, "es")),
                  );
                  setSalesServicioId(creado.id);
                  void (async () => {
                    if (!token) return;
                    let serviceId = creado.serviceClientId ?? null;
                    if (!serviceId) {
                      try {
                        const activado = await provisionSalesServiceClient(token, creado.id);
                        serviceId = activado.serviceClient.id;
                      } catch (e) {
                        setError(apiErrorMessage(e, "El cliente se creó, pero no quedó listo para la actividad"));
                        return;
                      }
                    }
                    setForm((prev) => ({ ...prev, clientId: String(serviceId) }));
                  })();
                }}
                onSelect={async (c) => {
                  setSalesServicioId(c.id);
                  if (!token) return;
                  try {
                    let serviceId = c.serviceClientId ?? null;
                    if (!serviceId) {
                      const activado = await provisionSalesServiceClient(token, c.id);
                      serviceId = activado.serviceClient.id;
                      setClientesCorporativos((prev) =>
                        prev.map((row) => (row.id === c.id ? { ...row, serviceClientId: serviceId } : row)),
                      );
                    }
                    setForm((prev) => ({ ...prev, clientId: String(serviceId) }));
                  } catch (e) {
                    setError(apiErrorMessage(e, "No se pudo usar ese cliente en la actividad"));
                  }
                }}
              />
            ) : needsClientPicker ? (
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
          <label
            htmlFor={`${periodoId}-del`}
            style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}
          >
            {form.periodoFin ? "Del" : requireSchedule || tone === "core" ? "Día" : "Fecha"}
          </label>
          <input
            id={`${periodoId}-del`}
            className="input"
            type="date"
            value={form.fecha}
            onChange={(e) => {
              setPeriodoAuto(false);
              setForm({ ...form, fecha: e.target.value });
            }}
            required={requireSchedule}
          />
        </div>
        <div>
          <label
            htmlFor={`${periodoId}-al`}
            style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}
          >
            Al (último día, si dura varios)
          </label>
          <input
            id={`${periodoId}-al`}
            className="input"
            type="date"
            value={form.periodoFin}
            min={form.fecha || undefined}
            onChange={(e) => {
              setPeriodoAuto(false);
              setForm({ ...form, periodoFin: e.target.value });
            }}
            aria-describedby={`${periodoId}-resumen`}
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
        <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
          {etapas && etapas.length > 0 ? (
            <label style={{ display: "grid", gap: 4, maxWidth: 460 }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Etapa del proyecto</span>
              <select
                className="input"
                value={form.projectMilestoneId}
                onChange={(e) => elegirEtapa(e.target.value)}
              >
                <option value="">
                  Todo el proyecto
                  {ventanaProyecto?.inicio && ventanaProyecto?.fin
                    ? ` · ${fechaCorta(ventanaProyecto.inicio)} – ${fechaCorta(ventanaProyecto.fin)}`
                    : ""}
                </option>
                {etapas.map((etapa) => (
                  <option key={etapa.hitoId} value={etapa.hitoId}>
                    {etapa.nombre} · {fechaCorta(etapa.inicio)} – {fechaCorta(etapa.fin)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p
            id={`${periodoId}-resumen`}
            style={{
              margin: 0,
              fontSize: 12.5,
              lineHeight: 1.4,
              color:
                form.periodoFin && form.fecha && form.periodoFin < form.fecha
                  ? "var(--danger)"
                  : "var(--text-secondary)",
            }}
          >
            {form.periodoFin && form.fecha
              ? form.periodoFin < form.fecha
                ? "El último día no puede ser anterior al primero."
                : `${resumenDelRango({ inicio: form.fecha, fin: form.periodoFin })}. Se queda en la pizarra cada día hasta terminarla y no cuenta como atrasada antes del último día.`
              : "Sin último día es de un solo momento (día y hora). Si el trabajo dura varios días, pon hasta cuándo: así no hay que cargarla cada día."}
          </p>
        </div>
        {isCore ? (
          <>
            <label style={coreLabelStyle}>
              ¿Cuánto tiempo toma? (min)
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Ej. 90"
                value={form.tiempoEstimadoMin}
                onChange={(e) => setForm({ ...form, tiempoEstimadoMin: e.target.value })}
                style={{ fontWeight: 400 }}
              />
            </label>
            <label style={coreLabelStyle}>
              Máximo permitido (min)
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="Ej. 120"
                value={form.tiempoMaximoMin}
                onChange={(e) => setForm({ ...form, tiempoMaximoMin: e.target.value })}
                style={{ fontWeight: 400 }}
              />
            </label>
          </>
        ) : (
          <>
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
          </>
        )}
        {pendingRequestId && (
          <>
            <input className="input" placeholder="Sucursal" value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} />
            <input className="input" placeholder="Número sucursal" value={form.branchNumber} onChange={(e) => setForm({ ...form, branchNumber: e.target.value })} />
            <input className="input" placeholder="Ciudad" value={form.branchCity} onChange={(e) => setForm({ ...form, branchCity: e.target.value })} />
            <input className="input" placeholder="Estado" value={form.branchState} onChange={(e) => setForm({ ...form, branchState: e.target.value })} />
            <input className="input" placeholder="Dirección sucursal" value={form.branchAddress} onChange={(e) => setForm({ ...form, branchAddress: e.target.value })} />
          </>
        )}
        {isCore ? (
          <label style={{ ...coreLabelStyle, gridColumn: "1 / -1" }}>
            Indicaciones para todos
            <textarea
              className="input"
              rows={3}
              placeholder="Qué deben saber todos los que la hagan: acceso, material, contacto…"
              value={form.indicaciones}
              onChange={(e) => setForm({ ...form, indicaciones: e.target.value })}
              style={{ fontSize: 16, fontWeight: 400, lineHeight: 1.4, resize: "vertical", fontFamily: "inherit" }}
            />
          </label>
        ) : (
          <input
            className="input"
            placeholder="Indicaciones para el responsable"
            value={form.indicaciones}
            onChange={(e) => setForm({ ...form, indicaciones: e.target.value })}
            style={{ gridColumn: "1 / -1" }}
          />
        )}
        {isCore ? (
          <div
            role="group"
            aria-label="Fotos de evidencia por persona"
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
                aria-label="Una foto menos"
                disabled={Number(form.evidencePhotoRequired || 4) <= 2}
                style={{ minWidth: 44, minHeight: 44, padding: "4px 10px", fontSize: 18 }}
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
              <strong
                aria-live="polite"
                style={{ minWidth: 28, textAlign: "center", fontSize: 16, color: "var(--text-primary, var(--text))" }}
              >
                {form.evidencePhotoRequired}
              </strong>
              <button
                type="button"
                className="btn"
                aria-label="Una foto más"
                disabled={Number(form.evidencePhotoRequired || 4) >= 8}
                style={{ minWidth: 44, minHeight: 44, padding: "4px 10px", fontSize: 18 }}
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
            <span style={{ fontWeight: 500, fontSize: 13 }}>(de 2 a 8)</span>
          </div>
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

      {puedeDefinirCampos ? (
        <section
          aria-labelledby={herramientasTituloId}
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
          <h3
            id={herramientasTituloId}
            style={{ margin: 0, fontSize: 14, fontWeight: 750, display: "flex", alignItems: "center", gap: 6 }}
          >
            Herramientas a llevar{" "}
            <span style={{ fontWeight: 500, fontSize: 12, color: "var(--text-tertiary)" }}>(opcional)</span>
            <InfoOutlinedIcon
              aria-label="Quien ejecuta palomea cada herramienta antes de salir; con pendientes la app no deja iniciar."
              titleAccess="Quien ejecuta palomea cada herramienta antes de salir; con pendientes la app no deja iniciar."
              sx={{ fontSize: 16, color: "var(--text-tertiary)" }}
            />
          </h3>
          <HerramientasChecklistEditor
            value={herramientas}
            onChange={setHerramientas}
            errores={herramientasIntentado ? erroresHerramientas : null}
            disabled={saving}
            responsableId={form.responsableId ? Number(form.responsableId) : undefined}
            extraTeamUserIds={extraTeamIds}
            responsableNombreCorto={
              users.find((u) => String(u.id) === String(form.responsableId))?.nombre?.split(/\s+/).slice(0, 2).join(" ")
            }
            usePersonalKit={usaKit}
            onToggleUsePersonalKit={setUsaKit}
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

      {herramientasPendiente ? (
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
            <strong>{tone === "core" ? "La actividad ya se creó" : "La OT ya se creó"}</strong>, pero no se guardaron las
            herramientas a llevar: {herramientasPendiente.error}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button size="sm" variant="primary" onClick={() => void reintentarHerramientas()} loading={saving}>
              Reintentar guardar las herramientas
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void seguirSinHerramientas()} disabled={saving}>
              Seguir sin herramientas
            </Button>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Si sigues sin herramientas, puedes definirlas después desde el detalle de la actividad.
          </span>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 16 }}>
        {onCancel && !camposPendiente && !herramientasPendiente && (
          <Button variant="secondary" size={isCore ? "lg" : "sm"} onClick={onCancel}>Cancelar</Button>
        )}
        {!camposPendiente && !herramientasPendiente ? (
          <Button
            size={isCore ? "lg" : "sm"}
            variant={isCore ? "primary" : undefined}
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? "Guardando…" : activitySubmitLabel(form, isEdit, tone)}
          </Button>
        ) : null}
        {error && (
          <span role="alert" style={{ color: "var(--danger)", fontSize: isCore ? 14 : 13 }}>
            {error}
          </span>
        )}
        {success && (
          <span role="status" style={{ color: "var(--success)", fontSize: isCore ? 14 : 13 }}>
            {success}
          </span>
        )}
      </div>
    </Section>
    </div>
  );
}
