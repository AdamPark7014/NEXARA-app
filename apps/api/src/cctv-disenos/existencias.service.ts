import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service.js';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service.js';
import { precioConMargen } from '../cotizaciones/cotizacion-totals.js';
import { NOMBRE_PLANO_TECNICO, NOMBRE_VISTA_3D, NOMBRE_VISTA_COBERTURA } from '../cotizaciones/cotizacion-formato-nexara.js';
import { esFinal, estaBloqueada } from '../cotizaciones/estado-cotizacion.js';
import { grupoDePartida, type PartidaAgrupable } from '../cotizaciones/partidas-grupos.js';
import { normalizarOpciones } from '../cotizaciones/personalizacion.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ScoredOffer } from '../smart-quote/scoring/quote-scoring.js';
import { ProductSearchService } from '../smart-quote/search/product-search.service.js';
import {
  partidaDeInstalacion,
  SIN_PRECIO,
  elegirCandidato,
  fichaDeProducto,
  interpretarBusqueda,
  normalizarModelo,
  paqueteDelDiseno,
  partidaDeLinea,
  primeroConMegapixeles,
  textoDeProducto,
  tipoDesdeCt,
  validarLineas,
  variantesDeModelo,
  type EnAlmacen,
  type ModeloPedido,
  type ProductoCt,
} from './existencias.js';
import { LecturaFichaService } from './lectura-ficha.service.js';
import { MAX_FRASE_DISENO } from './sitio-ia.js';

/** Lo que se enseña de CT. El costo no: quien diseña ve el precio de venta sugerido. */
export type ResumenCt = {
  clave: string;
  nombre: string | null;
  marca: string | null;
  modelo: string | null;
  piezas: number;
  /** En el almacén de CT que nos surte. */
  cerca: number;
  /** De venta, sin IVA, en pesos. */
  precio: number;
  dias: number;
  /** `modelo`: coincidió solo. `manual`: alguien lo eligió. */
  ligado: 'modelo' | 'manual';
};

export type Disponibilidad = {
  clave: string;
  almacen: { productId: number; sku: string; piezas: number } | null;
  ct: ResumenCt | null;
};

type FilaCt = { id: number; clave: string; modelo: string | null; numParte: string | null; marca: string | null; hay: boolean };

/** Quien pide una cotización: `CotizacionesService` necesita saber quién es. */
export type ActorCotizacion = { id: number; email?: string | null; roleKey?: string | null; nombre?: string | null };

const NOMBRE_PLANO = 'Plano de videovigilancia';
/** Lo que el diseñador adjunta por su cuenta: se reemplaza al actualizar; lo que alguien subió a mano se queda. */
const ANEXOS_DEL_DISENO = [NOMBRE_PLANO, NOMBRE_PLANO_TECNICO, NOMBRE_VISTA_3D, NOMBRE_VISTA_COBERTURA];
/** El margen con el que llega una partida de CT a la cotización. */
const MARGEN_CT = 30;

