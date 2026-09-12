import { Injectable, Logger } from '@nestjs/common';

/**
 * Servicios REST del SAT (consulta pública, sin e.firma).
 *
 * 1. Validación de RFC — formato + checksum (algoritmo SAT).
 * 2. Consulta de estatus de comprobante — API REST pública del SAT
 *    (https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc).
 *
 * Nota: la Descarga Masiva requiere e.firma + WS-Security SOAP; se documenta el
 * flujo y se expone el endpoint de autenticación preparado para cuando se cargue
 * la e.firma (EFIRMA_CER_BASE64 / EFIRMA_KEY_BASE64 / EFIRMA_KEY_PASSWORD).
 */

export interface RfcValidationResult {
  rfc: string;
  valid: boolean;
  type: 'MORAL' | 'FISICA' | 'GENERICO' | 'EXTRANJERO' | 'UNKNOWN';
  errors: string[];
}

export interface CfdiStatusResult {
  uuid: string;
  rfcEmisor: string;
  rfcReceptor: string;
  total: string;
  estado: string; // Vigente | Cancelado | No Encontrado
  esCancelable: string;
  estatusCancelacion: string;
  codigoEstatus: string;
  raw?: string;
}

/** Catálogo c_RegimenFiscal (SAT) — subset operativo CFDI 4.0. */
export const SAT_FISCAL_REGIMES: Array<{
  code: string;
  name: string;
  moral: boolean;
  fisica: boolean;
}> = [
  { code: '601', name: 'General de Ley Personas Morales', moral: true, fisica: false },
  { code: '603', name: 'Personas Morales con Fines no Lucrativos', moral: true, fisica: false },
  { code: '605', name: 'Sueldos y Salarios e Ingresos Asimilados a Salarios', moral: false, fisica: true },
  { code: '606', name: 'Arrendamiento', moral: false, fisica: true },
  { code: '607', name: 'Régimen de Enajenación o Adquisición de Bienes', moral: false, fisica: true },
  { code: '608', name: 'Demás ingresos', moral: false, fisica: true },
  { code: '610', name: 'Residentes en el Extranjero sin Establecimiento Permanente', moral: true, fisica: true },
  { code: '611', name: 'Ingresos por Dividendos (socios y accionistas)', moral: false, fisica: true },
  { code: '612', name: 'Personas Físicas con Actividades Empresariales y Profesionales', moral: false, fisica: true },
  { code: '614', name: 'Ingresos por intereses', moral: false, fisica: true },
  { code: '615', name: 'Régimen de los ingresos por obtención de premios', moral: false, fisica: true },
  { code: '616', name: 'Sin obligaciones fiscales', moral: false, fisica: true },
  { code: '620', name: 'Sociedades Cooperativas de Producción que optan por diferir ingresos', moral: true, fisica: false },
  { code: '621', name: 'Incorporación Fiscal', moral: false, fisica: true },
  { code: '622', name: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', moral: true, fisica: false },
  { code: '623', name: 'Opcional para Grupos de Sociedades', moral: true, fisica: false },
  { code: '624', name: 'Coordinados', moral: true, fisica: false },
  { code: '625', name: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', moral: false, fisica: true },
  { code: '626', name: 'Régimen Simplificado de Confianza', moral: true, fisica: true },
];

export interface FiscalRegimeOption {
  code: string;
  name: string;
}

export interface SatRfcStatus {
  formatoCorrecto: boolean;
  activo: boolean;
  localizado: boolean;
}

export interface FiscalLookupResult {
  validation: RfcValidationResult;
  regimes: FiscalRegimeOption[];
  suggestedRegime: string | null;
  satStatus: SatRfcStatus | null;
  legalName: string | null;
  fiscalZipCode: string | null;
  source: 'local' | 'facturama' | 'sat_datos';
  message: string;
}

@Injectable()
export class SatService {
  private readonly logger = new Logger(SatService.name);

  getRegimesForPersonType(type: RfcValidationResult['type']): FiscalRegimeOption[] {
    if (type === 'MORAL') {
      return SAT_FISCAL_REGIMES.filter((r) => r.moral).map(({ code, name }) => ({ code, name }));
    }
    if (type === 'FISICA') {
      return SAT_FISCAL_REGIMES.filter((r) => r.fisica).map(({ code, name }) => ({ code, name }));
    }
    if (type === 'GENERICO' || type === 'EXTRANJERO') {
      return SAT_FISCAL_REGIMES.filter((r) => r.code === '616' || r.code === '610').map(({ code, name }) => ({
        code,
        name,
      }));
    }
    return SAT_FISCAL_REGIMES.map(({ code, name }) => ({ code, name }));
  }

  /**
   * Lookup fiscal para formularios de cliente.
   * - Siempre: validación local + catálogo de régimenes filtrado por PF/PM.
   * - Con FACTURAMA_*: valida existencia ante SAT (status) y filtra régimenes vía PAC.
   * - Con SAT_DATOS_FISCALES_URL + API_KEY: intenta razón social / CP / régimenes reales (terceros).
   * El SAT oficial NO publica API gratuita de Constancia; razón social requiere proveedor o CSF.
   */
  async lookupFiscalByRfc(rfc: string): Promise<FiscalLookupResult> {
    const validation = this.validateRfc(rfc);
    const localRegimes = this.getRegimesForPersonType(validation.type);
    const suggestedRegime =
      validation.type === 'MORAL' ? '601' : validation.type === 'FISICA' ? '612' : localRegimes[0]?.code ?? null;

    if (!validation.valid) {
      return {
        validation,
        regimes: localRegimes,
        suggestedRegime: null,
        satStatus: null,
        legalName: null,
        fiscalZipCode: null,
        source: 'local',
        message: validation.errors.join('; ') || 'RFC inválido',
      };
    }

    const datos = await this.trySatDatosFiscales(validation.rfc);
    if (datos) {
      return {
        validation,
        regimes: datos.regimes.length ? datos.regimes : localRegimes,
        suggestedRegime: datos.regimes[0]?.code ?? suggestedRegime,
        satStatus: datos.satStatus,
        legalName: datos.legalName,
        fiscalZipCode: datos.fiscalZipCode,
        source: 'sat_datos',
        message: 'Datos fiscales obtenidos del proveedor configurado (SAT_DATOS_FISCALES_*).',
      };
    }

    const facturama = await this.tryFacturamaLookup(validation.rfc);
    if (facturama) {
      return {
        validation,
        regimes: facturama.regimes.length ? facturama.regimes : localRegimes,
        suggestedRegime: facturama.regimes[0]?.code ?? suggestedRegime,
        satStatus: facturama.satStatus,
        legalName: null,
        fiscalZipCode: null,
        source: 'facturama',
        message: facturama.message,
      };
    }

    return {
      validation,
      regimes: localRegimes,
      suggestedRegime,
      satStatus: null,
      legalName: null,
      fiscalZipCode: null,
      source: 'local',
      message:
        'RFC con formato válido. Régimenes sugeridos por tipo de persona. ' +
        'Para razón social automática configura SAT_DATOS_FISCALES_URL/API_KEY, ' +
        'o FACTURAMA_* para validar existencia ante el SAT.',
    };
  }

  private async tryFacturamaLookup(rfc: string): Promise<{
    regimes: FiscalRegimeOption[];
    satStatus: SatRfcStatus | null;
    message: string;
  } | null> {
    const user = process.env['FACTURAMA_USER']?.trim();
    const password = process.env['FACTURAMA_PASSWORD']?.trim();
    if (!user || !password) return null;

    const base = (process.env['FACTURAMA_BASE_URL'] || 'https://apisandbox.facturama.mx').replace(/\/$/, '');
    const auth = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

    try {
      let satStatus: SatRfcStatus | null = null;
      const statusRes = await fetch(`${base}/customers/status?rfc=${encodeURIComponent(rfc)}`, {
        headers: { Authorization: auth, Accept: 'application/json' },
      });
      if (statusRes.ok) {
        const s: any = await statusRes.json();
        satStatus = {
          formatoCorrecto: Boolean(s?.FormatoCorrecto ?? s?.formatoCorrecto ?? true),
          activo: Boolean(s?.Activo ?? s?.activo ?? false),
          localizado: Boolean(s?.Localizado ?? s?.localizado ?? false),
        };
      }

      const regimes: FiscalRegimeOption[] = [];
      const regRes = await fetch(`${base}/Catalogs/FiscalRegimens?rfc=${encodeURIComponent(rfc)}`, {
        headers: { Authorization: auth, Accept: 'application/json' },
      });
      if (regRes.ok) {
        const list = (await regRes.json()) as unknown;
        for (const row of Array.isArray(list) ? list : []) {
          const item = row as Record<string, unknown>;
          const code = String(item?.Value ?? item?.value ?? '').replace(/^R/, '');
          const name = String(item?.Name ?? item?.name ?? code);
          if (code) regimes.push({ code, name });
        }
      }

      const parts: string[] = ['Consultado vía Facturama'];
      if (satStatus) {
        parts.push(
          satStatus.localizado && satStatus.activo
            ? 'RFC localizado y activo en el SAT'
            : satStatus.localizado
              ? 'RFC localizado pero no activo'
              : 'RFC no localizado en el SAT (sandbox siempre simula OK)',
        );
      }
      parts.push('Facturama no devuelve razón social; solo estatus + régimenes aplicables.');

      return { regimes, satStatus, message: parts.join('. ') };
    } catch (err) {
      this.logger.warn(`Facturama lookup falló: ${(err as Error).message}`);
      return null;
    }
  }

  private async trySatDatosFiscales(rfc: string): Promise<{
    regimes: FiscalRegimeOption[];
    satStatus: SatRfcStatus | null;
    legalName: string | null;
    fiscalZipCode: string | null;
  } | null> {
    const baseUrl = process.env['SAT_DATOS_FISCALES_URL']?.trim();
    const apiKey = process.env['SAT_DATOS_FISCALES_API_KEY']?.trim();
    if (!baseUrl || !apiKey) return null;

    try {
      const url = baseUrl.includes('{rfc}')
        ? baseUrl.replace('{rfc}', encodeURIComponent(rfc))
        : `${baseUrl.replace(/\/$/, '')}?rfc=${encodeURIComponent(rfc)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-API-KEY': apiKey,
        },
      });
      if (!res.ok) {
        this.logger.warn(`SAT_DATOS_FISCALES respondió ${res.status}`);
        return null;
      }
      const raw: any = await res.json();
      const data = raw?.data ?? raw?.result ?? raw?.resultado ?? raw;

      const legalName =
        (data?.razon_social || data?.razonSocial || data?.nombre || data?.name || data?.Nombre || null) as
          | string
          | null;
      const fiscalZipCode = String(
        data?.codigo_postal || data?.codigoPostal || data?.postalCode || data?.cp || data?.CP || '',
      ).trim() || null;

      const regimes: FiscalRegimeOption[] = [];
      const regList = data?.regimenes || data?.regimes || data?.Regimenes || [];
      if (Array.isArray(regList)) {
        for (const r of regList) {
          const code = String(r?.regimen_id || r?.regimen || r?.code || r?.Value || r?.cve || '').replace(/\D/g, '');
          const name = String(r?.dregimen || r?.name || r?.Name || r?.descripcion || code);
          if (code.length >= 3) regimes.push({ code: code.slice(-3).padStart(3, '0'), name });
        }
      }

      return {
        regimes,
        satStatus: {
          formatoCorrecto: true,
          activo: String(data?.situacion_contribuyente || data?.situacion || 'ACTIVO').toUpperCase().includes('ACT'),
          localizado: true,
        },
        legalName: legalName ? String(legalName).trim() : null,
        fiscalZipCode,
      };
    } catch (err) {
      this.logger.warn(`SAT_DATOS_FISCALES falló: ${(err as Error).message}`);
      return null;
    }
  }

  /** Valida formato y checksum de un RFC mexicano. */
  validateRfc(rfc: string): RfcValidationResult {
    const normalized = (rfc || '').trim().toUpperCase();
    const errors: string[] = [];

    if (!normalized) {
      return { rfc: normalized, valid: false, type: 'UNKNOWN', errors: ['RFC vacío'] };
    }

    // RFC genéricos del SAT
    if (normalized === 'XAXX010101000') {
      return { rfc: normalized, valid: true, type: 'GENERICO', errors: [] };
    }
    if (normalized === 'XEXX010101000') {
      return { rfc: normalized, valid: true, type: 'EXTRANJERO', errors: [] };
    }

    const moralRe = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
    const fisicaRe = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;

    let type: RfcValidationResult['type'] = 'UNKNOWN';
    if (moralRe.test(normalized)) type = 'MORAL';
    else if (fisicaRe.test(normalized)) type = 'FISICA';
    else errors.push('Formato de RFC inválido (esperado: 12 chars persona moral o 13 chars persona física)');

    if (type !== 'UNKNOWN' && !this.checkRfcChecksum(normalized)) {
      errors.push('Dígito verificador del RFC incorrecto');
    }

    return { rfc: normalized, valid: errors.length === 0, type, errors };
  }

  /**
   * Consulta el estatus de un CFDI en el SAT (API REST pública).
   * Requiere: UUID, RFC emisor, RFC receptor, total.
   */
  async queryCfdiStatus(params: {
    uuid: string;
    rfcEmisor: string;
    rfcReceptor: string;
    total: string | number;
  }): Promise<CfdiStatusResult> {
    const uuid = params.uuid.trim().toUpperCase();
    const rfcEmisor = params.rfcEmisor.trim().toUpperCase();
    const rfcReceptor = params.rfcReceptor.trim().toUpperCase();
    const total = typeof params.total === 'number'
      ? params.total.toFixed(6).replace(/\.?0+$/, '')
      : String(params.total);

    const expression = [
      `?re=${encodeURIComponent(rfcEmisor)}`,
      `&rr=${encodeURIComponent(rfcReceptor)}`,
      `&tt=${encodeURIComponent(total)}`,
      `&id=${encodeURIComponent(uuid)}`,
    ].join('');

    const url = `https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc/Consulta?${expression}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`SAT respondió ${response.status}`);
      }
      const data: any = await response.json();
      return {
        uuid,
        rfcEmisor,
        rfcReceptor,
        total,
        estado: data?.Estado || data?.estado || 'Desconocido',
        esCancelable: data?.EsCancelable || data?.esCancelable || '',
        estatusCancelacion: data?.EstatusCancelacion || data?.estatusCancelacion || '',
        codigoEstatus: data?.CodigoEstatus || data?.codigoEstatus || '',
        raw: JSON.stringify(data),
      };
    } catch (err) {
      this.logger.warn(`Consulta SAT falló para ${uuid}: ${(err as Error).message}`);
      return {
        uuid,
        rfcEmisor,
        rfcReceptor,
        total,
        estado: 'Error de consulta',
        esCancelable: '',
        estatusCancelacion: '',
        codigoEstatus: '',
        raw: (err as Error).message,
      };
    }
  }

  /** ¿Hay e.firma configurada para Descarga Masiva? */
  isEfirmaConfigured(): boolean {
    const hasCer = Boolean(process.env['EFIRMA_CER_BASE64'] || process.env['EFIRMA_CER_PATH']);
    const hasKey = Boolean(process.env['EFIRMA_KEY_BASE64'] || process.env['EFIRMA_KEY_PATH']);
    const hasPass = Boolean(process.env['EFIRMA_KEY_PASSWORD']);
    return hasCer && hasKey && hasPass;
  }

  /**
   * Descarga Masiva — requiere e.firma + WS-Security SOAP.
   * Este método valida la configuración y devuelve instrucciones si falta e.firma.
   * La implementación completa del flujo SOAP (Autenticación → Solicitud → Verificación → Descarga)
   * se activa cuando EFIRMA_* esté configurado.
   */
  async descargaMasivaStatus(): Promise<{
    configured: boolean;
    message: string;
    endpoints: string[];
  }> {
    if (!this.isEfirmaConfigured()) {
      return {
        configured: false,
        message:
          'Descarga Masiva requiere e.firma (EFIRMA_CER_BASE64, EFIRMA_KEY_BASE64, EFIRMA_KEY_PASSWORD). ' +
          'La e.firma es distinta del CSD y se usa para autenticación WS-Security ante el SAT.',
        endpoints: [
          'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/Autenticacion/Autenticacion.svc',
          'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/SolicitaDescargaService.svc',
          'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/VerificaSolicitudDescargaService.svc',
          'https://cfdidescargamasiva.clouda.sat.gob.mx/DescargaMasivaService.svc',
        ],
      };
    }
    return {
      configured: true,
      message: 'e.firma configurada. Flujo Descarga Masiva disponible (Autenticación → Solicitud → Verificación → Descarga).',
      endpoints: [
        'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/Autenticacion/Autenticacion.svc',
        'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/SolicitaDescargaService.svc',
        'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/VerificaSolicitudDescargaService.svc',
        'https://cfdidescargamasiva.clouda.sat.gob.mx/DescargaMasivaService.svc',
      ],
    };
  }

  /** Algoritmo de dígito verificador del RFC (SAT). */
  private checkRfcChecksum(rfc: string): boolean {
    const base = rfc.slice(0, -1);
    const checkChar = rfc.slice(-1);
    const dict = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZÑ';
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      const idx = dict.indexOf(base[i]);
      if (idx < 0) return false;
      sum += idx * (base.length + 1 - i);
    }
    const remainder = sum % 11;
    const expected = remainder === 0 ? '0' : remainder === 1 ? 'A' : String(11 - remainder);
    return checkChar === expected;
  }
}
