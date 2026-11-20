/**
 * Filtro de campos de la matriz «quién ve qué» (Entrega 2): para quien no tiene «Ver precios», los montos
 * de una respuesta salen en `null` y el objeto que los traía lleva `montosOcultos: true`, para que la
 * web y las apps escriban «Confidencial». El resto del registro no cambia. Módulo PURO.
 *
 * Negado por omisión: se esconde todo número cuyo nombre suena a dinero (importe, monto, costo,
 * presupuesto, margen, sueldo…), no una lista cerrada de campos, para que un campo nuevo no se escape.
 * Los conteos («partidasSinCosto», «personasSinSueldo») y las horas no son dinero y se dejan.
 */

/** Nombres que son dinero. Se prueban contra la clave completa, sin distinguir mayúsculas. */
const RE_DINERO =
  /(importe|monto|pagado|costo|cost(?!umbre)|budget|amount|precio|price|tarifa|margen|margin|saldo|sueldo|salari|subtotal|utilidad|profit|revenue|ingreso|egreso|gasto|expense|anticipo|adeudo|cobrado|facturado|valor|descuento|discount|^iva$|^isr$|^tax|impuesto|lineTotal|totalAmount|totalCost|totalAnio|totalMes|grandTotal)/i;

/** Conteos, horas, banderas y puntajes que llevan una de esas palabras pero no son dinero. */
const RE_NO_DINERO =
  /^(sin|con|num|count|cantidad|cuantos|total(es)?(Partidas|Items|Personas|Horas|Km|Registros)|horas|personas|sesiones|salidas|partidas|personas|fichas)|(Score|Count|Cantidad|Horas|Km|Pct?Avance|Id|Ids|At|Fecha|Origen|Tipo|Estado|Nombre|Label|Etiqueta)$|^(origenTarifa|tarifaDe|recostear|reactivar|costea)$/;

/** Contenedores cuyo contenido numérico es todo dinero aunque la clave no lo diga (`totales.semana`). */
const RE_CONTENEDOR_DINERO = /^(totales|montos|costos|saldos|tarifas|importes|precios|presupuesto|finanzas|financiero)$/i;

/** Contenedores donde `total` es el total en dinero (la cotización del proyecto). */
const RE_CONTENEDOR_CON_TOTAL = /^(cotizacion|cotizacionGanada|quote|cotizaciones|quotes|venta|ventas|orden|order|factura|invoice)$/i;

/** Hermanas que delatan que el `total` de un objeto es dinero. */
const HERMANAS_DE_TOTAL = ['currency', 'moneda', 'subtotal', 'iva', 'tax', 'quoteNumber', 'folio'];

/** Prisma.Decimal y parecidos: se esconden como número. */
function esDecimal(v: unknown): boolean {
  return Boolean(v && typeof v === 'object' && typeof (v as { toFixed?: unknown }).toFixed === 'function' && typeof (v as { s?: unknown }).s === 'number');
}

function esNumerico(v: unknown): boolean {
  if (typeof v === 'number' || typeof v === 'bigint') return true;
  if (esDecimal(v)) return true;
  return typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.trim());
}

export function esClaveDeDinero(clave: string): boolean {
  if (RE_NO_DINERO.test(clave)) return false;
  return RE_DINERO.test(clave);
}

function esPlano(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (v instanceof Date || esDecimal(v)) return false;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const PROFUNDIDAD_MAX = 12;

/**
 * Devuelve una copia con los montos en `null` (no muta la entrada: la respuesta puede venir de caché).
 * Un objeto que perdió al menos un monto lleva `montosOcultos: true`.
 */
export function ocultarMontos<T>(valor: T): T {
  const vistos = new WeakMap<object, unknown>();

  const recorrer = (v: unknown, padre: string | null, todoEsDinero: boolean, nivel: number): unknown => {
    if (nivel > PROFUNDIDAD_MAX) return v;
    if (Array.isArray(v)) {
      if (vistos.has(v)) return vistos.get(v);
      const copia: unknown[] = [];
      vistos.set(v, copia);
      for (const x of v) copia.push(recorrer(x, padre, todoEsDinero, nivel + 1));
      return copia;
    }
    if (!esPlano(v)) return v;
    if (vistos.has(v)) return vistos.get(v);
    const copia: Record<string, unknown> = {};
    vistos.set(v, copia);
    const totalEsDinero =
      todoEsDinero ||
      (padre != null && RE_CONTENEDOR_CON_TOTAL.test(padre)) ||
      HERMANAS_DE_TOTAL.some((h) => h in v) ||
      Object.keys(v).some((k) => k !== 'total' && esClaveDeDinero(k) && esNumerico(v[k]));
    let oculto = false;
    for (const [k, x] of Object.entries(v)) {
      const dinero =
        esNumerico(x) &&
        !RE_NO_DINERO.test(k) &&
        (esClaveDeDinero(k) || (k === 'total' && totalEsDinero) || (todoEsDinero && !/^(id|.*Id)$/.test(k)));
      if (dinero) {
        copia[k] = null;
        oculto = true;
        continue;
      }
      const contenedor = RE_CONTENEDOR_DINERO.test(k) || (todoEsDinero && esPlano(x));
      copia[k] = recorrer(x, k, contenedor, nivel + 1);
    }
    if (oculto) copia['montosOcultos'] = true;
    return copia;
  };

  return recorrer(valor, null, false, 0) as T;
}

/**
 * Lo que manda de regreso quien no ve precios: si un formulario reenvía el monto que recibió vacío
 * («Confidencial»), no debe borrar el valor guardado. Quita (mutando el cuerpo) los montos en `null` o
 * vacíos y la marca `montosOcultos`; un monto escrito a mano (la gasolina que carga un chofer) se respeta.
 */
export function limpiarEntradaSinPrecios(cuerpo: unknown, nivel = 0): void {
  if (nivel > PROFUNDIDAD_MAX) return;
  if (Array.isArray(cuerpo)) {
    for (const x of cuerpo) limpiarEntradaSinPrecios(x, nivel + 1);
    return;
  }
  if (!esPlano(cuerpo)) return;
  for (const [k, x] of Object.entries(cuerpo)) {
    if (k === 'montosOcultos' || ((x === null || x === '') && (esClaveDeDinero(k) || k === 'total'))) {
      delete cuerpo[k];
      continue;
    }
    limpiarEntradaSinPrecios(x, nivel + 1);
  }
}

/** Tipos de documento de proyecto que llevan precios (contrato): solo con «Ver precios». */
export const DOCUMENTOS_CON_PRECIOS: readonly string[] = ['CONTRATO'];

/**
 * Quita de las listas de documentos (`documents`/`documentos`) los contratos. Devuelve copia; los
 * planos, actas, minutas y reportes se quedan para quien entra al proyecto.
 */
export function ocultarContratos<T>(valor: T, nivel = 0): T {
  if (nivel > PROFUNDIDAD_MAX) return valor;
  if (Array.isArray(valor)) return valor.map((x) => ocultarContratos(x, nivel + 1)) as T;
  if (!esPlano(valor)) return valor;
  const copia: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(valor)) {
    if ((k === 'documents' || k === 'documentos') && Array.isArray(x)) {
      copia[k] = x
        .filter((d) => !(esPlano(d) && DOCUMENTOS_CON_PRECIOS.includes(String(d['kind'] ?? ''))))
        .map((d) => ocultarContratos(d, nivel + 1));
    } else {
      copia[k] = ocultarContratos(x, nivel + 1);
    }
  }
  return copia as T;
}
