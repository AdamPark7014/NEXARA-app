import type { IPacAdapter, PacCancelInput, PacCancelResult, PacStampInput, PacStampResult } from '../pac.types.js';

/**
 * Adapter Finkok (SOAP API). Requiere FINKOK_USER + FINKOK_PASSWORD.
 *
 * Finkok expone WSDL SOAP — esta implementación construye el payload SOAP a mano,
 * lo cual evita una dependencia adicional. En producción se recomienda envolver con
 * un cliente SOAP dedicado o un firmador CSD nativo.
 */
export class FinkokAdapter implements IPacAdapter {
  readonly provider = 'finkok' as const;

  constructor(
    private readonly opts: {
      baseUrl?: string;
      user: string;
      password: string;
    },
  ) {
    if (!opts.user || !opts.password) {
      throw new Error('Finkok: FINKOK_USER y FINKOK_PASSWORD requeridos');
    }
  }

  private get base(): string {
    return this.opts.baseUrl || 'https://demo-facturacion.finkok.com';
  }

  async stamp(input: PacStampInput): Promise<PacStampResult> {
    const xml = await this.buildSealedXml(input);
    const xmlBase64 = Buffer.from(xml, 'utf8').toString('base64');

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:apps="apps.services.soap.core.views">
  <soapenv:Body>
    <apps:stamp>
      <apps:xml>${xmlBase64}</apps:xml>
      <apps:username>${this.opts.user}</apps:username>
      <apps:password>${this.opts.password}</apps:password>
    </apps:stamp>
  </soapenv:Body>
</soapenv:Envelope>`;

    const response = await fetch(`${this.base}/servicios/soap/stamp.wsdl`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml', SOAPAction: 'stamp' },
      body: soapBody,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Finkok timbrado falló (${response.status}): ${body.slice(0, 400)}`);
    }

    const text = await response.text();
    const uuid = this.extractXmlTag(text, 'UUID') || this.extractXmlTag(text, 'uuid') || '';
    const stampedAt = this.extractXmlTag(text, 'Fecha') || new Date().toISOString();
    const certNumber = this.extractXmlTag(text, 'noCertificadoSAT') || '00001000000000000000';
    const cfdiXml = this.extractXmlTag(text, 'xml') || '';

    return {
      uuid,
      stampedAt: new Date(stampedAt),
      satCertNumber: certNumber,
      satSignature: this.extractXmlTag(text, 'selloSAT') || null,
      xml: cfdiXml,
      pdfUrl: null,
      provider: 'finkok',
    };
  }

  async cancel(input: PacCancelInput): Promise<PacCancelResult> {
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:apps="apps.services.soap.core.views">
  <soapenv:Body>
    <apps:cancel>
      <apps:UUIDS>
        <apps:uuid_type>
          <apps:UUID>${input.uuid}</apps:UUID>
          <apps:Motivo>${input.cancelReason}</apps:Motivo>
          ${input.substitutionUuid ? `<apps:FolioSustitucion>${input.substitutionUuid}</apps:FolioSustitucion>` : ''}
        </apps:uuid_type>
      </apps:UUIDS>
      <apps:username>${this.opts.user}</apps:username>
      <apps:password>${this.opts.password}</apps:password>
      <apps:taxpayer_id>${input.emisorRfc}</apps:taxpayer_id>
    </apps:cancel>
  </soapenv:Body>
</soapenv:Envelope>`;

    const response = await fetch(`${this.base}/servicios/soap/cancel.wsdl`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml', SOAPAction: 'cancel' },
      body: soapBody,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Finkok cancelación falló (${response.status}): ${body.slice(0, 400)}`);
    }
    const text = await response.text();
    return {
      accepted: /<EstatusUUID>201<\/EstatusUUID>|<EstatusUUID>202<\/EstatusUUID>/.test(text),
      acuse: this.extractXmlTag(text, 'Acuse') || null,
      cancelledAt: new Date(),
      provider: 'finkok',
    };
  }

  protected async buildSealedXml(_input: PacStampInput): Promise<string> {
    throw new Error('Finkok: implementar buildSealedXml() con firmador CSD del emisor');
  }

  private extractXmlTag(xml: string, tag: string): string | null {
    const re = new RegExp(`<[^>]*${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*${tag}[^>]*>`, 'i');
    const match = re.exec(xml);
    return match ? match[1].trim() : null;
  }
}
