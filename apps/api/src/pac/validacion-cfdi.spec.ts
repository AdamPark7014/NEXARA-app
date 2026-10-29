import { validarCfdiParaTimbrar, validarComplementoPago } from './validacion-cfdi.js';

/** Lo que Core frena antes de llamar al PAC (el sandbox de Facturama no lo revisa contra el SAT). */

const BASE = {
  invoiceNumber: 'F-100',
  serie: 'A',
  folio: '100',
  total: 116,
  subtotal: 100,
  taxTotal: 16,
  currency: 'MXN',
  paymentForm: 'FP03',
  paymentMethod: 'PUE',
  cfdiUsage: 'G03',
  emisor: { rfc: 'NEE240925V73', name: 'NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT', regime: '601', zipCode: '72775' },
  receptor: { rfc: 'URE180429TM6', name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA', regime: 'R601', zipCode: '86991' },
  items: [{ description: 'Instalación', quantity: 1, unitPrice: 100, taxRate: 16, satProductKey: '72151605', satUnitKey: 'E48' }],
};
const con = (cambio: Record<string, unknown>) => ({ ...BASE, ...cambio }) as any;
const receptor = (cambio: Record<string, unknown>) => con({ receptor: { ...BASE.receptor, ...cambio } });
const problemas = (entrada: any) => validarCfdiParaTimbrar(entrada, 'NEE240925V73').join(' | ');

describe('validarCfdiParaTimbrar', () => {
  it('deja pasar una factura completa', () => {
    expect(validarCfdiParaTimbrar(BASE as any, 'NEE240925V73')).toEqual([]);
  });

  it('frena el uso que no corresponde al régimen del cliente', () => {
    expect(problemas(con({ cfdiUsage: 'D01' }))).toMatch(/uso D01 no es válido para un cliente con régimen 601/);
    expect(problemas(con({ cfdiUsage: 'P01' }))).toMatch(/P01 · Por definir» ya no existe/);
    expect(problemas(receptor({ rfc: 'CACX7605101P8', name: 'XOCHILT CASAS CHAVEZ', regime: '616' }))).toMatch(/616\) solo admite el uso S01/);
  });

  it('frena un régimen que no es del tipo de persona del RFC', () => {
    expect(problemas(receptor({ regime: '612' }))).toMatch(/es de persona física y el RFC del cliente es de empresa/);
    expect(problemas(receptor({ rfc: 'CACX7605101P8', name: 'XOCHILT CASAS CHAVEZ', regime: '601' }))).toMatch(/es de empresa y el RFC del cliente es de persona física/);
  });

  it('frena RFC mal escrito o con dígito verificador equivocado', () => {
    expect(problemas(receptor({ rfc: 'URE18042' }))).toMatch(/no tiene el formato del SAT/);
    expect(problemas(receptor({ rfc: 'URE180429TM5' }))).toMatch(/dígito verificador/);
  });

  it('frena la razón social con régimen de capital', () => {
    expect(problemas(receptor({ name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA S.A. DE C.V.' }))).toMatch(/régimen de capital/);
    expect(problemas(receptor({ name: 'GRUPO EJEMPLO SA DE CV' }))).toMatch(/régimen de capital/);
    expect(problemas(receptor({ name: 'CONSULTORES ASOCIADOS S.C.' }))).toMatch(/régimen de capital/);
  });

  it('RFC genérico: a un cliente sin RFC se le factura con su nombre; la global no está soportada', () => {
    // Sandbox 29-10: XAXX con su nombre timbra; con «PUBLICO EN GENERAL» Facturama exige InformacionGlobal.
    expect(validarCfdiParaTimbrar(receptor({ rfc: 'XAXX010101000', name: 'JUAN PEREZ LOPEZ', regime: null, zipCode: null }), 'NEE240925V73')).toEqual([]);
    expect(problemas(receptor({ rfc: 'XAXX010101000', name: 'PUBLICO EN GENERAL' }))).toMatch(/factura global al público en general/);
    expect(problemas(receptor({ rfc: 'XAXX010101000', name: '' }))).toMatch(/Falta el nombre del cliente/);
    expect(problemas(receptor({ rfc: 'XEXX010101000', name: 'FOREIGN INC' }))).toMatch(/extranjero/);
  });

  it('frena claves SAT con formato inválido', () => {
    const r = problemas(con({ items: [{ ...BASE.items[0], satProductKey: '1234', satUnitKey: '' }] }));
    expect(r).toMatch(/clave de producto o servicio del SAT debe tener 8 dígitos/);
    expect(r).toMatch(/falta la clave de unidad/);
  });

  it('frena totales que no cuadran con los conceptos e IEPS no soportado', () => {
    expect(problemas(con({ total: 120 }))).toMatch(/no cuadra con sus conceptos \(\$116.00\)/);
    expect(problemas(con({ items: [{ ...BASE.items[0], iepsRate: 8 }] }))).toMatch(/IEPS/);
  });

  it('cuadra varias partidas con descuento y sin IVA', () => {
    const items = [
      { description: 'Cámara', quantity: 4, unitPrice: 1250, discount: 500, taxRate: 16, satProductKey: '46171610', satUnitKey: 'H87' },
      { description: 'Instalación', quantity: 1, unitPrice: 2000, taxRate: 16, satProductKey: '72151605', satUnitKey: 'E48' },
      { description: 'Capacitación', quantity: 2, unitPrice: 300, taxRate: 0, satProductKey: '86101700', satUnitKey: 'E48' },
    ];
    // (5000-500)*1.16 + 2000*1.16 + 600 = 5220 + 2320 + 600
    expect(validarCfdiParaTimbrar(con({ items, total: 8140 }), 'NEE240925V73')).toEqual([]);
  });

  it('frena moneda extranjera sin tipo de cambio, PUE con 99 y emisor ajeno', () => {
    expect(problemas(con({ currency: 'USD' }))).toMatch(/tipo de cambio/);
    expect(problemas(con({ paymentForm: 'FP99' }))).toMatch(/no puede ser «99/);
    expect(validarCfdiParaTimbrar(BASE as any, 'EKU9003173C9').join(' ')).toMatch(/la empresa factura con EKU9003173C9/);
  });

  it('frena CP del cliente incompleto', () => {
    expect(problemas(receptor({ zipCode: '8699' }))).toMatch(/código postal fiscal del cliente debe tener 5 dígitos/);
  });
});

describe('validarComplementoPago', () => {
  const PAGO = {
    invoiceNumber: 'PAGO-F-100-7',
    serie: 'P',
    folio: '7',
    emisor: BASE.emisor,
    receptor: BASE.receptor,
    payment: { date: '2026-10-29T00:00:00.000Z', paymentForm: 'FP03', amount: 580, currency: 'MXN' },
    relatedDocs: [
      { uuid: '5e09160f-a206-44d7-b389-4f243585e76a', currency: 'MXN', paymentMethod: 'PPD', partialityNumber: 1, previousBalance: 1160, amountPaid: 580, remainingBalance: 580 },
    ],
  };

  it('deja pasar un pago parcial que cuadra', () => {
    expect(validarComplementoPago(PAGO as any, 'NEE240925V73')).toEqual([]);
  });

  it('frena pago mayor al saldo, saldo que no cuadra y forma 99', () => {
    const malo = {
      ...PAGO,
      payment: { ...PAGO.payment, paymentForm: 'FP99' },
      relatedDocs: [{ ...PAGO.relatedDocs[0], amountPaid: 2000, remainingBalance: 0 }],
    };
    const r = validarComplementoPago(malo as any, 'NEE240925V73').join(' | ');
    expect(r).toMatch(/forma real en que se pagó/);
    expect(r).toMatch(/es mayor que el saldo/);
    expect(r).toMatch(/saldo insoluto no cuadra/);
  });
});
