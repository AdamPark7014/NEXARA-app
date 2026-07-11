/**
 * Handoff CRM ↔ OPS: un mismo proyecto de negocio, dos facetas.
 *
 * Ownership:
 *  - Identidad compartida (nombre, tipo, scope, sitios, fechas plan):
 *    last-write-wins según el panel que edita; se propaga al otro lado.
 *  - Status: mapeo bidireccional (enums distintos).
 *  - Campo (ingenieros, OTs, actualEndDate): solo OPS.
 *  - Comercial (budget, margen, orden, factura): solo CRM.
 */
import type { OperationalProjectStatus, SalesProjectStatus, ServiceProjectType } from '@prisma/client';

export function salesStatusToOps(status: SalesProjectStatus | string): OperationalProjectStatus {
  switch (status) {
    case 'ON_HOLD':
      return 'ON_HOLD';
    case 'CLOSED':
      return 'COMPLETED';
    case 'PLANNED':
    case 'IN_PROGRESS':
    default:
      return 'ACTIVE';
  }
}

export function opsStatusToSales(status: OperationalProjectStatus | string): SalesProjectStatus {
  switch (status) {
    case 'ON_HOLD':
      return 'ON_HOLD';
    case 'COMPLETED':
      return 'CLOSED';
    case 'ACTIVE':
    default:
      return 'IN_PROGRESS';
  }
}

export type SharedSalesIdentity = {
  name: string;
  projectType: ServiceProjectType;
  scopeSummary: string | null;
  siteCount: number | null;
  startDate: Date | null;
  endDate: Date | null;
  status: SalesProjectStatus;
};

export type SharedOpsIdentity = {
  title: string;
  projectType: ServiceProjectType;
  scopeSummary: string | null;
  siteCount: number | null;
  startDate: Date;
  endDate: Date | null;
  status: OperationalProjectStatus;
};

/** Campos OPS a escribir cuando CRM es la fuente. */
export function opsPatchFromSales(sales: SharedSalesIdentity): {
  title: string;
  projectType: ServiceProjectType;
  scopeSummary: string | null;
  siteCount: number | null;
  startDate: Date;
  endDate: Date | null;
  status: OperationalProjectStatus;
} {
  return {
    title: sales.name,
    projectType: sales.projectType,
    scopeSummary: sales.scopeSummary,
    siteCount: sales.siteCount,
    startDate: sales.startDate || new Date(),
    endDate: sales.endDate,
    status: salesStatusToOps(sales.status),
  };
}

/** Campos CRM a escribir cuando OPS es la fuente. */
export function salesPatchFromOps(ops: SharedOpsIdentity): {
  name: string;
  projectType: ServiceProjectType;
  scopeSummary: string | null;
  siteCount: number | null;
  startDate: Date;
  endDate: Date | null;
  status: SalesProjectStatus;
} {
  return {
    name: ops.title,
    projectType: ops.projectType,
    scopeSummary: ops.scopeSummary,
    siteCount: ops.siteCount,
    startDate: ops.startDate,
    endDate: ops.endDate,
    status: opsStatusToSales(ops.status),
  };
}
