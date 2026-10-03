import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { WarehouseService } from './warehouse.service.js';
import {
  campoParaCodigo,
  clasificarCodigo,
  motivoCodigoInvalido,
  variantesDeBusqueda,
} from './codigo-barras.js';
import { ConsultaUpc, proveedorDesdeEntorno, type ResultadoUpc } from './upc-lookup.js';

export type AltaPorCodigoDto = {
  codigo: string;
  name: string;
  sku?: string;
  marca?: string;
  modelo?: string;
  descripcion?: string;
  imagenUrl?: string;
  categoria?: string;
  unidad?: string;
};

export type MovimientoPorCodigoDto = {
  codigo: string;
  /** RECEIPT | DISPATCH | TRANSFER | ADJUSTMENT | RETURN (o IN / OUT). */
  type: string;
  /** En la unidad de lo escaneado: cajas si el código es de una caja, piezas si no. */
  quantity: number;
  fromWarehouseId?: number;
  toWarehouseId?: number;
  unitCost?: number;
  notes?: string;
  reference?: string;
  activityId?: number;
};

const SELECT_PRODUCTO = {
  id: true,
  sku: true,
  name: true,
  ean: true,
  upc: true,
  codigoBarras: true,
  unitName: true,
  imageUrl: true,
} as const;

/**
 * Almacén por código de barras: lo que hace falta además de buscar (`findByBarcode`,
 * que ya existía): ligar un código a un producto, dar de alta lo que el lector no
 * conoce, registrar un movimiento con solo el código (las apps) y consultar el
 * catálogo internacional.
 */
