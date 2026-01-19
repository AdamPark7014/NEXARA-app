// Tipo para la vista de sources en el frontend
type ProductSourceView = {
  supplier: string;
  price: number | null;
  currency: string | null;
  stock: number | null;
};
// ...existing code...
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { CTOnlineService } from './ctonline.service.js';
import { IcecatService } from './icecat.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

interface ProductFilters {
  search?: string;
  brand?: string;
  category?: string;
  supplier?: string;
  active?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class ProductsService {
  /**
   * Sincronización automática cada 15 minutos desde CT Online
   */
  @Cron('*/15 * * * *')
  async handleCronSyncCTOnline() {
    this.logger.log('[CRON] Iniciando sincronización automática con CT Online...');
    try {
      const result = await this.syncFromCTOnline();
      this.logger.log(`[CRON] Sincronización automática completada. Productos importados: ${result.productsImported}`);
    } catch (error) {
      this.logger.error(`[CRON] Error en sincronización automática: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

      /**
       * Busca un producto por cualquier identificador único
       */
      async findByAnyId(id: string): Promise<any | null> {
        // Buscar por sku, id
        const whereOptions = [
          { sku: id },
          { id: isNaN(Number(id)) ? undefined : Number(id) },
        ];
        for (const where of whereOptions) {
          // Quitar undefined
          const cleanWhere = Object.fromEntries(Object.entries(where).filter(([_, v]) => v !== undefined));
          if (Object.keys(cleanWhere).length === 0) continue;
          const product = await this.prisma['product'].findFirst({
            where: cleanWhere,
            include: {
              brand: true,
              sources: true,
            },
          });
          if (product) return product;
        }
        return null;
      }
    // Devuelve solo los campos mínimos para sitemap
    async findMinimal(updatedSince?: string) {
      const where: any = {};
      if (updatedSince) {
        where.updatedAt = { gte: new Date(updatedSince) };
      }
      return this.prisma['product'].findMany({
        where,
        select: {
          id: true,
          sku: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
    }
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private prisma: PrismaService,
    private ctOnlineService: CTOnlineService,
    private icecatService: IcecatService,
  ) {}

  async create(createProductDto: CreateProductDto) {
    // Si viene un brand string, ignorarlo (se debe usar API de CT Online)
    const { brand, ...productData } = createProductDto;
    
    return this.prisma['product'].create({
      data: productData,
    });
  }

  async findAll(filters: ProductFilters = {}) {
    const {
      search,
      brand,
      category,
      page = 1,
      limit = 20,
    } = filters;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { mpn: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (brand) {
      where.brand = { normalized: { equals: brand, mode: 'insensitive' } };
    }

    if (category) {
      where.category = category;
    }

    // Filtros de supplier y active no aplican directamente, ProductSource.supplier es string

    const [products] = await Promise.all([
      this.prisma['product'].findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          brand: true,
          sources: true,
        },
      }),
      this.prisma['product'].count({ where }),
    ]);

    // Agregar el mejor precio, mayor stock y exponer sources con stock/precio de cada proveedor
    const productsWithSources = products.map((p: any) => {
      let price: number | undefined = undefined;
      let currency: string | undefined = undefined;
      let bestSupplier: string | undefined = undefined;
      let maxStock: number | undefined = undefined;
      let maxStockSupplier: string | undefined = undefined;
      let sources: ProductSourceView[] = [];

      if (Array.isArray(p.sources) && p.sources.length > 0) {
        // Mapear todos los proveedores
        sources = p.sources.map((s: any) => {
          let stockValue = 0;
          if (typeof s.stock === 'number') {
            stockValue = s.stock;
          } else if (typeof s.stock === 'object' && s.stock !== null) {
            if ('total' in s.stock && typeof s.stock.total === 'number') {
              stockValue = s.stock.total;
            } else {
              // Sumar todos los valores numéricos de los almacenes
              stockValue = Object.values(s.stock).reduce((sum: number, v) =>
                typeof v === 'number' ? sum + v : sum, 0) as number;
            }
          }
          return {
            supplier: s.supplier,
            price: typeof s.price === 'number' ? s.price : null,
            currency: typeof s.currency === 'string' ? s.currency : null,
            stock: stockValue,
          };
        });
        // Mejor precio
        const validSources = sources.filter((s: any) => typeof s.price === 'number' && s.price != null && s.price > 0);
        if (validSources.length > 0) {
          const best = validSources.reduce((min, s) => {
            if (!min || min.price == null) return s;
            if (s.price == null) return min;
            return s.price < min.price ? s : min;
          }, validSources[0]);
          price = best?.price ?? undefined;
          currency = best?.currency ?? undefined;
          bestSupplier = best?.supplier;
        }
        // Mayor stock
        const stockSources = sources.filter((s: any) => typeof s.stock === 'number' && s.stock != null);
        if (stockSources.length > 0) {
          const maxS = stockSources.reduce((max, s) => {
            if (!max || max.stock == null) return s;
            if (s.stock == null) return max;
            return s.stock > max.stock ? s : max;
          }, stockSources[0]);
          maxStock = maxS?.stock ?? undefined;
          maxStockSupplier = maxS?.supplier;
        }
      }
      return { ...p, price, currency, bestSupplier, maxStock, maxStockSupplier, sources };
    })
    // Mostrar todos los productos, aunque no tengan stock o precio
    // Si quieres filtrar solo activos, puedes usar: .filter(p => p.active)

    // Si no hay productos, intentar poblar la base de datos automáticamente
    if (productsWithSources.length === 0) {
      try {
        // Importar productos desde CTOnline
        await this.ctOnlineService.syncCatalog();
        // Volver a consultar productos
        const repopulated = await this.prisma['product'].findMany({
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { brand: true, sources: true },
        });
        return {
          products: repopulated,
          pagination: {
            page,
            limit,
            total: repopulated.length,
            totalPages: Math.ceil(repopulated.length / limit),
          },
        };
      } catch (e) {
        this.logger.error('Error al poblar productos automáticamente:', e);
      }
    }
    return {
      products: productsWithSources,
      pagination: {
        page,
        limit,
        total: productsWithSources.length,
        totalPages: Math.ceil(productsWithSources.length / limit),
      },
    };
  }

  async findOne(sku: string) {
    const product = await this.prisma['product'].findUnique({
      where: { sku },
      include: {
        brand: true,
        sources: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Producto con SKU ${sku} no encontrado`);
    }

    return product;
  }

  async update(sku: string, updateProductDto: UpdateProductDto) {
    await this.findOne(sku); // Verifica que existe

    // Ignorar brand string del DTO (debe usarse BD de CT Online)
    const { brand, ...productData } = updateProductDto;

    return this.prisma['product'].update({
      where: { sku },
      data: productData,
    });
  }

  async remove(sku: string) {
    await this.findOne(sku); // Verifica que existe

    return this.prisma['product'].delete({
      where: { sku },
    });
  }

  /**
   * Sincroniza catálogo desde CT Online
   */
  async syncFromCTOnline() {
    this.logger.log('Iniciando sincronización con CT Online...');
    const result = await this.ctOnlineService.syncCatalog();
    return result;
  }

  async enrichWithIcecat(sku: string) {
    const product = await this.findOne(sku);

    // Usa MPN + Brand para búsqueda en Icecat
    const brandNormalized = (product.brand && typeof product.brand === 'object') ? (product.brand.normalized ?? '') : '';
    // No hay product.mpn, solo sku, ean, upc, brandNormalized
    if (!brandNormalized) {
      this.logger.warn(`Producto ${sku} no tiene Brand. Icecat requiere Brand.`);
      return { success: false, message: 'Falta Brand para búsqueda en Icecat' };
    }

    this.logger.log(`Enriqueciendo ${sku} con Icecat (Brand: ${brandNormalized})...`);
    const enrichedData = await this.icecatService.enrichProduct(
      sku,
      product.ean,
      product.upc,
      brandNormalized,
    );

    if (!enrichedData) {
      return { success: false, message: 'No se encontró información en Icecat' };
    }

    // Actualiza solo los campos que no estaban completos
    const updateData: any = {};

    if (!product.description && enrichedData.description) {
      updateData.description = enrichedData.description;
    }

    if (!product.imageUrl && enrichedData.imageUrl) {
      updateData.imageUrl = enrichedData.imageUrl;
    }

    if (!product.thumbnailUrl && enrichedData.thumbnailUrl) {
      updateData.thumbnailUrl = enrichedData.thumbnailUrl;
    }

    if (enrichedData.specifications) {
      updateData.specifications = enrichedData.specifications;
    }

    if (enrichedData.icecatId) {
      updateData.icecatId = enrichedData.icecatId;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma['product'].update({
        where: { sku },
        data: updateData,
      });

      return { success: true, message: 'Producto enriquecido', updatedFields: Object.keys(updateData) };
    }

    return { success: false, message: 'No había campos por actualizar' };
  }

  /**
   * Enriquece productos en lote con datos de Icecat
   */
  async enrichBatch(options: {
    limit?: number;
    onlyWithoutDescription?: boolean;
    onlyWithEAN?: boolean;
    brand?: string;
    onlyActive?: boolean;
    onlyWithMPN?: boolean;
  } = {}) {
    const {
      limit = 100,
      onlyWithoutDescription = true,
      onlyWithEAN = false,
      brand,
      onlyActive = false,
    } = options;

    const where: any = {};

    // No hay campo mpn en Product

    if (onlyActive) {
      where.sources = {
        some: { active: true },
      };
    }

    if (onlyWithoutDescription) {
      where.description = null;
    }

    if (onlyWithEAN) {
      where.OR = [
        { ean: { not: null } },
        { upc: { not: null } },
      ];
    }

    if (brand) {
      where.brand = { normalized: { equals: brand, mode: 'insensitive' } };
    }

    const products = await this.prisma['product'].findMany({
      where,
      take: limit,
      select: {
        sku: true,
        name: true,
        brand: { select: { name: true, normalized: true } },
        ean: true,
        upc: true,
      },
    });

    this.logger.log(`Enriqueciendo ${products.length} productos con Icecat (Brand filter: ${brand || 'all'})...`);

    const results = {
      total: products.length,
      enriched: 0,
      notFound: 0,
      noUpdate: 0,
      errors: 0,
    };

    for (const product of products) {
      try {
        const result = await this.enrichWithIcecat(product.sku);
        
        if (result.success) {
          results.enriched++;
        } else if (result.message?.includes('No se encontró')) {
          results.notFound++;
        } else {
          results.noUpdate++;
        }

        // Pequeña pausa para no saturar la API de Icecat
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        results.errors++;
        let errorMsg = '';
        if (error instanceof Error) {
          errorMsg = error.message;
        } else if (typeof error === 'object' && error !== null && 'message' in error) {
          errorMsg = (error as any).message;
        } else {
          errorMsg = String(error);
        }
        this.logger.error(`Error enriqueciendo ${product.sku}: ${errorMsg}`);
      }
    }

    this.logger.log(`Enriquecimiento en lote completado: ${JSON.stringify(results)}`);
    return results;
  }

  /**
   * Obtiene lista de marcas disponibles
   */
  async getBrands() {
    const brands = await this.prisma['brand'].findMany({
      select: { name: true, normalized: true },
      orderBy: { name: 'asc' },
    });

    return brands;
  }

  /**
   * Busca productos por MPN + Brand (para Icecat)
   */
  async findByMPN() {
    // No existe búsqueda por mpn, solo por sku, ean, upc, brand
    return [];
  }

  /**
   * Obtiene lista de categorías disponibles
   */
  async getCategories() {
    const categories = await this.prisma['product'].findMany({
      where: { category: { not: null } },
      distinct: ['category'],
      select: { category: true },
    });

    return categories.map((c: any) => c.category).filter(Boolean).sort();
  }

  /**
   * Obtiene lista de proveedores con conteo de productos
   */
  async getSuppliers() {
    const suppliers = await this.prisma['supplier'].findMany({
      where: { isActive: true },
      // No hay relación directa para contar productos por proveedor en ProductSource
      orderBy: { name: 'asc' },
    });

    return suppliers.map((s: any) => ({
      id: s.id,
      name: s.name,
      // productCount: calcular aparte si es necesario
    }));
  }
}
