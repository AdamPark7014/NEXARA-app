import { cents } from './cfdi-xml.builder.js';
import { digitoRfcCorrecto } from './rfc-checksum.js';
import { SAT_FISCAL_REGIMES } from './sat.service.js';
import type { PacPaymentComplementInput, PacStampInput } from './pac.types.js';

/**
 * Revisión CFDI 4.0 que se hace en Core ANTES de mandar al PAC.
 *
 * El sandbox de Facturama no compara contra el SAT (nombre y régimen del RFC, CP de su constancia), así que lo que no
 * se revise aquí solo aparece en producción, con la factura ya en «timbrando». Las reglas salen de los catálogos
 * c_UsoCFDI, c_RegimenFiscal, c_FormaPago y c_Moneda del Anexo 20 y de las reglas del RFC genérico.
 *
 * Devuelve la lista de problemas en español (vacía si todo cuadra); quien llama decide cómo mostrarla.
 */

const RFC_PUBLICO_EN_GENERAL = 'XAXX010101000';
const RFC_EXTRANJERO = 'XEXX010101000';
const RFC_MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z\d]{3}$/;
const RFC_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/;

const REGIMENES_EMPRESA = ['601', '603', '606', '612', '620', '621', '622', '623', '624', '625', '626'];
const REGIMENES_DEDUCCIONES_PERSONALES = ['605', '606', '607', '608', '611', '612', '614', '615', '625'];
const REGIMENES_TODOS = [
  '601', '603', '605', '606', '607', '608', '610', '611', '612', '614', '615', '616', '620', '621', '622', '623',
  '624', '625', '626',
];

/** c_UsoCFDI: regímenes del receptor que admite cada uso (CFDI 4.0). P01 ya no existe en 4.0. */
export const USOS_CFDI: Record<string, string[]> = {
  G01: REGIMENES_EMPRESA,
  G02: REGIMENES_EMPRESA,
  G03: REGIMENES_EMPRESA,
  I01: REGIMENES_EMPRESA,
  I02: REGIMENES_EMPRESA,
  I03: REGIMENES_EMPRESA,
  I04: REGIMENES_EMPRESA,
  I05: REGIMENES_EMPRESA,
  I06: REGIMENES_EMPRESA,
  I07: REGIMENES_EMPRESA,
  I08: REGIMENES_EMPRESA,
  D01: REGIMENES_DEDUCCIONES_PERSONALES,
  D02: REGIMENES_DEDUCCIONES_PERSONALES,
  D03: REGIMENES_DEDUCCIONES_PERSONALES,
  D04: REGIMENES_DEDUCCIONES_PERSONALES,
  D05: REGIMENES_DEDUCCIONES_PERSONALES,
  D06: REGIMENES_DEDUCCIONES_PERSONALES,
  D07: REGIMENES_DEDUCCIONES_PERSONALES,
  D08: REGIMENES_DEDUCCIONES_PERSONALES,
  D09: REGIMENES_DEDUCCIONES_PERSONALES,
  D10: REGIMENES_DEDUCCIONES_PERSONALES,
  S01: REGIMENES_TODOS,
  CP01: REGIMENES_TODOS,
  CN01: ['605'],
};

/** c_FormaPago vigente. */
const FORMAS_PAGO = new Set([
  '01', '02', '03', '04', '05', '06', '08', '12', '13', '14', '15', '17', '23', '24', '25', '26', '27', '28', '29', '30',
  '31', '99',
]);

/** Monedas con las que Core factura hoy (c_Moneda las tiene todas; estas son las que se aceptan sin revisar). */
const MONEDAS = new Set(['MXN', 'USD', 'EUR', 'CAD', 'GBP', 'JPY', 'CHF', 'CNY']);

/** El SAT guarda la razón social sin el régimen de capital: con «S.A. de C.V.» el nombre ya no coincide. */
const REGIMEN_CAPITAL = /[\s,.](S\.?\s?A\.?\s?P?\.?\s?I?\.?\s?(DE\s+C\.?\s?V\.?)?|S\.?\s?DE\s+R\.?\s?L\.?(\s?DE\s+C\.?\s?V\.?)?|S\.?\s?C\.?|A\.?\s?C\.?|S\.?\s?A\.?\s?S\.?)\.?$/i;

const sinR = (v?: string | null) => String(v ?? '').trim().toUpperCase().replace(/^R(?=\d{3}$)/, '');
const sinFP = (v?: string | null) => String(v ?? '').trim().toUpperCase().replace(/^FP/, '');

type Persona = 'MORAL' | 'FISICA' | 'GENERICO' | 'EXTRANJERO' | null;

