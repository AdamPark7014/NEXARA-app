import type { CsdService } from './csd.service.js';
import type { PacStampInput } from './pac.types.js';

/**
 * Constructor de CFDI 4.0 sellado (cadena original + sello con CSD).
 *
 * Genera el XML `cfdi:Comprobante` 4.0 con Emisor, Receptor, Conceptos e Impuestos,
 * calcula la cadena original según la secuencia del Anexo 20 y la sella con el CSD
 * del emisor. El PAC recibe este XML ya sellado y lo timbra (agrega el UUID / SelloSAT).
 *
 * Soporta TipoDeComprobante:
 *   I = Ingreso (factura), E = Egreso (nota de crédito).
 */

const CFDI_NS = 'http://www.sat.gob.mx/cfd/4';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
const SCHEMA_LOCATION =
  'http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd';

function esc(value: string): string {
  return String(value ?? '').replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

/**
 * Redondeo a centavos, como número.
 *
 * Todo importe se redondea **una sola vez, aquí, antes de sumarse**. Sumar
 * valores a plena precisión y redondear el total al final no da lo mismo que
 * sumar los valores ya redondeados, y el SAT valida exactamente eso: que
 * `TotalImpuestosTrasladados` sea la suma de los `Importe` que aparecen
 * impresos en los conceptos. Un centavo de diferencia y el PAC rechaza el
 * timbrado con un error que no explica nada.
 */
export function cents(n: number): number {
  const escalado = (Number(n) || 0) * 100;
  // El epsilon va **relativo a la magnitud**. Uno fijo (`Number.EPSILON`, del
  // orden de 1e-16) no alcanza para corregir valores grandes: 1.005 se guarda
  // como 1.00499999999999989, y a escala 100 le falta ~1.4e-14 para llegar al
  // medio centavo. Con el epsilon fijo se redondeaba hacia abajo justo en los
  // importes terminados en medio centavo, que son los habituales al aplicar
  // 16 % sobre precios con dos decimales.
  const ajuste = Math.abs(escalado) * Number.EPSILON * 4;
  return Math.round(escalado + Math.sign(escalado) * ajuste) / 100;
}

/** 2 decimales tipo importe. */
function m(n: number): string {
  return cents(n).toFixed(2);
}
/** 6 decimales tipo tasa/cuota. */
function r6(n: number): string {
  return (Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000).toFixed(6);
}

/** Fecha CFDI: `yyyy-MM-ddTHH:mm:ss` en hora local (sin zona). */
function cfdiDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

interface BuiltConcept {
  claveProdServ: string;
  claveUnidad: string;
  unidad: string;
  cantidad: number;
  descripcion: string;
  valorUnitario: number;
  importe: number;
  descuento: number;
  base: number;
  ivaRate: number; // 0.16, 0.08, 0
  ivaAmount: number;
  ivaRetAmount: number;
  isrRetAmount: number;
}

export interface SealedCfdi {
  xml: string;
  cadenaOriginal: string;
  sello: string;
  noCertificado: string;
}

export interface BuildOptions {
  tipoComprobante?: 'I' | 'E';
  relatedUuids?: string[];
  relationType?: string; // 01, 02, 03... (para Egreso normalmente 01)
}

export function buildSealedCfdi(
  input: PacStampInput,
  csd: CsdService,
  opts: BuildOptions = {},
): SealedCfdi {
  if (!csd.isConfigured()) {
    throw new Error('CSD no configurado: no se puede sellar el CFDI localmente');
  }

  const tipo = opts.tipoComprobante || 'I';
  const fecha = cfdiDate(new Date());
  const noCertificado = csd.noCertificado;
  const certificado = csd.certificadoBase64;
  const serie = input.serie || 'A';
  const folio = (input.folio || input.invoiceNumber.replace(/[^0-9]/g, '') || '1').slice(0, 40);
  const moneda = input.currency || 'MXN';
  const tipoCambio = moneda !== 'MXN' && input.exchangeRate ? input.exchangeRate : null;
  const formaPago = (input.paymentForm || 'FP99').replace(/^FP/, '').padStart(2, '0');
  const metodoPago = input.paymentMethod || 'PUE';
  const lugarExpedicion = (input.emisor.zipCode || input.receptor.zipCode || '00000').slice(0, 5);
  const receptorZip = (input.receptor.zipCode || input.emisor.zipCode || '00000').slice(0, 5);
  const emisorRegime = (input.emisor.regime || 'R601').replace(/^R/, '');
  const receptorRegime = (input.receptor.regime || 'R616').replace(/^R/, '');
  const usoCfdi = input.cfdiUsage || (tipo === 'E' ? 'G02' : 'G03');

  // Conceptos + impuestos
  const concepts: BuiltConcept[] = input.items.map((it) => {
    const cantidad = it.quantity;
    const valorUnitario = it.unitPrice;
    // Cada importe queda redondeado ya aquí, para que lo que se suma sea
    // exactamente lo que después se imprime en el XML.
    const importe = cents(cantidad * valorUnitario);
    const descuento = cents(it.discount || 0);
    const base = cents(importe - descuento);
    const ivaRate = it.taxRate != null ? it.taxRate / 100 : 0.16;
    const ivaAmount = cents(base * ivaRate);
    const ivaRetAmount = cents(it.ivaRetAmount ?? 0);
    const isrRetAmount = cents(it.isrRetAmount ?? 0);
    const iepsRate = it.iepsRate != null ? it.iepsRate / 100 : 0;
    const iepsAmount = cents(it.iepsAmount ?? base * iepsRate);
    return {
      claveProdServ: it.satProductKey || '01010101',
      claveUnidad: it.satUnitKey || 'E48',
      unidad: it.unitName || 'Servicio',
      cantidad,
      descripcion: it.description,
      valorUnitario,
      importe,
      descuento,
      base,
      ivaRate,
      ivaAmount,
      ivaRetAmount,
      isrRetAmount,
    };
  });

  // Los totales suman valores YA redondeados, así que coinciden con lo impreso
  // en cada concepto. El `cents` exterior sólo limpia el ruido binario de la
  // suma; no cambia el centavo.
  const subTotal = cents(concepts.reduce((s, c) => s + c.importe, 0));
  const descuentoTotal = cents(concepts.reduce((s, c) => s + c.descuento, 0));
  const totalTraslados = cents(concepts.reduce((s, c) => s + c.ivaAmount, 0));
  const totalRetIva = cents(concepts.reduce((s, c) => s + c.ivaRetAmount, 0));
  const totalRetIsr = cents(concepts.reduce((s, c) => s + c.isrRetAmount, 0));
  const totalRetenciones = cents(totalRetIva + totalRetIsr);
  // La base del traslado global es la suma de las bases de los conceptos, no
  // `subTotal - descuentoTotal` recalculado: así no puede desviarse de ellas.
  const baseTraslados = cents(concepts.reduce((s, c) => s + c.base, 0));
  const total = cents(subTotal - descuentoTotal + totalTraslados - totalRetenciones);

  // ── Construcción de nodos Conceptos ──
  const conceptosXml = concepts
    .map((c) => {
      const trasladoNode = `<cfdi:Traslado Base="${m(c.base)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="${r6(c.ivaRate)}" Importe="${m(c.ivaAmount)}"/>`;
      const retNodes: string[] = [];
      if (c.isrRetAmount > 0) {
        const isrRate = c.base > 0 ? c.isrRetAmount / c.base : 0;
        retNodes.push(`<cfdi:Retencion Base="${m(c.base)}" Impuesto="001" TipoFactor="Tasa" TasaOCuota="${r6(isrRate)}" Importe="${m(c.isrRetAmount)}"/>`);
      }
      if (c.ivaRetAmount > 0) {
        const ivaRetRate = c.base > 0 ? c.ivaRetAmount / c.base : 0;
        retNodes.push(`<cfdi:Retencion Base="${m(c.base)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="${r6(ivaRetRate)}" Importe="${m(c.ivaRetAmount)}"/>`);
      }
      const impuestosNode =
        `<cfdi:Impuestos>` +
        `<cfdi:Traslados>${trasladoNode}</cfdi:Traslados>` +
        (retNodes.length ? `<cfdi:Retenciones>${retNodes.join('')}</cfdi:Retenciones>` : '') +
        `</cfdi:Impuestos>`;
      const descAttr = c.descuento > 0 ? ` Descuento="${m(c.descuento)}"` : '';
      return (
        `<cfdi:Concepto ClaveProdServ="${esc(c.claveProdServ)}" Cantidad="${r6(c.cantidad)}" ClaveUnidad="${esc(c.claveUnidad)}" Unidad="${esc(c.unidad)}" Descripcion="${esc(c.descripcion)}" ValorUnitario="${m(c.valorUnitario)}" Importe="${m(c.importe)}"${descAttr} ObjetoImp="02">` +
        impuestosNode +
        `</cfdi:Concepto>`
      );
    })
    .join('');

  // ── Nodo Impuestos totales ──
  const retencionesTotalesNode =
    totalRetenciones > 0
      ? `<cfdi:Retenciones>` +
        (totalRetIsr > 0 ? `<cfdi:Retencion Impuesto="001" Importe="${m(totalRetIsr)}"/>` : '') +
        (totalRetIva > 0 ? `<cfdi:Retencion Impuesto="002" Importe="${m(totalRetIva)}"/>` : '') +
        `</cfdi:Retenciones>`
      : '';
  const trasladosTotalesNode =
    `<cfdi:Traslados>` +
    `<cfdi:Traslado Base="${m(baseTraslados)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${m(totalTraslados)}"/>` +
    `</cfdi:Traslados>`;
  const impuestosTotalesNode =
    `<cfdi:Impuestos${totalRetenciones > 0 ? ` TotalImpuestosRetenidos="${m(totalRetenciones)}"` : ''} TotalImpuestosTrasladados="${m(totalTraslados)}">` +
    retencionesTotalesNode +
    trasladosTotalesNode +
    `</cfdi:Impuestos>`;

  // ── CfdiRelacionados (para Egreso / notas de crédito) ──
  const relatedXml =
    opts.relatedUuids && opts.relatedUuids.length
      ? `<cfdi:CfdiRelacionados TipoRelacion="${esc(opts.relationType || '01')}">` +
        opts.relatedUuids.map((u) => `<cfdi:CfdiRelacionado UUID="${esc(u)}"/>`).join('') +
        `</cfdi:CfdiRelacionados>`
      : '';

  // ── Atributos del Comprobante ──
  const tipoCambioAttr = tipoCambio ? ` TipoCambio="${r6(tipoCambio)}"` : '';
  const descuentoAttr = descuentoTotal > 0 ? ` Descuento="${m(descuentoTotal)}"` : '';

  const comprobanteAttrs =
    `xmlns:cfdi="${CFDI_NS}" xmlns:xsi="${XSI_NS}" xsi:schemaLocation="${SCHEMA_LOCATION}" ` +
    `Version="4.0" Serie="${esc(serie)}" Folio="${esc(folio)}" Fecha="${fecha}" ` +
    `Sello="__SELLO__" FormaPago="${formaPago}" NoCertificado="${noCertificado}" Certificado="${certificado}" ` +
    `SubTotal="${m(subTotal)}"${descuentoAttr} Moneda="${moneda}"${tipoCambioAttr} Total="${m(total)}" ` +
    `TipoDeComprobante="${tipo}" Exportacion="01" MetodoPago="${metodoPago}" LugarExpedicion="${lugarExpedicion}"`;

  // ── Cadena original (Anexo 20, secuencia CFDI 4.0) ──
  const cadenaParts: string[] = [
    '4.0',
    serie,
    folio,
    fecha,
    formaPago,
    noCertificado,
    m(subTotal),
    descuentoTotal > 0 ? m(descuentoTotal) : '',
    moneda,
    tipoCambio ? r6(tipoCambio) : '',
    m(total),
    tipo,
    '01', // Exportacion
    metodoPago,
    lugarExpedicion,
  ];
  // Emisor
  cadenaParts.push(input.emisor.rfc, input.emisor.name, emisorRegime);
  // Receptor
  cadenaParts.push(
    input.receptor.rfc,
    input.receptor.name,
    receptorZip,
    receptorRegime,
    usoCfdi,
  );
  // Conceptos
  for (const c of concepts) {
    cadenaParts.push(
      c.claveProdServ,
      r6(c.cantidad),
      c.claveUnidad,
      c.unidad,
      c.descripcion,
      m(c.valorUnitario),
      m(c.importe),
    );
    if (c.descuento > 0) cadenaParts.push(m(c.descuento));
    cadenaParts.push('02'); // ObjetoImp
  }
  const cadenaOriginal = `||${cadenaParts.map((p) => String(p ?? '').replace(/\|/g, ' ').trim()).join('|')}||`;

  const sello = csd.sign(cadenaOriginal);

  const emisorXml = `<cfdi:Emisor Rfc="${esc(input.emisor.rfc)}" Nombre="${esc(input.emisor.name)}" RegimenFiscal="${emisorRegime}"/>`;
  const receptorXml = `<cfdi:Receptor Rfc="${esc(input.receptor.rfc)}" Nombre="${esc(input.receptor.name)}" DomicilioFiscalReceptor="${receptorZip}" RegimenFiscalReceptor="${receptorRegime}" UsoCFDI="${usoCfdi}"/>`;

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<cfdi:Comprobante ${comprobanteAttrs.replace('__SELLO__', sello)}>` +
    relatedXml +
    emisorXml +
    receptorXml +
    `<cfdi:Conceptos>${conceptosXml}</cfdi:Conceptos>` +
    impuestosTotalesNode +
    `</cfdi:Comprobante>`;

  return { xml, cadenaOriginal, sello, noCertificado };
}

/** CFDI tipo P — Complemento de Pago (Pagos 2.0) sellado con CSD. */
export function buildSealedPaymentCfdi(
  input: import('./pac.types.js').PacPaymentComplementInput,
  csd: CsdService,
): SealedCfdi {
  if (!csd.isConfigured()) {
    throw new Error('CSD no configurado: no se puede sellar complemento de pago');
  }

  const fecha = cfdiDate(new Date());
  const noCertificado = csd.noCertificado;
  const certificado = csd.certificadoBase64;
  const serie = input.serie || 'P';
  const folio = (input.folio || input.invoiceNumber.replace(/[^0-9]/g, '') || '1').slice(0, 40);
  const lugarExpedicion = (input.emisor.zipCode || input.receptor.zipCode || '00000').slice(0, 5);
  const receptorZip = (input.receptor.zipCode || input.emisor.zipCode || '00000').slice(0, 5);
  const emisorRegime = (input.emisor.regime || 'R601').replace(/^R/, '');
  const receptorRegime = (input.receptor.regime || 'R616').replace(/^R/, '');
  const moneda = input.payment.currency || 'MXN';
  const monto = input.payment.amount;
  const formaPago = (input.payment.paymentForm || 'FP03').replace(/^FP/, '').padStart(2, '0');
  const fechaPago = input.payment.date.replace('Z', '').slice(0, 19);

  const doc = input.relatedDocs[0];
  const doctoRelacionado = doc
    ? `<pago20:DoctoRelacionado IdDocumento="${esc(doc.uuid)}"` +
      `${doc.serie ? ` Serie="${esc(doc.serie)}"` : ''}` +
      `${doc.folio ? ` Folio="${esc(doc.folio)}"` : ''}` +
      ` MonedaDR="${doc.currency || 'MXN'}" EquivalenciaDR="1" NumParcialidad="${doc.partialityNumber}"` +
      ` ImpSaldoAnt="${m(doc.previousBalance)}" ImpPagado="${m(doc.amountPaid)}" ImpSaldoInsoluto="${m(doc.remainingBalance)}" ObjetoImpDR="02">` +
      `<pago20:ImpuestosDR><pago20:TrasladosDR><pago20:TrasladoDR BaseDR="${m(doc.amountPaid / 1.16)}" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="${m(doc.amountPaid - doc.amountPaid / 1.16)}"/></pago20:TrasladosDR></pago20:ImpuestosDR>` +
      `</pago20:DoctoRelacionado>`
    : '';

  const pagosXml =
    `<pago20:Pago FechaPago="${fechaPago}" FormaDePagoP="${formaPago}" MonedaP="${moneda}" Monto="${m(monto)}"` +
    `${input.payment.operationNumber ? ` NumOperacion="${esc(input.payment.operationNumber)}"` : ''}>` +
    doctoRelacionado +
    `</pago20:Pago>`;

  const complementoXml =
    `<cfdi:Complemento><pago20:Pagos Version="2.0" xmlns:pago20="http://www.sat.gob.mx/Pagos20">${pagosXml}</pago20:Pagos></cfdi:Complemento>`;

  const conceptoXml =
    `<cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>`;

  const cadenaOriginal = `||4.0|${serie}|${folio}|${fecha}|${noCertificado}|0.00|XXX|0.00|P|01|${lugarExpedicion}|${input.emisor.rfc}|${input.emisor.name}|${emisorRegime}|${input.receptor.rfc}|${input.receptor.name}|${receptorZip}|${receptorRegime}|CP01|84111506|1|ACT|Pago|0.00|0.00|01||`;

  const sello = csd.sign(cadenaOriginal);

  const comprobanteAttrs =
    `xmlns:cfdi="${CFDI_NS}" xmlns:xsi="${XSI_NS}" xmlns:pago20="http://www.sat.gob.mx/Pagos20"` +
    ` xsi:schemaLocation="${SCHEMA_LOCATION} http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd"` +
    ` Version="4.0" Serie="${esc(serie)}" Folio="${esc(folio)}" Fecha="${fecha}"` +
    ` Sello="${sello}" NoCertificado="${noCertificado}" Certificado="${certificado}"` +
    ` SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P" Exportacion="01" LugarExpedicion="${lugarExpedicion}"`;

  const emisorXml = `<cfdi:Emisor Rfc="${esc(input.emisor.rfc)}" Nombre="${esc(input.emisor.name)}" RegimenFiscal="${emisorRegime}"/>`;
  const receptorXml = `<cfdi:Receptor Rfc="${esc(input.receptor.rfc)}" Nombre="${esc(input.receptor.name)}" DomicilioFiscalReceptor="${receptorZip}" RegimenFiscalReceptor="${receptorRegime}" UsoCFDI="CP01"/>`;

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<cfdi:Comprobante ${comprobanteAttrs}>` +
    emisorXml +
    receptorXml +
    `<cfdi:Conceptos>${conceptoXml}</cfdi:Conceptos>` +
    complementoXml +
    `</cfdi:Comprobante>`;

  return { xml, cadenaOriginal, sello, noCertificado };
}
