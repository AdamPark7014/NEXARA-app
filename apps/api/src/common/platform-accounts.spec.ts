import {
  isNonEmployeeEmail,
  sinActividades,
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
