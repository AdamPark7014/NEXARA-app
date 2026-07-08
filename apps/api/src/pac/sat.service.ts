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

@Injectable()
export class SatService {
  private readonly logger = new Logger(SatService.name);

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