function tipoPersona(rfc: string): Persona {
  if (rfc === RFC_PUBLICO_EN_GENERAL) return 'GENERICO';
  if (rfc === RFC_EXTRANJERO) return 'EXTRANJERO';
  if (RFC_MORAL.test(rfc)) return 'MORAL';
  if (RFC_FISICA.test(rfc)) return 'FISICA';
  return null;
}

function revisarRfc(quien: string, rfcCrudo: string | null | undefined, problemas: string[]): Persona {
  const rfc = String(rfcCrudo ?? '').trim().toUpperCase();
  if (!rfc) {
    problemas.push(`Falta el RFC del ${quien}.`);
    return null;
  }
  const tipo = tipoPersona(rfc);
  if (!tipo) {
    problemas.push(`El RFC del ${quien} (${rfc}) no tiene el formato del SAT: 12 caracteres (empresa) o 13 (persona física).`);
    return null;
  }
  if ((tipo === 'MORAL' || tipo === 'FISICA') && !digitoRfcCorrecto(rfc)) {
    problemas.push(`El dígito verificador del RFC del ${quien} (${rfc}) no cuadra: revísalo contra su constancia de situación fiscal.`);
  }
  return tipo;
}

function revisarRegimen(quien: string, regimenCrudo: string | null | undefined, tipo: Persona, problemas: string[]): string | null {
  const regimen = sinR(regimenCrudo);
  if (!regimen) {
    problemas.push(`Falta el régimen fiscal del ${quien}.`);
    return null;
  }
  const catalogo = SAT_FISCAL_REGIMES.find((r) => r.code === regimen);
  if (!catalogo) {
    problemas.push(`El régimen fiscal ${regimen} del ${quien} no existe en el catálogo del SAT.`);
    return null;
  }
  if (tipo === 'MORAL' && !catalogo.moral) {
    problemas.push(`El régimen ${regimen} (${catalogo.name}) es de persona física y el RFC del ${quien} es de empresa.`);
  }
  if (tipo === 'FISICA' && !catalogo.fisica) {
    problemas.push(`El régimen ${regimen} (${catalogo.name}) es de empresa y el RFC del ${quien} es de persona física.`);
  }
  return regimen;
}

function revisarCp(quien: string, cp: string | null | undefined, problemas: string[]) {
  if (!/^\d{5}$/.test(String(cp ?? '').trim())) {
    problemas.push(`El código postal fiscal del ${quien} debe tener 5 dígitos (el de su constancia de situación fiscal).`);
  }
}

function revisarNombre(quien: string, nombre: string | null | undefined, problemas: string[]) {
  const n = String(nombre ?? '').trim();
  if (!n || /^(emisor|receptor)$/i.test(n)) {
    problemas.push(`Falta la razón social del ${quien}.`);
    return;
  }
  if (REGIMEN_CAPITAL.test(` ${n}`)) {
    problemas.push(
      `La razón social del ${quien} («${n}») lleva el régimen de capital (S.A. de C.V., S. de R.L., S.C.…). ` +
        'En CFDI 4.0 va como en la constancia del SAT, sin esa terminación.',
    );
  }
}

function revisarMoneda(moneda: string | null | undefined, tipoCambio: number | null | undefined, problemas: string[]) {
  const m = String(moneda || 'MXN').trim().toUpperCase();
  if (!MONEDAS.has(m)) problemas.push(`Moneda ${m} no soportada para facturar (MXN, USD, EUR…).`);
  if (m !== 'MXN' && !(Number(tipoCambio) > 0)) problemas.push(`Para facturar en ${m} hace falta el tipo de cambio.`);
}

