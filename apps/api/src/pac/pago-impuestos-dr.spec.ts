import { impuestosDrDePago, xmlNodosImpuestosDr } from './pago-impuestos-dr';

describe('pago-impuestos-dr', () => {
  it('16%', () => { const r = impuestosDrDePago(1160, 16); expect(r.base).toBe(1000); expect(r.importe).toBe(160); expect(r.tipoFactor).toBe('Tasa'); });
  it('8%', () => { const r = impuestosDrDePago(1080, 8); expect(r.base).toBe(1000); expect(r.importe).toBe(80); });
  it('0%', () => { const r = impuestosDrDePago(1000, 0); expect(r.base).toBe(1000); expect(r.importe).toBe(0); });
  it('exento', () => { const r = impuestosDrDePago(1000, 16, { exento: true }); expect(r.tipoFactor).toBe('Exento'); expect(r.tasa).toBeNull(); expect(r.importe).toBe(0); });
  it('default 16', () => { const r = impuestosDrDePago(1160, undefined); expect(r.base).toBe(1000); expect(r.importe).toBe(160); });
  it('xml tasa', () => { const xml = xmlNodosImpuestosDr(impuestosDrDePago(1160, 16)); expect(xml).toContain('TasaOCuotaDR=\"0.160000\"'); expect(xml).toContain('BaseDR=\"1000.00\"'); });
  it('xml exento sin tasa', () => { const xml = xmlNodosImpuestosDr(impuestosDrDePago(1000, null, { exento: true })); expect(xml).not.toContain('TasaOCuotaDR'); });
});