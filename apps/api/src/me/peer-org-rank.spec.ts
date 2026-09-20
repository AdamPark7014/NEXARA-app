import { ROLE_TIER, type RoleKey } from '../common/rbac/roles.v2.js';
import { canPeerRequestTarget, orgRankFromPuesto, orgRankFromRoleKey, orgRankOf } from './peer-org-rank.js';

describe('peer-org-rank', () => {
  it('usa ROLE_TIER para roleKey conocido', () => {
    expect(orgRankFromRoleKey('ing_campo')).toBe(ROLE_TIER.ing_campo as number);
    expect(orgRankFromRoleKey('ceo')).toBe(ROLE_TIER.ceo as number);
    expect(orgRankFromRoleKey('no-existe')).toBe(0);
  });

  it('heurística de puesto en español', () => {
    expect(orgRankFromPuesto('Director de Operaciones')).toBe(90);
    expect(orgRankFromPuesto('Coordinador de campo')).toBe(70);
    expect(orgRankFromPuesto('Técnico instalador')).toBe(40);
    expect(orgRankFromPuesto(null)).toBe(0);
  });

  it('toma el máximo entre puesto y roleKey', () => {
    const u = { roleKey: 'ing_campo' as RoleKey, puesto: 'Coordinador' };
    expect(orgRankOf(u)).toBe(70);
  });

  it('solo permite destino mismo rango o superior', () => {
    const tecnico = { roleKey: 'ing_campo', puesto: null };
    const coord = { roleKey: 'coord_operaciones', puesto: null };
    expect(canPeerRequestTarget(tecnico, tecnico)).toBe(true);
    expect(canPeerRequestTarget(tecnico, coord)).toBe(true);
    expect(canPeerRequestTarget(coord, tecnico)).toBe(false);
  });
});
