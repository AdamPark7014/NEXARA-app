/**
 * La cotización que recibe el cliente, con el diseño de NEXARA («Memoria descriptiva y propuesta
 * técnica-económica»): portada, datos de la propuesta, alcance, planos, garantías, partidas, subtotal /
 * IVA / total, importe con letra, condiciones y firma. El costo y el margen no entran.
 */
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { importeConLetra } from './importe-letra.js';
import { factorMargen } from './cotizacion-totals.js';
import { normalizarOpciones, type ReferenciasCliente } from './personalizacion.js';
import { normalizarBloques } from './alcance-bloques.js';
import { puntosPorOmision, TITULOS_POR_OMISION } from './alcance-por-omision.js';
import { objetivoDePropuesta, type Objetivo } from './objetivo-plantilla.js';
import { ESTADO, estadoDesdeDb } from './estado-cotizacion.js';
import { grupoDePartida, GRUPOS, incluyeInstalacion, type GrupoPartida } from './partidas-grupos.js';
import { dibujarMarco, dibujarPortada, VERDE } from './cotizacion-marco.js';
import { anticipoDeCotizacion, terminosDeCotizacion, type Terminos } from './terminos-segmento.js';
import { segmentosLista } from './vinetas-texto.js';
import { alcanceDeMemoria, calculoDelCentro, justificacionDeMemoria, type LineaDeCamaras, type MemoriaDiseno } from './memoria-diseno.js';
import { anexarPaginasPdf, clasificarPlanos, type PlanoArchivo, type PlanosClasificados } from '../common/pdf/planos-pdf.js';
import { PDF_FUENTES as F, registrarFuentesCorporativas } from '../common/pdf/nexara-pdf-theme.js';

const VERDE_OSC = '#15735F';
const CARBON = '#24262A';
const GRIS = '#5F6368';
const GRIS_TITULO = '#4A4A4C';
const GRIS_RECUADRO = '#EFEFED';
const AZUL = '#0E2A47';
const AZUL_GRUPO = '#1F3F66';
const ZEBRA = '#F2F5F8';
const LINEA = '#D8DEE6';
const TINTA = '#222222';

const LM = 46;
const AW = 506;
const TITULO_X = 58;
/** Donde empieza el cuerpo de una hoja de continuación y donde termina, antes del pie. */
const TOP = 112;
const BOTTOM = 688;
const CUERPO = { size: 10.6, lh: 15.2 };
/** La tabla de precios sale más ancha que el texto, como en el diseño. */
const TABLA_X = 36;
const TABLA_W = 540;

/** Nombre de cada grupo en la tabla, como en el diseño. */
const ETIQUETA_DE_TABLA: Record<GrupoPartida, string> = {
  EQUIPOS: 'EQUIPAMIENTO ACTIVO Y ACCESORIOS',
  MATERIALES: 'INFRAESTRUCTURA Y MATERIALES',
  MANO_DE_OBRA: 'SERVICIOS DE IMPLEMENTACIÓN Y PUESTA A PUNTO',
};

/** Garantía de los trabajos cuando se cobra instalación y quien cotiza no escribió otra. */
const GARANTIA_DE_INSTALACION =
  'Los trabajos de mano de obra ejecutados por NEXARA cuentan con 6 meses de garantía en sitio contra vicios ocultos de implementación.';

const EXCLUSIONES_DE_GARANTIA = [
  'Manipulación por terceros: apertura de carcasas, alteración del cableado o cambios de configuración por personal ajeno a NEXARA.',
  'Vandalismo o daño mecánico: impactos de maquinaria, obras cercanas, cortes de ruta o robo.',
  'Descargas eléctricas y red del inmueble: rayos, cortocircuitos, falta de tierra física o voltajes fuera de rango.',
  'Caso fortuito o uso indebido: sismos, inundaciones, químicos o lavado a presión sobre los equipos.',
] as const;

/**
 * Datos fiscales del emisor: abren la primera hoja de toda cotización (los pidió Adam, arriba del
 * título). Van escritos aquí y no se leen de `company_profile` porque esa fila trae datos de relleno.
 */
export const EMISOR = {
  razon: 'New Engineering Expertise And Resource Advancement S.A. De C.V.',
  rfc: 'NEE240925V73',
  domicilio: 'Ignacio Allende 512 local 2 Santiago Momoxpan, 72775 San Pedro Cholula, Puebla',
  correo: 'gerencia@nexara.com.mx',
  telefonos: '2226960350',
} as const;

/** Los renglones del emisor tal como se imprimen; el primero (la razón social) va en negritas. */
export const RENGLONES_EMISOR: readonly string[] = [
  EMISOR.razon,
  `RFC: ${EMISOR.rfc}`,
  EMISOR.domicilio,
  `Correo electrónico: ${EMISOR.correo}`,
  `Teléfonos: ${EMISOR.telefonos}`,
];

const FIRMA = {
  nombre: 'CHRISTIAN EDUARDO DEL POZO SÁNCHEZ',
  cargo: 'REPRESENTANTE LEGAL DE',
  razon: EMISOR.razon.toUpperCase(),
};

const ENTREGA_DEFAULT = '15 días naturales, o según disponibilidad de inventario al confirmar el pedido.';
const GARANTIA_DEFAULT = 'La otorgada por el fabricante.';

/**
 * Nombre con el que el diseñador adjunta sus imágenes (igual en `lib/cctv/memoriaCotizacion.ts`): cada
 * una tiene su lugar fijo en el PDF. Un edificio de varios niveles lleva una hoja técnica por nivel.
 */
export const NOMBRE_VISTA_3D = 'Vista 3D general del sitio';
export const NOMBRE_PLANO_TECNICO = 'Plano técnico de distribución';
export const NOMBRE_VISTA_COBERTURA = 'Cobertura en el piso por nivel de detalle';

/** Los cuatro niveles de IEC 62676-4, de más a menos detalle, con los colores del plano y la maqueta. */
const NIVELES_DORI = [
  { clave: 'identificacion', titulo: 'Identificación', ppm: '250 PPM o más', uso: 'Se puede saber quién es una persona', color: '#0AA870' },
  { clave: 'reconocimiento', titulo: 'Reconocimiento', ppm: '125 PPM o más', uso: 'Se reconoce a alguien conocido', color: '#0D8CD9' },
  { clave: 'observacion', titulo: 'Observación', ppm: '62 PPM o más', uso: 'Se ven rasgos y la actividad', color: '#3D5CE6' },
  { clave: 'deteccion', titulo: 'Detección', ppm: '25 PPM o más', uso: 'Se nota que hay alguien', color: '#8C6BD9' },
] as const;

