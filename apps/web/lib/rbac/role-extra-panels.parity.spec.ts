import { ROLE_EXTRA_PANELS as WEB } from './roles';
// Espejo API — import relativo al paquete web no aplica; duplicamos claves críticas.
// La fuente de verdad de este spec es: web debe igualar API (Fortify/Armor).

const API_ROLE_EXTRA_PANELS: Record<string, string[]> = {
  super_admin: ['core', 'sales', 'ops', 'studio', 'portal', 'lab', 'integra'],
  ceo: ['core', 'sales', 'ops', 'studio', 'lab', 'integra'],
  arquitecto: ['ops', 'core', 'sales', 'integra'],
  dir_operaciones: ['core', 'ops', 'sales', 'integra'],
  dir_admin: ['core', 'sales'],
  coord_admin: ['core', 'sales'],
  administrativo: ['core'],
  rh: ['core'],
  contabilidad: ['core'],
  coord_operaciones: ['ops', 'core', 'integra'],
  ing_campo: ['ops'],
  ing_soporte: ['ops', 'core', 'integra'],
  coord_ventas: ['sales', 'core'],
  vendedor: ['sales'],
  lider_diseno: ['studio', 'core'],
  disenador: ['studio'],
  cliente: ['portal', 'integra'],
};

describe('ROLE_EXTRA_PANELS parity API↔web (Armor)', () => {
  it('mismas claves de rol', () => {
    expect(Object.keys(WEB).sort()).toEqual(Object.keys(API_ROLE_EXTRA_PANELS).sort());
  });

  it('mismos paneles extra por rol', () => {
    for (const role of Object.keys(API_ROLE_EXTRA_PANELS)) {
      expect([...(WEB as any)[role]].sort()).toEqual(
        [...API_ROLE_EXTRA_PANELS[role]].sort(),
      );
    }
  });

  it('cliente incluye integra (lectura)', () => {
    expect(WEB.cliente).toContain('integra');
    expect(WEB.cliente).toContain('portal');
  });
});
