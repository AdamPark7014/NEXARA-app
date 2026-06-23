/**
 * NEXARA · RBAC v2 — Entry point
 *
 * Importa SIEMPRE desde aquí:
 *   import { ROLES, checkUrlAccess, getRequiredApprovers } from 'src/common/rbac';
 */
export * from './roles.v2';
export * from './url-matrix';
export * from './approval-policy';
export { UrlAccessGuard } from './url-access.guard';
