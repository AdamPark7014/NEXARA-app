import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { FacturamaAdapter, fechaPagoCfdi, formaYMetodoDePago } from './facturama.adapter.js';

/**
 * Contrato con la API Web de Facturama tal como la documenta su portal (oct-2026):
 * la emisión no trae el XML, cancelar pide el `Id` interno y un reintento tras un corte
 * de red no debe timbrar dos veces.
 */

const XML_TIMBRADO =
  '<?xml version="1.0" encoding="utf-8"?><cfdi:Comprobante Version="4.0">' +
  '<cfdi:CfdiRelacionados TipoRelacion="04"><cfdi:CfdiRelacionado UUID="11111111-1111-1111-1111-111111111111"/></cfdi:CfdiRelacionados>' +
  '<cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="5E09160F-A206-44D7-B389-4F243585E76A" ' +
  'FechaTimbrado="2026-10-29T12:00:05" RfcProvCertif="SPR190613I52" NoCertificadoSAT="30001000000500003456" ' +
  'SelloSAT="SELLOSAT==" /></cfdi:Complemento></cfdi:Comprobante>';

const CFDI_CREADO = {
  Id: 'DznlumtVtkA3ya4JXAeGWw2',
  Serie: 'A',
  Folio: '100',
  Total: 116,
  Status: 'active',
  Issuer: { Rfc: 'NEE240925V73' },
  Receiver: { Rfc: 'URE180429TM6' },
  Complement: { TaxStamp: { Uuid: '5e09160f-a206-44d7-b389-4f243585e76a', Date: '2026-10-29T12:00:05', SatCertNumber: '30001000000500003456' } },
};

const FACTURA = {
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
  items: [
    { description: 'Instalación de cámaras', quantity: 1, unitPrice: 100, taxRate: 16, satProductKey: '72151605', satUnitKey: 'E48' },
  ],
};

type Llamada = { metodo: string; url: string; cuerpo: any };

/** Servidor falso: cada ruta responde con lo que diga `rutas`; registra todas las llamadas. */
function servidor(rutas: Array<[RegExp, (l: Llamada) => { status?: number; body?: unknown } | 'corte']>) {
  const llamadas: Llamada[] = [];
  global.fetch = jest.fn(async (url: any, init: any = {}) => {
    const llamada: Llamada = {
      metodo: init.method || 'GET',
      url: String(url).replace('https://apisandbox.facturama.mx', ''),
      cuerpo: init.body ? JSON.parse(init.body) : undefined,
    };
    llamadas.push(llamada);
    const ruta = rutas.find(([patron]) => patron.test(`${llamada.metodo} ${llamada.url}`));
    if (!ruta) throw new Error(`ruta no simulada: ${llamada.metodo} ${llamada.url}`);
    const r = ruta[1](llamada);
    if (r === 'corte') throw Object.assign(new Error('socket hang up'), { name: 'TypeError' });
    const texto = r.body === undefined ? '' : typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return { status: r.status ?? 200, text: async () => texto } as any;
  }) as any;
  return llamadas;
}

const xmlEnBase64 = () => ({ body: { ContentEncoding: 'base64', Content: Buffer.from(XML_TIMBRADO).toString('base64') } });

