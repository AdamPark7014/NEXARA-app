/**
 * De la cotización guardada al payload del PDF «Propuesta técnica».
 *
 * Aquí se decide qué campo del editor de Core va a qué parte del documento:
 *
 *   portada        cliente, proyecto (`projectName`), folio, fecha, versión (revisión)
 *   01 Objetivo    `objetivo` (texto con marcas) → introducción, beneficios y cierre; lo vacío
 *                  lo completa la plantilla del segmento y las cifras de las partidas
 *   02 Alcance     título = `projectName`; párrafo de entrada = `scope` (bloque sin título, sin
 *                  número); subsecciones = `alcanceBloques` (título, párrafos y viñetas)
 *   03 Planos      anexos propios en el orden del editor, más la evidencia de la actividad
 *   04 Cotización  partidas **en el orden del editor**, subtotal/IVA/total, términos por partes
 *                  («Forma de pago: …») con lo reescrito en `note`, y quién la elaboró
 *
 * Módulo puro (sin Nest ni Prisma): el servicio le pasa lo que busca en la base y la API de
 * mentira de la web puede armar el mismo PDF.
 */
import type { PropuestaPayload } from './propuesta-tecnica-pdf.js';
import { normalizarBloques } from './alcance-bloques.js';
import { objetivoDePropuesta } from './objetivo-plantilla.js';
import { incluyeInstalacion, type PartidaAgrupable } from './partidas-grupos.js';
import { ETIQUETA_SEGMENTO, diasDeVigencia, normalizarSegmento, terminosDeCotizacion } from './terminos-segmento.js';
import { ESTADO, estadoDesdeDb } from './estado-cotizacion.js';

export type CotizacionParaPropuesta = {
  quoteNumber: string;
  status?: unknown;
  revision?: number | null;
  sentAt?: Date | string | null;
  segmento?: unknown;
  issueDate?: Date | string | null;
  validUntil?: Date | string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  projectName?: string | null;
  scope?: string | null;
  objetivo?: string | null;
  alcanceBloques?: unknown;
  note?: string | null;
  depositPercent?: number | null;
  currency?: string | null;
  subtotal?: unknown;
  taxTotal?: unknown;
  total?: unknown;
  items?: Array<PartidaAgrupable & { discount?: unknown }> | null;
};

export type ExtrasPropuesta = {
  planos?: Array<{ url?: unknown; nombre?: unknown; tipo?: unknown }>;
  participantes?: Array<{ nombre: string; rolEtiqueta: string; siglas: string }>;
  empresa?: PropuestaPayload['empresa'];
};

function fecha(valor: unknown): string | null {
  if (!valor) return null;
  const d = new Date(valor as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const numero = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function payloadDePropuesta(quote: CotizacionParaPropuesta, extras: ExtrasPropuesta = {}): PropuestaPayload {
  const partidas = (quote.items ?? []).map((item) => ({
    ...item,
    qty: numero(item.qty),
    unitPrice: numero(item.unitPrice),
    laborHours: numero(item.laborHours),
    laborRate: numero(item.laborRate),
    discount: numero(item.discount),
  }));
  const segmento = normalizarSegmento(quote.segmento);
  const vigenciaDias = diasDeVigencia(quote.issueDate ?? null, quote.validUntil ?? null);

  // Portada «VERSIÓN n.0»: un borrador que ya salió antes es la siguiente revisión en preparación
  // (la vista previa dice 2.0 mientras se edita la R2); al enviar, `send` pasa la revisión nueva.
  const enPreparacion = Boolean(quote.sentAt) && estadoDesdeDb(quote.status) === ESTADO.BORRADOR;
  const revision = Math.max(1, Math.trunc(numero(quote.revision) || 1) + (enPreparacion ? 1 : 0));

  // 02: el párrafo de entrada va como bloque sin título; el generador lo imprime debajo del título
  // del proyecto y sin número. Luego las subsecciones, sin bloques vacíos y con viñetas limpias.
  const intro = quote.scope?.trim();
  const alcance = [
    ...(intro ? [{ titulo: '', texto: intro, vinetas: [] as string[] }] : []),
    ...normalizarBloques(quote.alcanceBloques).map((b) => ({
      titulo: b.titulo,
      texto: b.texto,
      vinetas: b.vinetas,
      parametros: b.parametros ?? null,
    })),
  ];

  // 04: el PDF del cliente no imprime grupos, así que las partidas van en el orden en que quien
  // cotiza las acomodó (como en la propuesta modelo), no agrupadas por tipo.
  // El TOTAL de cada renglón es antes de IVA, como en el modelo: así la columna suma el SUBTOTAL.
  // (`CotizacionItem.lineTotal` guarda el importe con IVA, por eso no se usa aquí.)
  const filas = partidas.map((p) => {
    const base = p.qty * p.unitPrice + p.laborHours * p.laborRate;
    return {
      name: String(p.name ?? ''),
      description: p.description ?? null,
      unit: p.unit ?? null,
      qty: p.qty,
      unitPrice: p.unitPrice,
      lineTotal: Math.round(base * (1 - Math.min(100, Math.max(0, p.discount)) / 100) * 100) / 100,
    };
  });

  return {
    folio: quote.quoteNumber,
    revision,
    issueDate: fecha(quote.issueDate) ?? new Date().toISOString().slice(0, 10),
    validUntil: fecha(quote.validUntil),
    segmentoEtiqueta: ETIQUETA_SEGMENTO[segmento],
    cliente: {
      nombre: quote.clientName ?? null,
      empresa: quote.clientCompany ?? null,
      telefono: quote.clientPhone ?? null,
      correo: quote.clientEmail ?? null,
      direccion: quote.clientAddress ?? null,
    },
    proyecto: quote.projectName ?? null,
    objetivo: objetivoDePropuesta({
      segmento,
      partidas,
      proyecto: quote.projectName,
      objetivoLibre: quote.objetivo,
      vigenciaDias,
    }),
    alcance,
    planos: (extras.planos ?? []).map((p) => ({
      url: String(p?.url ?? ''),
      nombre: p?.nombre != null ? String(p.nombre) : null,
      tipo: p?.tipo != null ? String(p.tipo) : null,
    })),
    grupos: filas.length
      ? [{ grupo: 'PARTIDAS', etiqueta: 'Partidas', subtotal: filas.reduce((a, p) => a + p.lineTotal, 0), partidas: filas }]
      : [],
    subtotal: numero(quote.subtotal),
    iva: numero(quote.taxTotal),
    total: numero(quote.total),
    currency: quote.currency || 'MXN',
    terminos: terminosDeCotizacion({
      segmento,
      incluyeInstalacion: incluyeInstalacion(partidas),
      anticipoPct: quote.depositPercent,
      vigenciaDias,
      personalizados: quote.note,
    }),
    participantes: extras.participantes ?? [],
    empresa: extras.empresa ?? null,
  };
}
