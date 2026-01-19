import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as ftp from 'basic-ftp';
import * as fs from 'fs/promises';
import * as path from 'path';

interface CTOnlineProduct {
  idProducto: number;
  clave: string;
  numParte: string;
  nombre: string;
  modelo: string;
  idMarca: number;
  marca: string;
  idSubCategoria: number;
  subcategoria: string;
  idCategoria: number;
  categoria: string;
  descripcion_corta: string;
  ean: string;
  upc: string;
  sustituto: string;
  activo: number;
  protegido: number;
  existencia: {
    [almacen: string]: number;
  };
  precio: number;
  moneda: string;
  tipoCambio: number;
  especificaciones: Array<{
    tipo: string;
    valor: string;
  }>;
  promociones: any[];
  imagen: string;
}

@Injectable()
export class CTOnlineService {
  private readonly logger = new Logger(CTOnlineService.name);
  private readonly ftpConfig = {
    host: '216.70.82.104',
    user: 'PUE0696',
    password: 't3d2WM43C38Lg0xwifzE',
  };

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('CTOnlineService initialized');
    this.logger.log(`PrismaService injected: ${!!this.prisma}`);
  }

  /**
   * Descarga el archivo JSON desde FTP
   */
  async downloadCatalog(): Promise<string> {
    const client = new ftp.Client();
    client.ftp.verbose = true;

    try {
      this.logger.log('Conectando al servidor FTP de CT Online...');
      await client.access(this.ftpConfig);

      const tempDir = path.join(process.cwd(), 'temp');
      await fs.mkdir(tempDir, { recursive: true });
      const localFile = path.join(tempDir, 'ctonline-catalog.json');

      this.logger.log('Descargando catálogo...');
      await client.downloadTo(localFile, '/catalogo_xml/productos.json');

      this.logger.log(`Catálogo descargado: ${localFile}`);
      return localFile;
    } catch (error) {
      this.logger.error(`Error descargando catálogo: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      client.close();
    }
  }
  /**
   * Normaliza nombre de marca para búsqueda y vinculación
   */
  private normalizeBrand(brandName: string): string {
    if (!brandName) return '';
    return brandName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .trim();
  }

  /**
   * Obtiene o crea una marca normalizada
   */
  private async getOrCreateBrand(
    prismaClient: any,
    brandName: string,
  ): Promise<{ id: number } | null> {
    if (!brandName) return null;

    const normalized = this.normalizeBrand(brandName);

    try {
      // Intenta encontrar la marca existente
      let brand = await prismaClient.brand.findUnique({
        where: { normalized },
      });

      // Si no existe, la crea
      if (!brand) {
        brand = await prismaClient.brand.create({
          data: {
            name: brandName,
            normalized,
          },
        });
      }

      return { id: brand.id };
    } catch (err) {
      this.logger.warn(
        `Error getting/creating brand ${brandName}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Procesa e importa productos desde el archivo JSON
   */
  async importProducts(filePath: string): Promise<number> {
    // CRITICAL FIX: Capture prisma reference to avoid 'this' context loss
    const prismaClient = this.prisma;
    
    if (!prismaClient) {
      this.logger.error('FATAL: PrismaService is undefined at method start!');
      return 0;
    }

    // ID del proveedor CT Internacional (crear si no existe)
    const ctSupplier = await prismaClient['supplier'].upsert({
      where: { name: 'CT Internacional' },
      update: {},
      create: {
        name: 'CT Internacional',
        apiUrl: 'https://www.ctonline.com',
        isActive: true,
      },
    });

    try {
      this.logger.log('Iniciando importación de productos...');
      
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const products: CTOnlineProduct[] = JSON.parse(fileContent);

      if (products.length === 0) {
        this.logger.warn('El archivo JSON está vacío');
        return 0;
      }

      this.logger.log(`Total de productos a importar: ${products.length}`);

      let imported = 0;
      let errors = 0;

      for (const product of products) {
        try {
          if (!product.clave) {
            errors++;
            continue;
          }

          const totalStock = Object.values(product.existencia || {}).reduce(
            (sum: number, qty: any) => sum + (parseInt(qty) || 0),
            0,
          );

          // Obtener o crear marca
          const brandRef = await this.getOrCreateBrand(
            prismaClient,
            product.marca,
          );

          // Crear o actualizar producto
          const createdProduct = await prismaClient['product'].upsert({
            where: { sku: product.clave },
            update: {
              name: product.nombre,
              description: product.descripcion_corta ?? null,
              brandId: brandRef?.id ?? null,
              category: product.categoria ?? null,
              ean: product.ean ?? null,
              upc: product.upc ?? null,
              imageUrl: product.imagen ?? null,
            },
            create: {
              sku: product.clave,
              name: product.nombre,
              description: product.descripcion_corta ?? null,
              brandId: brandRef?.id ?? null,
              category: product.categoria ?? null,
              ean: product.ean ?? null,
              upc: product.upc ?? null,
              imageUrl: product.imagen ?? null,
            },
          });

          // Crear o actualizar entrada en supplier_products
          // Buscar el producto en ProductCT por clave
          const productCT = await prismaClient['productCT'].findFirst({ where: { clave: product.clave } });
          if (productCT) {
            await prismaClient['supplierProduct'].upsert({
              where: {
                supplierId_productId: {
                  supplierId: ctSupplier.id,
                  productId: productCT.id,
                },
              },
              update: {
                supplierSku: product.clave,
                price: product.precio,
                currency: product.moneda || "MXN",
                stock: totalStock,
                active: product.activo === 1 && totalStock > 0,
              },
              create: {
                supplierId: ctSupplier.id,
                productId: productCT.id,
                supplierSku: product.clave,
                price: product.precio,
                currency: product.moneda || "MXN",
                stock: totalStock,
                active: product.activo === 1 && totalStock > 0,
              },
            });
          } else {
            this.logger.debug(`No existe ProductCT con clave: ${product.clave}, se omite supplierProduct.`);
          }

          // Crear o actualizar entrada en ProductSource para reflejar stock/precio de CT en el modelo principal
          await prismaClient['productSource'].upsert({
            where: {
              productId_supplier: {
                productId: createdProduct.id,
                supplier: 'CT Internacional',
              },
            },
            update: {
              price: product.precio,
              currency: product.moneda || 'MXN',
              stock: JSON.parse(JSON.stringify({ total: totalStock, ...product.existencia })),
              rawData: JSON.parse(JSON.stringify(product)),
            },
            create: {
              productId: createdProduct.id,
              supplier: 'CT Internacional',
              price: product.precio,
              currency: product.moneda || 'MXN',
              stock: JSON.parse(JSON.stringify({ total: totalStock, ...product.existencia })),
              rawData: JSON.parse(JSON.stringify(product)),
            },
          });
          imported++;

          if (imported % 500 === 0) {
            this.logger.log(`Progreso: ${imported}/${products.length}`);
          }
        } catch (error) {
          errors++;
          this.logger.debug(
            `Error con producto ${product.clave}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(`Importación completada: ${imported} importados, ${errors} errores`);
      return imported;
    } catch (error) {
      this.logger.error(
        `Error en importProducts: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Ejecuta el proceso completo de sincronización
   */
  async syncCatalog(): Promise<{ success: boolean; productsImported: number }> {
    try {
      const localJsonPath = path.join(process.cwd(), 'data', 'feeds', 'productos.json');
      this.logger.log(`Sincronizando desde: ${localJsonPath}`);
      const productsImported = await this.importProducts(localJsonPath);
      return { success: true, productsImported };
    } catch (error) {
      this.logger.error(
        `Error en sincronización: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { success: false, productsImported: 0 };
    }
  }
}
