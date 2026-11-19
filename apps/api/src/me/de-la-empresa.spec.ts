import { deLaEmpresa } from './my-activities.service';

/** C3: «En espera de revisión» y las cadenas de mando leían todos los usuarios sin filtro de empresa. */
describe('usuarios de la empresa', () => {
  it('con empresa, filtra por membresía', () => {
    expect(deLaEmpresa(1)).toEqual({ companyMemberships: { some: { companyId: 1 } } });
  });
  it('sin empresa no recorta', () => {
    expect(deLaEmpresa(null)).toEqual({});
  });
});
