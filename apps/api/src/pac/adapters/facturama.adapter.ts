import type { IPacAdapter, PacCancelInput, PacCancelResult, PacStampInput, PacStampResult } from '../pac.types.js';

/**
 * Adapter Facturama (https://api.facturama.mx).
 * Requiere FACTURAMA_USER, FACTURAMA_PASSWORD, FACTURAMA_BASE_URL.
 * Auth: HTTP Basic.
 */
export class FacturamaAdapter implements IPacAdapter {
  readonly provider = 'facturama' as const;

  constructor(
    private readonly user: string,
    private readonly password: string,
    private readonly baseUrl: string = 'https://apisandbox.facturama.mx',
  ) {
    if (!user || !password) {
      throw new Error('Facturama: FACTURAMA_USER y FACTURAMA_PASSWORD requeridos');
    }
  }

  private get authHeader(): string {
    const token = Buffer.from(`${this.user}:${this.password}`).toString('base64');
    return `Basic ${token}`;
  }

  async stamp(input: PacStampInput): Promise<PacStampResult> {
    const payload = {
      Serie: input.serie || 'A',
      Folio: input.folio || input.invoiceNumber.replace(/[^0-9]/g, '') || '1',
      CfdiType: 'I', // Ingreso (factura cliente)
      PaymentForm: (input.paymentForm || 'FP99').replace(/^FP/, ''),
      PaymentMethod: input.paymentMethod || 'PUE',
      Currency: input.currency || 'MXN',
      ExchangeRate: input.exchangeRate || 1,
      ExpeditionPlace: input.emisor.regime || '64000',
      Issuer: {
        Rfc: input.emisor.rfc,
        Name: input.emisor.name,
        FiscalRegime: (input.emisor.regime || '601').replace(/^R/, ''),
      },
      Receiver: {
        Rfc: input.receptor.rfc,
        Name: input.receptor.name,
        CfdiUse: input.cfdiUsage || 'G03',
        FiscalRegime: (input.receptor.regime || '612').replace(/^R/, ''),
        TaxZipCode: input.receptor.zipCode || '64000',
      },
      Items: input.items.map((item) => ({
        ProductCode: item.satProductKey || '01010101',
        IdentificationNumber: '',
        Description: item.description,
        Unit: item.unitName || 'Servicio',
        UnitCode: item.satUnitKey || 'E48',
        UnitPrice: item.unitPrice,
        Quantity: item.quantity,
        Subtotal: item.unitPrice * item.quantity,
        Discount: item.discount || 0,
        Taxes: item.taxRate
          ? [
              {
                Total: item.unitPrice * item.quantity * (item.taxRate / 100),
                Name: 'IVA',
                Base: item.unitPrice * item.quantity,
                Rate: item.taxRate / 100,
                IsRetention: false,
              },
            ]
          : [],
        Total: item.unitPrice * item.quantity * (1 + (item.taxRate || 0) / 100),
      })),
    };

    const response = await fetch(`${this.baseUrl}/3/cfdis`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Facturama timbrado falló (${response.status}): ${body.slice(0, 400)}`);
    }

    const data: any = await response.json();
    return {
      uuid: data?.Complement?.TaxStamp?.Uuid || data?.Uuid || data?.uuid,
      stampedAt: new Date(data?.Complement?.TaxStamp?.Date || data?.Date || Date.now()),
      satCertNumber: data?.Complement?.TaxStamp?.SatCertNumber || '00001000000000000000',
      satSignature: data?.Complement?.TaxStamp?.SatSign || null,
      xml: data?.Xml || '',
      pdfUrl: data?.Pdf || null,
      provider: 'facturama',
    };
  }

  async cancel(input: PacCancelInput): Promise<PacCancelResult> {
    const url = `${this.baseUrl}/cfdi/${input.uuid}?type=issued${
      input.substitutionUuid ? `&motive=${input.cancelReason}&uuidReplacement=${input.substitutionUuid}` : `&motive=${input.cancelReason}`
    }`;
    const response = await fetch(url, { method: 'DELETE', headers: { Authorization: this.authHeader } });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Facturama cancelación falló (${response.status}): ${body.slice(0, 400)}`);
    }
    const data: any = await response.json().catch(() => ({}));
    return {
      accepted: true,
      acuse: data?.Acknowledgment || null,
      cancelledAt: new Date(),
      provider: 'facturama',
    };
  }
}
