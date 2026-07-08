import type { IPacAdapter, PacCancelInput, PacCancelResult, PacStampInput, PacStampResult } from '../pac.types.js';
import type { CsdService } from '../csd.service.js';
import { buildSealedCfdi } from '../cfdi-xml.builder.js';

/**
 * Adapter SW Sapien (https://services.sw.com.mx). Modalidad CFDI 4.0 / Issuer
 * Requiere SW_TOKEN o (SW_USER + SW_PASSWORD).
 *
 * Dos modos:
 *  - XML pre-sellado (default): sella localmente con CSD (`buildSealedCfdi`) y envía a /stamp.
 *  - issue-JSON (SW_USE_ISSUE_JSON=1): SW sella con el CSD cargado en su bóveda.
 */
export class SwSapienAdapter implements IPacAdapter {
  readonly provider = 'sw' as const;

  constructor(
    private readonly opts: {
      baseUrl?: string;
      token?: string;
      user?: string;
      password?: string;
      useIssueJson?: boolean;
    },
    private readonly csd?: CsdService,
  ) {
    if (!opts.token && !(opts.user && opts.password)) {
      throw new Error('SW: SW_TOKEN o (SW_USER + SW_PASSWORD) requeridos');
    }
  }

  private get base(): string {
    return this.opts.baseUrl || 'https://services.test.sw.com.mx';
  }

  private async getToken(): Promise<string> {
    if (this.opts.token) return this.opts.token;
    const response = await fetch(`${this.base}/security/authenticate`, {
      method: 'POST',
      headers: {
        user: this.opts.user || '',
        password: this.opts.password || '',
      },
    });
    if (!response.ok) {
      throw new Error(`SW autenticación falló (${response.status})`);
    }
    const data: any = await response.json();
    return data?.data?.token || '';
  }

  async stamp(input: PacStampInput): Promise<PacStampResult> {
    const token = await this.getToken();
    const useJson = Boolean(this.opts.useIssueJson);

    if (useJson) {
      const payload = {
        info: { invoiceNumber: input.invoiceNumber },
        receiver: { rfc: input.receptor.rfc, name: input.receptor.name, cfdiUse: input.cfdiUsage || 'G03' },
        items: input.items.map((it) => ({
          quantity: it.quantity,
          unitValue: it.unitPrice,
          description: it.description,
          productCode: it.satProductKey || '01010101',
          unitCode: it.satUnitKey || 'E48',
          unit: it.unitName || 'Servicio',
          taxRate: (it.taxRate || 0) / 100,
        })),
      };
      const response = await fetch(`${this.base}/v4/cfdi33/issue/json/v4`, {
        method: 'POST',
        headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`SW timbrado JSON falló (${response.status}): ${body.slice(0, 400)}`);
      }
      const data: any = await response.json();
      return this.mapStampResponse(data);
    }

    // Modo XML pre-sellado: el caller debe pasar el XML firmado por CSD.
    const xml = await this.buildSealedXml(input);
    const response = await fetch(`${this.base}/v3/cfdi33/stamp/v4`, {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'text/xml' },
      body: xml,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SW timbrado XML falló (${response.status}): ${body.slice(0, 400)}`);
    }
    const data: any = await response.json();
    return this.mapStampResponse(data);
  }

  async cancel(input: PacCancelInput): Promise<PacCancelResult> {
    const token = await this.getToken();
    const payload = {
      uuid: input.uuid,
      motivo: input.cancelReason,
      folioSustitucion: input.substitutionUuid || undefined,
    };
    const response = await fetch(`${this.base}/cfdi33/cancel/${input.emisorRfc}/${input.uuid}/${input.cancelReason}`, {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SW cancelación falló (${response.status}): ${body.slice(0, 400)}`);
    }
    const data: any = await response.json();
    return {
      accepted: data?.status === 'success',
      acuse: data?.data?.acuse || null,
      cancelledAt: new Date(),
      provider: 'sw',
    };
  }

  /** Construye XML CFDI 4.0 pre-sellado con el CSD del emisor. */
  protected async buildSealedXml(input: PacStampInput): Promise<string> {
    if (!this.csd || !this.csd.isConfigured()) {
      throw new Error('SW: CSD del emisor no configurado. Configura CSD_* o usa SW_USE_ISSUE_JSON=1');
    }
    return buildSealedCfdi(input, this.csd, {
      tipoComprobante: input.tipoComprobante || 'I',
      relatedUuids: input.relatedUuids,
      relationType: input.relationType,
    }).xml;
  }

  private mapStampResponse(data: any): PacStampResult {
    const stamp = data?.data || data;
    return {
      uuid: stamp?.uuid || stamp?.UUID,
      stampedAt: new Date(stamp?.fechaTimbrado || stamp?.timestamp || Date.now()),
      satCertNumber: stamp?.noCertificadoSAT || '00001000000000000000',
      satSignature: stamp?.selloSAT || null,
      xml: stamp?.cfdi || stamp?.xml || '',
      pdfUrl: null,
      provider: 'sw',
    };
  }
}
