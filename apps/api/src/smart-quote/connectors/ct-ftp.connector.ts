import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'basic-ftp';
import type {
  NormalizedSupplierProduct,
  SupplierConnector,
  SupplierPullResult,
} from './supplier-connector.js';

type CtRawProduct = {
  idProducto?: number;
  clave?: string;
  numParte?: string;
  nombre?: string;
  modelo?: string;
  idMarca?: number;
  marca?: string;
  idSubCategoria?: number;
  subcategoria?: string;
  idCategoria?: number;
  categoria?: string;
  descripcion_corta?: string;
  ean?: string;
  upc?: string;
  sustituto?: string;
  activo?: number | boolean;
  protegido?: number | boolean;
  existencia?: Record<string, number>;
  precio?: number;
  moneda?: string;
  tipoCambio?: number;
  especificaciones?: Array<{ tipo?: string; valor?: string }>;
  promociones?: unknown[];
  imagen?: string;
};

@Injectable()
export class CtFtpConnector implements SupplierConnector {
  readonly code = process.env.CT_SUPPLIER_CODE || 'CT';
  private readonly logger = new Logger(CtFtpConnector.name);

  private get host() {
    return process.env.CT_FTP_HOST || '216.70.82.104';
  }
  private get user() {
    return process.env.CT_FTP_USER || '';
  }
  private get password() {
    return process.env.CT_FTP_PASSWORD || '';
  }
  private get remotePath() {
    return process.env.CT_FTP_PATH || '/catalogo_xml';
  }
  private get jsonFile() {
    return process.env.CT_FTP_JSON_FILE || 'productos.json';
  }
  private get xmlFile() {
    return process.env.CT_FTP_XML_FILE || 'productos.xml';
  }
  private get secure() {
    return process.env.CT_FTP_SECURE === '1';
  }

  private cacheDir() {
    return path.join(process.cwd(), '.tmp-ftp-inspect');
  }

  async pullPrimary(): Promise<SupplierPullResult> {
    return this.pullFile(this.jsonFile, 'JSON');
  }

  async pullFull(): Promise<SupplierPullResult> {
    // XML completo: por ahora si no hay parser XML dedicado, reutilizamos JSON
    // cuando XML no esté disponible; el sync nocturno pedirá XML y lo
    // convertirá cuando se agregue parser. Intentamos JSON fallback.
    try {
      return await this.pullFile(this.xmlFile, 'XML');
    } catch (err) {
      this.logger.warn(`CT XML pull failed, falling back to JSON: ${(err as Error).message}`);
      return this.pullPrimary();
    }
  }

  private async pullFile(fileName: string, source: 'JSON' | 'XML'): Promise<SupplierPullResult> {
    if (!this.user || !this.password) {
      throw new Error('CT_FTP_USER / CT_FTP_PASSWORD no configurados');
    }

    const client = new Client(120_000);
    const localDir = this.cacheDir();
    await mkdir(localDir, { recursive: true });
    const localPath = path.join(localDir, fileName);
    const remote = `${this.remotePath.replace(/\/$/, '')}/${fileName}`;

    let fileModifiedAt: string | null = null;
    try {
      await client.access({
        host: this.host,
        user: this.user,
        password: this.password,
        secure: this.secure,
      });
      const listing = await client.list(this.remotePath);
      const meta = listing.find((f) => f.name === fileName);
      fileModifiedAt = meta?.rawModifiedAt || meta?.modifiedAt?.toISOString() || null;
      this.logger.log(`Downloading CT ${source} ${remote}`);
      await client.downloadTo(localPath, remote);
    } finally {
      client.close();
    }

    if (source === 'XML') {
      // Parser XML liviano: si el archivo no es JSON, dejamos stub hasta fase XML.
      const head = (await readFile(localPath, 'utf8')).slice(0, 20).trim();
      if (head.startsWith('<')) {
        throw new Error('CT XML parser pendiente — usar sync JSON primario');
      }
    }

    const raw = await readFile(localPath, 'utf8');
    const checksum = createHash('sha256').update(raw).digest('hex');
    const parsed = JSON.parse(raw) as CtRawProduct[];
    if (!Array.isArray(parsed)) {
      throw new Error('CT feed no es un array JSON');
    }

    const products = parsed
      .map((row) => this.normalize(row))
      .filter((p): p is NormalizedSupplierProduct => Boolean(p));

    await writeFile(
      path.join(localDir, `${fileName}.meta.json`),
      JSON.stringify({ fileModifiedAt, checksum, count: products.length, at: new Date().toISOString() }, null, 2),
    );

    return { source, fileModifiedAt, checksum, products };
  }

  normalize(row: CtRawProduct): NormalizedSupplierProduct | null {
    const sku = String(row.clave || '').trim();
    if (!sku) return null;
    const existencia: Record<string, number> = {};
    if (row.existencia && typeof row.existencia === 'object') {
      for (const [k, v] of Object.entries(row.existencia)) {
        existencia[k] = Number(v) || 0;
      }
    }
    return {
      externalId: row.idProducto ?? null,
      sku,
      partNumber: row.numParte?.trim() || null,
      name: row.nombre?.trim() || sku,
      model: row.modelo?.trim() || null,
      brand: row.marca?.trim() || null,
      brandIdExternal: row.idMarca ?? null,
      category: row.categoria?.trim() || null,
      categoryIdExternal: row.idCategoria ?? null,
      subcategory: row.subcategoria?.trim() || null,
      subcategoryIdExternal: row.idSubCategoria ?? null,
      shortDescription: row.descripcion_corta?.trim() || null,
      ean: row.ean?.trim() || null,
      upc: row.upc?.trim() || null,
      substituteSku: row.sustituto?.trim() || null,
      active: row.activo === 1 || row.activo === true,
      protected: row.protegido === 1 || row.protegido === true,
      existencia,
      price: Number(row.precio) || 0, // CT: precio de lista SIN IVA (términos ctonline.mx)
      currency: (row.moneda || 'MXN').toUpperCase(),
      exchangeRate: row.tipoCambio != null ? Number(row.tipoCambio) : null,
      specifications: Array.isArray(row.especificaciones)
        ? row.especificaciones
            .filter((s) => s?.tipo && s?.valor)
            .map((s) => ({ tipo: String(s.tipo), valor: String(s.valor) }))
        : [],
      promotions: Array.isArray(row.promociones) ? row.promociones : [],
      imageUrl: row.imagen?.trim() || null,
      raw: row,
    };
  }
}
