import type {
  IPacAdapter,
  PacCancelInput,
  PacCancelResult,
  PacPaymentComplementInput,
  PacStampInput,
  PacStampResult,
} from '../pac.types.js';

/**
 * Adapter mock — sin llamada externa, genera UUID estilo CFDI 4.0 y XML placeholder.
 * Útil en dev/staging cuando no hay credenciales reales de PAC.
 */
export class MockPacAdapter implements IPacAdapter {
  readonly provider = 'mock' as const;

  async stamp(input: PacStampInput): Promise<PacStampResult> {
    const uuid = this.generateUuid();
    return {
      uuid,
      stampedAt: new Date(),
      satCertNumber: '00001000000000000000',
      satSignature: this.randomHex(64),
      xml: this.buildXmlPlaceholder(input, uuid),
      pdfUrl: null,
      provider: 'mock',
    };
  }

  async cancel(input: PacCancelInput): Promise<PacCancelResult> {
    return {
      accepted: true,
      acuse: `<Acuse motivo="${input.cancelReason}" uuid="${input.uuid}" mock="true"/>`,
      cancelledAt: new Date(),
      provider: 'mock',
    };
  }

  async stampPayment(input: PacPaymentComplementInput): Promise<PacStampResult> {
    const uuid = this.generateUuid();
    return {
      uuid,
      stampedAt: new Date(),
      satCertNumber: '00001000000000000000',
      satSignature: this.randomHex(64),
      xml: `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" TipoDeComprobante="P" mock="true"><cfdi:Complemento><pago20:Pagos xmlns:pago20="http://www.sat.gob.mx/Pagos20"><pago20:Pago Monto="${input.payment.amount.toFixed(2)}"/></pago20:Pagos></cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" SelloCFD="MOCK_SELLO"/></cfdi:Comprobante>`,
      pdfUrl: null,
      provider: 'mock',
    };
  }

  private generateUuid(): string {
    return [
      this.randomHex(8),
      this.randomHex(4),
      `4${this.randomHex(3)}`,
      `${'89ab'[Math.floor(Math.random() * 4)]}${this.randomHex(3)}`,
      this.randomHex(12),
    ].join('-').toUpperCase();
  }

  private randomHex(length: number) {
    const chars = '0123456789abcdef';
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += chars[Math.floor(Math.random() * 16)];
    }
    return out;
  }

  private buildXmlPlaceholder(input: PacStampInput, uuid: string): string {
    const items = input.items
      .map(
        (item) =>
          `<cfdi:Concepto Cantidad="${item.quantity}" ValorUnitario="${item.unitPrice.toFixed(2)}" Importe="${(item.quantity * item.unitPrice).toFixed(2)}" Descripcion="${this.escapeXml(item.description)}" ClaveProdServ="${item.satProductKey || '01010101'}" ClaveUnidad="${item.satUnitKey || 'E48'}" Unidad="${this.escapeXml(item.unitName || 'Servicio')}"/>`,
      )
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="${input.serie || 'A'}" Folio="${input.folio || input.invoiceNumber}" SubTotal="${input.subtotal.toFixed(2)}" Total="${input.total.toFixed(2)}" Moneda="${input.currency}">
  <cfdi:Emisor Rfc="${input.emisor.rfc}" Nombre="${this.escapeXml(input.emisor.name)}" RegimenFiscal="${input.emisor.regime || '601'}"/>
  <cfdi:Receptor Rfc="${input.receptor.rfc}" Nombre="${this.escapeXml(input.receptor.name)}" DomicilioFiscalReceptor="${input.receptor.zipCode || ''}" RegimenFiscalReceptor="${input.receptor.regime || '612'}" UsoCFDI="${input.cfdiUsage || 'G03'}"/>
  <cfdi:Conceptos>${items}</cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="${new Date().toISOString()}" SelloCFD="MOCK_SELLO" NoCertificadoSAT="00001000000000000000" SelloSAT="MOCK_SELLO_SAT"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
  }

  private escapeXml(value: string): string {
    return value.replace(/[<>&"']/g, (char) => {
      switch (char) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '"': return '&quot;';
        case "'": return '&apos;';
        default: return char;
      }
    });
  }
}
