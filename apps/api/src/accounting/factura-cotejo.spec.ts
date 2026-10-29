import { BadRequestException } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';

/**
 * El cotejo al pagar, el timbre sin UUID, la balanza, el catálogo SAT y el
 * sello salen en una frase. El estado, el proveedor y el folio salen del dato real.
 */

const EMPRESA = 7;

function servicio(prisma: object, pac: object = {}, sat: object = {}) {
  return new AccountingService(
    prisma as never,
    {} as never,
    pac as never,
    sat as never,
    { next: jest.fn() } as never,
    {} as never,
  );
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

describe('factura · cotejo y timbre en una frase', () => {
  it('el cotejo pendiente y el timbre sin UUID se dicen en una frase', async () => {
    const pending = await pagar('PENDING');
    expect(pending.error).toBeInstanceOf(BadRequestException);
    expect(mensaje(pending.error)).toBe(
      '3-way match pendiente (PENDING): resuelve variaciones o exime el match antes de pagar.',
    );
    expect(pending.pagoCreado).toBe(false);

    const variance = await pagar('VARIANCE');
    expect(mensaje(variance.error)).toBe(
      '3-way match pendiente (VARIANCE): resuelve variaciones o exime el match antes de pagar.',
    );

    for (const estado of ['MATCHED', 'WAIVED', 'NOT_REQUIRED'] as const) {
      const seguido = await pagar(estado);
      expect(mensaje(seguido.error)).not.toContain('3-way match');
      expect(seguido.pagoCreado).toBe(true);
    }

    const sinOrden = await pagar('PENDING', { sinOrdenNiRecepcion: true });
    expect(mensaje(sinOrden.error)).not.toContain('3-way match');
    expect(sinOrden.pagoCreado).toBe(true);

    const sw = await timbrar({ provider: 'sw', folio: 'A-100' });
    expect(sw.error).toBeInstanceOf(BadRequestException);
    expect(mensaje(sw.error)).toBe(
      'El proveedor de timbrado (sw) respondió sin UUID: la factura A-100 quedó en «timbrando» para evitar un doble timbrado; revisa en el portal del proveedor si se emitió antes de reintentar.',
    );
    expect(sw.volvioABorrador).toBe(false);
    expect(sw.quedoTimbrando).toBe(true);

    const finkok = await timbrar({ provider: 'finkok', folio: 'B-200' });
    expect(mensaje(finkok.error)).toBe(
      'El proveedor de timbrado (finkok) respondió sin UUID: la factura B-200 quedó en «timbrando» para evitar un doble timbrado; revisa en el portal del proveedor si se emitió antes de reintentar.',
    );
    expect(finkok.volvioABorrador).toBe(false);
  });

  it('deja en una frase la balanza, el catálogo SAT y el sello', async () => {
    const cuentas = [
      { id: 1, code: '1000', name: 'Caja', type: 'ASSET', satAgrupador: null },
      { id: 2, code: '2000', name: 'Proveedores', type: 'LIABILITY', satAgrupador: null },
    ];
    const prisma = { account: { findMany: jest.fn().mockResolvedValue(cuentas) } };
    const service = servicio(prisma);

    await expect(service.exportBalanzaXml(10, 2026, EMPRESA)).rejects.toThrow(
      'Faltan 2 cuenta(s) sin agrupador SAT asignado: complétalas antes de exportar la Balanza.',
    );
    await expect(service.exportCatalogoCuentasXml(EMPRESA)).rejects.toThrow(
      'Faltan 2 cuenta(s) sin agrupador SAT asignado: complétalas antes de exportar el Catálogo de cuentas.',
    );

    const una = servicio({
      account: {
        findMany: jest.fn().mockResolvedValue([cuentas[0]]),
      },
    });
    await expect(una.exportBalanzaXml(10, 2026, EMPRESA)).rejects.toThrow(
      'Faltan 1 cuenta(s) sin agrupador SAT asignado: complétalas antes de exportar la Balanza.',
    );

    const previo = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const sinSello = servicio(
        {},
        { provider: 'sw', fallbackToMock: false, csdInfo: () => ({ configured: false }) },
        { isEfirmaConfigured: () => false },
      );
      expect(sinSello.getPacInfo().productionWarning).toBe(
        'Falta el certificado de sello digital: sin él las facturas no se pueden sellar.',
      );

      const conSello = servicio(
        {},
        { provider: 'sw', fallbackToMock: false, csdInfo: () => ({ configured: true }) },
        { isEfirmaConfigured: () => true },
      );
      expect(conSello.getPacInfo().productionWarning ?? '').not.toContain('certificado de sello digital');
    } finally {
      process.env.NODE_ENV = previo;
    }
  });
});

