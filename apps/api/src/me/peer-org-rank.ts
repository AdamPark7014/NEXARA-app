import { ROLE_TIER, RoleKey } from '../common/rbac/roles.v2.js';

export function orgRankFromRoleKey(roleKey: string | null | undefined): number {
  if (!roleKey || !(roleKey in ROLE_TIER)) return 0;
  return ROLE_TIER[roleKey as RoleKey];
}

export function orgRankFromPuesto(puesto: string | null | undefined): number {
  if (!puesto) return 0;
  const lowerPuesto = puesto.toLowerCase();
  if (lowerPuesto.includes('director') || lowerPuesto.includes('ceo') || lowerPuesto.includes('dirección general')) return 90;
  if (lowerPuesto.includes('coordinador') || lowerPuesto.includes('encargado') || lowerPuesto.includes('líder') || lowerPuesto.includes('lider')) return 70;
  if (lowerPuesto.includes('ingeniero') || lowerPuesto.includes('técnico') || lowerPuesto.includes('tecnico') || lowerPuesto.includes('auxiliar') || lowerPuesto.includes('instalador')) return 40;
  return 30;
}

export function orgRankOf(user: { roleKey?: string | null; puesto?: string | null }): number {
  const roleRank = orgRankFromRoleKey(user.roleKey);
  const puestoRank = orgRankFromPuesto(user.puesto);
  return Math.max(roleRank, puestoRank);
}

export function canPeerRequestTarget(from: { roleKey?: string | null; puesto?: string | null }, to: { roleKey?: string | null; puesto?: string | null }): boolean {
  // Peer requests go to same org rank or higher (peers/seniors); subordinates are assigned via normal OT, not this path.
  // Boss-assigned OT reject stays 403 elsewhere.
  return orgRankOf(to) >= orgRankOf(from);
}