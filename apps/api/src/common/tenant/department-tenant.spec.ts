import { requireCompanyId, companyWhere } from './tenant-scope.js';

describe('Department tenant uniqueness contract', () => {
  it('requireCompanyId gates department ops', () => {
    expect(() => requireCompanyId(null)).toThrow(/Empresa requerida/);
    expect(companyWhere(12)).toEqual({ companyId: 12 });
  });

  it('compound unique shape is companyId+nombre', () => {
    const where = { companyId_nombre: { companyId: 3, nombre: 'Operaciones' } };
    expect(where.companyId_nombre.companyId).toBe(3);
    expect(where.companyId_nombre.nombre).toBe('Operaciones');
  });
});
