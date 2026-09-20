/**
 * Personalización por cotización: qué secciones y columnas lleva el PDF, carta de presentación,
 * condiciones comerciales, moneda y firmas. Se guarda en `Cotizacion.opciones` (JSON).
 *
 * Sin opciones guardadas todo sigue como antes: todas las secciones, tabla con precio unitario y sin
 * marca/imagen/descuento, sin carta, MXN y una firma «Elaboró» con el autor.
 *
 * Aquí también vive lo que guarda una plantilla de cotización (textos, secciones, columnas,
 * términos y, si se pide, sus partidas).
 *
 * Módulo puro (sin Nest ni Prisma): lo usan el servicio, la vista previa y la API de mentira.
 */
import { normalizarBloques } from './alcance-bloques.js';
import { normalizarSegmento, type Segmento } from './terminos-segmento.js';

export type SeccionesOpcionales = { objetivo: boolean; alcance: boolean; planos: boolean; terminos: boolean; firma: boolean };
export type ColumnasOpcionales = { marcaModelo: boolean; imagen: boolean; descuento: boolean; precioUnitario: boolean };
export type CartaPresentacion = { dirigidaA: string; cargo?: string; mensaje: string };
export type Moneda = 'MXN' | 'USD';
export type Firmante = { nombre: string; cargo?: string };

/** Condiciones comerciales que alimentan los términos. Vacío = esa línea no se imprime. */
export type CondicionesComerciales = { formaPago: string; tiempoEntrega: string; garantia: string };

/** Lo que se guarda en `Cotizacion.opciones`. */
export type OpcionesCotizacion = {
  secciones: SeccionesOpcionales;
  columnas: ColumnasOpcionales;
  carta: CartaPresentacion | null;
  /** Solo con USD: «Tipo de cambio del día de pago según DOF», etc. */
  tipoCambioNota: string;
  condiciones: CondicionesComerciales;
  /** `null` = el autor de la cotización, con su puesto. */
  elaboro: Firmante | null;
  autorizo: (Firmante & { userId?: number | null }) | null;
};

/** Contrato con el generador del PDF (`PropuestaPayload.opciones`). */
export type OpcionesPropuesta = {
  secciones: SeccionesOpcionales;
  columnas: ColumnasOpcionales;
  carta: CartaPresentacion | null;
  moneda: Moneda;
  tipoCambioNota?: string;
  firmas: Array<{ nombre: string; cargo?: string; rol: 'Elaboró' | 'Autorizó' }>;
};

export const SECCIONES_POR_OMISION: SeccionesOpcionales = {
  objetivo: true,
  alcance: true,
  planos: true,
  terminos: true,
  firma: true,
};

export const COLUMNAS_POR_OMISION: ColumnasOpcionales = {
  marcaModelo: false,
  imagen: false,
  descuento: false,
  precioUnitario: true,
};

export function opcionesPorOmision(): OpcionesCotizacion {
  return {
    secciones: { ...SECCIONES_POR_OMISION },
    columnas: { ...COLUMNAS_POR_OMISION },
    carta: null,
    tipoCambioNota: '',
    condiciones: { formaPago: '', tiempoEntrega: '', garantia: '' },
    elaboro: null,
    autorizo: null,
  };
}

const texto = (valor: unknown, max: number) => (typeof valor === 'string' ? valor.replace(/\r\n?/g, '\n').trim().slice(0, max) : '');
const bandera = (valor: unknown, omision: boolean) => (typeof valor === 'boolean' ? valor : omision);
const objeto = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};

function firmante(crudo: unknown): Firmante | null {
  const o = objeto(crudo);
  const nombre = texto(o['nombre'], 120);
  if (!nombre) return null;
  const cargo = texto(o['cargo'], 120);
  return cargo ? { nombre, cargo } : { nombre };
}

/**
 * Lo que venga (JSON guardado, DTO del editor, plantilla) → opciones completas y sanas. Tolera
 * `null`, campos de más, tipos equivocados y textos enormes: nunca lanza.
 */
