/**
 * Lectura de un CFDI (3.3 o 4.0) recibido: lo justo para ligarlo a un pago o gasto.
 *
 * No se añade una dependencia de XML: del comprobante solo se leen atributos de cinco nodos
 * (Comprobante, Emisor, Receptor, TimbreFiscalDigital y el bloque de Impuestos del documento),
 * y sus nombres los fija el Anexo 20. El prefijo de namespace no se da por hecho (`cfdi:` es lo
 * habitual, pero el SAT no lo exige).
 */

export interface CfdiLeido {
  uuid: string;
  version: string;
  fecha: string;
  serie: string | null;
  folio: string | null;
  /** I ingreso · E egreso · P pago · N nómina · T traslado. */
  tipo: string;
  moneda: string;
  subtotal: number;
  descuento: number;
  total: number;
  /** IVA trasladado del documento (impuesto 002). */
  iva: number;
  /** IEPS y otros traslados que no son IVA. */
  otrosTraslados: number;
  retenciones: number;
  metodoPago: string | null;
  formaPago: string | null;
  emisor: { rfc: string; nombre: string | null; regimen: string | null };
  receptor: { rfc: string; nombre: string | null; cp: string | null; uso: string | null };
}

export class CfdiInvalidoError extends Error {}

const ENTIDADES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodificar(valor: string): string {
  return valor.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m) => {
    if (m.startsWith('&#x')) return String.fromCharCode(parseInt(m.slice(3, -1), 16));
    if (m.startsWith('&#')) return String.fromCharCode(Number(m.slice(2, -1)));
    return ENTIDADES[m] ?? m;
  });
}

function atributos(etiqueta: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_][\w.-]*(?::[\w.-]+)?)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(etiqueta))) {
    const nombre = m[1].includes(':') && !m[1].startsWith('xmlns') ? m[1].split(':')[1] : m[1];
    out[nombre] = decodificar(m[3] ?? m[4] ?? '');
  }
  return out;
}

/** Primera etiqueta de apertura con ese nombre local, sin importar el prefijo. */
function etiqueta(xml: string, nombre: string, desde = 0): { attrs: Record<string, string>; fin: number } | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${nombre}(?=[\\s/>])([^>]*)>`, 'g');
  re.lastIndex = desde;
  const m = re.exec(xml);
  if (!m) return null;
  return { attrs: atributos(m[1]), fin: re.lastIndex };
}

function importe(valor: string | undefined): number {
  if (valor == null || valor.trim() === '') return 0;
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export function leerCfdi(xmlCrudo: string): CfdiLeido {
  const xml = String(xmlCrudo ?? '').replace(/^﻿/, '');
  if (!xml.trim()) throw new CfdiInvalidoError('El archivo está vacío.');

  const comprobante = etiqueta(xml, 'Comprobante');
  if (!comprobante) throw new CfdiInvalidoError('No es un CFDI: falta el nodo Comprobante.');
  const c = comprobante.attrs;

  const emisor = etiqueta(xml, 'Emisor', comprobante.fin)?.attrs ?? {};
  const receptor = etiqueta(xml, 'Receptor', comprobante.fin)?.attrs ?? {};
  const timbre = etiqueta(xml, 'TimbreFiscalDigital')?.attrs ?? {};

  const uuid = (timbre['UUID'] ?? '').trim().toUpperCase();
  if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(uuid)) {
    throw new CfdiInvalidoError('El CFDI no está timbrado: no trae el UUID del SAT.');
  }
  const rfcEmisor = (emisor['Rfc'] ?? emisor['rfc'] ?? '').trim().toUpperCase();
  const rfcReceptor = (receptor['Rfc'] ?? receptor['rfc'] ?? '').trim().toUpperCase();
  if (!RFC.test(rfcEmisor) || !RFC.test(rfcReceptor)) {
    throw new CfdiInvalidoError('El CFDI no trae RFC de emisor y receptor válidos.');
  }

  // Los impuestos del documento son el nodo Impuestos que sigue a </Conceptos>; los de cada
  // concepto van dentro de Conceptos y no se suman aparte.
  const finConceptos = xml.search(/<\/(?:[\w.-]+:)?Conceptos>/);
  let iva = 0;
  let otrosTraslados = 0;
  let retenciones = 0;
  if (finConceptos >= 0) {
    const resto = xml.slice(finConceptos);
    const impuestos = etiqueta(resto, 'Impuestos');
    if (impuestos) {
      retenciones = importe(impuestos.attrs['TotalImpuestosRetenidos']);
      const cierre = resto.search(/<\/(?:[\w.-]+:)?Impuestos>/);
      const bloque = resto.slice(impuestos.fin, cierre >= 0 ? cierre : undefined);
      const re = /<(?:[\w.-]+:)?Traslado(?=[\s/>])([^>]*)>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(bloque))) {
        const t = atributos(m[1]);
        if (t['Impuesto'] === '002') iva += importe(t['Importe']);
        else otrosTraslados += importe(t['Importe']);
      }
    }
  }

  return {
    uuid,
    version: c['Version'] ?? c['version'] ?? '',
    fecha: (c['Fecha'] ?? '').slice(0, 10),
    serie: c['Serie']?.trim() || null,
    folio: c['Folio']?.trim() || null,
    tipo: (c['TipoDeComprobante'] ?? 'I').toUpperCase(),
    moneda: c['Moneda'] ?? 'MXN',
    subtotal: importe(c['SubTotal']),
    descuento: importe(c['Descuento']),
    total: importe(c['Total']),
    iva: Math.round(iva * 100) / 100,
    otrosTraslados: Math.round(otrosTraslados * 100) / 100,
    retenciones,
    metodoPago: c['MetodoPago'] ?? null,
    formaPago: c['FormaPago'] ?? null,
    emisor: { rfc: rfcEmisor, nombre: emisor['Nombre']?.trim() || null, regimen: emisor['RegimenFiscal'] ?? null },
    receptor: {
      rfc: rfcReceptor,
      nombre: receptor['Nombre']?.trim() || null,
      cp: receptor['DomicilioFiscalReceptor'] ?? null,
      uso: receptor['UsoCFDI'] ?? null,
    },
  };
}

/** «…4F2A»: los últimos cuatro del UUID, como se muestra en la tabla. */
export function uuidCorto(uuid: string | null | undefined): string {
  const limpio = String(uuid ?? '').replace(/-/g, '');
  return limpio ? `…${limpio.slice(-4).toUpperCase()}` : '';
}
