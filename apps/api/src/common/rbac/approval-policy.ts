/**
 * NEXARA · RBAC v2 — Política de Aprobaciones Jerárquicas
 * --------------------------------------------------------
 * Flujos:
 *   1. VIÁTICOS  (Ing. Campo → Admin → Coord.Admin → Dir.Admin → CEO)
 *   2. EVIDENCIAS / ACTIVIDADES (Ing. Campo → Coord.Ops → Admin → Coord.Admin)
 *   3. COTIZACIONES (Vendedor → Coord.Ventas → Dir.Ops → CEO)
 *   4. COMPRAS / PROCUREMENT (Solicitante → Coord.Admin → Dir.Admin → CEO)
 *
 * Los umbrales en MXN son CONFIGURABLES desde /core/configuracion/aprobaciones
 * (tabla `ApprovalThreshold` en BD). Aquí solo se exponen los defaults.
 */
import { ROLES, type RoleKey } from './roles.v2';

export type ApprovalFlow = 'viaticos' | 'evidencias' | 'cotizaciones' | 'compras' | 'vehicles' | 'multas';

export type ApprovalStep = {
  /** Rol que aprueba este paso. */
  role: RoleKey;
  /** Si está definido, este paso solo aplica si el monto >= threshold. */
  thresholdMxn?: number;
  /** Descripción humana del paso. */
  label: string;
  /** ¿Es el paso terminal por defecto? (si nadie más matchea). */
  isFinal?: boolean;
};

/**
 * Cadenas de aprobación por flujo (orden ascendente).
 * Se evalúa secuencialmente: un paso aplica si su threshold se cumple.
 * Pasos sin threshold SIEMPRE aplican.
 */
export const APPROVAL_CHAINS: Record<ApprovalFlow, ApprovalStep[]> = {
  // ─── VIÁTICOS ────────────────────────────────────────────────────
  viaticos: [
    { role: ROLES.ADMINISTRATIVO,    label: 'Revisión administrativa' },           // siempre
    { role: ROLES.COORD_ADMIN,       label: 'Coordinación administrativa' },       // siempre
    { role: ROLES.DIR_ADMIN,         thresholdMxn: 10_000,  label: 'Dir. Administrativo' },
    { role: ROLES.CEO,               thresholdMxn: 50_000,  label: 'CEO', isFinal: true },
  ],

  // ─── EVIDENCIAS / ACTIVIDADES DE CAMPO ───────────────────────────
  evidencias: [
    { role: ROLES.COORD_OPERACIONES, label: 'Coordinador de Operaciones (técnico)' },
    { role: ROLES.ADMINISTRATIVO,    label: 'Documentación administrativa' },
    { role: ROLES.COORD_ADMIN,       label: 'Archivo y cierre', isFinal: true },
  ],

  // ─── COTIZACIONES / VENTAS ───────────────────────────────────────
  cotizaciones: [
    { role: ROLES.COORD_VENTAS,      thresholdMxn: 50_000,   label: 'Coord. Ventas' },
    { role: ROLES.DIR_OPERACIONES,   thresholdMxn: 250_000,  label: 'Dir. Operaciones (validación técnica)' },
    { role: ROLES.CEO,               thresholdMxn: 1_000_000, label: 'CEO', isFinal: true },
  ],

  // ─── COMPRAS / PROCUREMENT ───────────────────────────────────────
  compras: [
    { role: ROLES.COORD_ADMIN,       label: 'Coordinación administrativa' },
    { role: ROLES.DIR_ADMIN,         thresholdMxn: 25_000,   label: 'Dir. Administrativo' },
    { role: ROLES.CEO,               thresholdMxn: 200_000,  label: 'CEO', isFinal: true },
  ],

  // ─── VEHÍCULOS (Operaciones → Arquitecto → Admin → CEO) ─────────
  vehicles: [
    { role: ROLES.COORD_OPERACIONES, label: 'Coordinación de Operaciones' },
    { role: ROLES.ARQUITECTO,        label: 'Arquitecto / validación técnica' },
    { role: ROLES.ADMINISTRATIVO,    label: 'Administración' },
    { role: ROLES.CEO,               label: 'CEO — Autorización final', isFinal: true },
  ],

  // ─── MULTAS ──────────────────────────────────────────────────────
  multas: [
    { role: ROLES.COORD_OPERACIONES, label: 'Operaciones — pre-autorización' },
    { role: ROLES.ADMINISTRATIVO,    label: 'Administración' },
    { role: ROLES.CEO,               label: 'CEO — Autorización final', isFinal: true },
  ],
};

/**
 * Calcula los pasos requeridos para un monto dado en un flujo.
 * Pasos sin threshold siempre se incluyen; con threshold solo si amount >= threshold.
 */
export function getRequiredApprovers(flow: ApprovalFlow, amountMxn = 0): ApprovalStep[] {
  return APPROVAL_CHAINS[flow].filter(
    step => step.thresholdMxn == null || amountMxn >= step.thresholdMxn,
  );
}

/** ¿Este rol puede aprobar este paso? */
export function canApproveStep(role: RoleKey, step: ApprovalStep): boolean {
  return role === step.role || role === ROLES.SUPER_ADMIN;
}