export function normalizarOpciones(crudo: unknown): OpcionesCotizacion {
  const o = objeto(crudo);
  const s = objeto(o['secciones']);
  const c = objeto(o['columnas']);
  const k = objeto(o['condiciones']);
  const cartaCruda = objeto(o['carta']);
  const dirigidaA = texto(cartaCruda['dirigidaA'], 160);
  const mensaje = texto(cartaCruda['mensaje'], 4000);
  const cargoCarta = texto(cartaCruda['cargo'], 120);
  const autorizo = firmante(o['autorizo']);
  const userId = Number(objeto(o['autorizo'])['userId']);

  return {
    secciones: {
      objetivo: bandera(s['objetivo'], true),
      alcance: bandera(s['alcance'], true),
      planos: bandera(s['planos'], true),
      terminos: bandera(s['terminos'], true),
      firma: bandera(s['firma'], true),
    },
    columnas: {
      marcaModelo: bandera(c['marcaModelo'], false),
      imagen: bandera(c['imagen'], false),
      descuento: bandera(c['descuento'], false),
      precioUnitario: bandera(c['precioUnitario'], true),
    },
    carta: dirigidaA || mensaje ? { dirigidaA, ...(cargoCarta ? { cargo: cargoCarta } : {}), mensaje } : null,
    tipoCambioNota: texto(o['tipoCambioNota'], 200),
    condiciones: {
      formaPago: texto(k['formaPago'], 300),
      tiempoEntrega: texto(k['tiempoEntrega'], 300),
      garantia: texto(k['garantia'], 300),
    },
    elaboro: firmante(o['elaboro']),
    autorizo: autorizo ? { ...autorizo, ...(Number.isInteger(userId) && userId > 0 ? { userId } : {}) } : null,
  };
}

/** Moneda de la cotización (`Cotizacion.currency`); cualquier otra cosa es MXN. */
export const normalizarMoneda = (valor: unknown): Moneda => (String(valor ?? '').trim().toUpperCase() === 'USD' ? 'USD' : 'MXN');

/**
 * Opciones para el generador del PDF. Las firmas se arman aquí: «Elaboró» es el autor (o quien se
 * haya escrito en su lugar) y «Autorizó» solo si se capturó.
 */
export function opcionesDePropuesta(
  opciones: OpcionesCotizacion,
  contexto: { moneda?: unknown; autor?: Firmante | null },
): OpcionesPropuesta {
  const moneda = normalizarMoneda(contexto.moneda);
  const elaboro = opciones.elaboro ?? contexto.autor ?? null;
  const firmas: OpcionesPropuesta['firmas'] = [];
  if (elaboro?.nombre) firmas.push({ nombre: elaboro.nombre, ...(elaboro.cargo ? { cargo: elaboro.cargo } : {}), rol: 'Elaboró' });
  if (opciones.autorizo?.nombre) {
    firmas.push({
      nombre: opciones.autorizo.nombre,
      ...(opciones.autorizo.cargo ? { cargo: opciones.autorizo.cargo } : {}),
      rol: 'Autorizó',
    });
  }
  return {
    secciones: { ...opciones.secciones },
    columnas: { ...opciones.columnas },
    carta: opciones.carta,
    moneda,
    ...(moneda === 'USD' && opciones.tipoCambioNota ? { tipoCambioNota: opciones.tipoCambioNota } : {}),
    firmas,
  };
}

/**
 * Condiciones comerciales sugeridas por segmento (el editor las ofrece ya escritas en una cotización
 * nueva). El anticipo y la vigencia son los que ya usa el resto del sistema.
 */
export function condicionesPorOmision(segmento: unknown): CondicionesComerciales & { anticipoPct: number; vigenciaDias: number } {
  const s: Segmento = normalizarSegmento(segmento);
  if (s === 'LICITACION') {
    return {
      formaPago: 'Conforme a las bases de la licitación y al contrato que de ella derive.',
      tiempoEntrega: 'El que señalen las bases y el programa de trabajo del contrato.',
      garantia: 'La que exijan las bases; garantía del fabricante en equipos.',
      anticipoPct: 0,
      vigenciaDias: 30,
    };
  }
  if (s === 'COMERCIAL') {
    return {
      formaPago: 'Transferencia electrónica o depósito bancario.',
      tiempoEntrega: 'De 3 a 5 días hábiles a partir del anticipo, sujeto a inventario.',
      garantia: 'Garantía del fabricante en los equipos.',
      anticipoPct: 50,
      vigenciaDias: 15,
    };
  }
  return {
    formaPago: 'Transferencia electrónica o depósito bancario.',
    tiempoEntrega: 'Según el programa de trabajo acordado con el cliente al confirmar el anticipo.',
    garantia: 'Garantía del fabricante en los equipos y 90 días en la mano de obra.',
    anticipoPct: 50,
    vigenciaDias: 15,
  };
}

