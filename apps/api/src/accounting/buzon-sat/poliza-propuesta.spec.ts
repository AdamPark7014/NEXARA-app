import { proponerPolizaRecibido } from './poliza-propuesta';
import { CUENTAS } from '../mesa-contable/polizas-mesa';

describe('proponerPolizaRecibido', () => {
  it('usa historial con confianza alta', () => {
    const p = proponerPolizaRecibido({
      total: 116, iva: 16, cuentaGastoCodigo: '601.02', cuentaDesdeHistorial: true,
    });
    expect(p.confianza).toBe('alta');
    expect(p.cuentaGastoCodigo).toBe('601.02');
    expect(p.renglones.some((r) => r.codigo === CUENTAS.proveedores && r.haber > 0)).toBe(true);
  });
  it('sin historial usa gastos admin', () => {
    const p = proponerPolizaRecibido({ total: 116, iva: 16 });
    expect(p.cuentaGastoCodigo).toBe(CUENTAS.gastosAdministracion);
    expect(p.confianza).toBe('baja');
  });
});