@Injectable()
export class ExistenciasCctvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly busqueda: ProductSearchService,
    private readonly lectura: LecturaFichaService,
    private readonly catalogo: CatalogService,
    private readonly cotizaciones: CotizacionesService,
  ) {}

  /* ── Almacén ─────────────────────────────────────────────────────────────── */

  /** Por `productId` si está ligado; si no, por SKU igual al modelo. */
  private async deAlmacen(empresa: number, pedidos: readonly ModeloPedido[]): Promise<Map<string, EnAlmacen>> {
    const ids = pedidos.flatMap((p) => (p.productId ? [p.productId] : []));
    const nombres = [...new Set(pedidos.flatMap((p) => variantesDeModelo(p.modelo)))];
    if (!ids.length && !nombres.length) return new Map();
    const productos = await this.prisma.$queryRaw<Array<{ id: number; sku: string; price: number | null }>>`
      SELECT id, sku, price FROM "Product"
      WHERE "companyId" = ${empresa} AND activo IS NOT FALSE AND (
        id = ANY(${ids}::int[])
        OR regexp_replace(upper(sku), '[^A-Z0-9]', '', 'g') = ANY(${nombres}::text[])
      )`;
    if (!productos.length) return new Map();
    const niveles = await this.prisma.stockLevel.findMany({
      where: { companyId: empresa, productId: { in: productos.map((p) => p.id) } },
      select: { productId: true, quantity: true, reservedQty: true, unitCost: true },
    });
    const salida = new Map<string, EnAlmacen>();
    for (const p of pedidos) {
      const variantes = variantesDeModelo(p.modelo);
      const prod = productos.find((x) => x.id === p.productId) ?? productos.find((x) => variantes.includes(normalizarModelo(x.sku)));
      if (!prod) continue;
      const suyos = niveles.filter((n) => n.productId === prod.id);
      const piezas = suyos.reduce((s, n) => s + Number(n.quantity) - Number(n.reservedQty), 0);
      const conCosto = suyos.filter((n) => Number(n.unitCost) > 0);
      salida.set(p.clave, {
        productId: prod.id,
        sku: prod.sku,
        piezas: Math.max(Math.round(piezas), 0),
        precio: prod.price != null && Number(prod.price) > 0 ? Number(prod.price) : null,
        costo: conCosto.length ? conCosto.reduce((s, n) => s + Number(n.unitCost), 0) / conCosto.length : null,
      });
    }
    return salida;
  }

  /* ── CT ──────────────────────────────────────────────────────────────────── */

  /** La oferta de CT de cada modelo: la que se eligió a mano o la que coincide exacto. */
  private async deCt(pedidos: readonly ModeloPedido[]): Promise<Map<string, { oferta: ScoredOffer; ligado: ResumenCt['ligado'] }>> {
    const claves = [...new Set(pedidos.flatMap((p) => (p.ct ? [p.ct] : [])))];
    const nombres = [...new Set(pedidos.flatMap((p) => (p.ct ? [] : variantesDeModelo(p.modelo))))];
    if (!claves.length && !nombres.length) return new Map();
    const filas = await this.prisma.$queryRaw<FilaCt[]>`
      SELECT id, clave, modelo, "numParte", marca, (existencia IS NOT NULL AND existencia::text <> '{}') AS hay
      FROM productos_ct
      WHERE activo AND (
        upper(clave) = ANY(${claves}::text[])
        OR regexp_replace(upper(coalesce(modelo, '')), '[^A-Z0-9]', '', 'g') = ANY(${nombres}::text[])
        OR regexp_replace(upper(coalesce("numParte", '')), '[^A-Z0-9]', '', 'g') = ANY(${nombres}::text[])
      )`;
    const elegidas = new Map<string, { clave: string; ligado: ResumenCt['ligado'] }>();
    for (const p of pedidos) {
      if (p.ct) {
        const f = filas.find((x) => x.clave.toUpperCase() === p.ct);
        if (f) elegidas.set(p.clave, { clave: f.clave, ligado: 'manual' });
        continue;
      }
      const variantes = variantesDeModelo(p.modelo);
      const candidatos = filas.filter((f) => variantes.includes(normalizarModelo(f.modelo)) || variantes.includes(normalizarModelo(f.numParte)));
      const f = elegirCandidato(candidatos, p.marca);
      if (f) elegidas.set(p.clave, { clave: f.clave, ligado: 'modelo' });
    }
    const unicas = [...new Set([...elegidas.values()].map((e) => e.clave))];
    const ofertas = new Map<string, ScoredOffer>();
    await Promise.all(
      unicas.map(async (clave) => {
        const r = await this.busqueda.getProduct(clave);
        if (r?.data) ofertas.set(clave, r.data);
      }),
    );
    const salida = new Map<string, { oferta: ScoredOffer; ligado: ResumenCt['ligado'] }>();
    for (const [pedido, e] of elegidas) {
      const oferta = ofertas.get(e.clave);
      if (oferta) salida.set(pedido, { oferta, ligado: e.ligado });
    }
    return salida;
  }

  private resumen(o: ScoredOffer, ligado: ResumenCt['ligado']): ResumenCt {
    return {
      clave: String(o.clave ?? ''),
      nombre: o.nombre,
      marca: o.marca,
      modelo: o.modelo || o.numParte,
      piezas: o.stockTotal,
      cerca: o.stockPreferred,
      // Lo que va a decir la cotización: costo × (1 + margen). La venta «sugerida» del buscador sale de otra cuenta y daba 10 % más.
      precio: precioConMargen(o.costMxn, MARGEN_CT) ?? o.sellPriceSuggested,
      dias: o.leadTimeDays,
      ligado,
    };
  }

  async disponibilidad(empresa: number, pedidos: readonly ModeloPedido[]): Promise<Disponibilidad[]> {
    if (!pedidos.length) return [];
    const [almacen, ct] = await Promise.all([this.deAlmacen(empresa, pedidos), this.deCt(pedidos)]);
    return pedidos.map((p) => {
      const a = almacen.get(p.clave);
      const c = ct.get(p.clave);
      return {
        clave: p.clave,
        almacen: a ? { productId: a.productId, sku: a.sku, piezas: a.piezas } : null,
        ct: c ? this.resumen(c.oferta, c.ligado) : null,
      };
    });
  }

  /** Buscar en el catálogo de CT, con o sin palabras. Primero lo que tiene piezas. */
  async buscarCt(q: string | undefined, subcategoria: string | undefined) {
    const texto = (q ?? '').trim().slice(0, 80);
    const elegida = (subcategoria ?? '').trim().slice(0, 60);
    if (!texto && !elegida) return { resultados: [] };
    const pedido = interpretarBusqueda(texto, elegida);
    const buscar = (palabras: readonly string[]) =>
      this.busqueda.search({ q: palabras.join(' '), subcategory: pedido.subcategoria || undefined, inStockOnly: false, optimize: 'BALANCE', targetMarginPercent: MARGEN_CT, take: 24 });
    // Si con todas las palabras no hay nada, se quitan de atrás para adelante: es mejor algo parecido que nada.
    let palabras = pedido.palabras;
    let r = await buscar(palabras);
    // Sin familia, quedarse sin palabras sería enseñar todo el catálogo.
    while (!r.data.length && palabras.length > (pedido.subcategoria ? 0 : 1)) {
      palabras = palabras.slice(0, -1);
      r = await buscar(palabras);
    }
    return {
      resultados: primeroConMegapixeles(r.data, pedido.megapixeles).map((o) => ({
        ...this.resumen(o, 'manual'),
        descripcion: o.descripcion,
        imagen: o.imagen,
        ...(tipoDesdeCt(o) ?? { familia: null, tipo: null }),
      })),
    };
  }

  /**
   * Un producto de CT como ficha del catálogo. La IA lee lo que dice CT para llenar lo técnico, y marca,
   * modelo y tipo salen de CT. Si la IA no está, queda con eso para capturar el resto. No guarda nada.
   */
  async fichaDesdeCt(empresa: number, clave: unknown) {
    const c = typeof clave === 'string' ? clave.trim() : '';
    if (!c) throw new BadRequestException('Falta la clave de CT');
    const r = await this.busqueda.getProduct(c);
    if (!r?.data) throw new NotFoundException('Ese producto ya no está en CT');
    const o = r.data as unknown as ProductoCt;
    const leida = await this.lectura.equipoDesdeFrase(empresa, textoDeProducto(o, MAX_FRASE_DISENO)).catch(() => null);
    return { ...fichaDeProducto(o, leida), archivo: '', hojas: 0, escaneado: false, ms: leida?.ms ?? 0, sinLectura: !leida };
  }

  /** Da de alta el modelo en el inventario de siempre; si ya estaba, solo lo liga. Las existencias se capturan en Almacén. */
  async altaEnAlmacen(empresa: number, cuerpo: { marca?: unknown; modelo?: unknown; descripcion?: unknown; categoria?: unknown; equipoId?: unknown }) {
    const modelo = typeof cuerpo?.modelo === 'string' ? cuerpo.modelo.trim() : '';
    if (!modelo) throw new BadRequestException('Falta el modelo');
    if (modelo.length > 120) throw new BadRequestException('El modelo es demasiado largo');
    const marca = typeof cuerpo.marca === 'string' ? cuerpo.marca.trim().slice(0, 80) : '';
    const sku = modelo.toUpperCase();
    const ya = await this.prisma.product.findFirst({ where: { companyId: empresa, sku }, select: { id: true, sku: true } });
    const producto =
      ya ??
      (await this.catalogo.createProduct({
        sku,
        name: `${marca} ${modelo}`.trim(),
        description: typeof cuerpo.descripcion === 'string' ? cuerpo.descripcion.slice(0, 300) : undefined,
        category: typeof cuerpo.categoria === 'string' ? cuerpo.categoria.slice(0, 80) : undefined,
        tipoArticulo: 'EQUIPO',
        companyId: empresa,
      }));
    const equipoId = Number(cuerpo.equipoId);
    if (Number.isInteger(equipoId) && equipoId > 0) {
      await this.prisma.cctvEquipo.updateMany({ where: { id: equipoId, companyId: empresa }, data: { productId: producto.id } });
    }
    return { productId: producto.id, sku: producto.sku, yaExistia: Boolean(ya) };
  }

  /* ── Pasar a cotización ──────────────────────────────────────────────────── */

  private async cargarDiseno(empresa: number, id: number) {
    const d = await this.prisma.cctvDiseno.findFirst({
      where: { id, companyId: empresa, archivadoAt: null },
      select: { id: true, nombre: true, clienteId: true, cotizacionId: true },
    });
    if (!d) throw new NotFoundException('Diseño no encontrado');
    return d;
  }

  /**
   * Crea o actualiza una cotización con los equipos del diseño. Solo reemplaza sus propias partidas: lo que
   * alguien agregó a mano en la cotización (mano de obra, viáticos) se queda. Si esa cotización ya salió al
   * cliente no se reabre desde aquí: hay que pedir otra.
   *
   * `folioManual` es para los ejemplos, que no deben gastar el consecutivo de nadie: no llega desde la pantalla.
   */
  async pasarACotizacion(actor: ActorCotizacion, id: number, cuerpo: { lineas?: unknown; nueva?: unknown; memoria?: unknown }, empresa: number, opciones: { folioManual?: string } = {}) {
    const diseno = await this.cargarDiseno(empresa, id);
    const lineas = validarLineas(cuerpo?.lineas);
    const [almacen, ct] = await Promise.all([this.deAlmacen(empresa, lineas), this.deCt(lineas)]);
    const paqueteClave = paqueteDelDiseno(id);
    const partidas = lineas.map((l) => {
      const c = ct.get(l.clave);
      return partidaDeLinea(l, {
        paqueteClave,
        almacen: almacen.get(l.clave) ?? null,
        mayorista: c ? { ...(this.busqueda.lineFromOffer(c.oferta, l.cantidad, 'BALANCE') as unknown as Record<string, unknown>), marginPercent: MARGEN_CT } : null,
      });
    });
    const sinPrecio = partidas.filter((p) => p.notes === SIN_PRECIO).length;
    const memoria = normalizarOpciones({ memoria: cuerpo?.memoria }).memoria;

    const actual = cuerpo?.nueva === true || !diseno.cotizacionId ? null : await this.prisma.cotizacion.findFirst({ where: { id: diseno.cotizacionId, companyId: empresa }, select: { id: true, status: true, quoteNumber: true } });
    if (actual) {
      if (estaBloqueada(actual.status) || esFinal(actual.status)) {
        throw new ConflictException(`La cotización ${actual.quoteNumber} ya salió al cliente. Ábrela para hacer una versión nueva, o crea otra desde aquí.`);
      }
      const completa = await this.cotizaciones.findOne(actual.id, empresa);
      const conservadas = (completa?.items ?? []).filter((i: { paqueteClave?: string | null }) => i.paqueteClave !== paqueteClave);
      // La instalación no es del paquete: su precio lo captura quien cotiza y actualizar no debe borrarlo.
      const yaTieneManoDeObra = conservadas.some((i) => grupoDePartida(i as unknown as PartidaAgrupable) === 'MANO_DE_OBRA');
      await this.cotizaciones.update(
        actual.id,
        { items: [...conservadas, ...partidas, ...(yaTieneManoDeObra ? [] : [partidaDeInstalacion()])], ...(memoria ? { opciones: { ...normalizarOpciones(completa?.opciones), memoria } } : {}) } as never,
        actor.id,
        empresa,
        actor,
      );
      await this.quitarAnexosDelDiseno(actual.id, completa?.planos, empresa);
      return { cotizacionId: actual.id, quoteNumber: actual.quoteNumber, creada: false, partidas: partidas.length, conservadas: conservadas.length, sinPrecio: sinPrecio + (yaTieneManoDeObra ? 0 : 1) };
    }

    const creada = await this.cotizaciones.create(
      {
        items: [...partidas, partidaDeInstalacion()],
        quoteNumber: opciones.folioManual,
        // Un sistema de cámaras se cotiza como obra, con 50 % de anticipo (Esquema de cotizaciones, plantilla CCTV).
        segmento: 'OBRA',
        depositPercent: 50,
        ...(memoria ? { opciones: { memoria } } : {}),
        trabajo: diseno.nombre.slice(0, 200),
        projectName: diseno.nombre.slice(0, 200),
        ...(diseno.clienteId ? { salesClientId: diseno.clienteId } : { clientName: 'Cliente por definir', clienteSinAlta: true }),
      } as never,
      actor.id,
      empresa,
      actor,
    );
    await this.prisma.cctvDiseno.update({ where: { id }, data: { cotizacionId: creada.id } });
    return { cotizacionId: creada.id, quoteNumber: creada.quoteNumber, creada: true, partidas: partidas.length, conservadas: 0, sinPrecio: sinPrecio + 1 };
  }

  private async quitarAnexosDelDiseno(cotizacionId: number, planos: unknown, empresa: number) {
    const lista = Array.isArray(planos) ? (planos as Array<{ url?: string; nombre?: string }>) : [];
    for (const p of lista) {
      if (p?.url && ANEXOS_DEL_DISENO.some((n) => String(p.nombre ?? '').startsWith(n))) await this.cotizaciones.quitarPlano(cotizacionId, p.url, empresa);
    }
  }

  /** Adjunta el plano a la cotización del diseño. Si ya llevaba uno de este diseño, lo reemplaza. */
  async adjuntarPlano(id: number, archivo: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined, nombre: unknown, empresa: number) {
    const diseno = await this.cargarDiseno(empresa, id);
    if (!diseno.cotizacionId) throw new BadRequestException('Este diseño aún no tiene cotización.');
    const texto = typeof nombre === 'string' && nombre.trim() ? nombre.trim().slice(0, 120) : NOMBRE_PLANO;
    const quote = await this.cotizaciones.findOne(diseno.cotizacionId, empresa);
    const previos = Array.isArray(quote?.planos) ? (quote.planos as Array<{ url?: string; nombre?: string }>) : [];
    for (const p of previos) {
      if (p?.nombre === texto && p.url) await this.cotizaciones.quitarPlano(diseno.cotizacionId, p.url, empresa);
    }
    await this.cotizaciones.agregarPlano(diseno.cotizacionId, archivo, texto, empresa);
    return { ok: true as const };
  }
}
