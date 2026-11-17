import { sentidoCfdi, coincideImporte, dentroDeDias } from './ingest-cfdi';
import type { CfdiLeido } from '../mesa-contable/cfdi-xml';

const base: CfdiLeido = {
  uuid: '11111111-1111-1111-1111-111111111111', version: '4.0', fecha: '2026-11-16',
  serie: null, folio: null, tipo: 'I', moneda: 'MXN', subtotal: 100, descuento: 0, total: 116,
  iva: 16, otrosTraslados: 0, ivaRetenido: 0, isrRetenido: 0, retenciones: 0,
  metodoPago: 'PUE', formaPago: '03',
  emisor: { rfc: 'ABC880101XXX', nombre: 'Prov', regimen: '601' },
  receptor: { rfc: 'NEX010101AAA', nombre: 'Nexara', cp: '72775', uso: 'G03' },
};

describe('ingest-cfdi', () => {
  it('sentido', () => {
    expect(sentidoCfdi(base, 'NEX010101AAA')).toBe('recibido');
    expect(sentidoCfdi({ ...base, emisor: { ...base.emisor, rfc: 'NEX010101AAA' }, receptor: { ...base.receptor, rfc: 'ABC880101XXX' } }, 'NEX010101AAA')).toBe('emitido');
  });
  it('importe y dias', () => {
    expect(coincideImporte(100, 100.5)).toBe(true);
    expect(dentroDeDias('2026-11-10', '2026-11-16', 7)).toBe(true);
  });
});