/** Datos que pide el cliente en su propio formato (Esquema de cotizaciones, formato A), en el orden en que se imprimen. */
const REFERENCIAS_DEL_CLIENTE: ReadonlyArray<[keyof ReferenciasCliente, string]> = [
  ['proyecto', 'Proyecto del cliente'],
  ['region', 'Región'],
  ['ritm', 'RITM'],
  ['requerimiento', 'Requerimiento'],
  ['sp', 'SP'],
  ['oc', 'Orden de compra'],
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PartidaFormato = {
  partida: string;
  /** Quien cotiza numeró a mano (`1.1`): el número se imprime y su orden manda sobre los grupos. */
  numeroPropio: boolean;
  grupo: GrupoPartida;
  titulo: string;
  marca: string;
  modelo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
};

export type FormatoNexara = {
  numero: string;
  fecha: string;
  vence: string;
  vigenciaDias: number;
  moneda: string;
  cliente: string;
  atencion: string;
  telefono: string;
  correo: string;
  ubicacion: string;
  proyecto: string;
  responsable: string;
  trabajo: string;
  pagoCorto: string;
  entrega: string;
  /** Frase de vigencia de las condiciones comerciales (la misma que edita la cotización). */
  vigencia: string;
  /** La forma de pago del editor. Vacía (la persona la borró): el renglón no se imprime. */
  condicionesPago: string;
  garantia: string;
  /** Nota del tipo de cambio («Personalizar»), para cotizaciones en dólares. */
  tipoCambioNota: string;
  /** Versión de la portada: la revisión, o la siguiente si es un borrador de algo que ya salió. */
  version: number;
  /** Lo escrito en el editor o el borrador corto de las partidas; `null` = apagado en «Personalizar». */
  objetivo: Objetivo | null;
  /** Párrafo de entrada del alcance (`scope`) y bloques sin título. */
  alcanceIntro: string[];
  /** Bloques con título del alcance; sin ninguno escrito, los puntos por omisión. */
  alcance: Array<{ titulo: string; texto: string; vinetas: string[]; especial?: 'lineas' | 'centro' }>;
  /** La ingeniería del diseño de cámaras; solo en lo que viene del diseñador. */
  memoria: MemoriaDiseno | null;
  /** El alcance ejecutivo sale de la memoria: nadie escribió el suyo. */
  ejecutivoDeMemoria: boolean;
  referencias: Array<[string, string]>;
  /** Porcentaje de anticipo, para imprimir cuánto es; 0 o 100: un solo pago. */
  anticipoPorciento: number;
  /** Título de cada apartado fijo: el que escribió quien cotiza o el del diseño. */
  titulos: { objetivo: string; garantias: string; cotizacion: string };
  /** false = «Planos» apagado en «Personalizar». */
  conPlanos: boolean;
  /** Renglones de la póliza; vacío = no se imprime (términos apagados o licitación: mandan las bases). */
  garantias: string[];
  partidas: PartidaFormato[];
  subtotal: number;
  /** false = el cliente no requiere factura: sin renglón de IVA y «precios sin IVA». */
  conIva: boolean;
  ivaPorciento: number;
  iva: number;
  total: number;
  letras: string;
  terminos: string[];
};

type QuoteLike = {
  quoteNumber?: string | null;
  issueDate?: Date | string | null;
  validUntil?: Date | string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  atencion?: string | null;
  trabajo?: string | null;
  projectName?: string | null;
  scope?: string | null;
  objetivo?: string | null;
  alcanceBloques?: unknown;
  status?: unknown;
  revision?: number | null;
  sentAt?: Date | string | null;
  preparedBy?: string | null;
  /** Con las partidas (si se cobra instalación) decide los términos por omisión. */
  segmento?: unknown;
  deliveryTime?: string | null;
  depositPercent?: number | null;
  /** 20 = el precio impreso ya incluye ese margen. Null o 0: el precio de la partida. */
  marginPercent?: unknown;
  /** false = sin factura: sin IVA. */
  conIva?: boolean | null;
  currency?: string | null;
  note?: string | null;
  opciones?: unknown;
  items?: Array<Record<string, unknown>> | null;
};

const dinero = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Párrafos de un texto libre: cada salto de línea es uno. */
const parrafosDe = (valor?: string | null) =>
  String(valor ?? '')
    .split(/\r?\n+/)
    // Lo pegado de Word trae tabuladores, que la fuente no tiene: saldrían como un cuadro negro.
    .map((t) => t.replace(/\t+/g, ' ').replace(/ {2,}/g, ' ').trim())
    .filter(Boolean);

const fechaCorta = (valor: Date | string | null | undefined): string => {
  if (!valor) return '';
  const iso = valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
};

const diasEntre = (desde: Date | string | null | undefined, hasta: Date | string | null | undefined): number => {
  const a = desde ? new Date(desde) : null;
  const b = hasta ? new Date(hasta) : null;
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 15;
  const dias = Math.round((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / 86_400_000);
  return dias > 0 ? dias : 15;
};

/** Lo que imprime «Tiempo de entrega» si la cotización no escribió el suyo. */
export const ENTREGA_POR_OMISION = ENTREGA_DEFAULT;
/** Lo que imprime «Garantía» si la cotización no escribió la suya. */
export const GARANTIA_POR_OMISION = GARANTIA_DEFAULT;

/**
 * Vigencia de las condiciones comerciales. Si quien cotiza escribió una frase, esa es la que sale
 * en el PDF; si no, la de siempre (días naturales y fecha de vencimiento).
 */
export function textoVigencia(dias: number, vence: string, propia?: string | null): string {
  const escrito = String(propia ?? '').trim();
  if (escrito) return escrito;
  if (dias > 0 && vence) return `${dias} días naturales (vence el ${vence})`;
  if (dias > 0) return `${dias} días naturales a partir de la fecha de emisión de esta propuesta.`;
  return '15 días naturales';
}

/** Lo que cabe en un renglón de la celda «Condiciones de pago» de la franja (8 pt). */
const CABE_EN_FRANJA = 26;

/** Lo que necesitan los grupos y las cifras del objetivo de cada partida guardada. */
function agrupable(item: Record<string, unknown>) {
  const texto = (valor: unknown) => (valor == null ? null : String(valor));
  return {
    grupo: texto(item['grupo']),
    category: texto(item['category']),
    name: texto(item['name']),
    description: texto(item['description']),
    unit: texto(item['unit']),
    qty: Number(item['qty'] ?? 0) || 0,
    unitPrice: Number(item['unitPrice'] ?? 0) || 0,
    laborHours: Number(item['laborHours'] ?? 0) || 0,
    laborRate: Number(item['laborRate'] ?? 0) || 0,
    model: texto(item['model']),
  };
}

const agrupables = (quote: QuoteLike) => (quote.items ?? []).map(agrupable);

/**
 * La póliza: la garantía que dejó quien cotiza y, si se cobra instalación y esa frase no habla ya de
 * los trabajos, la de la mano de obra. En licitación mandan las bases.
 */
function garantiasDe(garantia: string, modalidad: Terminos['modalidad'], instalacion: boolean, conTerminos: boolean): string[] {
  if (!conTerminos || modalidad === 'LICITACION') return [];
  const hablaDeTrabajos = /trabajo|mano de obra|instalaci|mantenimiento/i.test(garantia);
  return [
    `${hablaDeTrabajos ? 'Garantía' : 'Equipos'}: ${garantia}`,
    ...(instalacion && !hablaDeTrabajos ? [`Instalación: ${GARANTIA_DE_INSTALACION}`] : []),
  ];
}

/**
 * Los términos de la cotización, los mismos que enseña el editor: el texto del segmento con el
 * anticipo capturado, o lo que quien cotiza reescribió (`note`). Entrega, garantía y vigencia no van
 * aquí: son renglones propios de las condiciones comerciales.
 */
function terminosDelEditor(quote: QuoteLike): Terminos {
  return terminosDeCotizacion({
    segmento: quote.segmento,
    incluyeInstalacion: incluyeInstalacion(agrupables(quote)),
    anticipoPct: quote.depositPercent,
    personalizados: quote.note,
    condiciones: { formaPago: normalizarOpciones(quote.opciones).condiciones.formaPago },
  });
}

/**
 * Forma de pago de la cotización: el texto del renglón «Condiciones de pago» y su versión de una
 * línea para la franja. Los dos salen de lo mismo que edita la persona (el anticipo y el texto de
 * «Forma de pago»), para que no se contradigan. Antes el renglón era un texto fijo con «50% de
 * anticipo» que seguía saliendo aunque el anticipo se hubiera quitado.
 */
export function pagoDeCotizacion(
  quote: QuoteLike,
  terminos: Terminos = terminosDelEditor(quote),
): { texto: string; corto: string } {
  const n = anticipoDeCotizacion(quote.depositPercent);
  const porAnticipo = n >= 100 ? 'Contado' : n <= 0 ? 'Contra entrega' : `${n}% anticipo`;
  const parte = terminos.partes.find((p) => p.clave === 'pago');
  // Borró el texto: no se afirma nada que no escribió. Si dejó un anticipo, ese sí lo capturó.
  if (!parte) return { texto: '', corto: n > 0 ? porAnticipo : '' };
  if (!parte.personalizado) {
    return { texto: parte.texto, corto: terminos.modalidad === 'LICITACION' ? 'Según bases' : porAnticipo };
  }
  // Texto propio: si es corto va tal cual; si no, el anticipo solo cuando el texto también lo dice.
  const propio = parte.texto.replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '');
  let corto = 'Ver condiciones';
  if (!parte.texto.includes('\n') && propio.length <= CABE_EN_FRANJA) corto = propio;
  else if (n > 0 && n < 100 && /anticipo/i.test(propio) && new RegExp(`(^|\\D)${n}\\s*%`).test(propio)) corto = porAnticipo;
  else if (n >= 100 && /contado/i.test(propio)) corto = porAnticipo;
  else if (n <= 0 && /contra entrega/i.test(propio) && !/anticipo/i.test(propio)) corto = porAnticipo;
  return { texto: parte.texto, corto };
}

/** De la cotización guardada (o del borrador de la vista previa) al formato impreso. */
/** El título del centro sigue a lo colocado, salvo que alguien le haya puesto el suyo. */
function tituloDelCentro(m: MemoriaDiseno, titulo: string, esElSugerido: boolean): string {
  if (!esElSugerido) return titulo;
  const grabacion = m.centro.some((e) => e.tipo === 'nvr');
  const respaldo = m.centro.some((e) => e.tipo === 'ups');
  if (grabacion && respaldo) return 'Centro de monitoreo, almacenamiento y respaldo eléctrico online';
  return grabacion ? 'Centro de monitoreo y almacenamiento' : titulo;
}

export function formatoDesdeCotizacion(quote: QuoteLike): FormatoNexara {
  const opciones = normalizarOpciones(quote.opciones);
  const memoria = opciones.memoria ?? null;
  const moneda = String(quote.currency ?? 'MXN').toUpperCase() === 'USD' ? 'USD' : 'MXN';
  // El PDF del cliente no enseña el margen: el precio de cada partida ya lo trae.
  const factor = factorMargen(quote.marginPercent);
  const conIva = quote.conIva !== false;
  const crudas = (quote.items ?? []).map((item, i) => {
    const qty = Number(item['qty'] ?? 0) || 0;
    const precio = Number(item['unitPrice'] ?? 0) || 0;
    const labor = (Number(item['laborHours'] ?? 0) || 0) * (Number(item['laborRate'] ?? 0) || 0);
    const descuento = Math.min(100, Math.max(0, Number(item['discount'] ?? 0) || 0));
    const bruto = (qty * precio + labor) * (1 - descuento / 100);
    const taxRaw = item['tax'] == null || item['tax'] === '' ? 16 : Number(item['tax']);
    // Sin factura no hay IVA, aunque la partida conserve su tasa.
    const tax = !conIva ? 0 : Number.isFinite(taxRaw) ? taxRaw : 16;
    const partidaPropia = String(item['partida'] ?? '').trim();
    const fila: PartidaFormato = {
      partida: partidaPropia || String(i + 1),
      numeroPropio: Boolean(partidaPropia) && partidaPropia !== String(i + 1),
      grupo: grupoDePartida(agrupable(item)),
      titulo: String(item['name'] ?? '').trim(),
      marca: String(item['brand'] ?? '').trim(),
      modelo: String(item['model'] ?? '').trim(),
      descripcion: String(item['description'] ?? '').trim(),
      unidad: String(item['unit'] ?? '').trim() || 'Pieza',
      cantidad: qty,
      precioUnitario: round2(precio * factor),
      importe: round2(bruto * factor),
    };
    return { fila, tax, bruto };
  });
  const partidas = crudas.map((p) => p.fila);
  const subtotalBase = round2(crudas.reduce((a, p) => a + p.bruto, 0));
  const ivaBase = round2(crudas.reduce((a, p) => a + p.bruto * (p.tax / 100), 0));
  const subtotal = round2(partidas.reduce((a, p) => a + p.importe, 0));
  let iva = round2(crudas.reduce((a, p) => a + p.fila.importe * (p.tax / 100), 0));
  const tasas = new Set(crudas.map((p) => p.tax));
  const ivaPorciento = tasas.size === 1 ? [...tasas][0]! : 16;
  // Total = (subtotal + IVA) × (1 + margen/100). El centavo de redondeo cae en el IVA.
  const total = round2((subtotalBase + ivaBase) * factor);
  if (round2(subtotal + iva) !== total) iva = round2(total - subtotal);
  const empresa = String(quote.clientCompany ?? '').trim();
  const nombre = String(quote.clientName ?? '').trim();
  const atencionExplicita = String(quote.atencion ?? '').trim();
  const dias = diasEntre(quote.issueDate, quote.validUntil);
  const vence = fechaCorta(quote.validUntil);
  const terminos = terminosDelEditor(quote);
  const pago = pagoDeCotizacion(quote, terminos);
  const garantia = opciones.condiciones.garantia.trim() || GARANTIA_DEFAULT;

  // Un borrador que ya salió antes es la siguiente versión en preparación; al enviar, `send` pasa la nueva.
  const revision = Math.trunc(Number(quote.revision) || 1);
  const enPreparacion = Boolean(quote.sentAt) && estadoDesdeDb(quote.status) === ESTADO.BORRADOR;

  // Los bloques sin título se leen como parte de lo anterior: de la entrada, o del último con título.
  const alcanceIntro = opciones.secciones.alcance ? parrafosDe(quote.scope) : [];
  const alcance: FormatoNexara['alcance'] = [];
  if (opciones.secciones.alcance) {
    const sugeridos = puntosPorOmision(agrupables(quote));
    // Un punto por omisión que nadie reescribió (solo se renombró o se reordenó) sigue saliendo del diseño.
    const conMemoria = (b: { clave?: string; titulo: string; texto?: string | null; vinetas: string[] }): FormatoNexara['alcance'][number] => {
      const base = { titulo: b.titulo.trim(), texto: String(b.texto ?? '').trim(), vinetas: b.vinetas };
      if (!memoria || sugeridos.find((s) => s.clave === b.clave)?.texto !== b.texto) return base;
      if (b.clave === 'omision:justificacion') {
        const j = justificacionDeMemoria(memoria);
        return { titulo: base.titulo, texto: j.texto, vinetas: j.vinetas.length ? j.vinetas : b.vinetas };
      }
      if (b.clave === 'omision:especificacion') return { ...base, especial: 'lineas' };
      if (b.clave === 'omision:monitoreo') return { ...base, titulo: tituloDelCentro(memoria, base.titulo, b.titulo === sugeridos.find((s) => s.clave === b.clave)?.titulo), especial: 'centro' };
      return base;
    };
    for (const b of normalizarBloques(quote.alcanceBloques)) {
      const textoBloque = String(b.texto ?? '').trim();
      if (b.titulo.trim()) alcance.push(conMemoria(b));
      else if (alcance.length) {
        const previo = alcance[alcance.length - 1]!;
        previo.texto = [previo.texto, textoBloque].filter(Boolean).join('\n');
        previo.vinetas = [...previo.vinetas, ...b.vinetas];
      } else alcanceIntro.push(...parrafosDe(textoBloque), ...b.vinetas);
    }
    // Sin puntos escritos van los del diseño: la portada nunca sale sin ellos.
    if (!alcance.length) sugeridos.forEach((b) => alcance.push(conMemoria(b)));
  }
  return {
    numero: String(quote.quoteNumber ?? '').trim() || 'COTIZACIÓN',
    fecha: fechaCorta(quote.issueDate) || fechaCorta(new Date()),
    vence,
    vigenciaDias: dias,
    vigencia: textoVigencia(dias, vence, opciones.condiciones.vigencia),
    moneda,
    cliente: empresa || nombre || '—',
    atencion: atencionExplicita || (empresa && nombre && empresa !== nombre ? nombre : ''),
    telefono: String(quote.clientPhone ?? '').trim(),
    correo: String(quote.clientEmail ?? '').trim(),
    ubicacion: String(quote.clientAddress ?? '').trim(),
    proyecto: String(quote.projectName ?? '').trim(),
    responsable: String(quote.preparedBy ?? '').trim() || 'Christian Del Pozo',
    trabajo: String(quote.trabajo ?? '').trim() || 'Ventas',
    pagoCorto: pago.corto,
    entrega: opciones.condiciones.tiempoEntrega.trim() || String(quote.deliveryTime ?? '').trim() || ENTREGA_DEFAULT,
    condicionesPago: pago.texto,
    garantia,
    tipoCambioNota: moneda === 'USD' ? String(opciones.tipoCambioNota ?? '').trim() : '',
    version: Math.max(1, revision + (enPreparacion ? 1 : 0)),
    objetivo: opciones.secciones.objetivo
      ? objetivoDePropuesta({ segmento: quote.segmento, partidas: agrupables(quote), objetivoLibre: quote.objetivo })
      : null,
    alcanceIntro,
    alcance,
    memoria,
    ejecutivoDeMemoria: Boolean(memoria) && !String(quote.objetivo ?? '').trim() && Boolean(opciones.secciones.objetivo),
    referencias: REFERENCIAS_DEL_CLIENTE.flatMap(([clave, etiqueta]): Array<[string, string]> => {
      const valor = String(opciones.referencias?.[clave] ?? '').trim();
      return valor ? [[etiqueta, valor]] : [];
    }),
    anticipoPorciento: anticipoDeCotizacion(quote.depositPercent),
    titulos: {
      objetivo: opciones.titulos.objetivo || TITULOS_POR_OMISION.objetivo,
      garantias: opciones.titulos.garantias || TITULOS_POR_OMISION.garantias,
      cotizacion: opciones.titulos.cotizacion || TITULOS_POR_OMISION.cotizacion,
    },
    conPlanos: opciones.secciones.planos,
    garantias: garantiasDe(garantia, terminos.modalidad, incluyeInstalacion(agrupables(quote)), opciones.secciones.terminos),
    partidas,
    subtotal,
    conIva,
    ivaPorciento,
    iva,
    total,
    letras: importeConLetra(total, moneda),
    // La forma de pago ya va en su renglón; con los términos apagados en «Personalizar» no salen.
    terminos: opciones.secciones.terminos
      ? terminos.partes.filter((p) => p.clave !== 'pago').map((p) => `${p.titulo}: ${p.texto}`)
      : [],
  };
}

function directorioAssets(): string {
  const candidatos = [
    path.resolve(__dirname, '../assets/cotizacion-nexara'),
    path.resolve(__dirname, '../../src/assets/cotizacion-nexara'),
    path.resolve(process.cwd(), 'src/assets/cotizacion-nexara'),
    path.resolve(process.cwd(), 'apps/api/src/assets/cotizacion-nexara'),
    path.resolve(process.cwd(), 'dist/assets/cotizacion-nexara'),
  ];
  return candidatos.find((d) => fs.existsSync(path.join(d, 'firma_christian.png'))) ?? candidatos[0]!;
}

type Doc = PDFKit.PDFDocument;

type Lapiz = {
  doc: Doc;
  y: number;
  numero: string;
  pagina: number;
  /** Página donde quedó el título de cada parte. */
  paginaDe: Partial<Record<Apartado['clave'], number>>;
  /** Hojas horizontales: su folio va en otro lugar y no llevan marco. */
  apaisadas: Set<number>;
};

function asegurar(p: Lapiz, alto: number) {
  if (p.y + alto <= BOTTOM) return;
  hoja(p);
}

/** Hoja interior nueva, con su marco. `p.y === TOP` quiere decir que sigue en blanco. */
function hoja(p: Lapiz) {
  p.doc.addPage({ size: 'LETTER', margin: 0 });
  p.pagina += 1;
  dibujarMarco(p.doc);
  p.y = TOP;
}

/** Filete sin título de las hojas que continúan, como en el diseño. */
function fileteDeHoja(p: Lapiz) {
  p.doc.save();
  p.doc.moveTo(TITULO_X, 104).lineTo(458, 104).lineWidth(2).strokeColor(VERDE).stroke();
  p.doc.restore();
}

/** Texto que sigue en otra hoja: lleva el filete y arranca abajo del logotipo y los rombos. */
function continuarTexto(p: Lapiz, alto: number) {
  if (p.y + alto <= BOTTOM) return;
  hoja(p);
  fileteDeHoja(p);
  p.y = 124;
}

/** Abre hoja salvo que la actual siga en blanco. */
function hojaEnBlanco(p: Lapiz) {
  if (p.y !== TOP) hoja(p);
}

function texto(p: Lapiz, valor: string, x: number, y: number, ancho: number, opts: PDFKit.Mixins.TextOptions & { font?: string; size?: number; color?: string }) {
  p.doc.font(opts.font ?? F.texto).fontSize(opts.size ?? 8).fillColor(opts.color ?? TINTA);
  p.doc.text(valor, x, y, { width: ancho, lineGap: 1, ...opts });
}

function altoDe(p: Lapiz, valor: string, ancho: number, size = 8, font?: string): number {
  p.doc.font(font ?? F.texto).fontSize(size);
  return p.doc.heightOfString(valor || ' ', { width: ancho, lineGap: 1 });
}

/** Parte un párrafo en renglones que caben en `ancho`, respetando los saltos de línea. */
function partirTexto(p: Lapiz, valor: string, ancho: number, size: number, font: string): string[] {
  p.doc.font(font).fontSize(size);
  const usable = Math.max(8, ancho);
  const lineas: string[] = [];
  for (const parrafo of valor.replace(/\r\n/g, '\n').split('\n')) {
    if (!parrafo) {
      lineas.push('');
      continue;
    }
    let resto = parrafo;
    while (resto.length) {
      if (p.doc.widthOfString(resto) <= usable) {
        lineas.push(resto);
        break;
      }
      let corte = 1;
      let lo = 1;
      let hi = resto.length;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (p.doc.widthOfString(resto.slice(0, mid)) <= usable) {
          corte = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      let espacio = -1;
      for (let i = corte; i > 0; i -= 1) {
        if (resto[i - 1] === ' ') {
          espacio = i - 1;
          break;
        }
      }
      const hasta = espacio > 0 ? espacio : Math.max(1, corte);
      const trozo = resto.slice(0, hasta).trimEnd();
      lineas.push(trozo || resto.slice(0, Math.max(1, corte)));
      resto = resto.slice(trozo ? hasta : Math.max(1, corte)).replace(/^\s+/, '');
    }
  }
  return lineas.length ? lineas : [''];
}

function altoRenglon(p: Lapiz, size: number, font: string): number {
  p.doc.font(font).fontSize(size);
  return Math.max(p.doc.currentLineHeight(true) + 1, size + 2);
}

/**
 * Un renglón ya medido. Sin `width` PDFKit no lo parte ni abre una hoja en blanco al llegar al
 * margen: el corte de página lo deciden estas funciones.
 */
function renglonFijo(p: Lapiz, valor: string, x: number, y: number, ancho: number, font: string, size: number, color: string, align: 'left' | 'center' | 'right' = 'left', tabular = false) {
  p.doc.font(font).fontSize(size).fillColor(color);
  // Cifras de ancho fijo para que las columnas de importes cuadren.
  const cifras = tabular ? { features: ['tnum' as const] } : {};
  if (align === 'left') {
    p.doc.text(valor || ' ', x, y, { lineBreak: false, ...cifras });
    return;
  }
  p.doc.text(valor || ' ', x, y, { width: ancho, align, lineBreak: false, ...cifras });
}

// ─────────────────────────────────────────────────────────────────────────────
// Texto corrido
// ─────────────────────────────────────────────────────────────────────────────

/** Título de apartado: gris, en mayúsculas, con el filete verde. En hoja nueva va a la altura del logotipo. */
function tituloDeApartado(p: Lapiz, a: Apartado, inicio = 30) {
  const numero = `${a.numero}. `;
  const etiqueta = `${numero}${a.titulo.toUpperCase()}`;
  const opciones = { width: 420, characterSpacing: 0.9, lineGap: 3.4 };
  p.doc.font(F.fuerte).fontSize(13.4);
  const alto = p.doc.heightOfString(etiqueta, opciones);
  // Un título nunca queda solo al pie: viaja con el principio de lo que encabeza (`inicio`).
  if (p.y !== TOP) asegurar(p, alto + 42 + inicio);
  // El alto de hoja en blanco se decide después de `asegurar`, que pudo abrirla.
  if (p.y === TOP) p.y = alto > 22 ? 62 : 78;
  else p.y += 20;
  p.paginaDe[a.clave] ??= p.pagina;
  // El número en verde y el resto en gris: un solo texto, para que parta igual que al medirlo.
  p.doc.font(F.fuerte).fontSize(13.4).fillColor(VERDE_OSC).text(numero, TITULO_X, p.y, { ...opciones, continued: true });
  p.doc.fillColor(GRIS_TITULO).text(a.titulo.toUpperCase(), opciones);
  const yFilete = p.y + alto + 4;
  const finFilete = Math.min(458, TITULO_X + p.doc.widthOfString(etiqueta, opciones) + 16);
  p.doc.save();
  p.doc.moveTo(TITULO_X, yFilete).lineTo(Math.max(finFilete, TITULO_X + 220), yFilete).lineWidth(2).strokeColor(VERDE).stroke();
  p.doc.restore();
  p.y = yFilete + 18;
}

function subtitulo(p: Lapiz, valor: string) {
  continuarTexto(p, 38);
  renglonFijo(p, valor, LM, p.y, AW, F.fuerte, CUERPO.size, GRIS_TITULO);
  p.y += 17;
}

/** Párrafo por renglones: el corte de hoja siempre lo decide `BOTTOM`, nunca PDFKit. */
function parrafo(p: Lapiz, valor: string, o: { despues?: number } = {}) {
  const lineas = partirTexto(p, valor.trim(), AW, CUERPO.size, F.texto);
  continuarTexto(p, CUERPO.lh * Math.min(2, lineas.length));
  for (const linea of lineas) {
    continuarTexto(p, CUERPO.lh);
    if (linea) renglonFijo(p, linea, LM, p.y, AW, F.texto, CUERPO.size, TINTA);
    p.y += CUERPO.lh;
  }
  p.y += o.despues ?? 6;
}

/** «Etiqueta: resto» → ['Etiqueta', 'resto'] cuando la etiqueta es corta; si no, `null`. */
function conEtiqueta(valor: string): [string, string] | null {
  const m = /^([^:.]{3,40}):\s+(.+)$/s.exec(valor.trim());
  return m ? [m[1]!.trim(), m[2]!.trim()] : null;
}

/**
 * Texto con su etiqueta en negritas en el mismo renglón («Tiempo de entrega: 15 días»). `marca` dibuja
 * lo que va antes (viñeta o cuadrito), a la altura del primer renglón.
 */
function conEtiquetaEnLinea(
  p: Lapiz,
  valor: string,
  o: { x: number; size?: number; lh?: number; colorEtiqueta?: string; despues?: number; marca?: (y: number) => void },
) {
  const size = o.size ?? CUERPO.size;
  const lh = o.lh ?? CUERPO.lh;
  const ancho = LM + AW - o.x;
  const partes = conEtiqueta(valor);
  const cuerpo = partes ? partes[1] : valor.trim();
  const etiqueta = partes ? `${partes[0]}: ` : '';
  p.doc.font(F.semi).fontSize(size);
  const anchoEtiqueta = etiqueta ? p.doc.widthOfString(etiqueta) : 0;

  // El primer renglón es lo que quepa después de la etiqueta; el resto, a todo lo ancho.
  const parrafos = cuerpo.split(/\r?\n/);
  const palabras = (parrafos[0] ?? '').split(/\s+/).filter(Boolean);
  p.doc.font(F.texto).fontSize(size);
  let primero = '';
  let i = 0;
  for (; i < palabras.length; i += 1) {
    const prueba = primero ? `${primero} ${palabras[i]}` : palabras[i]!;
    if (p.doc.widthOfString(prueba) > ancho - anchoEtiqueta) break;
    primero = prueba;
  }
  const resto = [palabras.slice(i).join(' '), ...parrafos.slice(1)].filter((t, n) => n > 0 || t).join('\n');
  const siguientes = resto ? partirTexto(p, resto, ancho, size, F.texto) : [];

  continuarTexto(p, lh * Math.min(2, 1 + siguientes.length));
  o.marca?.(p.y);
  if (etiqueta) renglonFijo(p, etiqueta, o.x, p.y, anchoEtiqueta, F.semi, size, o.colorEtiqueta ?? TINTA);
  if (primero) renglonFijo(p, primero, o.x + anchoEtiqueta, p.y, ancho, F.texto, size, TINTA);
  p.y += lh;
  for (const linea of siguientes) {
    continuarTexto(p, lh);
    if (linea) renglonFijo(p, linea, o.x, p.y, ancho, F.texto, size, TINTA);
    p.y += lh;
  }
  p.y += o.despues ?? 3;
}

function vineta(p: Lapiz, valor: string) {
  conEtiquetaEnLinea(p, valor, {
    x: LM + 16,
    marca: (y) => {
      p.doc.save();
      p.doc.circle(LM + 6, y + CUERPO.size * 0.6, 1.8).fill(TINTA);
      p.doc.restore();
    },
  });
}

const RECUADRO = { x: LM - 14, ancho: AW + 28, interior: AW + 4 };
const altoDeRecuadro = (p: Lapiz, cuerpo: string) =>
  12 + 15 + partirTexto(p, cuerpo.trim(), RECUADRO.interior, 9.4, F.texto).length * 13.2 + 9;

/** Recuadro gris con título en negritas, como la «Ventaja operativa» del diseño. */
function recuadro(p: Lapiz, titulo: string, cuerpo: string) {
  const { x, ancho, interior } = RECUADRO;
  const lineas = partirTexto(p, cuerpo.trim(), interior, 9.4, F.texto);
  const alto = altoDeRecuadro(p, cuerpo);
  // Un cierre escrito más largo que media hoja ya no es un recuadro: se lee como texto corrido.
  if (alto > (BOTTOM - TOP) / 2) {
    subtitulo(p, titulo);
    for (const t of parrafosDe(cuerpo)) parrafo(p, t);
    return;
  }
  continuarTexto(p, alto + 8);
  p.y += 4;
  p.doc.save();
  p.doc.roundedRect(x, p.y, ancho, alto, 7).fill(GRIS_RECUADRO);
  p.doc.restore();
  renglonFijo(p, titulo, x + 12, p.y + 11, interior, F.fuerte, 9.8, GRIS_TITULO);
  lineas.forEach((linea, i) => renglonFijo(p, linea, x + 12, p.y + 26 + i * 13.2, interior, F.texto, 9.4, GRIS));
  p.y += alto + 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Apartados
// ─────────────────────────────────────────────────────────────────────────────

/** Por encima de esto los bloques del alcance dejan de ser apartados y van juntos en uno solo. */
const MAX_APARTADOS_DE_ALCANCE = 8;

type Apartado = {
  clave: 'objetivo' | 'alcance' | 'levantamiento' | 'planos' | 'garantias' | 'cotizacion';
  numero: number;
  titulo: string;
  bloque?: FormatoNexara['alcance'][number];
};

/** Lo que trae esta cotización: lo vacío o apagado no se numera ni sale en el índice de la portada. */
function apartadosDe(q: FormatoNexara, hayPlanos: boolean): Apartado[] {
  const lista: Array<Omit<Apartado, 'numero'>> = [];
  if (q.objetivo || q.alcanceIntro.length) lista.push({ clave: 'objetivo', titulo: q.titulos.objetivo });
  if (q.alcance.length > MAX_APARTADOS_DE_ALCANCE) lista.push({ clave: 'alcance', titulo: 'Alcance técnico' });
  else q.alcance.forEach((bloque) => lista.push({ clave: 'alcance', titulo: bloque.titulo, bloque }));
  // Con el alcance apagado en «Personalizar» tampoco sale el levantamiento: es parte de lo técnico.
  if (q.memoria?.levantamiento.filas.length && q.alcance.length) lista.push({ clave: 'levantamiento', titulo: 'Levantamiento por zona' });
  if (hayPlanos) lista.push({ clave: 'planos', titulo: 'Planos' });
  if (q.garantias.length) lista.push({ clave: 'garantias', titulo: q.titulos.garantias });
  lista.push({ clave: 'cotizacion', titulo: q.titulos.cotizacion });
  return lista.map((a, i) => ({ ...a, numero: i + 1 }));
}

/**
 * El título de la propuesta cuando nadie escribió un proyecto (casi 6 de cada 10 cotizaciones): lo
 * que se está cotizando, de los grupos de sus partidas.
 */
export function trabajoDePartidas(partidas: Array<Pick<PartidaFormato, 'grupo' | 'titulo' | 'unidad'>>): string {
  if (partidas.length && partidas.every((d) => /licen|suscrip/i.test(`${d.titulo} ${d.unidad}`))) return 'Licenciamiento';
  const hay = (grupo: GrupoPartida) => partidas.some((d) => d.grupo === grupo);
  const [equipo, material, obra] = [hay('EQUIPOS'), hay('MATERIALES'), hay('MANO_DE_OBRA')];
  if (!equipo && !material) return obra ? 'Servicios de implementación y puesta a punto' : '';
  const entrega = obra ? 'Suministro e instalación' : 'Suministro';
  if (equipo && material) return `${entrega} de equipamiento e infraestructura`;
  return `${entrega} de ${equipo ? 'equipamiento' : 'materiales'}`;
}

/**
 * Arranque de la primera hoja interior: los datos fiscales junto al logotipo (los pidió Adam en toda
 * cotización), el proyecto y, una sola vez, los datos de la cotización. El contenido sigue en esa misma
 * hoja: una hoja aparte con el título parecía una segunda portada, pero pobre.
 */
function arranqueDePropuesta(p: Lapiz, q: FormatoNexara) {
  hoja(p);
  const { doc } = p;
  const xFiscal = LM + 28;
  RENGLONES_EMISOR.forEach((linea, i) => {
    doc.fillColor(GRIS).font(i === 0 ? F.semi : F.texto).fontSize(i === 0 ? 7.6 : 7.2);
    doc.text(linea, xFiscal, 16 + i * 9.6, { lineBreak: false });
  });

  let y = 73;
  doc.font(F.semi).fontSize(8.6).fillColor(VERDE_OSC);
  doc.text('MEMORIA DESCRIPTIVA Y PROPUESTA TÉCNICA-ECONÓMICA', TITULO_X, y, { lineBreak: false, characterSpacing: 0.5 });
  y += 15;

  // El cuerpo más grande con el que el proyecto cabe en dos renglones, al lado del logotipo.
  const proyecto = (q.proyecto || trabajoDePartidas(q.partidas)).toUpperCase();
  if (proyecto) {
    const opciones = (size: number) => ({ width: 436, lineGap: size * 0.2 });
    let size = 19;
    doc.font(F.fuerte);
    while (size > 11 && (doc.fontSize(size), doc.heightOfString(proyecto, opciones(size))) > size * 1.2 * 2 + size * 0.5) size -= 1;
    doc.fontSize(size).fillColor(GRIS_TITULO);
    doc.text(proyecto, TITULO_X, y, opciones(size));
    y += doc.heightOfString(proyecto, opciones(size));
  }

  const campos: Array<[string, string]> = [
    ['Cliente', q.cliente],
    ['Cotización N°', q.numero],
    ['Fecha de emisión', q.fecha],
    ['Atención', q.atencion],
    ['Responsable comercial', q.responsable],
    ['Teléfono', q.telefono],
    ['Correo', q.correo],
    ['Ubicación', q.ubicacion],
    ...q.referencias,
  ].filter(([, valor]) => valor!.trim()) as Array<[string, string]>;

  const { x, ancho } = RECUADRO;
  const columnas = 3;
  const anchoCelda = (ancho - 28) / columnas;
  const lineasDe = (valor: string) => partirTexto(p, valor.trim(), anchoCelda - 8, 9.6, F.texto).slice(0, 2);
  const filas: Array<Array<[string, string]>> = [];
  for (let i = 0; i < campos.length; i += columnas) filas.push(campos.slice(i, i + columnas));
  const altoFila = (fila: Array<[string, string]>) => 11 + Math.max(...fila.map(([, v]) => lineasDe(v).length)) * 13 + 7;
  const altoCaja = 11 + filas.reduce((acc, fila) => acc + altoFila(fila), 0) + 3;

  const arriba = Math.max(y + 11, 120);
  doc.save();
  doc.roundedRect(x, arriba, ancho, altoCaja, 7).fill(GRIS_RECUADRO);
  doc.restore();
  let yFila = arriba + 11;
  for (const fila of filas) {
    fila.forEach(([etiqueta, valor], c) => {
      const xCelda = x + 14 + c * anchoCelda;
      renglonFijo(p, etiqueta.toUpperCase(), xCelda, yFila, anchoCelda - 8, F.semi, 7, GRIS);
      lineasDe(valor).forEach((linea, n) => renglonFijo(p, linea, xCelda, yFila + 11 + n * 13, anchoCelda - 8, F.texto, 9.6, TINTA));
    });
    yFila += altoFila(fila);
  }
  p.y = arriba + altoCaja + 2;
}

/** Texto libre: un renglón que empieza con viñeta se imprime como viñeta, lo demás como párrafo. */
function textoLibre(p: Lapiz, valor: string) {
  const vinetaEscrita = /^[•·*-]\s+(.+)$/s.exec(valor);
  if (vinetaEscrita) vineta(p, vinetaEscrita[1]!);
  else parrafo(p, valor);
}

/** Franja de cifras del proyecto: el único bloque oscuro del cuerpo, con el color del pie de hoja. */
function bandaDeCifras(p: Lapiz, cifras: Array<[string, string]>) {
  const alto = 56;
  const { x, ancho } = RECUADRO;
  continuarTexto(p, alto + 12);
  p.y += 4;
  p.doc.save();
  p.doc.roundedRect(x, p.y, ancho, alto, 7).fill(CARBON);
  p.doc.restore();
  const celda = ancho / cifras.length;
  cifras.forEach(([valor, etiqueta], i) => {
    const xCelda = x + i * celda;
    if (i) {
      p.doc.save();
      p.doc.moveTo(xCelda, p.y + 12).lineTo(xCelda, p.y + alto - 12).lineWidth(0.5).strokeColor('#4A4D52').stroke();
      p.doc.restore();
    }
    renglonFijo(p, valor, xCelda, p.y + 11, celda, F.fuerte, 17, VERDE, 'center', true);
    renglonFijo(p, etiqueta, xCelda, p.y + 35, celda, F.medio, 7.6, '#D9DCE0', 'center');
  });
  p.y += alto + 10;
}

/**
 * Imagen a todo lo ancho, con su leyenda: se recorta arriba y abajo para llenar lo que queda de la hoja,
 * entre `minimo` y `maximo` de alto. Si no alcanza, pasa completa a la hoja siguiente.
 */
function imagenConLeyenda(p: Lapiz, nombre: string, imagen: PlanosClasificados['imagenes'][number]['imagen'], o: { minimo?: number; maximo?: number } = {}) {
  const minimo = o.minimo ?? 190;
  const maximo = Math.min(o.maximo ?? 300, (AW * imagen.alto) / imagen.ancho);
  if (BOTTOM - p.y - 20 < Math.min(minimo, maximo)) {
    hoja(p);
    fileteDeHoja(p);
    p.y = 124;
  }
  const alto = Math.min(maximo, BOTTOM - p.y - 20);
  try {
    p.doc.save();
    p.doc.roundedRect(LM, p.y, AW, alto, 6).clip();
    p.doc.image(imagen.datos, LM, p.y, { cover: [AW, alto], align: 'center', valign: 'center' });
    p.doc.restore();
  } catch {
    /* un anexo corrupto deja su hueco en blanco, no tumba la cotización */
  }
  p.y += alto + 6;
  leyendaDePlano(p, nombre);
}

function apartadoEjecutivoDeMemoria(p: Lapiz, q: FormatoNexara, a: Apartado, m: MemoriaDiseno, vistas: PlanosClasificados['imagenes']) {
  tituloDeApartado(p, a);
  const { parrafos, resultado } = alcanceDeMemoria(m);
  for (const t of q.alcanceIntro) textoLibre(p, t);
  for (const t of parrafos) parrafo(p, t);
  const cifras: Array<[string, string]> = [[String(m.camaras), m.camaras === 1 ? 'Cámara proyectada' : 'Cámaras proyectadas']];
  if (m.cobertura) cifras.push([`${Math.round(m.cobertura.cubierto)} %`, 'Del interior cubierto']);
  if (m.tb > 0) cifras.push([`${m.tb.toFixed(1)} TB`, m.retencionDias ? `De grabación a ${m.retencionDias} días` : 'De grabación']);
  if (m.mbps > 0) cifras.push([`${Math.round(m.mbps)} Mbps`, 'De video continuo']);
  bandaDeCifras(p, cifras);
  if (m.cobertura) nivelesDeDetalle(p, m.cobertura);
  if (resultado) recuadro(p, 'Resultado esperado', resultado);
  // Las vistas del sitio abren su propia hoja y la llenan.
  if (vistas.length) {
    hoja(p);
    fileteDeHoja(p);
    p.y = 124;
    const alto = Math.min(300, (BOTTOM - 124) / vistas.length - 24);
    for (const v of vistas) imagenConLeyenda(p, v.nombre, v.imagen, { minimo: 100, maximo: alto });
  }
}

function apartadoEjecutivo(p: Lapiz, q: FormatoNexara, a: Apartado) {
  tituloDeApartado(p, a);
  for (const t of parrafosDe(q.objetivo?.intro)) textoLibre(p, t);
  for (const t of q.alcanceIntro) textoLibre(p, t);
  const beneficios = q.objetivo?.beneficios ?? [];
  if (beneficios.length) {
    p.y += 2;
    subtitulo(p, 'Beneficios principales');
    beneficios.forEach((b) => vineta(p, b));
    p.y += 4;
  }
  if (q.objetivo?.cierre.trim()) recuadro(p, 'Resultado esperado', q.objetivo.cierre);
}

function cuerpoDeBloque(p: Lapiz, bloque: FormatoNexara['alcance'][number]) {
  for (const t of parrafosDe(bloque.texto)) textoLibre(p, t);
  if (bloque.vinetas.length) {
    bloque.vinetas.forEach((v) => vineta(p, v));
    p.y += 4;
  }
}

/**
 * Lo que debe caber junto al título de un bloque: si es corto, todo (una viñeta sola en la hoja
 * siguiente se ve mal); si no, su primer párrafo y su primera viñeta.
 */
function altoDeInicio(p: Lapiz, bloque: FormatoNexara['alcance'][number]): number {
  const renglones = (t: string, ancho: number) => partirTexto(p, t, ancho, CUERPO.size, F.texto).length * CUERPO.lh;
  const parrafos = parrafosDe(bloque.texto).map((t) => renglones(t, AW) + 6);
  const vinetas = bloque.vinetas.map((v) => renglones(v, AW - 26) + 3);
  const todo = [...parrafos, ...vinetas].reduce((acc, n) => acc + n, 0);
  return todo <= 170 ? todo : (parrafos[0] ?? 0) + (vinetas[0] ?? 0);
}

function apartadoDeAlcance(p: Lapiz, q: FormatoNexara, a: Apartado) {
  tituloDeApartado(p, a, a.bloque ? altoDeInicio(p, a.bloque) : 30);
  if (a.bloque) {
    cuerpoDeBloque(p, a.bloque);
    return;
  }
  q.alcance.forEach((bloque, i) => {
    subtitulo(p, `${a.numero}.${i + 1}  ${bloque.titulo}`);
    cuerpoDeBloque(p, bloque);
    p.y += 4;
  });
}

const cacheModelos = new Map<string, Buffer | null>();

/** El modelo 3D propio del tipo de equipo (nunca fotos del fabricante). Sin archivo, nada: el texto ocupa ese lugar. */
function imagenDeModelo(tipo: string): Buffer | null {
  const clave = /^[a-z-]+$/.test(tipo) ? tipo : 'generico';
  if (cacheModelos.has(clave)) return cacheModelos.get(clave)!;
  const nombre = clave === 'panoramica' || clave === 'ojo-de-pez' ? 'domo' : clave;
  const dir = path.join(directorioAssets(), 'modelos');
  const archivo = [nombre, 'generico'].map((n) => path.join(dir, `${n}.png`)).find((f) => fs.existsSync(f));
  const datos = archivo ? fs.readFileSync(archivo) : null;
  cacheModelos.set(clave, datos);
  return datos;
}

const FOTO_LINEA = 104;

/** Una línea de cámaras, como en el diseño: qué es, dónde va y qué trae, con su modelo al lado. */
function bloqueDeLinea(p: Lapiz, l: LineaDeCamaras, letra: string) {
  const anchoTexto = AW - FOTO_LINEA - 18;
  const xTexto = LM + FOTO_LINEA + 18;
  const titulo = `${letra}. ${l.titulo} — ${l.cantidad} ${l.cantidad === 1 ? 'cámara' : 'cámaras'}`;
  const modelo = [l.marca, l.modelo].filter(Boolean).join(' ');
  const ubicaciones = `Ubicaciones asignadas: ${l.ubicaciones.join(', ')}.`;
  const lh = 13.6;
  const size = 9.8;
  const lineasUb = l.ubicaciones.length ? partirTexto(p, ubicaciones, anchoTexto, size, F.texto) : [];
  const lineasDatos = l.datos.flatMap((d) => partirTexto(p, d, anchoTexto - 11, size, F.texto).map((t, i) => ({ t, marca: i === 0 })));
  const altoTexto = 17 + 14 + 3 + lineasUb.length * lh + (lineasUb.length ? 5 : 0) + lineasDatos.length * lh;
  const alto = Math.max(altoTexto, FOTO_LINEA);
  continuarTexto(p, alto + 14);
  const arriba = p.y;
  const foto = l.foto ? Buffer.from(l.foto.slice(l.foto.indexOf(',') + 1), 'base64') : imagenDeModelo(l.tipo);
  p.doc.save();
  p.doc.roundedRect(LM, arriba, FOTO_LINEA, FOTO_LINEA, 6).fill(GRIS_RECUADRO);
  p.doc.restore();
  if (foto) {
    try {
      p.doc.image(foto, LM + 8, arriba + 8, { fit: [FOTO_LINEA - 16, FOTO_LINEA - 16], align: 'center', valign: 'center' });
    } catch {
      /* el recuadro queda vacío */
    }
  }
  let y = arriba;
  renglonFijo(p, titulo, xTexto, y, anchoTexto, F.fuerte, 10.8, GRIS_TITULO);
  y += 15;
  renglonFijo(p, modelo, xTexto, y, anchoTexto, F.semi, 8.8, VERDE_OSC);
  y += 17;
  for (const t of lineasUb) {
    renglonFijo(p, t, xTexto, y, anchoTexto, F.texto, size, TINTA);
    y += lh;
  }
  if (lineasUb.length) y += 5;
  for (const { t, marca } of lineasDatos) {
    if (marca) {
      p.doc.save();
      p.doc.circle(xTexto + 3, y + size * 0.6, 1.6).fill(VERDE_OSC);
      p.doc.restore();
    }
    renglonFijo(p, t, xTexto + 11, y, anchoTexto - 11, F.texto, size, TINTA);
    y += lh;
  }
  p.y = arriba + alto + 16;
}

function apartadoDeLineas(p: Lapiz, a: Apartado, m: MemoriaDiseno) {
  tituloDeApartado(p, a, 130);
  parrafo(
    p,
    m.lineas.length > 1
      ? `Cada ubicación tiene condiciones de luz y de geometría propias. En lugar de un modelo genérico para todo el inmueble, se seleccionaron ${m.lineas.length} líneas de equipo:`
      : 'El equipo seleccionado responde a las condiciones de luz y de geometría de cada ubicación:',
    { despues: 12 },
  );
  m.lineas.forEach((l, i) => bloqueDeLinea(p, l, String.fromCharCode(65 + i)));
  if (m.otros.length) {
    subtitulo(p, 'Otros sistemas integrados');
    m.otros.forEach((o) => vineta(p, `${o.titulo}: ${[o.cantidad > 1 ? `${o.cantidad} ×` : '', o.modelo].filter(Boolean).join(' ')}`));
  }
}

const FILA_DATO = 21;

/** Tabla de dos columnas con el estilo de la propuesta económica. */
function tablaDeDatos(p: Lapiz, titulo: string, filas: Array<[string, string]>) {
  if (!filas.length) return;
  continuarTexto(p, 22 + FILA_DATO * (filas.length <= 10 ? filas.length : 3));
  const { x, ancho } = RECUADRO;
  p.doc.save();
  p.doc.rect(x, p.y, ancho, 22).fill(AZUL);
  p.doc.restore();
  renglonFijo(p, titulo, x + 8, p.y + 6.6, ancho - 16, F.fuerte, 7.8, '#FFFFFF');
  p.y += 22;
  filas.forEach(([etiqueta, valor], i) => {
    if (p.y + FILA_DATO > BOTTOM) {
      hoja(p);
      fileteDeHoja(p);
      p.y = 124;
    }
    if (i % 2) {
      p.doc.save();
      p.doc.rect(x, p.y, ancho, FILA_DATO).fill(ZEBRA);
      p.doc.restore();
    }
    renglonFijo(p, etiqueta, x + 8, p.y + 6, 170, F.semi, 8.8, TINTA);
    renglonFijo(p, valor, x + 180, p.y + 6, ancho - 188, F.texto, 8.8, TINTA);
    p.y += FILA_DATO;
    p.doc.save();
    p.doc.strokeColor(LINEA).lineWidth(0.4).moveTo(x, p.y).lineTo(x + ancho, p.y).stroke();
    p.doc.restore();
  });
  p.y += 12;
}

function apartadoDelCentro(p: Lapiz, a: Apartado, m: MemoriaDiseno) {
  tituloDeApartado(p, a, 120);
  parrafo(p, 'Toda la red converge en un punto donde se concentran la grabación, la supervisión y la protección eléctrica del sistema. Estas son las cifras con las que se dimensionó:', { despues: 10 });
  tablaDeDatos(p, 'DIMENSIONAMIENTO DEL SISTEMA', calculoDelCentro(m));
  if (m.centro.length) {
    tablaDeDatos(
      p,
      'EQUIPAMIENTO DEL CENTRO',
      m.centro.map((e) => [e.titulo, [e.cantidad > 1 ? `${e.cantidad} ×` : '', e.modelo, e.detalle ? `· ${e.detalle}` : ''].filter(Boolean).join(' ')]),
    );
  }
}

/** Cuántas cámaras de cada modelo van en cada zona: la hoja de levantamiento de los formatos de cliente. */
function apartadoDeLevantamiento(p: Lapiz, a: Apartado, m: MemoriaDiseno) {
  const { columnas, filas } = m.levantamiento;
  const altoCabeza = 34;
  const altoFila = 19;
  tituloDeApartado(p, a, 80 + altoCabeza);
  parrafo(p, 'Distribución de las cámaras por zona y por modelo, tal como quedaron en el diseño.', { despues: 10 });
  const { x, ancho } = RECUADRO;
  const anchoZona = Math.min(190, ancho - columnas.length * 62 - 44);
  const anchoTotal = 44;
  const anchoCol = columnas.length ? (ancho - anchoZona - anchoTotal) / columnas.length : 0;
  const cabeza = () => {
    p.doc.save();
    p.doc.rect(x, p.y, ancho, altoCabeza).fill(AZUL);
    p.doc.restore();
    renglonFijo(p, 'Zona', x + 8, p.y + 12, anchoZona - 12, F.fuerte, 7.8, '#FFFFFF');
    columnas.forEach((c, i) => {
      const xc = x + anchoZona + i * anchoCol;
      renglonFijo(p, c.titulo, xc + 2, p.y + 6, anchoCol - 4, F.fuerte, 7.6, '#FFFFFF', 'center');
      const modelo = partirTexto(p, c.modelo, anchoCol - 6, 6.2, F.texto).slice(0, 2);
      modelo.forEach((t, n) => renglonFijo(p, t, xc + 2, p.y + 16 + n * 7.6, anchoCol - 4, F.texto, 6.2, '#C9D3DE', 'center'));
    });
    renglonFijo(p, 'Total', x + ancho - anchoTotal, p.y + 12, anchoTotal - 6, F.fuerte, 7.8, '#FFFFFF', 'right');
    p.y += altoCabeza;
  };
  cabeza();
  const varios = new Set(filas.map((f) => f.nivel)).size > 1;
  let nivel: string | null = null;
  let n = 0;
  const totales: Record<string, number> = {};
  for (const f of filas) {
    if (p.y + altoFila * 2 > BOTTOM) {
      hoja(p);
      cabeza();
    }
    if (varios && f.nivel !== nivel) {
      nivel = f.nivel;
      p.doc.save();
      p.doc.rect(x, p.y, ancho, FILA_GRUPO).fill(AZUL_GRUPO);
      p.doc.restore();
      renglonFijo(p, f.nivel.toUpperCase(), x + 8, p.y + 5.4, ancho - 16, F.fuerte, 8, '#FFFFFF');
      p.y += FILA_GRUPO;
    }
    n += 1;
    if (n % 2 === 0) {
      p.doc.save();
      p.doc.rect(x, p.y, ancho, altoFila).fill(ZEBRA);
      p.doc.restore();
    }
    renglonFijo(p, partirTexto(p, f.zona, anchoZona - 12, 8.8, F.medio)[0] ?? '', x + 8, p.y + 5, anchoZona - 12, F.medio, 8.8, TINTA);
    let suma = 0;
    columnas.forEach((c, i) => {
      const v = f.piezas[c.clave] ?? 0;
      suma += v;
      totales[c.clave] = (totales[c.clave] ?? 0) + v;
      renglonFijo(p, v ? String(v) : '—', x + anchoZona + i * anchoCol, p.y + 5, anchoCol, v ? F.semi : F.texto, 8.8, v ? TINTA : GRIS, 'center', true);
    });
    renglonFijo(p, String(suma), x + ancho - anchoTotal, p.y + 5, anchoTotal - 6, F.fuerte, 8.8, TINTA, 'right', true);
    p.y += altoFila;
    p.doc.save();
    p.doc.strokeColor(LINEA).lineWidth(0.4).moveTo(x, p.y).lineTo(x + ancho, p.y).stroke();
    p.doc.restore();
  }
  p.doc.save();
  p.doc.rect(x, p.y, ancho, altoFila + 2).fill(AZUL);
  p.doc.restore();
  renglonFijo(p, 'TOTAL', x + 8, p.y + 6, anchoZona - 12, F.fuerte, 8.4, '#FFFFFF');
  let total = 0;
  columnas.forEach((c, i) => {
    const v = totales[c.clave] ?? 0;
    total += v;
    renglonFijo(p, String(v), x + anchoZona + i * anchoCol, p.y + 6, anchoCol, F.fuerte, 8.8, '#FFFFFF', 'center', true);
  });
  renglonFijo(p, String(total), x + ancho - anchoTotal, p.y + 6, anchoTotal - 6, F.fuerte, 8.8, '#FFFFFF', 'right', true);
  p.y += altoFila + 12;
}

/** Cuánto del interior alcanza cada nivel de detalle de IEC 62676-4. */
function nivelesDeDetalle(p: Lapiz, c: NonNullable<MemoriaDiseno['cobertura']>) {
  const altoFila = 25;
  continuarTexto(p, 20 + altoFila * NIVELES_DORI.length + 8);
  renglonFijo(p, 'Nivel de detalle alcanzado (IEC 62676-4)', LM, p.y, AW, F.fuerte, CUERPO.size, GRIS_TITULO);
  p.y += 18;
  for (const n of NIVELES_DORI) {
    const pct = Math.max(0, Math.min(100, c[n.clave]));
    renglonFijo(p, n.titulo, LM + 12, p.y + 1, 110, F.semi, 9.2, TINTA);
    renglonFijo(p, `${n.ppm} · ${n.uso}`, LM + 12, p.y + 12, 240, F.texto, 7.4, GRIS);
    p.doc.save();
    p.doc.circle(LM + 4, p.y + 6, 3).fill(n.color);
    p.doc.roundedRect(LM + 244, p.y + 4, 216, 8, 4).fill('#E9ECEF');
    if (pct > 0) p.doc.roundedRect(LM + 244, p.y + 4, Math.max(8, (216 * pct) / 100), 8, 4).fill(n.color);
    p.doc.restore();
    renglonFijo(p, `${Math.round(pct)} %`, LM + 464, p.y + 1, AW - 464, F.fuerte, 10, TINTA, 'right', true);
    p.y += altoFila;
  }
  p.y += 8;
}

/** Leyenda de un plano, centrada y entre corchetes como en el diseño. */
function leyendaDePlano(p: Lapiz, nombre: string) {
  texto(p, `[ ${nombre.toUpperCase()} ]`, LM, p.y, AW, { font: F.semi, size: 7.8, color: CARBON, align: 'center', characterSpacing: 0.6 });
  p.y += altoDe(p, nombre.toUpperCase(), AW, 7.8, F.semi) + 8;
}

/** El plano técnico es doble carta y apaisado: va en hoja horizontal, a todo lo que da, para que se pueda leer. */
function hojaDePlanoTecnico(p: Lapiz, a: Apartado, nombre: string, imagen: PlanosClasificados['imagenes'][number]['imagen']) {
  p.doc.addPage({ size: 'LETTER', layout: 'landscape', margin: 0 });
  p.pagina += 1;
  p.apaisadas.add(p.pagina);
  p.paginaDe.planos ??= p.pagina;
  const { doc } = p;
  doc.font(F.fuerte).fontSize(11).fillColor(VERDE_OSC).text(`${a.numero}.`, 24, 18, { lineBreak: false, characterSpacing: 0.8 });
  doc.fillColor(GRIS_TITULO).text(nombre.toUpperCase(), 24 + doc.widthOfString(`${a.numero}.`) + 8, 18, { lineBreak: false, characterSpacing: 0.8 });
  doc.save();
  doc.moveTo(24, 34).lineTo(768, 34).lineWidth(1.4).strokeColor(VERDE).stroke();
  doc.restore();
  const arriba = 40;
  const libreW = 792 - 48;
  const libreH = 612 - arriba - 22;
  const escala = Math.min(libreW / imagen.ancho, libreH / imagen.alto);
  const ancho = imagen.ancho * escala;
  const alto = imagen.alto * escala;
  try {
    doc.image(imagen.datos, 24 + (libreW - ancho) / 2, arriba + (libreH - alto) / 2, { width: ancho, height: alto });
  } catch {
    /* un anexo corrupto deja su hueco en blanco, no tumba la cotización */
  }
  // Lo que siga abre hoja vertical con su marco.
  p.y = BOTTOM + 1;
}

function apartadoDePlanos(p: Lapiz, a: Apartado, anexos: PlanosClasificados) {
  const tecnicos = anexos.imagenes.filter((i) => i.nombre.startsWith(NOMBRE_PLANO_TECNICO));
  for (const t of tecnicos) hojaDePlanoTecnico(p, a, t.nombre, t.imagen);
  const resto = anexos.imagenes.filter((i) => !tecnicos.includes(i));
  if (tecnicos.length && !resto.length && !anexos.pdfs.length && !anexos.otros.length) return;
  if (tecnicos.length) hoja(p);
  anexos = { ...anexos, imagenes: resto };
  // Con imágenes el título viaja con la primera; sin ellas basta con la lista.
  if (anexos.imagenes.length) hojaEnBlanco(p);
  if (!tecnicos.length) tituloDeApartado(p, a);
  let primera = true;
  for (const { nombre, imagen } of anexos.imagenes) {
    if (!primera) hoja(p);
    primera = false;
    leyendaDePlano(p, nombre);
    const altoDisponible = BOTTOM - p.y;
    const escala = Math.min(AW / imagen.ancho, altoDisponible / imagen.alto, 1);
    const ancho = Math.round(imagen.ancho * escala);
    const alto = Math.round(imagen.alto * escala);
    try {
      p.doc.image(imagen.datos, LM + (AW - ancho) / 2, p.y, { width: ancho, height: alto });
    } catch {
      /* un anexo corrupto deja su hueco en blanco, no tumba la cotización */
    }
    p.y += alto + 8;
  }
  if (anexos.pdfs.length) {
    if (anexos.imagenes.length) hoja(p);
    parrafo(p, 'Planos que se anexan en las páginas siguientes:', { despues: 3 });
    anexos.pdfs.forEach(({ nombre }) => vineta(p, nombre));
  }
  if (anexos.otros.length) {
    if (anexos.imagenes.length && !anexos.pdfs.length) hoja(p);
    parrafo(p, 'Anexos que acompañan a esta cotización (no se pudieron imprimir aquí):', { despues: 3 });
    anexos.otros.forEach((nombre) => vineta(p, nombre));
  }
}

function apartadoDeGarantias(p: Lapiz, q: FormatoNexara, a: Apartado) {
  // Título, alcance y la primera exclusión van juntos; lo demás sigue en la otra hoja si hace falta.
  // Pasarla entera dejaba media hoja en blanco.
  // La etiqueta en negritas es más ancha que al medirla con texto normal: se mide un poco más angosto.
  const altoDeVinetas = (lista: readonly string[]) =>
    lista.reduce((acc, v) => acc + partirTexto(p, v, AW - 26, CUERPO.size, F.texto).length * CUERPO.lh + 3, 0);
  const vigencia = `Vigencia: ${q.vigencia}\n${lineaDeMoneda(q)}`;
  const ultima = EXCLUSIONES_DE_GARANTIA.length - 1;
  tituloDeApartado(p, a, 17 + altoDeVinetas(q.garantias) + 6 + 17 + 18 + altoDeVinetas(EXCLUSIONES_DE_GARANTIA.slice(0, 1)));
  subtitulo(p, 'Alcance de la garantía');
  q.garantias.forEach((g) => vineta(p, g));
  p.y += 6;
  subtitulo(p, 'Exclusiones');
  parrafo(p, 'La garantía no aplica cuando la falla derive de:', { despues: 3 });
  EXCLUSIONES_DE_GARANTIA.forEach((e, i) => {
    // La vigencia no queda sola en la hoja siguiente: se lleva la última exclusión.
    if (i === ultima) continuarTexto(p, altoDeVinetas([e]) + 6 + 12 + altoDeRecuadro(p, vigencia));
    vineta(p, e);
  });
  p.y += 6;
  recuadro(p, 'Vigencia comercial', vigencia);
}

// ─────────────────────────────────────────────────────────────────────────────
// Propuesta económica
// ─────────────────────────────────────────────────────────────────────────────

type Columna = {
  clave: 'unidad' | 'cantidad' | 'concepto' | 'modelo' | 'precio' | 'total';
  titulo: string;
  x: number;
  ancho: number;
  alinear: 'left' | 'center' | 'right';
};

const ENCABEZADO_TABLA = 22;
const FILA_GRUPO = 19;

/** Columnas del diseño. Sin ningún modelo capturado, ese ancho se lo queda el concepto. */
function columnasDeTabla(conModelo: boolean): Columna[] {
  const fijas: Array<Omit<Columna, 'x'>> = [
    { clave: 'unidad', titulo: 'Unidad', ancho: 40, alinear: 'center' },
    { clave: 'cantidad', titulo: 'Cant.', ancho: 30, alinear: 'center' },
    { clave: 'concepto', titulo: 'Concepto / Descripción', ancho: 0, alinear: 'left' },
    ...(conModelo ? [{ clave: 'modelo' as const, titulo: 'Modelo / SKU', ancho: 106, alinear: 'left' as const }] : []),
    { clave: 'precio', titulo: 'Precio Venta', ancho: 64, alinear: 'right' },
    { clave: 'total', titulo: 'Total Venta', ancho: 70, alinear: 'right' },
  ];
  const concepto = TABLA_W - fijas.reduce((acc, c) => acc + c.ancho, 0);
  let x = TABLA_X;
  return fijas.map((c) => {
    const col = { ...c, x, ancho: c.clave === 'concepto' ? concepto : c.ancho };
    x += col.ancho;
    return col;
  });
}

function encabezadoDeTabla(p: Lapiz, columnas: Columna[]) {
  const y = p.y;
  p.doc.save();
  p.doc.rect(TABLA_X, y, TABLA_W, ENCABEZADO_TABLA).fill(AZUL);
  p.doc.restore();
  for (const col of columnas) {
    renglonFijo(p, col.titulo, col.x + 4, y + 6.6, col.ancho - 8, F.fuerte, 7.8, '#FFFFFF', col.alinear);
  }
  p.y = y + ENCABEZADO_TABLA;
}

/** Alto de la primera partida de un grupo, para que su título no se quede solo al pie de la hoja. */
function altoDeConcepto(p: Lapiz, partida: PartidaFormato, columnas: Columna[]): number {
  const ancho = columnas.find((c) => c.clave === 'concepto')!.ancho - 8;
  return lineasDeConcepto(p, partida, ancho).reduce((acc, l) => acc + l.lh, 0) + 11;
}

function filaDeGrupo(p: Lapiz, etiqueta: string, columnas: Columna[], siguiente: number) {
  // Una partida más larga que una hoja se parte de todos modos: basta con que empiece aquí.
  const junto = siguiente > BOTTOM - TOP - ENCABEZADO_TABLA - FILA_GRUPO ? 30 : siguiente;
  if (p.y + FILA_GRUPO + junto > BOTTOM) {
    hoja(p);
    encabezadoDeTabla(p, columnas);
  }
  p.doc.save();
  p.doc.rect(TABLA_X, p.y, TABLA_W, FILA_GRUPO).fill(AZUL_GRUPO);
  p.doc.restore();
  renglonFijo(p, etiqueta, TABLA_X + 6, p.y + 5.4, TABLA_W - 12, F.fuerte, 8, '#FFFFFF');
  p.y += FILA_GRUPO;
}

type LineaDeFila = { t: string; font: string; size: number; color: string; lh: number; sangria: number; marca: boolean };

/** Renglones del concepto: el nombre y debajo la descripción, con sus viñetas. */
function lineasDeConcepto(p: Lapiz, partida: PartidaFormato, ancho: number): LineaDeFila[] {
  const numeroPropio = partida.numeroPropio ? `${partida.partida} · ` : '';
  const bloques: Array<{ texto: string; font: string; size: number; color: string }> = [
    { texto: `${numeroPropio}${partida.titulo || 'Concepto'}`, font: F.medio, size: 8.6, color: TINTA },
  ];
  if (partida.descripcion) bloques.push({ texto: partida.descripcion, font: F.texto, size: 7.9, color: GRIS });

  const lineas: LineaDeFila[] = [];
  for (const bloque of bloques) {
    const lh = altoRenglon(p, bloque.size, bloque.font);
    p.doc.font(bloque.font).fontSize(bloque.size);
    const sangriaVineta = Math.ceil(p.doc.widthOfString('•') + 4);
    const segmentos = segmentosLista(bloque.texto);
    const lista = segmentos.length ? segmentos : [{ tipo: 'parrafo' as const, texto: bloque.texto }];
    for (const seg of lista) {
      if (!seg.texto) {
        lineas.push({ t: '', font: bloque.font, size: bloque.size, color: bloque.color, lh: Math.max(4, Math.round(lh * 0.4)), sangria: 0, marca: false });
        continue;
      }
      if (seg.tipo === 'vineta') {
        const envueltas = partirTexto(p, seg.texto, Math.max(8, ancho - sangriaVineta), bloque.size, bloque.font);
        envueltas.forEach((t, i) => {
          lineas.push({ t, font: bloque.font, size: bloque.size, color: bloque.color, lh, sangria: sangriaVineta, marca: i === 0 });
        });
      } else {
        for (const t of partirTexto(p, seg.texto, ancho, bloque.size, bloque.font)) {
          lineas.push({ t, font: bloque.font, size: bloque.size, color: bloque.color, lh, sangria: 0, marca: false });
        }
      }
    }
  }
  return lineas;
}

/** La unidad como en el diseño: «Pza» y «Serv». Las demás quedan como se capturaron. */
function unidadCorta(unidad: string): string {
  const u = unidad.trim().toLowerCase();
  if (/^(pieza|piezas|pz|pza|pzas)\.?$/.test(u)) return 'Pza';
  if (/^(servicio|servicios|serv)\.?$/.test(u)) return 'Serv';
  return unidad;
}

/**
 * Una partida. Si cabe en una hoja no se parte: pasa entera a la siguiente. Solo una descripción más
 * larga que una hoja completa sigue en la de después, con las cifras en su primera parte.
 */
function filaPartida(p: Lapiz, partida: PartidaFormato, columnas: Columna[], zebra: boolean, reserva = 0) {
  const PAD = 5.5;
  const col = (clave: Columna['clave']) => columnas.find((c) => c.clave === clave);
  const concepto = col('concepto')!;
  const descAncho = concepto.ancho - 8;
  const lineas = lineasDeConcepto(p, partida, descAncho);

  const columnaModelo = col('modelo');
  // Un modelo es una sola palabra: si le falta poco para caber se reduce en vez de partirlo.
  let tamanoModelo = 8;
  if (columnaModelo && partida.modelo && !/\s/.test(partida.modelo)) {
    p.doc.font(F.semi).fontSize(tamanoModelo);
    const ancho = p.doc.widthOfString(partida.modelo);
    // Medio punto de holgura: justo al límite, el redondeo dejaba una letra sola en otro renglón.
    tamanoModelo = Math.max(6, Math.min(tamanoModelo, (tamanoModelo * (columnaModelo.ancho - 8.5)) / ancho));
  }
  const modelo = columnaModelo && partida.modelo ? partirTexto(p, partida.modelo, columnaModelo.ancho - 8, tamanoModelo, F.semi) : [];
  const marca =
    columnaModelo && partida.marca && partida.marca !== partida.modelo
      ? partirTexto(p, partida.marca, columnaModelo.ancho - 8, 7.2, F.texto)
      : [];
  const LH_MODELO = 10.4;
  const altoModelo = (modelo.length + marca.length) * LH_MODELO;
  const altoCeldas = Math.max(altoModelo, 10);

  const altoConcepto = lineas.reduce((acc, l) => acc + l.lh, 0);
  const altoFila = Math.max(altoConcepto, altoCeldas) + PAD * 2;
  const altoHoja = BOTTOM - TOP - ENCABEZADO_TABLA;
  const nuevaHojaDeTabla = () => {
    hoja(p);
    encabezadoDeTabla(p, columnas);
  };
  if (p.y + altoFila + reserva > BOTTOM && altoFila + reserva <= altoHoja) nuevaHojaDeTabla();
  if (p.y + lineas[0]!.lh + PAD * 2 > BOTTOM) nuevaHojaDeTabla();

  // Tramos de la fila, uno por hoja.
  const tramos: LineaDeFila[][] = [[]];
  let disponible = BOTTOM - p.y - PAD * 2;
  for (const linea of lineas) {
    if (linea.lh > disponible) {
      tramos.push([]);
      disponible = altoHoja - PAD * 2;
    }
    tramos[tramos.length - 1]!.push(linea);
    disponible -= linea.lh;
  }

  tramos.forEach((tramo, n) => {
    if (n > 0) nuevaHojaDeTabla();
    const arriba = p.y;
    const altoTramo = tramo.reduce((acc, l) => acc + l.lh, 0);
    const alto = Math.max(altoTramo, n === 0 ? altoCeldas : 0) + PAD * 2;
    if (zebra) {
      p.doc.save();
      p.doc.rect(TABLA_X, arriba, TABLA_W, alto).fill(ZEBRA);
      p.doc.restore();
    }
    let y = arriba + (alto - altoTramo) / 2;
    for (const linea of tramo) {
      const xDesc = concepto.x + 4;
      if (linea.marca) renglonFijo(p, '•', xDesc, y, linea.sangria, linea.font, linea.size, linea.color);
      if (linea.t) renglonFijo(p, linea.t, xDesc + linea.sangria, y, descAncho - linea.sangria, linea.font, linea.size, linea.color);
      y += linea.lh;
    }
    if (n === 0) {
      // Centradas en la fila, salvo en una descripción muy larga: ahí van arriba, junto a su nombre.
      const yCelda = alto > 260 ? arriba + PAD : arriba + alto / 2 - 4;
      for (const c of columnas) {
        const dato =
          c.clave === 'unidad'
            ? unidadCorta(partida.unidad)
            : c.clave === 'cantidad'
              ? String(partida.cantidad)
              : c.clave === 'precio'
                ? dinero(partida.precioUnitario)
                : c.clave === 'total'
                  ? dinero(partida.importe)
                  : null;
        if (dato != null) renglonFijo(p, dato, c.x + 3, yCelda, c.ancho - 6, c.clave === 'total' ? F.semi : F.texto, 8.4, TINTA, c.alinear, true);
      }
      if (columnaModelo) {
        let yModelo = alto > 260 ? arriba + PAD : arriba + (alto - altoModelo) / 2;
        for (const t of modelo) {
          renglonFijo(p, t, columnaModelo.x + 4, yModelo, columnaModelo.ancho - 8, F.semi, tamanoModelo, AZUL_GRUPO);
          yModelo += LH_MODELO;
        }
        for (const t of marca) {
          renglonFijo(p, t, columnaModelo.x + 4, yModelo, columnaModelo.ancho - 8, F.texto, 7.2, GRIS);
          yModelo += LH_MODELO;
        }
      }
    }
    p.doc.save();
    p.doc.strokeColor(LINEA).lineWidth(0.4).moveTo(TABLA_X, arriba + alto).lineTo(TABLA_X + TABLA_W, arriba + alto).stroke();
    p.doc.restore();
    p.y = arriba + alto;
  });
}

const ALTO_FILA_TOTAL = 21;
const ALTO_TOTAL = 27;
const altoDeTotales = (q: FormatoNexara) => (q.conIva ? 2 : 1) * ALTO_FILA_TOTAL + ALTO_TOTAL;

function totales(p: Lapiz, q: FormatoNexara) {
  const cajaW = 232;
  const x = TABLA_X + TABLA_W - cajaW;
  const letrasW = TABLA_W - cajaW - 20;
  const filas: Array<[string, string]> = [['Subtotal', dinero(q.subtotal)]];
  if (q.conIva) filas.push([`I.V.A. (${q.ivaPorciento}%)`, dinero(q.iva)]);
  const altoFila = ALTO_FILA_TOTAL;
  asegurar(p, altoDeTotales(q) + 8);
  texto(p, q.letras, TABLA_X, p.y + 5, letrasW, { size: 8.8, color: GRIS });
  // Cuánto es cada pago: el porcentaje solo obliga a sacar la cuenta.
  const anticipo = q.anticipoPorciento;
  if (anticipo > 0 && anticipo < 100 && q.total > 0) {
    const yPago = p.y + 8 + altoDe(p, q.letras, letrasW, 8.8) + 6;
    const primero = Math.round(q.total * anticipo) / 100;
    renglonFijo(p, `Anticipo (${anticipo} %)`, TABLA_X, yPago, 110, F.semi, 8.8, TINTA);
    renglonFijo(p, dinero(primero), TABLA_X + 110, yPago, 80, F.texto, 8.8, TINTA, 'right', true);
    renglonFijo(p, 'Saldo contra entrega', TABLA_X, yPago + 14, 110, F.semi, 8.8, TINTA);
    renglonFijo(p, dinero(q.total - primero), TABLA_X + 110, yPago + 14, 80, F.texto, 8.8, TINTA, 'right', true);
  }
  let y = p.y;
  for (const [etiqueta, valor] of filas) {
    renglonFijo(p, etiqueta, x + 8, y + 6, 100, F.semi, 9.2, TINTA);
    renglonFijo(p, valor, x + 90, y + 6, cajaW - 98, F.texto, 9.2, TINTA, 'right', true);
    y += altoFila;
    p.doc.save();
    p.doc.strokeColor(LINEA).lineWidth(0.4).moveTo(x, y).lineTo(x + cajaW, y).stroke();
    p.doc.restore();
  }
  p.doc.save();
  p.doc.rect(x, y, cajaW, ALTO_TOTAL).fill(AZUL);
  p.doc.restore();
  renglonFijo(p, `TOTAL PROYECTO (${q.moneda})`, x + 8, y + 9, 130, F.fuerte, 8.8, '#FFFFFF');
  renglonFijo(p, dinero(q.total), x + 90, y + 8, cajaW - 98, F.fuerte, 10.6, '#FFFFFF', 'right', true);
  p.y = y + ALTO_TOTAL;
}

const ALTO_SUBTOTAL = 20;

function filaSubtotalDeGrupo(p: Lapiz, etiqueta: string, importe: number) {
  if (p.y + ALTO_SUBTOTAL > BOTTOM) hoja(p);
  renglonFijo(p, etiqueta, TABLA_X + TABLA_W - 232, p.y + 5.6, 130, F.semi, 8.6, AZUL_GRUPO);
  renglonFijo(p, dinero(importe), TABLA_X + TABLA_W - 140, p.y + 5.6, 137, F.fuerte, 8.8, AZUL_GRUPO, 'right', true);
  p.y += ALTO_SUBTOTAL;
  p.doc.save();
  p.doc.strokeColor(AZUL_GRUPO).lineWidth(0.8).moveTo(TABLA_X, p.y).lineTo(TABLA_X + TABLA_W, p.y).stroke();
  p.doc.restore();
}

function apartadoEconomico(p: Lapiz, q: FormatoNexara, a: Apartado) {
  const columnas = columnasDeTabla(q.partidas.some((d) => d.modelo || d.marca));
  // Abre hoja, como en el diseño, salvo que en esta quede más de la mitad libre y le quepa la primera
  // partida: con un alcance corto dejaba casi toda la hoja en blanco.
  const primera = q.partidas[0];
  const altoPrimera = primera ? altoDeConcepto(p, primera, columnas) + 19 : 0;
  const reserva = q.partidas.length === 1 ? altoDeTotales(q) + 18 : 0;
  const libre = BOTTOM - p.y;
  if (libre < (BOTTOM - TOP) * 0.55 || libre < 130 + altoPrimera + reserva) hojaEnBlanco(p);
  tituloDeApartado(p, a);
  parrafo(p, 'A continuación se presenta el desglose de inversión correspondiente a esta propuesta.', { despues: 10 });

  encabezadoDeTabla(p, columnas);
  const grupos = gruposDeTabla(q.partidas);
  // Los totales nunca quedan solos en una hoja: viajan con la última partida.
  const reservaFinal = altoDeTotales(q) + 18;
  let n = 0;
  grupos.forEach(({ etiqueta, partidas }, i) => {
    if (etiqueta) {
      const esLaUltima = n + 1 === q.partidas.length;
      const conSubtotal = grupos.length > 1 && partidas.length === 1 ? ALTO_SUBTOTAL : 0;
      filaDeGrupo(p, `${String.fromCharCode(65 + i)}. ${etiqueta}`, columnas, altoDeConcepto(p, partidas[0]!, columnas) + conSubtotal + (esLaUltima ? reservaFinal : 0));
    }
    partidas.forEach((partida, j) => {
      n += 1;
      const conSubtotal = etiqueta && grupos.length > 1 && j === partidas.length - 1 ? ALTO_SUBTOTAL : 0;
      filaPartida(p, partida, columnas, n % 2 === 0, (n === q.partidas.length ? reservaFinal : 0) + conSubtotal);
    });
    if (etiqueta && grupos.length > 1) filaSubtotalDeGrupo(p, `Subtotal ${String.fromCharCode(65 + i)}`, partidas.reduce((acc, d) => acc + d.importe, 0));
  });
  if (!q.partidas.length) {
    texto(p, 'Sin partidas capturadas.', TABLA_X + 8, p.y + 6, TABLA_W - 16, { size: 8.6, color: GRIS });
    p.y += 22;
  }
  p.y += 10;
  totales(p, q);
}

/** Los tres grupos del diseño, con letra; si quien cotiza numeró a mano, su orden manda y no hay grupos. */
function gruposDeTabla(partidas: PartidaFormato[]): Array<{ etiqueta: string | null; partidas: PartidaFormato[] }> {
  if (partidas.some((d) => d.numeroPropio)) return [{ etiqueta: null, partidas }];
  const grupos = GRUPOS.map((grupo) => ({
    etiqueta: ETIQUETA_DE_TABLA[grupo],
    partidas: partidas.filter((d) => d.grupo === grupo),
  })).filter((g) => g.partidas.length);
  return grupos.length === 1 ? [{ etiqueta: null, partidas: grupos[0]!.partidas }] : grupos;
}

// ─────────────────────────────────────────────────────────────────────────────
// Condiciones y firma
// ─────────────────────────────────────────────────────────────────────────────

const FIRMA_ANCHO = 96;
const FIRMA_ALTO = FIRMA_ANCHO * (232 / 288);
const ALTO_DE_FIRMA = 20 + FIRMA_ALTO - 8 + 7 + 13 + 12 + 12;

function lineaDeMoneda(q: FormatoNexara): string {
  return `Moneda: Precios en ${q.moneda === 'USD' ? 'dólares americanos (USD)' : 'pesos mexicanos (MXN)'}, ${
    q.conIva ? `más IVA ${q.ivaPorciento}% desglosado.` : 'sin IVA (no incluye factura).'
  }${q.tipoCambioNota ? ` ${q.tipoCambioNota}` : ''}`;
}

function condicionesDe(q: FormatoNexara): string[] {
  const lineas = [`Tiempo de entrega: ${q.entrega}`];
  if (q.condicionesPago) lineas.push(`Condiciones de pago: ${q.condicionesPago}`);
  // Con la póliza impresa, garantía, vigencia y moneda ya están dichas ahí: aquí sería repetirlas.
  if (!q.garantias.length) {
    lineas.push(`Vigencia: ${q.vigencia}`);
    if (q.garantia) lineas.push(`Garantía: ${q.garantia}`);
    lineas.push(lineaDeMoneda(q));
  }
  return lineas;
}

/**
 * El cierre en su propia hoja va con la medida del diseño. Bajo los totales se aprieta un poco: una
 * tabla corta y su cierre caben juntos, en vez de dejar dos hojas a medias.
 */
const CIERRE_AMPLIO = { size: 10.2, lh: 14.6, despues: 4, titulo: 11.4, trasTitulo: 20, entre: 14, antesDeFirma: 44 };
const CIERRE_JUNTO = { size: 9.4, lh: 13.2, despues: 3, titulo: 10.4, trasTitulo: 16, entre: 10, antesDeFirma: 20 };

function cierre(p: Lapiz, q: FormatoNexara) {
  const condiciones = condicionesDe(q);
  const altoCon = (m: typeof CIERRE_AMPLIO) => {
    const lista = (lineas: string[]) =>
      lineas.reduce((acc, l) => acc + partirTexto(p, l, AW - 14, m.size, F.texto).length * m.lh + m.despues, 0);
    return m.trasTitulo + lista(condiciones) + (q.terminos.length ? m.entre + m.trasTitulo + lista(q.terminos) : 0) + m.antesDeFirma + ALTO_DE_FIRMA;
  };
  const SEPARACION = 20;
  const cabeJunto = p.y + SEPARACION + altoCon(CIERRE_JUNTO) <= BOTTOM;
  // Si tampoco cabe en una hoja entera (términos muy largos), sigue aquí y corre a la siguiente.
  if (!cabeJunto && altoCon(CIERRE_AMPLIO) <= BOTTOM - 132) hoja(p);
  const m = cabeJunto ? CIERRE_JUNTO : CIERRE_AMPLIO;

  // En hoja propia lleva el filete del diseño y arranca abajo del logotipo y los rombos.
  if (p.y === TOP) {
    fileteDeHoja(p);
    p.y = 132;
  } else {
    p.y += SEPARACION;
  }
  asegurar(p, 60);
  renglonFijo(p, 'CONDICIONES COMERCIALES', LM, p.y, AW, F.fuerte, m.titulo, VERDE_OSC);
  p.y += m.trasTitulo;
  for (const linea of condiciones) {
    conEtiquetaEnLinea(p, linea, { x: LM, size: m.size, lh: m.lh, colorEtiqueta: VERDE_OSC, despues: m.despues });
  }

  if (q.terminos.length) {
    p.y += m.entre;
    asegurar(p, 40);
    renglonFijo(p, 'TÉRMINOS Y CONDICIONES', LM, p.y, AW, F.fuerte, m.titulo, VERDE_OSC);
    p.y += m.trasTitulo;
    for (const linea of q.terminos) {
      conEtiquetaEnLinea(p, linea, {
        x: LM + 13,
        size: m.size,
        lh: m.lh,
        despues: m.despues,
        marca: (y) => {
          p.doc.save();
          p.doc.rect(LM + 1, y + m.size * 0.33, m.size * 0.47, m.size * 0.47).fill(TINTA);
          p.doc.restore();
        },
      });
    }
  }

  p.y += m.antesDeFirma;
  asegurar(p, ALTO_DE_FIRMA);
  texto(p, 'ATENTAMENTE', LM, p.y, AW, { font: F.fuerte, size: 9.6, color: TINTA, align: 'center' });
  p.y += 20;
  // Firma impresa de Christian: queda fija en todas las cotizaciones (pidió Monica por WhatsApp).
  const firma = path.join(directorioAssets(), 'firma_christian.png');
  if (fs.existsSync(firma)) {
    p.doc.image(firma, LM + (AW - FIRMA_ANCHO) / 2, p.y, { width: FIRMA_ANCHO, height: FIRMA_ALTO });
  }
  p.y += FIRMA_ALTO - 8;
  const firmaX = LM + AW * 0.275;
  p.doc.save();
  p.doc.strokeColor(CARBON).lineWidth(0.8).moveTo(firmaX, p.y).lineTo(firmaX + AW * 0.45, p.y).stroke();
  p.doc.restore();
  p.y += 7;
  texto(p, FIRMA.nombre, LM, p.y, AW, { size: 9.6, color: TINTA, align: 'center' });
  p.y += 13;
  texto(p, FIRMA.cargo, LM, p.y, AW, { size: 8.2, color: TINTA, align: 'center' });
  p.y += 12;
  texto(p, FIRMA.razon, LM, p.y, AW, { font: F.semi, size: 8.2, color: TINTA, align: 'center' });
}

// ─────────────────────────────────────────────────────────────────────────────

/** Número que imprime una hoja del documento base: las que siguen a los planos en PDF los cuentan. */
export function paginaImpresa(hoja: number, paginaTrasPlanos: number, paginasPdf: number): number {
  return paginaTrasPlanos && hoja > paginaTrasPlanos ? hoja + paginasPdf : hoja;
}

/** Páginas que van a anexar los planos en PDF: la paginación las cuenta antes de escribirse. */
async function paginasDePlanos(pdfs: PlanosClasificados['pdfs']): Promise<number> {
  let total = 0;
  for (const { archivo } of pdfs) {
    try {
      total += (await PDFLibDocument.load(await fs.promises.readFile(archivo))).getPageCount();
    } catch {
      /* `anexarPaginasPdf` también lo salta */
    }
  }
  return total;
}

/**
 * Página (1 = portada) donde arranca cada sección. La vista previa del editor la usa para llevar el
 * PDF a la sección que se está escribiendo. Una sección que no se imprime no aparece.
 */
export type SeccionesPropuesta = Partial<Record<'portada' | 'objetivo' | 'alcance' | 'planos' | 'cotizacion', number>>;

/**
 * La cotización que descarga y recibe el cliente: la «Memoria descriptiva y propuesta
 * técnica-económica» del diseño de NEXARA. Portada, datos de la propuesta y, en esa misma hoja, el
 * alcance ejecutivo (lo escrito o un borrador corto de las partidas), bloques de alcance, planos, póliza
 * de garantías, propuesta económica y, al final, condiciones, términos y firma. Cada dato se imprime
 * una sola vez.
 *
 * Una imagen de plano va a hoja propia; un PDF (lo normal en CAD y en la hoja de servicio) anexa sus
 * páginas reales justo después del apartado de planos, sin convertirlo a imagen: no pierde nitidez ni
 * texto seleccionable. Si se pasa `secciones`, se llena con la página donde empieza cada parte (la
 * vista previa del editor lleva ahí el PDF).
 */
export async function generarCotizacionNexaraPdf(
  quote: QuoteLike | FormatoNexara,
  planos: PlanoArchivo[] = [],
  secciones?: SeccionesPropuesta,
): Promise<Buffer> {
  const q = 'partidas' in quote && 'letras' in quote ? (quote as FormatoNexara) : formatoDesdeCotizacion(quote as QuoteLike);
  // La hoja técnica lleva letra chica: se imprime a más resolución que una foto.
  const todos = clasificarPlanos(q.conPlanos ? planos : [], { maxLadoDe: (nombre) => (nombre.startsWith(NOMBRE_PLANO_TECNICO) ? 2600 : undefined) });
  // Las vistas del sitio acompañan al alcance ejecutivo; si ese apartado no sale de la memoria, van con los planos.
  const vistas = q.ejecutivoDeMemoria ? todos.imagenes.filter((i) => i.nombre === NOMBRE_VISTA_3D || i.nombre === NOMBRE_VISTA_COBERTURA) : [];
  const anexos = { ...todos, imagenes: todos.imagenes.filter((i) => !vistas.includes(i)) };
  const hayPlanos = anexos.imagenes.length + anexos.pdfs.length + anexos.otros.length > 0;
  const paginasPdf = await paginasDePlanos(anexos.pdfs);
  const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: false, bufferPages: true });
  doc.info.Title = `Cotización ${q.numero}`;
  doc.info.Author = 'NEXARA';
  registrarFuentesCorporativas(doc);
  const p: Lapiz = { doc, y: 0, numero: q.numero, pagina: 0, paginaDe: {}, apaisadas: new Set() };
  const trozos: Buffer[] = [];
  doc.on('data', (t: Buffer) => trozos.push(t));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
  });

  const apartados = apartadosDe(q, hayPlanos);
  doc.addPage({ size: 'LETTER', margin: 0 });
  p.pagina = 1;
  dibujarPortada(doc, { version: q.version, indice: apartados.map(({ numero, titulo }) => ({ numero, titulo })) });
  arranqueDePropuesta(p, q);

  // Última hoja antes de los planos en PDF: ahí se insertan sus páginas.
  let paginaTrasPlanos = 0;
  for (const a of apartados) {
    if (a.clave === 'objetivo') {
      if (q.ejecutivoDeMemoria && q.memoria) apartadoEjecutivoDeMemoria(p, q, a, q.memoria, vistas);
      else apartadoEjecutivo(p, q, a);
    } else if (a.clave === 'alcance') {
      if (a.bloque?.especial === 'lineas' && q.memoria) apartadoDeLineas(p, a, q.memoria);
      else if (a.bloque?.especial === 'centro' && q.memoria) apartadoDelCentro(p, a, q.memoria);
      else apartadoDeAlcance(p, q, a);
    } else if (a.clave === 'levantamiento' && q.memoria) apartadoDeLevantamiento(p, a, q.memoria);
    else if (a.clave === 'planos') {
      apartadoDePlanos(p, a, anexos);
      paginaTrasPlanos = p.pagina;
      // Lo que sigue no puede quedar en la misma hoja que precede a las páginas anexadas.
      if (anexos.pdfs.length) hoja(p);
    } else if (a.clave === 'garantias') apartadoDeGarantias(p, q, a);
    else apartadoEconomico(p, q, a);
  }
  cierre(p, q);

  const totalBase = p.pagina;
  const total = totalBase + paginasPdf;
  const rango = doc.bufferedPageRange();
  for (let i = 1; i < rango.count; i += 1) {
    doc.switchToPage(rango.start + i);
    const impresa = paginaImpresa(i + 1, paginaTrasPlanos, paginasPdf);
    doc.font(F.texto).fontSize(7).fillColor(GRIS);
    const apaisada = p.apaisadas.has(i + 1);
    doc.text(`${q.numero}  ·  Página ${impresa} de ${total}`, apaisada ? 24 : LM, apaisada ? 596 : 696, { width: apaisada ? 744 : AW, align: 'right', lineBreak: false });
  }
  if (secciones) {
    const { paginaDe } = p;
    secciones.portada = 1;
    if (paginaDe.objetivo) secciones.objetivo = paginaDe.objetivo;
    if (paginaDe.alcance) secciones.alcance = paginaDe.alcance;
    if (paginaDe.planos) secciones.planos = paginaDe.planos;
    if (paginaDe.cotizacion) secciones.cotizacion = paginaImpresa(paginaDe.cotizacion, paginaTrasPlanos, paginasPdf);
  }
  doc.end();
  const base = await listo;
  return anexarPaginasPdf(base, anexos.pdfs, { antesDeFinal: totalBase - paginaTrasPlanos });
}