@Injectable()
export class CodigosBarrasService {
  private consulta: ConsultaUpc | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly warehouse: WarehouseService,
    private readonly catalog: CatalogService,
  ) {}

  /** Nunca lanza: si el servicio externo falla, devuelve `encontrado: false` con el motivo. */
  consultarUpc(codigo: string): Promise<ResultadoUpc> {
    // Se arma en la primera consulta para leer el entorno ya cargado, y una sola vez:
    // la caché vive en esta instancia.
    this.consulta ??= new ConsultaUpc({ proveedor: proveedorDesdeEntorno() });
    return this.consulta.buscar(codigo);
  }

  /**
   * Un código no puede apuntar a dos cosas: si ya es de otro producto o de una
   * presentación, el lector abriría una al azar.
   */
  private async asegurarCodigoLibre(tenantId: number, codigo: string, exceptoProductId?: number) {
    const variantes = variantesDeBusqueda(codigo);
    const otro = await this.prisma.product.findFirst({
      where: {
        ...companyWhere(tenantId),
        ...(exceptoProductId ? { id: { not: exceptoProductId } } : {}),
        OR: [
          { ean: { in: variantes } },
          { upc: { in: variantes } },
          { codigoBarras: { in: variantes } },
          { sku: { equals: codigo, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, sku: true },
    });
    if (otro) {
      throw new ConflictException(`El código ${codigo} ya es de «${otro.name}» (clave ${otro.sku})`);
    }

    const empaque = await this.prisma.productPackaging.findFirst({
      where: { codigoBarras: { in: variantes }, ...companyWhere(tenantId) },
      select: { nombre: true, product: { select: { name: true } } },
    });
    if (empaque) {
      throw new ConflictException(
        `El código ${codigo} ya es de la presentación «${empaque.nombre}» de «${empaque.product?.name ?? 'un producto'}»`,
      );
    }
  }

  /** Liga un código a un producto que ya existe. UPC-A va a `upc`, EAN a `ean`, lo demás a `codigoBarras`. */
  async asignarCodigo(
    productId: number,
    dto: { codigo?: string; reemplazar?: boolean },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const motivo = motivoCodigoInvalido(dto?.codigo);
    if (motivo) throw new BadRequestException(motivo);
    const { codigo, tipo } = clasificarCodigo(dto.codigo);

    const producto = await this.prisma.product.findFirst({
      where: { id: productId, ...companyWhere(tenantId) },
      select: SELECT_PRODUCTO,
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    await this.asegurarCodigoLibre(tenantId, codigo, productId);

    const campo = campoParaCodigo(tipo);
    const actual = (producto[campo] ?? '').trim();
    if (actual && !variantesDeBusqueda(actual).includes(codigo) && !dto.reemplazar) {
      // Cambiarlo en silencio dejaría sin leer las cajas que ya están en el anaquel.
      throw new ConflictException(
        `El producto ya tiene el código ${actual}. Si cambió de empaque, confirma que quieres reemplazarlo.`,
      );
    }

    return this.prisma.product.update({
      where: { id: productId },
      data:
        campo === 'upc'
          ? { upc: codigo }
          : campo === 'ean'
            ? { ean: codigo }
            : { codigoBarras: codigo },
      select: SELECT_PRODUCTO,
    });
  }

  /** «Dar de alta este producto»: lo que el lector no conocía, con el código ya puesto. */
  async altaPorCodigo(dto: AltaPorCodigoDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const motivo = motivoCodigoInvalido(dto?.codigo);
    if (motivo) throw new BadRequestException(motivo);
    const nombre = String(dto?.name ?? '').trim();
    if (!nombre) throw new BadRequestException('Escribe el nombre del producto');

    const { codigo, tipo } = clasificarCodigo(dto.codigo);
    await this.asegurarCodigoLibre(tenantId, codigo);

    const marca = String(dto.marca ?? '').trim().slice(0, 200);
    const modelo = String(dto.modelo ?? '').trim().slice(0, 120);
    // La marca solo se liga si ya está en el catálogo: crear marcas es del catálogo, y
    // un alta de mostrador no debe sembrar «HIKVISION», «Hikvision» y «hik vision».
    const brand = marca
      ? await this.prisma.brand.findFirst({
          where: { ...companyWhere(tenantId), name: { equals: marca, mode: 'insensitive' } },
          select: { id: true },
        })
      : null;

    const especificaciones: Record<string, string> = {};
    if (marca) especificaciones.marca = marca;
    if (modelo) especificaciones.modelo = modelo;

    const campo = campoParaCodigo(tipo);
    const creado = await this.catalog.createProduct({
      companyId: tenantId,
      sku: dto.sku,
      name: nombre.slice(0, 255),
      description: dto.descripcion ? String(dto.descripcion).slice(0, 2000) : undefined,
      // Solo https: una imagen http no carga dentro del panel.
      imageUrl: /^https:\/\//i.test(String(dto.imagenUrl ?? '')) ? String(dto.imagenUrl) : undefined,
      category: dto.categoria ? String(dto.categoria).slice(0, 120) : undefined,
      unit: dto.unidad ? String(dto.unidad).slice(0, 50) : undefined,
      brandId: brand?.id ?? null,
      especificaciones,
      upc: campo === 'upc' ? codigo : null,
      ean: campo === 'ean' ? codigo : null,
      codigoBarras: campo === 'codigoBarras' ? codigo : null,
    });

    return {
      id: creado.id,
      sku: creado.sku,
      name: creado.name,
      ean: creado.ean,
      upc: creado.upc,
      codigoBarras: creado.codigoBarras,
      unitName: creado.unitName,
      imageUrl: creado.imageUrl,
    };
  }

  /**
   * Movimiento con solo el código: lo que mandan las apps al escanear con la cámara.
   * Si el código es de una caja, `quantity` son cajas y el movimiento queda en piezas.
   */
  async movimientoPorCodigo(dto: MovimientoPorCodigoDto, userId: number, companyId?: number | null) {
    const hallazgo = await this.warehouse.findByBarcode(dto?.codigo, companyId);
    const cantidad = Number(dto?.quantity);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new BadRequestException('Indica una cantidad mayor a cero');
    }
    if (!dto?.type) throw new BadRequestException('Indica el tipo de movimiento');

    const esEmpaque = hallazgo.match === 'empaque';
    const movement = await this.warehouse.createStockMovement(
      {
        type: dto.type,
        productId: hallazgo.product.id,
        quantity: cantidad,
        fromWarehouseId: dto.fromWarehouseId ? Number(dto.fromWarehouseId) : undefined,
        toWarehouseId: dto.toWarehouseId ? Number(dto.toWarehouseId) : undefined,
        unitCost: dto.unitCost,
        activityId: dto.activityId ? Number(dto.activityId) : undefined,
        packagingId: esEmpaque ? hallazgo.packaging.id : undefined,
        cantidadCapturada: esEmpaque ? cantidad : undefined,
        unidadCaptura: esEmpaque ? hallazgo.packaging.nombre : undefined,
        reference: dto.reference?.trim() || hallazgo.codigoBarras,
        notes: dto.notes?.trim() || `Lector de códigos · ${hallazgo.codigoBarras}`,
      },
      userId,
      companyId,
    );

    return {
      match: hallazgo.match,
      codigoBarras: hallazgo.codigoBarras,
      product: hallazgo.product,
      packaging: esEmpaque ? hallazgo.packaging : null,
      movement,
    };
  }
}
