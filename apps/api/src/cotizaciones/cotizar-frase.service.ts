import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { ClaudeService, type UsoClaude } from '../ai/claude/claude.service.js';
import { CONFIG_COTIZAR, limpiarSalidaCotizar, peticionCotizar, type SalidaCotizar } from '../ai/cotizar/cotizar-ia.js';
import { ProductSearchService } from '../smart-quote/search/product-search.service.js';
import { padronParaComparar } from '../ventas/clientes-parecidos.service.js';
import { CATALOGO_PARTIDAS_V2 } from './catalogo-partidas-base.js';
import { CLIENTE_GENERICO, MARGEN_POR_OMISION, armarPropuesta, type PropuestaCotizacion } from './cotizar-frase.js';
import { candidatosDeUsadas, consultasDeCatalogo, type CandidatoPartida } from './emparejar-partidas.js';
import { PAQUETES } from './paquetes.js';
import { normalizarTexto } from './partidas-frecuentes.js';

/** Renglones recientes que se comparan con lo pedido; lo más viejo ya no da un precio útil. */
const PARTIDAS_RECIENTES = 1_500;
/** Cotizaciones de las que se toman los nombres de cliente ya usados. */
const COTIZACIONES_RECIENTES = 400;
const MAX_TEXTO = 6_000;

const sinPrecio = (parcial: Pick<CandidatoPartida, 'fuente' | 'name'> & Partial<CandidatoPartida>): CandidatoPartida => ({
  description: null,
  brand: null,
  model: null,
  unit: null,
  unitCost: null,
  unitPrice: 0,
  grupo: null,
  imagenUrl: null,
  veces: 0,
  ultimaVez: null,
  stock: null,
  productCtId: null,
  cotizaciones: [],
  ...parcial,
});

/** Lo que ya vive en código: los paquetes con su precio de partida y el formato de conceptos, sin precio. */
const CANDIDATOS_FIJOS: CandidatoPartida[] = [
  ...PAQUETES.flatMap((paquete) =>
    paquete.partidas.map((p) =>
      sinPrecio({ fuente: 'paquete', name: p.name, description: p.description ?? null, unit: p.unit, unitPrice: p.unitPrice, grupo: p.grupo }),
    ),
  ),
  ...CATALOGO_PARTIDAS_V2.map((p) =>
    sinPrecio({ fuente: 'formato', name: p.equipo, brand: p.marca, model: p.modelo, unit: p.unidad, grupo: p.grupo, description: p.descripcion ?? null }),
  ),
];

export type RespuestaCotizar = Omit<PropuestaCotizacion, 'parecida'> & {
  parecida: { id: number; folio: string; cliente: string; proyecto: string | null; enComun: number; deLineas: number } | null;
  margenPorOmision: number;
  uso: UsoClaude | null;
};

/**
 * «Cotizar con IA»: de una frase o una lista pegada a una propuesta de cotización que la persona
 * revisa. No crea ni guarda nada. Primero el código (`cotizar-frase.ts`); a Claude solo le llega la
 * frase, y solo si el código no alcanzó. Si la IA falla, queda lo que leyó el código.
 */
@Injectable()
export class CotizarFraseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly productos: ProductSearchService,
  ) {}

  async interpretar(texto: string, companyId: number | null, opciones: { excluir?: number | null } = {}): Promise<RespuestaCotizar> {
    const tenantId = requireCompanyId(companyId);
    const pedido = String(texto ?? '').trim().slice(0, MAX_TEXTO);
    if (!pedido) throw new BadRequestException('Escribe qué hay que cotizar.');

    const [padron, recientes, filas] = await Promise.all([
      padronParaComparar(this.prisma, tenantId),
      this.prisma.cotizacion.findMany({
        where: { companyId: tenantId, deletedAt: null },
        orderBy: { id: 'desc' },
        take: COTIZACIONES_RECIENTES,
        select: { clientName: true, salesClientId: true },
      }),
      this.prisma.cotizacionItem.findMany({
        where: { cotizacion: { companyId: tenantId, deletedAt: null, ...(opciones.excluir ? { id: { not: opciones.excluir } } : {}) } },
        orderBy: { id: 'desc' },
        take: PARTIDAS_RECIENTES,
        select: {
          id: true,
          cotizacionId: true,
          name: true,
          description: true,
          brand: true,
          model: true,
          unit: true,
          unitCost: true,
          unitPrice: true,
          imagenUrl: true,
          grupo: true,
          createdAt: true,
        },
      }),
    ]);

    const generico = padron.find((c) => normalizarTexto(c.name) === normalizarTexto(CLIENTE_GENERICO));
    const propuesta = await armarPropuesta<UsoClaude>(pedido, {
      padron,
      usados: recientes
        .filter((c) => c.clientName)
        .map((c) => ({ nombre: c.clientName!, salesClientId: c.salesClientId ?? null })),
      generico: generico ? { id: generico.id } : null,
      candidatos: [...candidatosDeUsadas(filas), ...CANDIDATOS_FIJOS],
      buscarCatalogo: (concepto) => this.delMayorista(concepto),
      preguntarIa: async (frase) => {
        if (!this.claude.disponible()) throw new Error('IA no disponible');
        const { datos, uso } = await this.claude.json<SalidaCotizar>({
          ...peticionCotizar(frase),
          proceso: 'cotizar-frase',
          companyId: tenantId,
          modelo: process.env.ANTHROPIC_COTIZAR_MODEL || CONFIG_COTIZAR.modelo,
        });
        return { ...limpiarSalidaCotizar(datos), uso };
      },
    });

    return { ...propuesta, parecida: await this.parecida(propuesta.parecida, tenantId), margenPorOmision: MARGEN_POR_OMISION };
  }

  /** Del mayorista: la búsqueda completa y, si no da nada, con menos palabras. Sin catálogo, sigue sin él. */
  private async delMayorista(concepto: string): Promise<CandidatoPartida[]> {
    for (const q of consultasDeCatalogo(concepto)) {
      const { data } = await this.productos.search({ q, take: 12, inStockOnly: false, targetMarginPercent: MARGEN_POR_OMISION });
      if (data.length) {
        return data.map((o) =>
          sinPrecio({
            fuente: 'catalogo',
            name: o.nombre || o.clave || concepto,
            description: o.descripcion ?? null,
            brand: o.marca ?? null,
            model: o.modelo ?? null,
            unit: 'Pieza',
            unitCost: Number(o.costMxn) > 0 ? Number(o.costMxn) : null,
            grupo: 'EQUIPOS',
            imagenUrl: o.imagen ?? null,
            stock: o.stockTotal ?? 0,
            productCtId: o.id,
          }),
        );
      }
    }
    return [];
  }

  private async parecida(p: PropuestaCotizacion['parecida'], companyId: number): Promise<RespuestaCotizar['parecida']> {
    if (!p) return null;
    const cot = await this.prisma.cotizacion.findFirst({
      where: { id: p.id, companyId, deletedAt: null },
      select: { id: true, quoteNumber: true, clientName: true, projectName: true },
    });
    if (!cot) return null;
    return { id: cot.id, folio: cot.quoteNumber ?? `#${cot.id}`, cliente: cot.clientName ?? '', proyecto: cot.projectName ?? null, enComun: p.enComun, deLineas: p.deLineas };
  }
}
