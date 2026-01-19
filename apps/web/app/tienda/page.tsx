function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001";
}
// Removed unused imports
import TiendaClient from "./TiendaClient";
import styles from "./tienda-new.module.css";

type Product = {
  id?: string | number;
  idProducto?: number | string;
  clave?: string;
  numParte?: string;
  sku?: string;
  name?: string;
  title?: string;
  modelo?: string;
  description?: string;
  precio?: number | string;
  price?: number | string;
  brand?: string;
  marca?: string;
  nombre?: string;
  descripcion_corta?: string;
  imagen?: string;
  image?: string;
  img?: string;
  url?: string;
  idCategoria?: number | string;
  categoria?: string;
  idSubCategoria?: number | string;
  subcategoria?: string;
  category?: string;
  subcategory?: string;
  moneda?: string;
  __source?: string;
  supplierProducts?: SupplierProduct[];
  specifications?: Record<string, unknown> | null;
  promociones?: unknown;
  existencia?: unknown;
  sources?: unknown;
};

async function fetchProducts(): Promise<Product[]> {
  const base = getApiBase();
  const endpoint = new URL("/products?limit=10000", base).toString();
  console.log("FETCHING PRODUCTS FROM:", endpoint);

  try {
    const res = await fetch(endpoint, { next: { revalidate: 60 } });
    console.log("RESPONSE STATUS:", res.status);
    if (res.ok) {
      const data = await res.json();
      console.log("PRODUCTS DATA:", data);
      return Array.isArray(data) ? data : (data?.products ?? []);
    }
  } catch (e) {
    console.error("FETCH ERROR 1:", e);
    // ignore and try refresh
  }

  try {
    const res2 = await fetch(`${endpoint}&refresh=true`, { cache: "no-store" });
    console.log("RESPONSE STATUS (refresh):", res2.status);
    if (res2.ok) {
      const data = await res2.json();
      console.log("PRODUCTS DATA (refresh):", data);
      return Array.isArray(data) ? data : (data?.products ?? []);
    }
  } catch (e) {
    console.error("FETCH ERROR 2:", e);
    // ignore
  }

  return [];
}

async function fetchDollarRate(): Promise<number | null> {
  try {
    // Intentar con una API pública de tasas de cambio
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    const data = await res.json();
    const rate = data.rates?.MXN;
    if (typeof rate === 'number') return rate + 0.30;
    return rate || null;
  } catch {
    // Si falla, retornar null
  }

  // removed stray lines and duplicate try block

  return null;
}

function pick<T>(...vals: Array<T | undefined>): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v as T;
}

type Supplier = {
  id: number;
  name: string;
};
type SupplierProduct = {
  supplier: Supplier;
  supplierSku: string;
  price: number;
  stock: number;
  active: boolean;
  currency?: string;
};
type Source = {
  supplier: string;
  price?: number;
  stock?: number;
  currency?: string;
};
type NormalizedProduct = {
  id: string;
  name: string;
  brand?: string;
  brandId?: number;
  category?: string;
  subcategory?: string;
  image?: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  description?: string;
  specifications?: Record<string, unknown> | null;
  icecatId?: string | null;
  icecatDatasheet?: string | null;
  ean?: string;
  upc?: string;
  tipoCambio?: number;
  promociones?: Array<Record<string, unknown>>;
  existencia?: Record<string, number>;
  protegido?: boolean;
  activo?: boolean;
  sustituto?: string;
  sources?: Source[];
  createdAt?: string;
  updatedAt?: string;
  source?: string;
  rawPrice?: string | number;
  supplierProducts?: string;
};