async function pagar(
  matchStatus: string,
  opts: { sinOrdenNiRecepcion?: boolean } = {},
): Promise<{ error: unknown; pagoCreado: boolean }> {
  const tx = {
    $executeRaw: jest.fn(),
    invoice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 10,
        companyId: EMPRESA,
        type: 'ACCOUNTS_PAYABLE',
        purchaseOrderId: opts.sinOrdenNiRecepcion ? null : 4,
        goodsReceiptId: null,
        matchStatus,
        isCancelled: false,
        deletedAt: null,
        paidAmount: 0,
        totalAmount: 1000,
        invoiceNumber: 'CXP-1',
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    payment: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    bankAccount: { findFirst: jest.fn() },
  };
  const prisma = {
    fiscalPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
    payment: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = servicio(prisma);
  try {
    await service.registerPayment(
      { invoiceId: 10, amount: 100, paymentDate: '2026-10-01' },
      1,
      EMPRESA,
    );
    return { error: new Error('no-debio-pagar'), pagoCreado: tx.payment.create.mock.calls.length > 0 };
  } catch (error) {
    return { error, pagoCreado: tx.payment.create.mock.calls.length > 0 };
  }
}

async function timbrar(opts: { provider: string; folio: string }) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    fiscalPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
    invoice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 22,
        companyId: EMPRESA,
        deletedAt: null,
        isCancelled: false,
        cfdiUuid: null,
        status: 'DRAFT',
        issueDate: new Date('2026-10-01T12:00:00.000Z'),
        invoiceNumber: opts.folio,
        cfdiSerie: 'A',
        cfdiFolio: '100',
        totalAmount: 116,
        subtotal: 100,
        taxAmount: 16,
        currency: 'MXN',
        exchangeRate: null,
        satPaymentForm: 'FP03',
        satPaymentMethod: 'PUE',
        cfdiUsage: 'G03',
        cfdiRelatedUuids: null,
        cfdiRelationType: null,
        // RFC de prueba del SAT: desde el 29-10 el timbrado revisa el dígito verificador antes de llamar al PAC.
        emisorRfc: 'EKU9003173C9',
        emisorName: 'Nexara',
        emisorRegime: 'R601',
        receptorRfc: 'URE180429TM6',
        receptorName: 'Cliente',
        receptorZipCode: '44100',
        receptorRegime: 'R601',
        items: [
          {
            description: 'Servicio',
            quantity: 1,
            unitPrice: 100,
            discount: 0,
            taxRate: 16,
            satProductKey: '81161800',
            satUnitKey: 'E48',
            unitName: 'Unidad',
          },
        ],
      }),
      updateMany,
      findUnique: jest.fn(),
    },
    systemSetting: {
      findMany: jest.fn().mockResolvedValue([
        { key: 'codigopostal', value: '06600', label: null, companyId: null },
      ]),
    },
  };
  const pac = {
    stamp: jest.fn().mockResolvedValue({ uuid: null, provider: opts.provider }),
  };
  const service = servicio(prisma, pac);
  let error: unknown;
  try {
    await service.stampInvoice(22, 1, EMPRESA);
  } catch (err) {
    error = err;
  }
  const estados = updateMany.mock.calls.map((call) => call[0]?.data?.status);
  return {
    error,
    volvioABorrador: estados.includes('DRAFT'),
    quedoTimbrando: estados.includes('STAMPING'),
  };
}
