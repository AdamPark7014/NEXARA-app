/**
 * NEXARA · Workflow / Aprobaciones — cliente API
 * ----------------------------------------------
 * Consume `apps/api/src/workflow/workflow.controller.ts`.
 * Usado por `/erp/approvals` (bandeja unificada de aprobaciones).
 */
import { buildApiUrl } from "@/lib/api-base";

export type WorkflowStepRow = {
  id: number;
  stepNumber: number;
  name: string;
  description?: string | null;
  approverRoleId?: number | null;
  approverUserId?: number | null;
  approverRole?: { nombre: string } | null;
  approverUser?: { nombre: string } | null;
};

export type WorkflowApprovalRow = {
  id: number;
  stepId: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  comments?: string | null;
  decidedById?: number | null;
  decidedAt?: string | null;
  createdAt: string;
  step?: WorkflowStepRow;
  decidedBy?: { id: number; nombre: string } | null;
};

export type WorkflowInstanceRow = {
  id: number;
  entityId: number;
  entityType: string;
  currentStep: number;
  isComplete: boolean;
  isCancelled: boolean;
  startedAt: string;
  completedAt?: string | null;
  workflow: {
    name: string;
    entityType: string;
    steps?: WorkflowStepRow[];
  };
  startedBy?: { id: number; nombre: string; role?: { nombre: string } | null } | null;
  approvals?: WorkflowApprovalRow[];
};

/**
 * Approval pendiente con su instancia + cadena completa de pasos.
 * Estructura devuelta por `GET /workflow/my-pending` (versión enriquecida).
 */
export type PendingApproval = WorkflowApprovalRow & {
  instance: WorkflowInstanceRow;
};

const apiFetch = async (path: string, token: string, init: RequestInit = {}) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(buildApiUrl(path), { ...init, headers });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const json = JSON.parse(text);
          message = json?.message ? (Array.isArray(json.message) ? json.message.join(", ") : String(json.message)) : text;
        } catch {
          message = text;
        }
      }
    } catch {
      // ignore parsing errors
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

/** Aprobaciones pendientes para el usuario logged-in. */
export const listMyPendingApprovals = async (token: string): Promise<PendingApproval[]> => {
  const data = await apiFetch("workflow/my-pending", token, { method: "GET" });
  return Array.isArray(data) ? (data as PendingApproval[]) : [];
};

/** Decide (aprobar/rechazar) un approval específico. */
export const decideApproval = async (
  token: string,
  approvalId: number,
  decision: "APPROVED" | "REJECTED",
  comments?: string,
): Promise<{ decided: boolean; complete?: boolean; cancelled?: boolean; nextStep?: number }> => {
  return apiFetch(`workflow/approvals/${approvalId}/decide`, token, {
    method: "POST",
    body: JSON.stringify({ decision, comments }),
  });
};

/** Obtiene una instancia completa (cadena + decisores). */
export const getWorkflowInstance = async (token: string, instanceId: number): Promise<WorkflowInstanceRow> => {
  return apiFetch(`workflow/instances/${instanceId}`, token, { method: "GET" });
};

/** Lista todas las instancias asociadas a una entidad concreta. */
export const listWorkflowInstancesForEntity = async (
  token: string,
  entityType: string,
  entityId: number,
): Promise<WorkflowInstanceRow[]> => {
  const data = await apiFetch(`workflow/entity/${encodeURIComponent(entityType)}/${entityId}`, token, { method: "GET" });
  return Array.isArray(data) ? (data as WorkflowInstanceRow[]) : [];
};

/* ──────────────────────────────────────────────────────────────────────
 *  Helpers de presentación
 * ────────────────────────────────────────────────────────────────────── */

const ENTITY_TYPE_LABEL: Record<string, string> = {
  PURCHASE_ORDER: "Compra",
  EXPENSE: "Gasto",
  VIATIC: "Viáticos",
  VIATICS: "Viáticos",
  QUOTE: "Cotización",
  COTIZACION: "Cotización",
  DISCOUNT: "Descuento",
  HIRING: "Contratación",
  VACATION: "Vacaciones",
  CONTRACT: "Contrato",
  PROJECT: "Proyecto",
};

export const labelForEntityType = (entityType: string): string => {
  const upper = (entityType || "").toUpperCase();
  return ENTITY_TYPE_LABEL[upper] || entityType.charAt(0).toUpperCase() + entityType.slice(1).toLowerCase();
};

/** Normaliza un nombre de aprobador desde step (rol o usuario). */
export const stepApproverLabel = (step?: WorkflowStepRow | null): string => {
  if (!step) return "—";
  if (step.approverUser?.nombre) return step.approverUser.nombre;
  if (step.approverRole?.nombre) return step.approverRole.nombre;
  return step.name || "Aprobador";
};

const formatDateShort = (iso?: string | null): string | undefined => {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    const today = new Date();
    const isSameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterday =
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate();
    const time = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    if (isSameDay) return `Hoy ${time}`;
    if (isYesterday) return `Ayer ${time}`;
    return d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return undefined;
  }
};

export type ApprovalChainStep = {
  rol: string;
  estado: "Aprobado" | "Pendiente" | "En espera" | "Rechazado";
  quien?: string;
  fecha?: string;
  isCurrent: boolean;
};

/** Genera la cadena visual (todos los pasos) a partir de la instancia. */
export const buildApprovalChain = (instance: WorkflowInstanceRow, currentApprovalId?: number): ApprovalChainStep[] => {
  const allSteps = instance.workflow?.steps ?? [];
  const approvalsByStepId = new Map<number, WorkflowApprovalRow>();
  for (const a of instance.approvals ?? []) {
    approvalsByStepId.set(a.stepId, a);
  }
  return allSteps.map((step) => {
    const approval = approvalsByStepId.get(step.id);
    const decidedDate = formatDateShort(approval?.decidedAt);
    let estado: ApprovalChainStep["estado"];
    if (approval?.status === "APPROVED") estado = "Aprobado";
    else if (approval?.status === "REJECTED") estado = "Rechazado";
    else if (approval?.status === "PENDING") estado = "Pendiente";
    else estado = "En espera";

    return {
      rol: stepApproverLabel(step),
      estado,
      quien: approval?.decidedBy?.nombre,
      fecha: decidedDate,
      isCurrent: approval?.id === currentApprovalId,
    };
  });
};

export const formatRequestedAt = (iso?: string | null): string => formatDateShort(iso) || "—";