// ─── Plantillas de cotización ────────────────────────────────────────────────

export type PartidaDePlantilla = {
  name: string;
  description?: string | null;
  unit?: string | null;
  qty: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
  grupo?: string | null;
  brand?: string | null;
  model?: string | null;
  imagenUrl?: string | null;
};

/** Lo que guarda una plantilla: nada del cliente ni del folio. */
export type ContenidoPlantilla = {
  segmento: Segmento;
  projectName: string;
  scope: string;
  objetivo: string;
  alcanceBloques: unknown[];
  /** Términos reescritos (`note`). */
  note: string;
  depositPercent: number;
  currency: Moneda;
  opciones: OpcionesCotizacion;
  /** Solo si se guardó «con partidas». */
  items: PartidaDePlantilla[];
};

const MAX_PARTIDAS_PLANTILLA = 400;

function partidaDePlantilla(crudo: unknown): PartidaDePlantilla | null {
  const p = objeto(crudo);
  const name = texto(p['name'], 200);
  if (!name) return null;
  const numero = (v: unknown, min: number, max: number, omision: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : omision;
  };
  const opcional = (v: unknown, max: number) => texto(v, max) || null;
  return {
    name,
    description: opcional(p['description'], 2000),
    unit: opcional(p['unit'], 40),
    qty: Math.round(numero(p['qty'], 1, 1_000_000, 1)),
    unitPrice: Math.round(numero(p['unitPrice'], 0, 1_000_000_000, 0) * 100) / 100,
    discount: numero(p['discount'], 0, 100, 0),
    tax: numero(p['tax'], 0, 100, 16),
    grupo: opcional(p['grupo'], 20),
    brand: opcional(p['brand'], 120),
    model: opcional(p['model'], 120),
    imagenUrl: opcional(p['imagenUrl'], 500),
  };
}

/** Plantilla guardada o recibida → contenido completo y sano. */
export function normalizarContenidoPlantilla(crudo: unknown): ContenidoPlantilla {
  const o = objeto(crudo);
  const items = Array.isArray(o['items']) ? (o['items'] as unknown[]).slice(0, MAX_PARTIDAS_PLANTILLA) : [];
  return {
    segmento: normalizarSegmento(o['segmento']),
    projectName: texto(o['projectName'], 200),
    scope: texto(o['scope'], 20_000),
    objetivo: texto(o['objetivo'], 20_000),
    alcanceBloques: normalizarBloques(o['alcanceBloques']) as unknown[],
    note: texto(o['note'], 20_000),
    depositPercent: Math.round(Math.min(100, Math.max(0, Number(o['depositPercent']) || 0))),
    currency: normalizarMoneda(o['currency']),
    opciones: normalizarOpciones(o['opciones']),
    items: items.map(partidaDePlantilla).filter((p): p is PartidaDePlantilla => Boolean(p)),
  };
}

/** Cotización guardada → contenido de plantilla (sin cliente, folio, fechas ni planos). */
export function contenidoDesdeCotizacion(
  quote: {
    segmento?: unknown;
    projectName?: string | null;
    scope?: string | null;
    objetivo?: string | null;
    alcanceBloques?: unknown;
    note?: string | null;
    depositPercent?: number | null;
    currency?: string | null;
    opciones?: unknown;
    items?: Array<Record<string, unknown>> | null;
  },
  conPartidas: boolean,
): ContenidoPlantilla {
  return normalizarContenidoPlantilla({
    segmento: quote.segmento,
    projectName: quote.projectName ?? '',
    scope: quote.scope ?? '',
    objetivo: quote.objetivo ?? '',
    alcanceBloques: quote.alcanceBloques ?? [],
    note: quote.note ?? '',
    depositPercent: quote.depositPercent ?? 0,
    currency: quote.currency ?? 'MXN',
    // La firma «Autorizó» es de esa cotización, no de la plantilla.
    opciones: { ...normalizarOpciones(quote.opciones), autorizo: null, elaboro: null },
    items: conPartidas
      ? (quote.items ?? []).map((i) => ({
          name: i['name'],
          description: i['description'],
          unit: i['unit'],
          qty: Number(i['qty']),
          unitPrice: Number(i['unitPrice']),
          discount: Number(i['discount']),
          tax: Number(i['tax']),
          grupo: i['grupo'],
          brand: i['brand'],
          model: i['model'],
          imagenUrl: i['imagenUrl'],
        }))
      : [],
  });
}