/** Receptor + uso del CFDI, con las reglas del RFC genérico. */
function revisarReceptor(
  receptor: PacStampInput['receptor'],
  usoCrudo: string | null | undefined,
  problemas: string[],
  { usoFijo }: { usoFijo?: string } = {},
) {
  const tipo = revisarRfc('cliente', receptor.rfc, problemas);
  if (tipo === 'EXTRANJERO') {
    problemas.push('Facturar a un cliente extranjero (XEXX010101000) pide residencia fiscal y su número de registro: todavía no está soportado.');
    return;
  }
  if (tipo === 'GENERICO') {
    // El adaptador fija régimen 616, uso S01 y el CP de expedición. Con el nombre «PUBLICO EN GENERAL» el SAT la trata
    // como factura global y exige el nodo InformacionGlobal (periodicidad, meses, año), que Core no arma todavía; a un
    // cliente sin RFC se le factura con XAXX010101000 y su nombre (probado en el sandbox de Facturama, 29-10-2026).
    const nombre = String(receptor.name ?? '').trim();
    if (!nombre) {
      problemas.push('Falta el nombre del cliente: con el RFC genérico XAXX010101000 va el nombre de quien compra.');
    } else if (/^P[ÚU]BLICO EN GENERAL$/i.test(nombre)) {
      problemas.push(
        'La factura global al público en general («PUBLICO EN GENERAL») todavía no está soportada. Para un cliente sin RFC, ' +
          'deja XAXX010101000 y escribe su nombre.',
      );
    }
    return;
  }
  revisarNombre('cliente', receptor.name, problemas);
  revisarCp('cliente', receptor.zipCode, problemas);
  const regimen = revisarRegimen('cliente', receptor.regime, tipo, problemas);
  const uso = (usoFijo || String(usoCrudo ?? '')).trim().toUpperCase();
  if (!uso) {
    problemas.push('Falta el uso del CFDI.');
    return;
  }
  if (uso === 'P01') {
    problemas.push('El uso «P01 · Por definir» ya no existe en CFDI 4.0: elige el que corresponda (G03 gastos en general, por ejemplo).');
    return;
  }
  const admite = USOS_CFDI[uso];
  if (!admite) {
    problemas.push(`El uso de CFDI ${uso} no existe en el catálogo del SAT.`);
    return;
  }
  if (regimen === '616' && uso !== 'S01' && uso !== 'CP01') {
    problemas.push('Un cliente sin obligaciones fiscales (régimen 616) solo admite el uso S01 · Sin efectos fiscales.');
  } else if (regimen && !admite.includes(regimen)) {
    problemas.push(`El uso ${uso} no es válido para un cliente con régimen ${regimen}: revisa el uso o el régimen en su constancia.`);
  }
}

function revisarSerieFolio(serie: string | null | undefined, folio: string | null | undefined, invoiceNumber: string, problemas: string[]) {
  const s = String(serie ?? '').trim();
  const f = String(folio || invoiceNumber.replace(/[^0-9]/g, '')).trim();
  if (s && !/^[A-Za-z0-9]{1,25}$/.test(s)) problemas.push(`La serie «${s}» solo puede llevar letras y números (máximo 25).`);
  if (!f) problemas.push(`La factura ${invoiceNumber} no tiene folio numérico para el CFDI.`);
  else if (f.length > 40) problemas.push(`El folio ${f} pasa de 40 caracteres.`);
}

