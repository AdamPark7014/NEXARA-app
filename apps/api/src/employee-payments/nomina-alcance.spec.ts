import {
  configDeViewer,
  esContadoraNomina,
  esRhNomina,
  filtrarPersonasNomina,
  modoAlcanceContadora,
  parsearMapaAlcance,
  veNominaCompleta,
  type PersonaNomina,
} from './nomina-alcance.js';

const personas: PersonaNomina[] = [
  { id: 1, roleKey: 'ceo', email: 'ceo@nexara.com.mx' },
  { id: 2, roleKey: 'rh', email: 'rh@nexara.com.mx' },
  { id: 3, roleKey: 'ing_campo', email: 'joan@nexara.com.mx' },
  { id: 4, roleKey: 'administrativo', email: 'soluciones@nexara.com.mx' },
  { id: 7, roleKey: 'dir_operaciones', email: 'direccion.operaciones@nexara.com.mx' },
];

describe('nomina-alcance', () => {
  it('rh y ceo ven nómina completa; Mónica no; Paulina sí como contadora', () => {
    expect(esRhNomina({ id: 2, roleKey: 'rh' })).toBe(true);
    expect(veNominaCompleta({ id: 1, roleKey: 'ceo' })).toBe(true);
    expect(esContadoraNomina({ id: 9, roleKey: 'administrativo', email: 'finanzas@nexara.com.mx' })).toBe(true);
    expect(esContadoraNomina({ id: 8, roleKey: 'administrativo', email: 'soluciones@nexara.com.mx' })).toBe(false);
    expect(veNominaCompleta({ id: 8, roleKey: 'administrativo', email: 'soluciones@nexara.com.mx' })).toBe(false);
  });

  it('rh ve a toda la plantilla; Mónica no ve a nadie', () => {
    expect(filtrarPersonasNomina(personas, { id: 2, roleKey: 'rh' }).map((p) => p.id)).toEqual([1, 2, 3, 4, 7]);
    expect(filtrarPersonasNomina(personas, { id: 8, roleKey: 'administrativo', email: 'soluciones@nexara.com.mx' })).toEqual([]);
  });

  it('contadora por omisión excluye dirección y RH; con userIds solo esos', () => {
    const paulina = { id: 9, roleKey: 'administrativo', email: 'finanzas@nexara.com.mx' };
    expect(filtrarPersonasNomina(personas, paulina).map((p) => p.id)).toEqual([3, 4]);
    expect(filtrarPersonasNomina(personas, paulina, { userIds: [3] }).map((p) => p.id)).toEqual([3]);
  });

  it('parsearMapaAlcance y modo por omisión totales', () => {
    expect(parsearMapaAlcance('{')).toEqual({});
    const mapa = parsearMapaAlcance(
      JSON.stringify({ 'finanzas@nexara.com.mx': { userIds: [3, 4], modo: 'totales' } }),
    );
    expect(configDeViewer(mapa, { id: 9, email: 'Finanzas@nexara.com.mx' })?.userIds).toEqual([3, 4]);
    expect(modoAlcanceContadora(null)).toBe('totales');
    expect(modoAlcanceContadora({ modo: 'completo' })).toBe('completo');
  });
});

it('alcance vacío deniega todo y un correo de otro dominio no es Paulina', () => {
  const v = { id: 9, roleKey: 'administrativo', email: 'finanzas@nexara.com.mx' };
  expect(filtrarPersonasNomina(personas, v, { userIds: [] })).toEqual([]);
  expect(esContadoraNomina({ ...v, email: 'finanzas@otra.com' })).toBe(false);
  expect(esContadoraNomina({ ...v, isSuperAdmin: true })).toBe(false);
});