function normalize(products: Product[]): NormalizedProduct[] {
  return products
    .map((p, idx) => {
      const name = pick<string>(p.name, p.title, p.nombre, p.modelo) ?? '';
      // Si brand es objeto, usar brand.name
      let brand: string | undefined;
      if (typeof p.brand === 'object' && p.brand !== null && 'name' in p.brand) {
        brand = (p.brand as { name?: string }).name ?? '';
      } else {
        brand = pick<string>(p.brand, p.marca) ?? '';
      }
      // Si category es objeto, usar category.name
      let category: string | undefined;
      if (typeof p.category === 'object' && p.category !== null && 'name' in p.category) {
        category = (p.category as { name?: string }).name ?? '';
      } else {
        category = pick<string>(p.categoria, p.category as string) ?? '';
      }
      // Priorizar imagen enriquecida de Icecat cuando esté disponible
      const imageUrl = 'imageUrl' in p ? (p as Product & { imageUrl?: string }).imageUrl ?? null : null;
      const thumbnailUrl = 'thumbnailUrl' in p ? (p as Product & { thumbnailUrl?: string }).thumbnailUrl ?? null : null;
      const image = imageUrl ?? pick<string>(p.image, p.imagen, p.img) ?? '';
      let priceVal = p.precio ?? p.price ?? 0;
      let currencyVal = p.moneda ?? '';
      // Si no hay precio, buscar en suppliers (detalle API)
      if (priceVal === undefined || priceVal === null || priceVal === 0) {
        const suppliers = (p as Product & { suppliers?: Array<{ price?: number; currency?: string }> }).suppliers;
        if (Array.isArray(suppliers) && suppliers.length > 0) {
          const valid = suppliers.filter((s) => typeof s.price === 'number' && s.price! > 0);
          if (valid.length > 0 && valid[0] && typeof valid[0].price === 'number') {
            const best = valid.reduce((min, s) => (s.price! < (min.price ?? Number.MAX_SAFE_INTEGER) ? s : min), valid[0]);
            priceVal = typeof best.price === 'number' ? best.price : 0;
            currencyVal = best.currency ?? currencyVal;
          }
        } else {
          const supplierProducts = (p as Product & { supplierProducts?: SupplierProduct[] }).supplierProducts;
          if (Array.isArray(supplierProducts) && supplierProducts.length > 0 && supplierProducts[0]?.price !== undefined) {
            priceVal = supplierProducts[0].price;
            currencyVal = supplierProducts[0].currency ?? currencyVal;
          } else {
            const sources = (p as Product & { sources?: Array<{ price?: number; currency?: string }> }).sources;
            if (Array.isArray(sources) && sources.length > 0) {
              const validSources = sources.filter((s) => typeof s.price === 'number' && s.price! > 0);
              if (validSources.length > 0 && validSources[0] && typeof validSources[0].price === 'number') {
                const bestSource = validSources.reduce((min, s) => (s.price! < (min.price ?? Number.MAX_SAFE_INTEGER) ? s : min), validSources[0]);
                priceVal = typeof bestSource.price === 'number' ? bestSource.price : 0;
                currencyVal = bestSource.currency ?? currencyVal;
              }
            }
          }
        }
      }
      const priceNum = priceVal !== undefined && priceVal !== null ? Number(priceVal) : 0;
      // Si subcategory es objeto, usar subcategory.name
      let subcategory: string | undefined;
      if (typeof p.subcategory === 'object' && p.subcategory !== null && 'name' in p.subcategory) {
        subcategory = (p.subcategory as { name?: string }).name ?? '';
      } else {
        subcategory = pick<string>(p.subcategoria, p.subcategory as string);
      }
      const currency = currencyVal || undefined;
      const id = (p.id ?? p.idProducto ?? p.clave ?? p.numParte ?? idx).toString();
      const description = pick<string>(p.description, p.descripcion_corta);
      const specifications = (p as { specifications?: Record<string, unknown> | null }).specifications ?? null;
      const icecatId = (p as { icecatId?: string | null }).icecatId ?? null;
      const ean = (p as { ean?: string }).ean ?? undefined;
      const upc = (p as { upc?: string }).upc ?? undefined;
      // Normalizar supplierProducts: si es array, extraer info útil o convertir a string seguro
      let supplierProducts: string | undefined = undefined;
      const supplierProductsArr = (p as Product & { supplierProducts?: SupplierProduct[] }).supplierProducts;
      if (Array.isArray(supplierProductsArr) && supplierProductsArr.length > 0) {
        const sp = supplierProductsArr[0];
        supplierProducts = sp ? `${sp.supplier?.name || ''} $${sp.price ?? ''}`.trim() : '';
      }
      return {
        id,
        name: name || "Producto",
        brand,
        brandId: (p as { brandId?: number }).brandId ?? undefined,
        category,
        subcategory,
        price: priceNum,
        currency,
        image,
        imageUrl,
        thumbnailUrl,
        description,
        specifications,
        icecatId,
        icecatDatasheet: (p as { icecatDatasheet?: string | null }).icecatDatasheet ?? null,
        ean,
        upc,
        tipoCambio: (p as { tipoCambio?: number }).tipoCambio ?? undefined,
        promociones: (p as { promociones?: Array<Record<string, unknown>> }).promociones ?? undefined,
        existencia: (p as { existencia?: Record<string, number> }).existencia ?? undefined,
        protegido: typeof (p as { protegido?: boolean }).protegido === 'boolean' ? (p as { protegido?: boolean }).protegido : undefined,
        activo: typeof (p as { activo?: boolean }).activo === 'boolean' ? (p as { activo?: boolean }).activo : undefined,
        protegidoNum: typeof (p as { protegido?: boolean }).protegido === 'boolean' ? ((p as { protegido?: boolean }).protegido ? 1 : 0) : undefined,
        activoNum: typeof (p as { activo?: boolean }).activo === 'boolean' ? ((p as { activo?: boolean }).activo ? 1 : 0) : undefined,
        // sources already assigned above, remove duplicate
        maxStock: typeof (p as { maxStock?: number }).maxStock === 'number' ? (p as { maxStock?: number }).maxStock : undefined,
        sustituto: (p as { sustituto?: string }).sustituto ?? undefined,
        sources: (p as { sources?: Source[] }).sources ?? undefined,
        createdAt: (p as { createdAt?: string }).createdAt ?? undefined,
        updatedAt: (p as { updatedAt?: string }).updatedAt ?? undefined,
        source: p.__source,
        rawPrice: priceVal,
        supplierProducts,
      };
    })
    .filter((p) => p.name);
}

export const metadata = {
  title: "Tienda | Productos Nexara",
  description: "Descubre nuestro catálogo de productos de tecnología y soluciones",
};

export default async function TiendaPage() {
  const products = await fetchProducts();
  const normalized = normalize(products);
  const dollarRate = await fetchDollarRate();

  return (
    <main className={styles.page}>
      {dollarRate && (
        <section className={styles.dollarBanner}>
          <div className={styles.dollarContent}>
            <span className={styles.dollarLabel}>Tasa USD/MXN en vivo:</span>
            <span className={styles.dollarValue}>
              1 USD = ${dollarRate.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})} MXN
            </span>
          </div>
        </section>
      )}

      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>Tienda de Productos</p>
          <h1 className={styles.title}>Nexara Shop</h1>
          <p className={styles.subtitle}>
            Explora nuestro amplio catálogo de productos de tecnología y soluciones. Filtra por marca, categoría o rango de precio para encontrar lo que necesitas.
          </p>
        </div>
        <div className={styles.heroBadge}>Inventario en vivo</div>
      </section>

      <TiendaClient products={normalized} initialDollarRate={dollarRate} />
    </main>
  );
}
