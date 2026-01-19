import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

interface IcecatCachedProduct {
  mpn: string;
  brand: string;
  icecatId?: string;
  description?: string;
  specifications?: Record<string, any>;
  imageUrl?: string;
  thumbnailUrl?: string;
  datasheet?: string;
  lastFetch: Date;
  ttl: number; // TTL en segundos
}

/**
 * Servicio de caché local para fichas técnicas de Icecat
 * Cuando Icecat Full esté disponible, se poblará automáticamente
 * Por ahora actúa como preparador de estructura
 */
@Injectable()
export class IcecatCacheService {
  private readonly logger = new Logger(IcecatCacheService.name);
  private cache: Map<string, IcecatCachedProduct> = new Map();
  private readonly DEFAULT_TTL = 86400 * 30; // 30 días en segundos

  constructor(private readonly prisma: PrismaService) {
    this.logger.log(
      'IcecatCacheService initialized - Waiting for Icecat Full credentials',
    );
  }

  /**
   * Clave de caché: "brand|mpn" para búsqueda unificada
   */
  private getCacheKey(brand: string, mpn: string): string {
    return `${brand.toLowerCase()}|${mpn}`;
  }

  /**
   * Obtener ficha del caché
   */
  getFromCache(brand: string, mpn: string): IcecatCachedProduct | null {
    const key = this.getCacheKey(brand, mpn);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    const cacheAge = (now - cached.lastFetch.getTime()) / 1000;

    if (cacheAge > cached.ttl) {
      this.cache.delete(key);
      this.logger.debug(`Cache expired for ${key}`);
      return null;
    }

    return cached;
  }

  /**
   * Guardar ficha en caché
   */
  saveToCache(
    brand: string,
    mpn: string,
    data: Partial<IcecatCachedProduct>,
    ttl = this.DEFAULT_TTL,
  ): void {
    const key = this.getCacheKey(brand, mpn);
    this.cache.set(key, {
      mpn,
      brand,
      ...data,
      lastFetch: new Date(),
      ttl,
    });
    this.logger.debug(`Cached ${key} (TTL: ${ttl}s)`);
  }

  /**
   * Guardar ficha en BD para persistencia (cuando Icecat esté activo)
   */
  async saveToDB(
    productId: number,
    icecatData: Partial<IcecatCachedProduct>,
  ): Promise<void> {
    try {
      await this.prisma['product'].update({
        where: { id: productId },
        data: {
          icecatId: icecatData.icecatId ?? null,
          description: icecatData.description ?? null,
          specifications: icecatData.specifications ?? {},
          imageUrl: icecatData.imageUrl ?? null,
          thumbnailUrl: icecatData.thumbnailUrl ?? null,
          icecatDatasheet: icecatData.datasheet ?? null,
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      let errorMsg = '';
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        errorMsg = (err as any).message;
      } else {
        errorMsg = String(err);
      }
      this.logger.error(`Error saving Icecat data to DB: ${errorMsg}`);
    }
  }

  /**
   * Cargar caché desde BD en startup (datos persistidos previamente)
   */
  async loadCacheFromDB(): Promise<void> {
    try {
      const products = await this.prisma['product'].findMany({
        where: {
          icecatId: { not: null },
        },
        include: {
          brand: true,
        },
      });

      for (const product of products) {
        const mpn = product.sku || "";
        if (mpn && product.brand?.name) {
          this.saveToCache(product.brand.name, mpn, {
            icecatId: product.icecatId || '',
            description: product.description || '',
            specifications:
              (product.specifications as Record<string, any>) || {},
            imageUrl: product.imageUrl || '',
            thumbnailUrl: product.thumbnailUrl || '',
            datasheet: product.icecatDatasheet || '',
          });
        }
      }

      this.logger.log(
        `Loaded ${products.length} cached Icecat records from DB`,
      );
    } catch (err) {
      let errorMsg = '';
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        errorMsg = (err as any).message;
      } else {
        errorMsg = String(err);
      }
      this.logger.error(`Error loading cache from DB: ${errorMsg}`);
    }
  }

  /**
   * Limpiar caché expirado
   */
  clearExpiredCache(): void {
    let cleared = 0;
    const now = Date.now();

    for (const [key, cached] of this.cache.entries()) {
      const age = (now - cached.lastFetch.getTime()) / 1000;
      if (age > cached.ttl) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      this.logger.debug(`Cleared ${cleared} expired cache entries`);
    }
  }

  /**
   * Obtener estadísticas de caché
   */
  getStats(): { total: number; brands: Set<string>; mfg: Set<string> } {
    const brands = new Set<string>();
    const mfg = new Set<string>();

    for (const cached of this.cache.values()) {
      brands.add(cached.brand);
      mfg.add(cached.mpn);
    }

    return {
      total: this.cache.size,
      brands,
      mfg,
    };
  }
}
