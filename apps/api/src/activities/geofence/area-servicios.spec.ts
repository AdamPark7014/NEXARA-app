import { esDepartamentoServicios } from './area-servicios';

describe('área de Servicios', () => {
  it('reconoce el departamento Servicios', () => {
    expect(esDepartamentoServicios('Servicios')).toBe(true);
    expect(esDepartamentoServicios(' servicios ')).toBe(true);
    expect(esDepartamentoServicios('SERVICIOS')).toBe(true);
  });

  it('las demás áreas no entran', () => {
    expect(esDepartamentoServicios('Sistemas')).toBe(false);
    expect(esDepartamentoServicios('Administración')).toBe(false);
    expect(esDepartamentoServicios('Ingeniería')).toBe(false);
    expect(esDepartamentoServicios('Operaciones')).toBe(false);
    expect(esDepartamentoServicios(null)).toBe(false);
    expect(esDepartamentoServicios('')).toBe(false);
  });
});
