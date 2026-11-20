import {
  isNonEmployeeEmail,
  noSeMide,
  sinActividades,
  sinChecador,
  DIRECCION_GENERAL_EMAIL,
  PLATFORM_OWNER_EMAIL,
} from './platform-accounts.js';

describe('sinActividades', () => {
  it('dirección / plataforma (Christian, Getzemani) no llevan actividades', () => {
    expect(sinActividades({ email: PLATFORM_OWNER_EMAIL, roleKey: 'ceo' })).toBe(true);
    expect(sinActividades({ email: DIRECCION_GENERAL_EMAIL, roleKey: 'ceo' })).toBe(true);
    expect(isNonEmployeeEmail(PLATFORM_OWNER_EMAIL)).toBe(true);
  });

  it('Tere (rh) no es asignable ni de pizarra, pero sí es personal', () => {
    const tere = { email: 'tere.garcia@nexara.com.mx', roleKey: 'rh' };
    expect(sinActividades(tere)).toBe(true);
    expect(isNonEmployeeEmail(tere.email)).toBe(false);
  });

  it('Luis y Liz sí llevan actividades', () => {
    expect(sinActividades({ email: 'direccion.operaciones@nexara.com.mx', roleKey: 'dir_operaciones' })).toBe(false);
    expect(sinActividades({ email: 'lizeth.antonio@nexara.com.mx', roleKey: 'coord_admin' })).toBe(false);
  });

  it('técnico de campo no queda fuera', () => {
    expect(sinActividades({ email: 'joan.sanchez@nexara.com.mx', roleKey: 'ing_campo' })).toBe(false);
  });
});

describe('noSeMide', () => {
  it('Tere y Liz no salen en KPIs; Liz sigue siendo asignable', () => {
    expect(noSeMide({ email: 'tere.garcia@nexara.com.mx', roleKey: 'rh' })).toBe(true);
    expect(noSeMide({ email: 'lizeth.antonio@nexara.com.mx', roleKey: 'coord_admin' })).toBe(true);
    expect(sinActividades({ email: 'lizeth.antonio@nexara.com.mx', roleKey: 'coord_admin' })).toBe(false);
  });
  it('tecnico si se mide', () => {
    expect(noSeMide({ email: 'joan.sanchez@nexara.com.mx', roleKey: 'ing_campo' })).toBe(false);
  });
});

describe('sinChecador', () => {
  it('direccion y Tere no checan; Liz si', () => {
    expect(sinChecador({ email: PLATFORM_OWNER_EMAIL, roleKey: 'ceo' })).toBe(true);
    expect(sinChecador({ email: 'tere.garcia@nexara.com.mx', roleKey: 'rh' })).toBe(true);
    expect(sinChecador({ email: 'lizeth.antonio@nexara.com.mx', roleKey: 'coord_admin' })).toBe(false);
  });
});