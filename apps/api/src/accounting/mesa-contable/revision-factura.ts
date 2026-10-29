import { digitoRfcCorrecto } from '../../pac/rfc-checksum.js';

/**
 * «Antes de timbrar»: lo que el SAT o el PAC rechazarían, dicho antes de intentarlo. Un `error`
 * impide timbrar; un `aviso` se lee y se decide.
 */

export type NivelRevision = 'ok' | 'aviso' | 'error';

export interface Revision {
  clave: string;
  nivel: NivelRevision;
  texto: string;
  detalle: string | null;
}

export interface FacturaARevisar {
  receptorRfc: string | null;
  receptorName: string | null;
  receptorRegime: string | null;
  receptorZipCode: string | null;
  cfdiUsage: string | null;
  satPaymentMethod: string | null;
  satPaymentForm: string | null;
  totalAmount: number;
  esAnticipo: boolean;
  cfdiRelationType: string | null;
  conceptos: Array<{ unitPrice: number; quantity: number; total: number }>;
}

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** «R601» o «601» → «601»; «FP03» o «03» → «03». Los enums de Prisma llevan prefijo. */
export const claveSat = (v: string | null | undefined): string => String(v ?? '').replace(/^(R|FP)/, '');

export const REGIMENES: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas morales con fines no lucrativos',
  '605': 'Sueldos y salarios',
  '606': 'Arrendamiento',
  '612': 'Personas físicas con actividades empresariales',
  '616': 'Sin obligaciones fiscales',
  '621': 'Incorporación fiscal',
  '625': 'RESICO personas físicas',
  '626': 'RESICO personas morales',
};

export function revisarFactura(f: FacturaARevisar, timbradoConectado: boolean): Revision[] {
  const r: Revision[] = [];
  const add = (clave: string, nivel: NivelRevision, texto: string, detalle: string | null = null) =>
    r.push({ clave, nivel, texto, detalle });

  const rfc = String(f.receptorRfc ?? '').trim().toUpperCase();
  if (!rfc) add('rfc', 'error', 'Falta el RFC del cliente');
  else if (!RFC.test(rfc)) add('rfc', 'error', `El RFC ${rfc} no tiene el formato del SAT`);
  else if (!digitoRfcCorrecto(rfc)) {
    add('rfc', 'aviso', `El dígito verificador del RFC ${rfc} no cuadra`, 'Confírmalo contra la constancia de situación fiscal.');
  } else add('rfc', 'ok', `RFC ${rfc} con formato válido`);

  if (!String(f.receptorName ?? '').trim()) add('razon-social', 'error', 'Falta la razón social del cliente');

  const regimen = claveSat(f.receptorRegime);
  const uso = String(f.cfdiUsage ?? '').trim();
  if (!regimen) add('regimen', 'error', 'Falta el régimen fiscal del cliente');
  else if (regimen === '616' && uso !== 'S01') {
    add('regimen', 'error', 'Un cliente sin obligaciones fiscales (616) solo admite el uso S01');
  } else if (regimen === '605' && uso !== 'S01' && uso !== 'CN01') {
    add('regimen', 'aviso', 'El régimen 605 (sueldos) casi nunca recibe facturas de servicios', 'Revisa el régimen en su constancia.');
  } else add('regimen', 'ok', `El régimen ${regimen} admite el uso ${uso || 'G03'}`);

  if (!/^\d{5}$/.test(String(f.receptorZipCode ?? '').trim())) {
    add('cp', 'error', 'Falta el código postal fiscal del cliente');
  } else add('cp', 'ok', `Código postal fiscal ${String(f.receptorZipCode).trim()} capturado`);

  if (!f.conceptos.length) add('conceptos', 'error', 'La factura no tiene conceptos');
  else if (f.conceptos.some((c) => !(c.unitPrice > 0))) add('conceptos', 'error', 'Hay conceptos sin precio');

  const suma = Math.round(f.conceptos.reduce((s, c) => s + c.total, 0) * 100) / 100;
  if (f.conceptos.length && Math.abs(suma - f.totalAmount) > 0.01) {
    add('cuadre', 'error', `Los conceptos suman ${suma.toFixed(2)} y la factura dice ${f.totalAmount.toFixed(2)}`);
  } else if (f.conceptos.length) add('cuadre', 'ok', 'Los impuestos cuadran al centavo con los conceptos');

  const metodo = String(f.satPaymentMethod ?? '').toUpperCase();
  const forma = claveSat(f.satPaymentForm);
  if (metodo === 'PPD' && forma !== '99') add('forma', 'error', 'Con PPD la forma de pago tiene que ser 99 (por definir)');
  if (metodo === 'PUE' && forma === '99') add('forma', 'error', 'Con PUE la forma de pago no puede ser 99: indica cómo pagó');
  if (metodo === 'PPD' && forma === '99') {
    add('ppd', 'aviso', 'Es PPD: cuando el cliente pague, el complemento de pago aparecerá en «Por facturar»');
  }

  if (f.esAnticipo) add('anticipo', 'aviso', 'Es un CFDI de anticipo: la factura final se relaciona con él (07)');
  else if (f.cfdiRelationType === '07') {
    add('anticipo', 'aviso', 'Factura del remanente: relacionada con el anticipo (07) y con su base descontada', 'Confírmalo con tu procedimiento de anticipos.');
  }

  if (!timbradoConectado) add('timbrado', 'aviso', 'El timbrado todavía no está conectado: se puede revisar, no timbrar');
  return r;
}

export function puedeTimbrar(revisiones: Revision[], timbradoConectado: boolean): boolean {
  return timbradoConectado && !revisiones.some((x) => x.nivel === 'error');
}
