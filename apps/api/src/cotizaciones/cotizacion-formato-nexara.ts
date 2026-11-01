/**
 * La cotización que recibe el cliente, con el diseño de NEXARA («Memoria descriptiva y propuesta
 * técnica-económica»): portada, hoja de título, alcance, planos, garantías, partidas, subtotal / IVA /
 * total, importe con letra, condiciones y firma. El costo y el margen no entran.
 */
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { importeConLetra } from './importe-letra.js';
import { factorMargen } from './cotizacion-totals.js';
import { normalizarOpciones } from './personalizacion.js';
import { normalizarBloques } from './alcance-bloques.js';
import { puntosPorOmision, TITULOS_POR_OMISION } from './alcance-por-omision.js';
import { objetivoDePropuesta, type Objetivo } from './objetivo-plantilla.js';
import { ESTADO, estadoDesdeDb } from './estado-cotizacion.js';
import { grupoDePartida, GRUPOS, incluyeInstalacion, type GrupoPartida } from './partidas-grupos.js';
import { dibujarMarco, dibujarPortada, VERDE } from './cotizacion-marco.js';
import { anticipoDeCotizacion, terminosDeCotizacion, type Terminos } from './terminos-segmento.js';
import { segmentosLista } from './vinetas-texto.js';
import type { SeccionesPropuesta } from './propuesta-tecnica-pdf.js';
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

