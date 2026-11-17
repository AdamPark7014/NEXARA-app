import { APPROVAL_CHAINS, canApproveStep, getRequiredApprovers } from './approval-policy.js';
import { ROLES } from './roles.v2.js';

describe('approval-policy (viaticos y vehicles 15-11-2026)', () => {
  it('viaticos: solo coord_admin y luego ceo, sin umbral', () => {
    const steps = getRequiredApprovers('viaticos', 0);
    expect(steps.map((s) => s.role)).toEqual([ROLES.COORD_ADMIN, ROLES.CEO]);
    expect(steps[0].label).toBe('Gestión de viáticos');
    expect(steps[1].isFinal).toBe(true);
    expect(getRequiredApprovers('viaticos', 999_999)).toEqual(steps);
    expect(APPROVAL_CHAINS.viaticos).toHaveLength(2);
  });

  it('vehicles: solo coord_admin y luego ceo, final directo', () => {
    const steps = getRequiredApprovers('vehicles', 0);
    expect(steps.map((s) => s.role)).toEqual([ROLES.COORD_ADMIN]);
    expect(steps[0].label).toBe('Gestión de vehículos (Liz)');
    expect(steps[0].isFinal).toBe(true);
  });

  it('evidencias sigue con tres pasos e incluye coord_operaciones', () => {
    const steps = getRequiredApprovers('evidencias');
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.role)).toContain(ROLES.COORD_OPERACIONES);
  });

  it('canApproveStep respeta el rol del paso; super_admin aprueba cualquiera', () => {
    const primero = APPROVAL_CHAINS.viaticos[0];
    expect(canApproveStep(ROLES.COORD_ADMIN, primero)).toBe(true);
    expect(canApproveStep(ROLES.ADMINISTRATIVO, primero)).toBe(false);
    expect(canApproveStep(ROLES.SUPER_ADMIN, primero)).toBe(true);
  });
});