describe('FacturamaAdapter', () => {
  const pac = new FacturamaAdapter('usuario', 'secreto', 'https://apisandbox.facturama.mx', 1000);
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  describe('timbrado', () => {
    it('emite por API Web, baja el XML con el Id y devuelve los datos del timbre', async () => {
      const llamadas = servidor([
        [/^GET \/cfdi\?/, () => ({ body: [] })],
        [/^POST \/3\/cfdis$/, () => ({ status: 201, body: CFDI_CREADO })],
        [/^GET \/cfdi\/xml\/issued\/DznlumtVtkA3ya4JXAeGWw2$/, xmlEnBase64],
      ]);

      const r = await pac.stamp(FACTURA as any);

      const post = llamadas.find((l) => l.metodo === 'POST')!;
      expect(post.cuerpo.Issuer).toBeUndefined(); // en API Web el emisor sale del perfil de la cuenta
      expect(post.cuerpo).toMatchObject({
        Serie: 'A',
        Folio: '100',
        CfdiType: 'I',
        PaymentForm: '03',
        PaymentMethod: 'PUE',
        ExpeditionPlace: '72775',
        Receiver: { Rfc: 'URE180429TM6', FiscalRegime: '601', TaxZipCode: '86991', CfdiUse: 'G03' },
      });
      expect(post.cuerpo.ExchangeRate).toBeUndefined();
      expect(post.cuerpo.Items[0]).not.toHaveProperty('IdentificationNumber'); // vacío lo rechaza el SAT
      expect(post.cuerpo.Items[0]).toMatchObject({ Subtotal: 100, Total: 116, Taxes: [{ Name: 'IVA', Base: 100, Total: 16 }] });

      expect(r.uuid).toBe('5e09160f-a206-44d7-b389-4f243585e76a');
      expect(r.xml).toBe(XML_TIMBRADO);
      expect(r.satCertNumber).toBe('30001000000500003456');
      expect(r.satSignature).toBe('SELLOSAT==');
      expect(r.pacDocumentId).toBe('DznlumtVtkA3ya4JXAeGWw2');
      expect(r.stampedAt.toISOString()).toBe('2026-10-29T18:00:05.000Z'); // hora de Ciudad de México
    });

    it('redondea los impuestos a centavos como el ERP', async () => {
      const llamadas = servidor([
        [/^GET \/cfdi\?/, () => ({ body: [] })],
        [/^POST \/3\/cfdis$/, () => ({ status: 201, body: CFDI_CREADO })],
        [/^GET \/cfdi\/xml\//, xmlEnBase64],
      ]);
      await pac.stamp({ ...FACTURA, items: [{ ...FACTURA.items[0], quantity: 3, unitPrice: 33.335 }] } as any);
      const concepto = llamadas.find((l) => l.metodo === 'POST')!.cuerpo.Items[0];
      expect(concepto.Subtotal).toBe(100.01);
      expect(concepto.Taxes[0].Total).toBe(16);
      expect(concepto.Total).toBe(116.01);
    });

    it('reutiliza el CFDI si ya existe uno vigente con la misma serie, folio, cliente e importe', async () => {
      const llamadas = servidor([
        [/^GET \/cfdi\?/, () => ({ body: [{ Id: CFDI_CREADO.Id, Serie: 'A', Folio: '100' }] })],
        [/^GET \/cfdi\/DznlumtVtkA3ya4JXAeGWw2\?type=issued$/, () => ({ body: CFDI_CREADO })],
        [/^GET \/cfdi\/xml\//, xmlEnBase64],
      ]);
      const r = await pac.stamp(FACTURA as any);
      expect(llamadas.some((l) => l.metodo === 'POST')).toBe(false);
      expect(r.uuid).toBe('5e09160f-a206-44d7-b389-4f243585e76a');
    });

    it('se detiene si la serie y el folio ya están usados por otro cliente o importe', async () => {
      servidor([
        [/^GET \/cfdi\?/, () => ({ body: [{ Id: CFDI_CREADO.Id, Serie: 'A', Folio: '100' }] })],
        [/^GET \/cfdi\/DznlumtVtkA3ya4JXAeGWw2\?type=issued$/, () => ({ body: { ...CFDI_CREADO, Total: 999 } })],
      ]);
      await expect(pac.stamp(FACTURA as any)).rejects.toThrow(/Ya hay en Facturama un CFDI vigente/);
    });

    it('tras un corte de red recupera el CFDI que sí alcanzó a timbrarse', async () => {
      let consultas = 0;
      const llamadas = servidor([
        [/^GET \/cfdi\?/, () => ({ body: consultas++ === 0 ? [] : [{ Id: CFDI_CREADO.Id, Serie: 'A', Folio: '100' }] })],
        [/^POST \/3\/cfdis$/, () => 'corte'],
        [/^GET \/cfdi\/DznlumtVtkA3ya4JXAeGWw2\?type=issued$/, () => ({ body: CFDI_CREADO })],
        [/^GET \/cfdi\/xml\//, xmlEnBase64],
      ]);
      const r = await pac.stamp(FACTURA as any);
      expect(r.uuid).toBe('5e09160f-a206-44d7-b389-4f243585e76a');
      expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(1);
    });

    it('si el corte no dejó CFDI, avisa que es seguro reintentar', async () => {
      servidor([
        [/^GET \/cfdi\?/, () => ({ body: [] })],
        [/^POST \/3\/cfdis$/, () => ({ status: 503, body: 'Service Unavailable' })],
      ]);
      const error = await pac.stamp(FACTURA as any).catch((e) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.message).toMatch(/no se duplica/);
    });

    it('muestra al usuario el motivo del rechazo de Facturama', async () => {
      servidor([
        [/^GET \/cfdi\?/, () => ({ body: [] })],
        [
          /^POST \/3\/cfdis$/,
          () => ({ status: 400, body: { Message: 'La solicitud no es válida.', ModelState: { 'Receiver.Rfc': ['El RFC del receptor no está en la lista del SAT'] } } }),
        ],
      ]);
      const error = await pac.stamp(FACTURA as any).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('El RFC del receptor no está en la lista del SAT');
    });

    it('manda la razón social en mayúsculas y explica qué corregir cuando el SAT no la reconoce', async () => {
      const llamadas = servidor([
        [/^GET \/cfdi\?/, () => ({ body: [] })],
        [
          /^POST \/3\/cfdis$/,
          () => ({ status: 400, body: { Message: 'El campo Nombre del receptor, debe pertenecer al nombre asociado al RFC registrado en el campo Rfc del Receptor.' } }),
        ],
      ]);
      const error = await pac.stamp({ ...FACTURA, receptor: { ...FACTURA.receptor, name: '  Universidad  Robotica Española ' } } as any).catch((e) => e);
      expect(llamadas.find((l) => l.metodo === 'POST')!.cuerpo.Receiver.Name).toBe('UNIVERSIDAD ROBOTICA ESPAÑOLA');
      expect(error.message).toMatch(/tal como en su constancia de situación fiscal/);
    });

    it('no timbra sin código postal del emisor', async () => {
      const llamadas = servidor([]);
      await expect(pac.stamp({ ...FACTURA, emisor: { ...FACTURA.emisor, zipCode: null } } as any)).rejects.toThrow(
        /código postal fiscal de la empresa emisora/,
      );
      expect(llamadas).toHaveLength(0);
    });

    it('al público en general le pone régimen 616, uso S01 y el CP de expedición', async () => {
      const llamadas = servidor([
        [/^GET \/cfdi\?/, () => ({ body: [] })],
        [/^POST \/3\/cfdis$/, () => ({ status: 201, body: CFDI_CREADO })],
        [/^GET \/cfdi\/xml\//, xmlEnBase64],
      ]);
      await pac.stamp({ ...FACTURA, receptor: { rfc: 'XAXX010101000', name: 'PUBLICO EN GENERAL' } } as any);
      expect(llamadas.find((l) => l.metodo === 'POST')!.cuerpo.Receiver).toEqual({
        Rfc: 'XAXX010101000',
        Name: 'PUBLICO EN GENERAL',
        CfdiUse: 'S01',
        FiscalRegime: '616',
        TaxZipCode: '72775',
      });
    });
  });

  describe('forma y método de pago', () => {
    it('rechaza PUE con forma 99 y fuerza 99 con PPD', () => {
      expect(() => formaYMetodoDePago('FP99', 'PUE')).toThrow(/no puede ser «99/);
      expect(() => formaYMetodoDePago(null, 'PUE')).toThrow(/no puede ser «99/);
      expect(formaYMetodoDePago('FP03', 'PPD')).toEqual({ PaymentForm: '99', PaymentMethod: 'PPD' });
      expect(formaYMetodoDePago('FP03', 'PUE')).toEqual({ PaymentForm: '03', PaymentMethod: 'PUE' });
    });
  });

  describe('complemento de pago 2.0', () => {
    const PAGO = {
      invoiceNumber: 'PAGO-F-100-7',
      serie: 'P',
      folio: '7',
      emisor: FACTURA.emisor,
      receptor: FACTURA.receptor,
      payment: { date: '2026-10-29T00:00:00.000Z', paymentForm: 'FP03', amount: 1160, currency: 'MXN', operationNumber: 'SPEI-123' },
      relatedDocs: [
        {
          uuid: '5e09160f-a206-44d7-b389-4f243585e76a',
          serie: 'A',
          folio: '100',
          currency: 'MXN',
          paymentMethod: 'PPD',
          partialityNumber: 1,
          previousBalance: 1160,
          amountPaid: 1160,
          remainingBalance: 0,
        },
      ],
    };

    it('manda el IVA por documento pagado y respeta el día de la fecha de pago', async () => {
      const llamadas = servidor([
        [/^GET \/cfdi\?/, () => ({ body: [] })],
        [/^POST \/3\/cfdis$/, () => ({ status: 201, body: { ...CFDI_CREADO, Serie: 'P', Folio: '7', Total: 0 } })],
        [/^GET \/cfdi\/xml\//, xmlEnBase64],
      ]);
      await pac.stampPayment(PAGO as any);
      const cuerpo = llamadas.find((l) => l.metodo === 'POST')!.cuerpo;
      expect(cuerpo).toMatchObject({ CfdiType: 'P', NameId: '14', Serie: 'P', Folio: '7', Receiver: { CfdiUse: 'CP01' } });
      const pago = cuerpo.Complemento.Payments[0];
      expect(pago.Date).toBe('2026-10-29T12:00:00');
      expect(pago).toMatchObject({ PaymentForm: '03', Currency: 'MXN', Amount: 1160, OperationNumber: 'SPEI-123' });
      expect(pago).not.toHaveProperty('ExchangeRate'); // Facturama lo rechaza con pesos (probado en sandbox)
      const doc = pago.RelatedDocuments[0];
      expect(doc.PaymentMethod).toBeUndefined();
      expect(doc).toMatchObject({ TaxObject: '02', EquivalenceDocRel: 1, AmountPaid: 1160, ImpSaldoInsoluto: 0 });
      expect(doc.Taxes).toEqual([{ Name: 'IVA', Rate: 0.16, Base: 1000, Total: 160, IsRetention: false }]);
    });

    it('convierte a hora de México una fecha de pago con hora', () => {
      expect(fechaPagoCfdi('2026-10-29T20:30:00.000Z')).toBe('2026-10-29T14:30:00');
      expect(fechaPagoCfdi('2026-10-29')).toBe('2026-10-29T12:00:00');
    });
  });

  describe('cancelación', () => {
    const CANCELAR = { uuid: '5e09160f-a206-44d7-b389-4f243585e76a', emisorRfc: 'NEE240925V73', cancelReason: '02' as const };

    it('busca el Id por UUID y cancela con el motivo, sin uuidReplacement fuera del 01', async () => {
      const llamadas = servidor([
        [/^GET \/cfdi\?.*keyword=/, () => ({ body: [{ Id: CFDI_CREADO.Id, Uuid: '5E09160F-A206-44D7-B389-4F243585E76A' }] })],
        [/^GET \/cfdi\/DznlumtVtkA3ya4JXAeGWw2\?type=issued$/, () => ({ body: CFDI_CREADO })],
        [
          /^DELETE \/cfdi\/DznlumtVtkA3ya4JXAeGWw2\?/,
          () => ({ body: { Status: 'canceled', CancelationDate: '2026-10-29T12:10:00', AcuseXmlBase64: Buffer.from('<Acuse/>').toString('base64') } }),
        ],
      ]);
      const r = await pac.cancel(CANCELAR);
      const borrar = llamadas.find((l) => l.metodo === 'DELETE')!;
      expect(borrar.url).toContain('motive=02');
      expect(borrar.url).not.toContain('uuidReplacement');
      expect(r).toMatchObject({ accepted: true, acuse: '<Acuse/>' });
      expect(r.cancelledAt.toISOString()).toBe('2026-10-29T18:10:00.000Z');
    });

    it('con motivo 01 manda el UUID sustituto', async () => {
      const llamadas = servidor([
        [/^GET \/cfdi\/DznlumtVtkA3ya4JXAeGWw2\?type=issued$/, () => ({ body: CFDI_CREADO })],
        [/^DELETE /, () => ({ body: { Status: 'canceled' } })],
      ]);
      await pac.cancel({ ...CANCELAR, cancelReason: '01', substitutionUuid: 'aaaa-bbbb', pacDocumentId: CFDI_CREADO.Id });
      expect(llamadas.find((l) => l.metodo === 'DELETE')!.url).toContain('uuidReplacement=aaaa-bbbb');
    });

    it('si el cliente debe aceptarla, no la da por cancelada', async () => {
      servidor([
        [/^GET \/cfdi\/DznlumtVtkA3ya4JXAeGWw2\?type=issued$/, () => ({ body: CFDI_CREADO })],
        [/^DELETE /, () => ({ body: { Status: 'pending', ExpirationDate: '2026-11-01T12:10:00' } })],
      ]);
      await expect(pac.cancel({ ...CANCELAR, pacDocumentId: CFDI_CREADO.Id })).rejects.toThrow(/el cliente tiene que aceptarla/);
    });

    it('no vuelve a pedir la cancelación de un CFDI que Facturama ya tiene cancelado', async () => {
      const llamadas = servidor([
        [/^GET \/cfdi\/DznlumtVtkA3ya4JXAeGWw2\?type=issued$/, () => ({ body: { ...CFDI_CREADO, Status: 'canceled' } })],
      ]);
      const r = await pac.cancel({ ...CANCELAR, pacDocumentId: CFDI_CREADO.Id });
      expect(r.accepted).toBe(true);
      expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(false);
    });

    it('baja el PDF por el Id del CFDI', async () => {
      servidor([
        [/^GET \/cfdi\/pdf\/issued\/DznlumtVtkA3ya4JXAeGWw2$/, () => ({ body: { ContentType: 'pdf', Content: Buffer.from('%PDF-1.4').toString('base64') } })],
      ]);
      expect((await pac.downloadPdf(CFDI_CREADO.Id)).toString()).toBe('%PDF-1.4');
    });

    it('avisa si no encuentra el CFDI en Facturama', async () => {
      servidor([[/^GET \/cfdi\?/, () => ({ body: [] })]]);
      await expect(pac.cancel(CANCELAR)).rejects.toThrow(/No encontré en Facturama el CFDI/);
    });
  });
});