const PAGE_W = 612;
const LM = 46;
const AW = 506;
const TITULO_X = 58;
/** Donde empieza el cuerpo de una hoja de continuación y donde termina, antes del pie. */
const TOP = 112;
const BOTTOM = 688;
const CUERPO = { size: 9.6, lh: 14 };

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
  alcance: Array<{ titulo: string; texto: string; vinetas: string[] }>;
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
export function formatoDesdeCotizacion(quote: QuoteLike): FormatoNexara {
  const opciones = normalizarOpciones(quote.opciones);
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
    for (const b of normalizarBloques(quote.alcanceBloques)) {
      const textoBloque = String(b.texto ?? '').trim();
      if (b.titulo.trim()) alcance.push({ titulo: b.titulo.trim(), texto: textoBloque, vinetas: b.vinetas });
      else if (alcance.length) {
        const previo = alcance[alcance.length - 1]!;
        previo.texto = [previo.texto, textoBloque].filter(Boolean).join('\n');
        previo.vinetas = [...previo.vinetas, ...b.vinetas];
      } else alcanceIntro.push(...parrafosDe(textoBloque), ...b.vinetas);
    }
    // Sin puntos escritos van los del diseño: la portada nunca sale sin ellos.
    if (!alcance.length) {
      for (const b of puntosPorOmision(agrupables(quote))) {
        alcance.push({ titulo: b.titulo, texto: b.texto ?? '', vinetas: b.vinetas });
      }
    }
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
function tituloDeApartado(p: Lapiz, a: Apartado) {
  const etiqueta = `${a.numero}. ${a.titulo.toUpperCase()}`;
  const opciones = { width: 440, characterSpacing: 0.7, lineGap: 3.4 };
  p.doc.font(F.semi).fontSize(12.5);
  const alto = p.doc.heightOfString(etiqueta, opciones);
  if (p.y !== TOP) asegurar(p, alto + 66);
  // El alto de hoja en blanco se decide después de `asegurar`, que pudo abrirla.
  if (p.y === TOP) p.y = alto > 22 ? 64 : 76;
  else p.y += 14;
  p.paginaDe[a.clave] ??= p.pagina;
  p.doc.font(F.semi).fontSize(12.5).fillColor(GRIS_TITULO).text(etiqueta, TITULO_X, p.y, opciones);
  const yFilete = p.y + alto + 3;
  const finFilete = Math.min(TITULO_X + 440, TITULO_X + p.doc.widthOfString(etiqueta, opciones) + 26);
  p.doc.save();
  p.doc.moveTo(LM, yFilete).lineTo(Math.max(finFilete, LM + 220), yFilete).lineWidth(1.6).strokeColor(VERDE).stroke();
  p.doc.restore();
  p.y = yFilete + 15;
}

function subtitulo(p: Lapiz, valor: string) {
  asegurar(p, 34);
  renglonFijo(p, valor, LM, p.y, AW, F.semi, 9.6, GRIS_TITULO);
  p.y += 15;
}

/** Párrafo por renglones: el corte de hoja siempre lo decide `BOTTOM`, nunca PDFKit. */
function parrafo(p: Lapiz, valor: string, o: { despues?: number } = {}) {
  const lineas = partirTexto(p, valor.trim(), AW, CUERPO.size, F.texto);
  asegurar(p, CUERPO.lh * Math.min(2, lineas.length));
  for (const linea of lineas) {
    asegurar(p, CUERPO.lh);
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

  asegurar(p, lh * Math.min(2, 1 + siguientes.length));
  o.marca?.(p.y);
  if (etiqueta) renglonFijo(p, etiqueta, o.x, p.y, anchoEtiqueta, F.semi, size, o.colorEtiqueta ?? TINTA);
  if (primero) renglonFijo(p, primero, o.x + anchoEtiqueta, p.y, ancho, F.texto, size, TINTA);
  p.y += lh;
  for (const linea of siguientes) {
    asegurar(p, lh);
    if (linea) renglonFijo(p, linea, o.x, p.y, ancho, F.texto, size, TINTA);
    p.y += lh;
  }
  p.y += o.despues ?? 3;
}

function vineta(p: Lapiz, valor: string) {
  conEtiquetaEnLinea(p, valor, {
    x: LM + 14,
    marca: (y) => {
      p.doc.save();
      p.doc.circle(LM + 5, y + CUERPO.size * 0.6, 1.6).fill(TINTA);
      p.doc.restore();
    },
  });
}

/** Recuadro gris con título en negritas, como la «Ventaja operativa» del diseño. */
function recuadro(p: Lapiz, titulo: string, cuerpo: string) {
  const [x, ancho] = [LM - 14, AW + 28];
  const interior = ancho - 24;
  const lineas = partirTexto(p, cuerpo.trim(), interior, 8.6, F.texto);
  const alto = 12 + 13 + lineas.length * 12 + 9;
  // Un cierre escrito más largo que media hoja ya no es un recuadro: se lee como texto corrido.
  if (alto > (BOTTOM - TOP) / 2) {
    subtitulo(p, titulo);
    for (const t of parrafosDe(cuerpo)) parrafo(p, t);
    return;
  }
  asegurar(p, alto + 8);
  p.y += 4;
  p.doc.save();
  p.doc.roundedRect(x, p.y, ancho, alto, 7).fill(GRIS_RECUADRO);
  p.doc.restore();
  renglonFijo(p, titulo, x + 12, p.y + 11, interior, F.semi, 8.8, GRIS_TITULO);
  lineas.forEach((linea, i) => renglonFijo(p, linea, x + 12, p.y + 24 + i * 12, interior, F.texto, 8.6, GRIS));
  p.y += alto + 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Apartados
// ─────────────────────────────────────────────────────────────────────────────

/** Por encima de esto los bloques del alcance dejan de ser apartados y van juntos en uno solo. */
const MAX_APARTADOS_DE_ALCANCE = 8;

type Apartado = {
  clave: 'objetivo' | 'alcance' | 'planos' | 'garantias' | 'cotizacion';
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
  if (hayPlanos) lista.push({ clave: 'planos', titulo: 'Planos' });
  if (q.garantias.length) lista.push({ clave: 'garantias', titulo: q.titulos.garantias });
  lista.push({ clave: 'cotizacion', titulo: q.titulos.cotizacion });
  return lista.map((a, i) => ({ ...a, numero: i + 1 }));
}

/**
 * Hoja de título: «Memoria descriptiva…», el proyecto, y una sola vez los datos de la cotización.
 * Los datos fiscales del emisor van arriba, junto al logotipo (los pidió Adam en toda cotización).
 */
function hojaDeTitulo(p: Lapiz, q: FormatoNexara) {
  hoja(p);
  const { doc } = p;
  const xFiscal = LM + 28;
  RENGLONES_EMISOR.forEach((linea, i) => {
    doc.fillColor(GRIS).font(i === 0 ? F.semi : F.texto).fontSize(i === 0 ? 7 : 6.6);
    doc.text(linea, xFiscal, 17 + i * 8.6, { lineBreak: false });
  });

  const centro = { width: 480, align: 'center' as const };
  const xCentro = (PAGE_W - 480) / 2;
  doc.font(F.fuerte).fontSize(18.5).fillColor(GRIS_TITULO);
  doc.text('MEMORIA DESCRIPTIVA Y', xCentro, 206, { ...centro, lineBreak: false });
  doc.text('PROPUESTA TÉCNICA-ECONÓMICA', xCentro, 236, { ...centro, lineBreak: false });

  let y = 296;
  if (q.proyecto) {
    // El cuerpo más grande con el que el proyecto cabe en cuatro renglones.
    const titulo = q.proyecto.toUpperCase();
    let size = 24;
    doc.font(F.fuerte);
    while (size > 13 && (doc.fontSize(size), doc.heightOfString(titulo, { width: 440, lineGap: size * 0.42 })) > size * 1.42 * 4.2) size -= 1;
    doc.fontSize(size).fillColor(GRIS_TITULO);
    const opciones = { width: 440, align: 'center' as const, lineGap: size * 0.42 };
    const alto = doc.heightOfString(titulo, opciones);
    doc.text(titulo, (PAGE_W - 440) / 2, y, opciones);
    y += alto;
  }

  const izquierda: Array<[string, string]> = [
    ['Cliente', q.cliente],
    ['Atención', q.atencion],
    ['Teléfono', q.telefono],
    ['Correo', q.correo],
    ['Ubicación', q.ubicacion],
  ];
  const derecha: Array<[string, string]> = [
    ['Cotización N°', q.numero],
    ['Fecha de emisión', q.fecha],
    ['Responsable comercial', q.responsable],
  ];
  const [xIzq, anchoCol] = [76, 220];
  const xDer = xIzq + anchoCol + 20;
  const yDatos = Math.max(y + 36, 512);
  doc.save();
  doc.moveTo(xIzq, yDatos).lineTo(PAGE_W - xIzq, yDatos).lineWidth(0.8).strokeColor(VERDE).stroke();
  doc.restore();
  for (const [x, filas] of [[xIzq, izquierda], [xDer, derecha]] as Array<[number, Array<[string, string]>]>) {
    let yFila = yDatos + 13;
    for (const [etiqueta, valor] of filas) {
      if (!valor.trim()) continue;
      renglonFijo(p, etiqueta.toUpperCase(), x, yFila, anchoCol, F.semi, 6.6, GRIS);
      yFila += 9.5;
      const lineas = partirTexto(p, valor.trim(), anchoCol, 9, F.texto).slice(0, 2);
      for (const linea of lineas) {
        if (yFila + 12 > BOTTOM) break;
        renglonFijo(p, linea, x, yFila, anchoCol, F.texto, 9, TINTA);
        yFila += 12;
      }
      yFila += 5;
    }
  }
  // Lo que sigue arranca en hoja nueva.
  p.y = BOTTOM;
}

/** Texto libre: un renglón que empieza con viñeta se imprime como viñeta, lo demás como párrafo. */
function textoLibre(p: Lapiz, valor: string) {
  const vinetaEscrita = /^[•·*-]\s+(.+)$/s.exec(valor);
  if (vinetaEscrita) vineta(p, vinetaEscrita[1]!);
  else parrafo(p, valor);
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

function apartadoDeAlcance(p: Lapiz, q: FormatoNexara, a: Apartado) {
  tituloDeApartado(p, a);
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

/** Leyenda de un plano, centrada y entre corchetes como en el diseño. */
function leyendaDePlano(p: Lapiz, nombre: string) {
  texto(p, `[ ${nombre.toUpperCase()} ]`, LM, p.y, AW, { font: F.semi, size: 7.8, color: CARBON, align: 'center', characterSpacing: 0.6 });
  p.y += altoDe(p, nombre.toUpperCase(), AW, 7.8, F.semi) + 8;
}

function apartadoDePlanos(p: Lapiz, a: Apartado, anexos: PlanosClasificados) {
  // Con imágenes el título viaja con la primera; sin ellas basta con la lista.
  if (anexos.imagenes.length) hojaEnBlanco(p);
  tituloDeApartado(p, a);
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
  // La póliza se lee junta: si no cabe entera, pasa completa a la hoja siguiente.
  // La etiqueta en negritas es más ancha que al medirla con texto normal: se mide un poco más angosto.
  const altoDeVinetas = (lista: readonly string[]) =>
    lista.reduce((acc, v) => acc + partirTexto(p, v, AW - 24, CUERPO.size, F.texto).length * CUERPO.lh + 3, 0);
  asegurar(p, 70 + 15 + altoDeVinetas(q.garantias) + 6 + 15 + 17 + altoDeVinetas(EXCLUSIONES_DE_GARANTIA) + 66);
  tituloDeApartado(p, a);
  subtitulo(p, 'Alcance de la garantía');
  q.garantias.forEach((g) => vineta(p, g));
  p.y += 6;
  subtitulo(p, 'Exclusiones');
  parrafo(p, 'La garantía no aplica cuando la falla derive de:', { despues: 3 });
  EXCLUSIONES_DE_GARANTIA.forEach((e) => vineta(p, e));
  p.y += 6;
  recuadro(p, 'Vigencia comercial', `Vigencia: ${q.vigencia}\n${lineaDeMoneda(q)}`);
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

const ENCABEZADO_TABLA = 18;
const FILA_GRUPO = 16;

/** Columnas del diseño. Sin ningún modelo capturado, ese ancho se lo queda el concepto. */
function columnasDeTabla(conModelo: boolean): Columna[] {
  const fijas: Array<Omit<Columna, 'x'>> = [
    { clave: 'unidad', titulo: 'Unidad', ancho: 40, alinear: 'center' },
    { clave: 'cantidad', titulo: 'Cant.', ancho: 30, alinear: 'center' },
    { clave: 'concepto', titulo: 'Concepto / Descripción', ancho: 0, alinear: 'left' },
    ...(conModelo ? [{ clave: 'modelo' as const, titulo: 'Modelo / SKU', ancho: 104, alinear: 'left' as const }] : []),
    { clave: 'precio', titulo: 'Precio Venta', ancho: 62, alinear: 'right' },
    { clave: 'total', titulo: 'Total Venta', ancho: 68, alinear: 'right' },
  ];
  const concepto = AW - fijas.reduce((acc, c) => acc + c.ancho, 0);
  let x = LM;
  return fijas.map((c) => {
    const col = { ...c, x, ancho: c.clave === 'concepto' ? concepto : c.ancho };
    x += col.ancho;
    return col;
  });
}

function encabezadoDeTabla(p: Lapiz, columnas: Columna[]) {
  const y = p.y;
  p.doc.save();
  p.doc.rect(LM, y, AW, ENCABEZADO_TABLA).fill(AZUL);
  p.doc.restore();
  for (const col of columnas) {
    renglonFijo(p, col.titulo, col.x + 4, y + 5.2, col.ancho - 8, F.fuerte, 7, '#FFFFFF', col.alinear);
  }
  p.y = y + ENCABEZADO_TABLA;
}

function filaDeGrupo(p: Lapiz, etiqueta: string, columnas: Columna[]) {
  if (p.y + FILA_GRUPO + 30 > BOTTOM) {
    hoja(p);
    encabezadoDeTabla(p, columnas);
  }
  p.doc.save();
  p.doc.rect(LM, p.y, AW, FILA_GRUPO).fill(AZUL_GRUPO);
  p.doc.restore();
  renglonFijo(p, etiqueta, LM + 6, p.y + 4.4, AW - 12, F.fuerte, 7.2, '#FFFFFF');
  p.y += FILA_GRUPO;
}

type LineaDeFila = { t: string; font: string; size: number; color: string; lh: number; sangria: number; marca: boolean };

/** Renglones del concepto: el nombre y debajo la descripción, con sus viñetas. */
function lineasDeConcepto(p: Lapiz, partida: PartidaFormato, ancho: number): LineaDeFila[] {
  const numeroPropio = partida.numeroPropio ? `${partida.partida} · ` : '';
  const bloques: Array<{ texto: string; font: string; size: number; color: string }> = [
    { texto: `${numeroPropio}${partida.titulo || 'Concepto'}`, font: F.medio, size: 7.8, color: TINTA },
  ];
  if (partida.descripcion) bloques.push({ texto: partida.descripcion, font: F.texto, size: 7.2, color: GRIS });

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

/**
 * Una partida. Si cabe en una hoja no se parte: pasa entera a la siguiente. Solo una descripción más
 * larga que una hoja completa sigue en la de después, con las cifras en su primera parte.
 */
function filaPartida(p: Lapiz, partida: PartidaFormato, columnas: Columna[], zebra: boolean, reserva = 0) {
  const PAD = 4.5;
  const col = (clave: Columna['clave']) => columnas.find((c) => c.clave === clave);
  const concepto = col('concepto')!;
  const descAncho = concepto.ancho - 8;
  const lineas = lineasDeConcepto(p, partida, descAncho);

  const columnaModelo = col('modelo');
  // Un modelo es una sola palabra: si le falta poco para caber se reduce en vez de partirlo.
  let tamanoModelo = 7.2;
  if (columnaModelo && partida.modelo && !/\s/.test(partida.modelo)) {
    p.doc.font(F.semi).fontSize(tamanoModelo);
    const ancho = p.doc.widthOfString(partida.modelo);
    tamanoModelo = Math.max(6, Math.min(tamanoModelo, (tamanoModelo * (columnaModelo.ancho - 8)) / ancho));
  }
  const modelo = columnaModelo && partida.modelo ? partirTexto(p, partida.modelo, columnaModelo.ancho - 8, tamanoModelo, F.semi) : [];
  const marca =
    columnaModelo && partida.marca && partida.marca !== partida.modelo
      ? partirTexto(p, partida.marca, columnaModelo.ancho - 8, 6.6, F.texto)
      : [];
  const LH_MODELO = 9.6;
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
      p.doc.rect(LM, arriba, AW, alto).fill(ZEBRA);
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
      const yCelda = alto > 140 ? arriba + PAD : arriba + alto / 2 - 4;
      for (const c of columnas) {
        const dato =
          c.clave === 'unidad'
            ? partida.unidad
            : c.clave === 'cantidad'
              ? String(partida.cantidad)
              : c.clave === 'precio'
                ? dinero(partida.precioUnitario)
                : c.clave === 'total'
                  ? dinero(partida.importe)
                  : null;
        if (dato != null) renglonFijo(p, dato, c.x + 3, yCelda, c.ancho - 6, F.texto, 7.6, TINTA, c.alinear, true);
      }
      if (columnaModelo) {
        let yModelo = alto > 140 ? arriba + PAD : arriba + (alto - altoModelo) / 2;
        for (const t of modelo) {
          renglonFijo(p, t, columnaModelo.x + 4, yModelo, columnaModelo.ancho - 8, F.semi, tamanoModelo, AZUL_GRUPO);
          yModelo += LH_MODELO;
        }
        for (const t of marca) {
          renglonFijo(p, t, columnaModelo.x + 4, yModelo, columnaModelo.ancho - 8, F.texto, 6.6, GRIS);
          yModelo += LH_MODELO;
        }
      }
    }
    p.doc.save();
    p.doc.strokeColor(LINEA).lineWidth(0.4).moveTo(LM, arriba + alto).lineTo(LM + AW, arriba + alto).stroke();
    p.doc.restore();
    p.y = arriba + alto;
  });
}

const ALTO_FILA_TOTAL = 18;
const altoDeTotales = (q: FormatoNexara) => (q.conIva ? 2 : 1) * ALTO_FILA_TOTAL + 22;

function totales(p: Lapiz, q: FormatoNexara) {
  const cajaW = 188;
  const x = LM + AW - cajaW;
  const letrasW = AW - cajaW - 16;
  const filas: Array<[string, string]> = [['Subtotal', dinero(q.subtotal)]];
  if (q.conIva) filas.push([`I.V.A. (${q.ivaPorciento}%)`, dinero(q.iva)]);
  const altoFila = ALTO_FILA_TOTAL;
  asegurar(p, altoDeTotales(q) + 8);
  texto(p, q.letras, LM, p.y + 4, letrasW, { size: 7.6, color: GRIS });
  let y = p.y;
  for (const [etiqueta, valor] of filas) {
    renglonFijo(p, etiqueta, x + 6, y + 5, 90, F.texto, 8, TINTA);
    renglonFijo(p, valor, x + 80, y + 5, cajaW - 86, F.texto, 8, TINTA, 'right', true);
    y += altoFila;
    p.doc.save();
    p.doc.strokeColor(LINEA).lineWidth(0.4).moveTo(x, y).lineTo(x + cajaW, y).stroke();
    p.doc.restore();
  }
  p.doc.save();
  p.doc.rect(x, y, cajaW, 22).fill(AZUL);
  p.doc.restore();
  renglonFijo(p, `TOTAL PROYECTO (${q.moneda})`, x + 6, y + 7, 112, F.fuerte, 7.6, '#FFFFFF');
  renglonFijo(p, dinero(q.total), x + 80, y + 6.4, cajaW - 86, F.fuerte, 8.6, '#FFFFFF', 'right', true);
  p.y = y + 22;
}

function apartadoEconomico(p: Lapiz, q: FormatoNexara, a: Apartado) {
  hojaEnBlanco(p);
  tituloDeApartado(p, a);
  parrafo(p, 'A continuación se presenta el desglose de inversión correspondiente a esta propuesta.', { despues: 8 });

  const columnas = columnasDeTabla(q.partidas.some((d) => d.modelo || d.marca));
  encabezadoDeTabla(p, columnas);
  const grupos = gruposDeTabla(q.partidas);
  // Los totales nunca quedan solos en una hoja: viajan con la última partida.
  const reservaFinal = altoDeTotales(q) + 18;
  let n = 0;
  grupos.forEach(({ etiqueta, partidas }, i) => {
    if (etiqueta) filaDeGrupo(p, `${String.fromCharCode(65 + i)}. ${etiqueta}`, columnas);
    for (const partida of partidas) {
      n += 1;
      filaPartida(p, partida, columnas, n % 2 === 0, n === q.partidas.length ? reservaFinal : 0);
    }
  });
  if (!q.partidas.length) {
    texto(p, 'Sin partidas capturadas.', LM + 8, p.y + 6, AW - 16, { size: 8, color: GRIS });
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
const ALTO_DE_FIRMA = 18 + FIRMA_ALTO - 8 + 6 + 12 + 12 + 12;

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

const TAMANO_CONDICIONES = 8.6;
const RENGLON_CONDICIONES = 12;

function cierre(p: Lapiz, q: FormatoNexara) {
  const condiciones = condicionesDe(q);
  // Condiciones, términos y firma van juntos en la hoja de los totales si ahí caben; si no, en la suya.
  const altoDeLista = (lineas: string[]) =>
    lineas.reduce(
      (acc, l) => acc + partirTexto(p, l, AW - 14, TAMANO_CONDICIONES, F.texto).length * RENGLON_CONDICIONES + 3,
      0,
    );
  const altoTotal =
    14 + 16 + altoDeLista(condiciones) + (q.terminos.length ? 10 + 16 + altoDeLista(q.terminos) : 0) + 16 + ALTO_DE_FIRMA;
  if (p.y + altoTotal > BOTTOM && altoTotal <= BOTTOM - TOP) hoja(p);

  p.y += p.y === TOP ? 0 : 14;
  if (p.y === TOP) p.y = 76;
  asegurar(p, 60);
  renglonFijo(p, 'CONDICIONES COMERCIALES', LM, p.y, AW, F.fuerte, 9.6, VERDE_OSC);
  p.y += 16;
  for (const linea of condiciones) {
    conEtiquetaEnLinea(p, linea, { x: LM, size: TAMANO_CONDICIONES, lh: RENGLON_CONDICIONES, colorEtiqueta: VERDE_OSC });
  }

  if (q.terminos.length) {
    p.y += 10;
    asegurar(p, 36);
    renglonFijo(p, 'TÉRMINOS Y CONDICIONES', LM, p.y, AW, F.fuerte, 9.6, VERDE_OSC);
    p.y += 16;
    for (const linea of q.terminos) {
      conEtiquetaEnLinea(p, linea, {
        x: LM + 11,
        size: TAMANO_CONDICIONES,
        lh: RENGLON_CONDICIONES,
        marca: (y) => {
          p.doc.save();
          p.doc.rect(LM + 1, y + 2.8, 4.2, 4.2).fill(TINTA);
          p.doc.restore();
        },
      });
    }
  }

  p.y += 16;
  asegurar(p, ALTO_DE_FIRMA);
  texto(p, 'ATENTAMENTE', LM, p.y, AW, { font: F.fuerte, size: 8.6, color: TINTA, align: 'center' });
  p.y += 18;
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
  p.y += 6;
  texto(p, FIRMA.nombre, LM, p.y, AW, { size: 8.6, color: TINTA, align: 'center' });
  p.y += 12;
  texto(p, FIRMA.cargo, LM, p.y, AW, { size: 7.6, color: TINTA, align: 'center' });
  p.y += 12;
  texto(p, FIRMA.razon, LM, p.y, AW, { font: F.semi, size: 7.6, color: TINTA, align: 'center' });
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
 * La cotización que descarga y recibe el cliente: la «Memoria descriptiva y propuesta
 * técnica-económica» del diseño de NEXARA. Portada, hoja de título, alcance ejecutivo (lo escrito o
 * un borrador corto de las partidas), bloques de alcance, planos, póliza de garantías, propuesta
 * económica y, al final, condiciones, términos y firma. Cada dato se imprime una sola vez.
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
  const anexos = clasificarPlanos(q.conPlanos ? planos : []);
  const hayPlanos = anexos.imagenes.length + anexos.pdfs.length + anexos.otros.length > 0;
  const paginasPdf = await paginasDePlanos(anexos.pdfs);
  const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: false, bufferPages: true });
  doc.info.Title = `Cotización ${q.numero}`;
  doc.info.Author = 'NEXARA';
  registrarFuentesCorporativas(doc);
  const p: Lapiz = { doc, y: 0, numero: q.numero, pagina: 0, paginaDe: {} };
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
  hojaDeTitulo(p, q);
  hoja(p);

  // Última hoja antes de los planos en PDF: ahí se insertan sus páginas.
  let paginaTrasPlanos = 0;
  for (const a of apartados) {
    if (a.clave === 'objetivo') apartadoEjecutivo(p, q, a);
    else if (a.clave === 'alcance') apartadoDeAlcance(p, q, a);
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
    doc.text(`${q.numero}  ·  Página ${impresa} de ${total}`, LM, 696, { width: AW, align: 'right', lineBreak: false });
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
