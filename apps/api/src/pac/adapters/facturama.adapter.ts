import type {
  IPacAdapter,
  PacCancelInput,
  PacCancelResult,
  PacPaymentComplementInput,
  PacStampInput,
  PacStampResult,
} from '../pac.types.js';

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
    const zip = input.emisor.zipCode || input.receptor.zipCode || '00000';
    const payload: Record<string, unknown> = {
      Serie: input.serie || 'A',
      Folio: input.folio || input.invoiceNumber.replace(/[^0-9]/g, '') || '1',
      CfdiType: input.tipoComprobante || 'I', // I = Ingreso, E = Egreso (nota de crédito)
      PaymentForm: (input.paymentForm || 'FP99').replace(/^FP/, ''),
      PaymentMethod: input.paymentMethod || 'PUE',
      Currency: input.currency || 'MXN',
      ExchangeRate: input.exchangeRate || 1,
      ExpeditionPlace: zip,
      Exportation: '01',
      Issuer: {
        Rfc: input.emisor.rfc,
        Name: input.emisor.name,
        FiscalRegime: (input.emisor.regime || '601').replace(/^R/, ''),
      },
      Receiver: {
        Rfc: input.receptor.rfc,
        Name: input.receptor.name,
        CfdiUse: input.cfdiUsage || (input.tipoComprobante === 'E' ? 'G02' : 'G03'),
        FiscalRegime: (input.receptor.regime || '616').replace(/^R/, ''),
        TaxZipCode: input.receptor.zipCode || zip,
      },
      Items: input.items.map((item) => {
        const base = item.unitPrice * item.quantity - (item.discount || 0);
        const ivaRate = item.taxRate != null ? item.taxRate / 100 : 0.16;
        const taxes: any[] = [
          {
            Total: base * ivaRate,
            Name: 'IVA',
            Base: base,
            Rate: ivaRate,
            IsRetention: false,
          },
        ];
        if (item.ivaRetAmount && item.ivaRetAmount > 0) {
          taxes.push({ Total: item.ivaRetAmount, Name: 'IVA', Base: base, Rate: base > 0 ? item.ivaRetAmount / base : 0, IsRetention: true });
        }
        if (item.isrRetAmount && item.isrRetAmount > 0) {
          taxes.push({ Total: item.isrRetAmount, Name: 'ISR', Base: base, Rate: base > 0 ? item.isrRetAmount / base : 0, IsRetention: true });
        }
        return {
          ProductCode: item.satProductKey || '01010101',
          IdentificationNumber: '',
          Description: item.description,
          Unit: item.unitName || 'Servicio',
          UnitCode: item.satUnitKey || 'E48',
          UnitPrice: item.unitPrice,
          Quantity: item.quantity,
          Subtotal: item.unitPrice * item.quantity,
          Discount: item.discount || 0,
          TaxObject: '02',
          Taxes: taxes,
          Total: base * (1 + ivaRate) - (item.ivaRetAmount || 0) - (item.isrRetAmount || 0),
        };
      }),
    };
    if (input.relatedUuids && input.relatedUuids.length) {
      payload['Relations'] = {
        Type: input.relationType || '01',
        Cfdis: input.relatedUuids.map((u) => ({ Uuid: u })),
      };
    }

    const data = await this.postCfdi(payload, 'timbrado');
    return this.mapStamp(data);
  }

  async stampPayment(input: PacPaymentComplementInput): Promise<PacStampResult> {
    const zip = input.emisor.zipCode || input.receptor.zipCode || '00000';
    const payload: Record<string, unknown> = {
      CfdiType: 'P',
      Serie: input.serie || 'P',
      Folio: input.folio || input.invoiceNumber.replace(/[^0-9]/g, '') || '1',
      ExpeditionPlace: zip,
      Issuer: {
        Rfc: input.emisor.rfc,
        Name: input.emisor.name,
        FiscalRegime: (input.emisor.regime || '601').replace(/^R/, ''),
      },
      Receiver: {
        Rfc: input.receptor.rfc,
        Name: input.receptor.name,
        CfdiUse: 'CP01',
        FiscalRegime: (input.receptor.regime || '616').replace(/^R/, ''),
        TaxZipCode: input.receptor.zipCode || zip,
      },
      Complemento: {
        Payments: [
          {
            Date: input.payment.date,
            PaymentForm: (input.payment.paymentForm || 'FP03').replace(/^FP/, ''),
            Amount: input.payment.amount,
            Currency: input.payment.currency || 'MXN',
            ExchangeRate: input.payment.exchangeRate || 1,
            OperationNumber: input.payment.operationNumber || undefined,
            RelatedDocuments: input.relatedDocs.map((d) => ({
              Uuid: d.uuid,
              Serie: d.serie || undefined,
              Folio: d.folio || undefined,
              Currency: d.currency || 'MXN',
              PaymentMethod: d.paymentMethod || 'PPD',
              PartialityNumber: d.partialityNumber,
              PreviousBalanceAmount: d.previousBalance,
              AmountPaid: d.amountPaid,
              ImpSaldoInsoluto: d.remainingBalance,
            })),
          },
        ],
      },
    };
    const data = await this.postCfdi(payload, 'complemento de pago');
    return this.mapStamp(data);
  }

  private async postCfdi(payload: Record<string, unknown>, label: string): Promise<any> {
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
      throw new Error(`Facturama ${label} falló (${response.status}): ${body.slice(0, 400)}`);
    }
    return response.json();
  }

  private mapStamp(data: any): PacStampResult {
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