/** Factura (I) o nota de crédito (E). `emisorEsperado` es el RFC del perfil fiscal de la empresa. */
export function validarCfdiParaTimbrar(input: PacStampInput, emisorEsperado?: string | null): string[] {
  const problemas: string[] = [];

  const tipoEmisor = revisarRfc('emisor', input.emisor.rfc, problemas);
  revisarRegimen('emisor', input.emisor.regime, tipoEmisor, problemas);
  revisarCp('emisor (lugar de expedición)', input.emisor.zipCode, problemas);
  const esperado = String(emisorEsperado ?? '').trim().toUpperCase();
  if (esperado && String(input.emisor.rfc ?? '').trim().toUpperCase() !== esperado) {
    problemas.push(
      `El borrador trae como emisor el RFC ${input.emisor.rfc} y la empresa factura con ${esperado}: vuelve a preparar la factura.`,
    );
  }

  revisarReceptor(input.receptor, input.cfdiUsage, problemas);
  revisarSerieFolio(input.serie, input.folio, input.invoiceNumber, problemas);
  revisarMoneda(input.currency, input.exchangeRate, problemas);

  const metodo = String(input.paymentMethod || 'PUE').trim().toUpperCase();
  const forma = sinFP(input.paymentForm);
  if (metodo !== 'PUE' && metodo !== 'PPD') problemas.push(`Método de pago ${metodo} inválido (PUE o PPD).`);
  if (forma && !FORMAS_PAGO.has(forma)) problemas.push(`La forma de pago ${forma} no existe en el catálogo del SAT.`);
  if (metodo === 'PUE' && (!forma || forma === '99')) {
    problemas.push('Con método PUE (una sola exhibición) la forma de pago no puede ser «99 · Por definir»: indica cómo pagó el cliente.');
  }
  if (input.tipoComprobante === 'E' && metodo !== 'PUE') {
    problemas.push('Una nota de crédito se emite con método PUE.');
  }

  if (!input.items?.length) problemas.push('La factura no tiene conceptos.');
  let subtotal = 0;
  let descuentos = 0;
  let impuestos = 0;
  let retenciones = 0;
  (input.items ?? []).forEach((item, i) => {
    const n = `Concepto ${i + 1}${item.description ? ` («${String(item.description).slice(0, 40)}»)` : ''}`;
    if (!String(item.description ?? '').trim()) problemas.push(`${n}: falta la descripción.`);
    if (!/^\d{8}$/.test(String(item.satProductKey ?? ''))) {
      problemas.push(`${n}: la clave de producto o servicio del SAT debe tener 8 dígitos (catálogo c_ClaveProdServ).`);
    }
    if (!/^[A-Z0-9]{1,3}$/.test(String(item.satUnitKey ?? '').toUpperCase())) {
      problemas.push(`${n}: falta la clave de unidad del SAT (por ejemplo E48 servicio, H87 pieza).`);
    }
    if (!(item.quantity > 0)) problemas.push(`${n}: la cantidad debe ser mayor a cero.`);
    if (!(item.unitPrice > 0)) problemas.push(`${n}: el precio unitario debe ser mayor a cero.`);
    const importe = cents(item.unitPrice * item.quantity);
    const descuento = cents(item.discount || 0);
    if (descuento < 0 || descuento > importe) problemas.push(`${n}: el descuento no puede ser negativo ni mayor que el importe.`);
    const tasa = item.taxRate != null ? Number(item.taxRate) : 16;
    if (![0, 8, 16].includes(tasa)) problemas.push(`${n}: tasa de IVA de ${tasa} %; solo se admite 16, 8 o 0.`);
    if ((item.iepsAmount ?? 0) > 0 || (item.iepsRate ?? 0) > 0) {
      problemas.push(`${n}: lleva IEPS y el timbrado todavía no lo emite; el total del CFDI no cuadraría con el de Core.`);
    }
    const base = cents(importe - descuento);
    subtotal += importe;
    descuentos += descuento;
    impuestos += cents(base * (tasa / 100));
    retenciones += cents(item.ivaRetAmount || 0) + cents(item.isrRetAmount || 0);
  });
  const totalConceptos = cents(subtotal - descuentos + impuestos - retenciones);
  if (input.items?.length && Math.abs(totalConceptos - cents(input.total)) > 0.01) {
    problemas.push(
      `El total de la factura ($${cents(input.total).toFixed(2)}) no cuadra con sus conceptos ($${totalConceptos.toFixed(2)}): ` +
        'vuelve a guardar el borrador para recalcularlo.',
    );
  }
  return problemas;
}

/** Complemento de pago (CFDI tipo P). */
export function validarComplementoPago(input: PacPaymentComplementInput, emisorEsperado?: string | null): string[] {
  const problemas: string[] = [];
  const tipoEmisor = revisarRfc('emisor', input.emisor.rfc, problemas);
  revisarRegimen('emisor', input.emisor.regime, tipoEmisor, problemas);
  revisarCp('emisor (lugar de expedición)', input.emisor.zipCode, problemas);
  const esperado = String(emisorEsperado ?? '').trim().toUpperCase();
  if (esperado && String(input.emisor.rfc ?? '').trim().toUpperCase() !== esperado) {
    problemas.push(`La factura pagada se emitió con el RFC ${input.emisor.rfc} y la empresa factura con ${esperado}.`);
  }
  revisarReceptor(input.receptor, 'CP01', problemas, { usoFijo: 'CP01' });
  revisarSerieFolio(input.serie, input.folio, input.invoiceNumber, problemas);
  revisarMoneda(input.payment.currency, input.payment.exchangeRate, problemas);
  const forma = sinFP(input.payment.paymentForm);
  if (!forma || forma === '99' || !FORMAS_PAGO.has(forma)) {
    problemas.push('El complemento de pago necesita la forma real en que se pagó (no «99 · Por definir»).');
  }
  if (!(input.payment.amount > 0)) problemas.push('El monto del pago debe ser mayor a cero.');
  for (const d of input.relatedDocs) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.uuid)) {
      problemas.push(`El UUID de la factura pagada (${d.uuid}) no es válido.`);
    }
    if (cents(d.amountPaid) > cents(d.previousBalance)) {
      problemas.push(`El pago ($${cents(d.amountPaid).toFixed(2)}) es mayor que el saldo de la factura ($${cents(d.previousBalance).toFixed(2)}).`);
    }
    if (Math.abs(cents(d.previousBalance - d.amountPaid) - cents(d.remainingBalance)) > 0.01) {
      problemas.push('El saldo insoluto no cuadra con el saldo anterior menos lo pagado.');
    }
  }
  return problemas;
}
