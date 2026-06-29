/**
 * Motor de aprobación jerárquica compartido (viáticos, vehículos, multas).
 * CEO siempre es paso final.
 */
import { getRequiredApprovers, type ApprovalStep } from './approval-policy.js';
import { ROLES, type RoleKey } from './roles.v2.js';

export type ApprovalFlowKind = 'viaticos' | 'compras' | 'vehicles' | 'multas';

export type TrailEntry = {
  role: string;
  userId: number;
  userName?: string;
  action: 'approve' | 'reject';
  at: string;
  note?: string;
};

export function buildApprovalChain(flow: ApprovalFlowKind, amountMxn = 0): ApprovalStep[] {
  const base = getRequiredApprovers(flow, amountMxn);
  const withoutCeo = base.filter((s) => s.role !== ROLES.CEO);
  const ceoStep = base.find((s) => s.role === ROLES.CEO) ?? {
    role: ROLES.CEO,
    label: 'CEO — Autorización final',
    isFinal: true,
  };
  return [...withoutCeo, { ...ceoStep, isFinal: true }];
}

export function stepRoleAt(chain: ApprovalStep[], stepIndex: number): RoleKey | null {
  return chain[stepIndex]?.role ?? null;
}

export function canActOnStep(actorRole: RoleKey | null, stepIndex: number, chain: ApprovalStep[]): boolean {
  if (!actorRole) return false;
  if (actorRole === ROLES.SUPER_ADMIN || actorRole === ROLES.CEO) {
    const expected = stepRoleAt(chain, stepIndex);
    return expected === actorRole || actorRole === ROLES.SUPER_ADMIN;
  }
  return stepRoleAt(chain, stepIndex) === actorRole;
}

export function isTerminalApproved(stepIndex: number, chain: ApprovalStep[]): boolean {
  return stepIndex >= chain.length;
}

export function appendTrail(trail: TrailEntry[] | null | undefined, entry: TrailEntry): TrailEntry[] {
  return [...(Array.isArray(trail) ? trail : []), entry];
}
