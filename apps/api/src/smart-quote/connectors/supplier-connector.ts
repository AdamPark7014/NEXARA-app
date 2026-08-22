export type SupplierPullSource = 'JSON' | 'XML' | 'API' | 'CSV';

/** Re-export homologación de precios — ver `pricing/supplier-pricing.ts`. */
export type { SupplierPricingPolicy } from '../pricing/supplier-pricing.js';
export { SUPPLIER_PRICING_POLICIES } from '../pricing/supplier-pricing.js';

export type NormalizedSupplierProduct = {
  externalId: number | null;
  sku: string;
  partNumber: string | null;
  name: string;
  model: string | null;
  brand: string | null;
  brandIdExternal: number | null;
  category: string | null;
  categoryIdExternal: number | null;
  subcategory: string | null;
  subcategoryIdExternal: number | null;
  shortDescription: string | null;
  ean: string | null;
  upc: string | null;
  substituteSku: string | null;
  active: boolean;
  protected: boolean;
  existencia: Record<string, number>;
  price: number;
  currency: string;
  exchangeRate: number | null;
  specifications: Array<{ tipo: string; valor: string }>;
  promotions: unknown[];
  imageUrl: string | null;
  raw: unknown;
};

export type SupplierPullResult = {
  source: SupplierPullSource;
  fileModifiedAt: string | null;
  checksum: string | null;
  products: NormalizedSupplierProduct[];
};

export interface SupplierConnector {
  readonly code: string;
  pullPrimary(): Promise<SupplierPullResult>;
  pullFull?(): Promise<SupplierPullResult>;
}
