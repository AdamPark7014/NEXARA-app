import { claveSat, puedeTimbrar, revisarFactura, type FacturaARevisar } from './revision-factura.js';

const base: FacturaARevisar = {
  receptorRfc: 'CMO0903155K2',
  receptorName: 'COLEGIO MONTEBELLO',
  receptorRegime: 'R603',
  receptorZipCode: '72810',
  cfdiUsage: 'G03',
  satPaymentMethod: 'PPD',
  satPaymentForm: 'FP99',
  totalAmount: 18560,
  esAnticipo: false,
  cfdiRelationType: null,
  conceptos: [
    { unitPrice: 750, quantity: 16, total: 13920 },
    { unitPrice: 2500, quantity: 1, total: 2900 },
    { unitPrice: 500, quantity: 3, total: 1740 },
  ],
};

const niveles = (f: Partial<FacturaARevisar>, conectado = true) =>
  Object.fromEntries(revisarFactura({ ...base, ...f }, conectado).map((r) => [r.clave, r.nivel]));

describe('revisarFactura', () => {
  it('el caso del mockup no tiene errores y avisa del PPD', () => {
    const r = revisarFactura(base, true);
    expect(r.filter((x) => x.nivel === 'error')).toEqual([]);
    expect(r.find((x) => x.clave === 'ppd')?.nivel).toBe('aviso');
    expect(puedeTimbrar(r, true)).toBe(true);
  });

  it('con PPD la forma tiene que ser 99, y con PUE no', () => {
    expect(niveles({ satPaymentForm: 'FP03' }).forma).toBe('error');
    expect(niveles({ satPaymentMethod: 'PUE', satPaymentForm: 'FP99' }).forma).toBe('error');
    expect(niveles({ satPaymentMethod: 'PUE', satPaymentForm: 'FP03' }).forma).toBeUndefined();
  });

  it('sin CP, régimen o precio no se timbra', () => {
    expect(niveles({ receptorZipCode: '' }).cp).toBe('error');
    expect(niveles({ receptorRegime: null }).regimen).toBe('error');
    const sinPrecio = revisarFactura({ ...base, conceptos: [{ unitPrice: 0, quantity: 1, total: 0 }], totalAmount: 0 }, true);
    expect(puedeTimbrar(sinPrecio, true)).toBe(false);
  });

  it('el régimen 616 solo admite S01', () => {
    expect(niveles({ receptorRegime: '616' }).regimen).toBe('error');
    expect(niveles({ receptorRegime: '616', cfdiUsage: 'S01' }).regimen).toBe('ok');
  });

  it('si los conceptos no suman el total, lo dice', () => {
    expect(niveles({ totalAmount: 18000 }).cuadre).toBe('error');
  });

  it('sin timbrado conectado se revisa pero no se timbra', () => {
    const r = revisarFactura(base, false);
    expect(r.find((x) => x.clave === 'timbrado')?.nivel).toBe('aviso');
    expect(puedeTimbrar(r, false)).toBe(false);
  });

  it('claveSat quita el prefijo de los enums', () => {
    expect(claveSat('R601')).toBe('601');
    expect(claveSat('FP03')).toBe('03');
    expect(claveSat(null)).toBe('');
  });
});
