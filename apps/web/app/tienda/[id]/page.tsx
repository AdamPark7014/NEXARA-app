import Image from "next/image";
import Link from "next/link";
import styles from "./detail-new.module.css";
import ProductActions from "./ProductActions";
import { extractSkuFromSlug } from "@/lib/seo-utils";

// Utility functions

// Lógica unificada de precio: IVA + markup + ajuste dólar + redondeo
function getFinalPriceMXN(price: number, currency: string | undefined, dollarRate: number): number {
  // 1. Agregar IVA
  const priceWithIVA = price * 1.16;
  // 2. Si es USD, convertir a MXN con ajuste de $0.30
  const priceInMXN = currency === 'USD' ? priceWithIVA * dollarRate : priceWithIVA;
  // 3. Aplicar markup 20%
  const withMarkup = priceInMXN * 1.2;
  // 4. Redondear según rango
  let rounded = withMarkup;
  if (withMarkup >= 10000) rounded = Math.round(withMarkup / 100) * 100;
  else if (withMarkup >= 1000) rounded = Math.round(withMarkup / 100) * 100;
  else if (withMarkup >= 100) rounded = Math.round(withMarkup / 10) * 10;
  else rounded = Math.round(withMarkup);
  return rounded - 0.01;
}


function formatPriceMXN(price: number): string {
  const formatted = price.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted} MXN`;
}

async function fetchDollarRate(): Promise<number> {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', { 
      cache: 'no-store' 
    });
    if (response.ok) {
      const data = await response.json();
      return data.rates?.MXN || 20;
    }
  } catch {
    console.log('Error fetching from exchangerate-api');
  }

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { 
      cache: 'no-store' 
    });
    if (response.ok) {
      const data = await response.json();
      return data.rates?.MXN || 20;
    }
  } catch {
    console.log('Error fetching from open.er-api');
  }

  return 20;
}

type Product = {
  id: string;
  idProducto?: number | string;
  clave?: string;
  numParte?: string;
  name?: string;
  title?: string;
  nombre?: string;
  modelo?: string;
  brand?: string;
  marca?: string;
  category?: string;
  categoria?: string;
  idCategoria?: number | string;
  subcategory?: string;
  subcategoria?: string;
  idSubCategoria?: number | string;
  price?: number | string;
  precio?: number | string;
  currency?: string;
  moneda?: string;
  tipoCambio?: number;
  image?: string;
  imagen?: string;
  img?: string;
  description?: string;
  descripcion_corta?: string;
  source?: string;
  __source?: string;
  rawPrice?: string | number;
  especificaciones?: Array<{ tipo: string; valor: string }>;
  existencia?: Record<string, number>;
  ean?: string;
  upc?: string;
  sustituto?: string;
  activo?: number;
  protegido?: number;
  promociones?: Array<Record<string, unknown>>;
  sku?: string;
  specifications?: Record<string, unknown> | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  icecatId?: string | null;
};

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001";
}

type DetailResponse = {
  product: Product;
  suppliers: Array<{
    id: number;
    name: string;
    sku: string;
    price: number;
    stock: number;
    active: boolean;
    leadTime?: number;
  }>;
};

/**
 * Busca producto por SKU usando el nuevo endpoint /detail
 */
async function fetchProductDetail(sku: string): Promise<DetailResponse | null> {
  const base = getApiBase();
  const endpoint = new URL(`/products/${sku}/detail`, base).toString();

  try {
    console.log(`[DEBUG] Buscando detalle de producto: ${sku}`);
    console.log(`[DEBUG] Endpoint: ${endpoint}`);
    
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[DEBUG] API respondió con status: ${res.status}`);
      return null;
    }
    
    const data: DetailResponse = await res.json();
    console.log(`[DEBUG] Producto encontrado: ${data.product.name}`);
    console.log(`[DEBUG] Proveedores disponibles: ${data.suppliers.length}`);
    
    return data;
  } catch (error) {
    console.error("Error fetching product detail:", error);
    return null;
  }
}

/**
 * Fallback: busca por ID en lista completa de productos (compatibilidad con URLs antiguas)
 */
async function fetchProductLegacy(id: string): Promise<Product | null> {
  const base = getApiBase();
  const endpoint = new URL("/products", base).toString();

  try {
    console.log(`[DEBUG] Fallback: Buscando producto legacy con ID: ${id}`);
    
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) {
      return null;
    }
    
    const json = await res.json();
    const products: Product[] = Array.isArray(json) ? json : json.products;
    // Buscar por ID (string o número)
    const found = products.find((p) => {
      const pid = String(p.id ?? p.idProducto ?? p.clave);
      return pid === id;
    });
    return found || null;
  } catch (error) {
    console.error("Error fetching product legacy:", error);
    return null;
  }
}

function pick<T>(...vals: Array<T | undefined>): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v as T;
}

export default async function ProductDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  // Extraer solo el SKU real del slug

  const sku = extractSkuFromSlug(id) || id;
  console.log('[DEBUG] SKU extraído para detalle:', sku);

  // 1. Intentar primero con el identificador único extraído del slug (sku)
  let detail = await fetchProductDetail(sku);
  if (!detail || !detail.product) {
    // 2. Si falla, obtener lista de productos y probar variantes adicionales
    let productsList: Product[] = [];
    try {
      const base = getApiBase();
      const endpoint = new URL("/products", base).toString();
      const res = await fetch(endpoint, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        productsList = Array.isArray(json) ? json : json.products;
      }
    } catch (e) {
      console.error("[DEBUG] No se pudo obtener lista de productos para búsqueda avanzada", e);
    }

    // Buscar el producto en la lista por coincidencia de slug, clave, numParte, modelo, idProducto
    const candidate = productsList.find(p => {
      return (
        p.clave === sku ||
        p.numParte === sku ||
        p.modelo === sku ||
        String(p.idProducto) === sku ||
        p.clave === id ||
        p.numParte === id ||
        p.modelo === id ||
        String(p.idProducto) === id
      );
    });

    // Probar variantes: clave, numParte, modelo, idProducto, id original
    const tryIds = [
      candidate?.clave,
      candidate?.numParte,
      candidate?.modelo,
      candidate?.idProducto ? String(candidate.idProducto) : undefined,
      id
    ].filter((v, i, arr) => !!v && arr.indexOf(v) === i);

    for (const variant of tryIds) {
      if (typeof variant === 'string') {
        detail = await fetchProductDetail(variant);
      }
      if (detail && detail.product) {
        console.log('[DEBUG] Producto encontrado usando variante:', variant);
        break;
      }
    }
  }

  // Fallback a búsqueda legacy (por ID) si falla todo
  let product = detail?.product;
  const suppliers = detail?.suppliers || [];
  if (!product) {
    const legacyProduct = await fetchProductLegacy(id);
    if (legacyProduct) {
      product = legacyProduct;
    }
  }
  
  const dollarRate = await fetchDollarRate();

  if (!product) {
    return (
      <main className={styles.page}>
        <div className={styles.notFound}>
          <h1>Producto no encontrado</h1>
          <p>El producto que buscas no está disponible.</p>
          <Link href="/tienda" className={styles.backLink}>Volver a la tienda</Link>
        </div>
      </main>
    );
  }

  const name = pick<string>(product.name, product.title, product.nombre, product.modelo) || "Producto";
  let brand: string | undefined = undefined;
  if (
    typeof product.brand === 'object' &&
    product.brand !== null &&
    'name' in product.brand &&
    typeof (product.brand as { name?: unknown }).name !== 'undefined'
  ) {
    brand = String((product.brand as { name?: unknown }).name);
  } else {
    brand = pick<string>(product.brand, product.marca);
  }
  // Priorizar imageUrl de Icecat sobre las imágenes originales
  const image = pick<string>(product.imageUrl ?? undefined, product.image, product.imagen, product.img);
  // const thumbnail = product.thumbnailUrl ?? undefined;
  const price = pick<number | string>(product.price, product.precio);
  let currency = product.moneda || product.currency;
  let priceNum = price !== undefined ? Number(price) : undefined;
  // Si no hay precio en el producto, tomar el mejor de suppliers
  if ((priceNum === undefined || isNaN(priceNum)) && suppliers.length > 0) {
    // Buscar el supplier con menor precio válido
    const validSuppliers = suppliers.filter(s => typeof s.price === 'number' && s.price > 0);
    if (validSuppliers.length > 0) {
      const best = validSuppliers.reduce((min, s) => (s && min && s.price < min.price ? s : min), validSuppliers[0]);
      if (best) {
        priceNum = best.price;
        currency = 'currency' in best ? (best as { currency?: string }).currency || currency : currency;
      }
    }
  }
  let category: string | undefined = undefined;
  if (typeof product.category === 'object' && product.category !== null && 'name' in product.category) {
    category = typeof (product.category as { name?: unknown }).name !== 'undefined'
      ? String((product.category as { name?: unknown }).name)
      : undefined;
  } else {
    category = pick<string>(product.categoria, product.category);
  }
  let subcategory: string | undefined = undefined;
  if (typeof product.subcategory === 'object' && product.subcategory !== null && 'name' in product.subcategory) {
    subcategory = typeof (product.subcategory as { name?: unknown }).name !== 'undefined'
      ? String((product.subcategory as { name?: unknown }).name)
      : undefined;
  } else {
    subcategory = pick<string>(product.subcategoria, product.subcategory);
  }
  // Priorizar descripción enriquecida de Icecat
  const description = pick<string>(product.description, product.descripcion_corta);
  const specs = product.especificaciones || [];
  const icecatSpecs = product.specifications;
  const stock = product.existencia || {};
  // const productSku = product.clave || product.numParte || product.sku;
  const ean = product.ean;
  const upc = product.upc;
  const modelo = product.modelo || product.numParte;
  const fullTitle = `${name} ${modelo ? `(${modelo})` : ""}`;
  const hasIcecatData = !!(product.icecatId || product.specifications);

  // Apply pricing logic
  let displayPrice: string = "";
  let finalPrice: number = 0;
  if (priceNum !== undefined && !Number.isNaN(priceNum)) {
    finalPrice = getFinalPriceMXN(priceNum, currency, dollarRate);
    displayPrice = formatPriceMXN(finalPrice);
  }

  // Calcula precio más bajo entre proveedores
  const supplierPrices = suppliers
    .filter(s => s.active)
    .map(s => ({
      ...s,
      markupPrice: getFinalPriceMXN(Number(s.price), currency, dollarRate),
    }))
    .sort((a, b) => a.markupPrice - b.markupPrice);

  const bestPrice = supplierPrices.length > 0 ? supplierPrices[0]?.markupPrice : finalPrice;

  return (
    <main className={styles.page}>
      <Link href="/tienda" className={styles.breadcrumb}>Volver a la tienda</Link>

      <section className={styles.heroBetter}>
        <div className={styles.imageBox}>
          {image ? (
            <Image src={image} alt={name} width={350} height={350} className={styles.imageBetter} />
          ) : (
            <div className={styles.imageFallback}>Sin imagen</div>
          )}
        </div>
        <div className={styles.dataBox}>
          <div className={styles.chipRow}>
            {product.__source && <span className={styles.chip}>{product.__source}</span>}
            {currency && <span className={styles.chip}>{currency}</span>}
          </div>
          <h1 className={styles.titleBetter}>{fullTitle}</h1>
          {sku && (
            <p className={styles.supplierName}>
              SKU: <strong>{sku}</strong>{modelo && ` | Modelo: ${modelo}`}
            </p>
          )}
          {(upc || ean) && (
            <p className={styles.supplierName}>
              {upc && <span><strong>UPC:</strong> {upc}</span>}
              {upc && ean && <span style={{ margin: '0 0.5em' }}>|</span>}
              {ean && <span><strong>EAN:</strong> {ean}</span>}
            </p>
          )}
          {brand && <p className={styles.supplierName}>Marca: {brand}</p>}
          {category && <p className={styles.supplierName}>Categoría: {category}</p>}
          {subcategory && <p className={styles.supplierName}>Subcategoría: {subcategory}</p>}
          {/* Mostrar stock de CT Internacional si está disponible en suppliers, si no, mostrar suma de existencia */}
          {(() => {
            const ctSupplier = suppliers.find(s => s.name === 'CT Internacional');
            if (ctSupplier && typeof ctSupplier.stock === 'number') {
              return (
                <div className={styles.stockBetter}>
                  Stock CT Internacional: <strong>{ctSupplier.stock}</strong> unidades
                </div>
              );
            } else if (Object.keys(stock).length > 0) {
              return (
                <div className={styles.stockBetter}>
                  Disponibilidad: <strong>{Object.values(stock).reduce((a, b) => a + b, 0)} unidades</strong>
                </div>
              );
            }
            return null;
          })()}
          <div className={styles.priceRow}>
            {displayPrice && (
              <span className={styles.priceBetter}>{displayPrice}</span>
            )}
            {supplierPrices.length > 0 && supplierPrices[0] && supplierPrices[0].name !== 'Proveedor Default' && (
              <span className={styles.supplierName}>Proveedor: {supplierPrices[0].name}</span>
            )}
          </div>
          <div className={styles.actionsRow}>
            <ProductActions productName={name} productId={id} price={bestPrice || finalPrice} currency={currency} image={image} />
          </div>
          {description && <div className={styles.descriptionBetter}>{description}</div>}
        </div>
      </section>

      {/* Especificaciones de CT Online */}
      {specs.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Especificaciones {hasIcecatData && <span className={styles.icecatBadge}>✓ Icecat</span>}</h2>
          <div className={styles.specsGrid}>
            {specs.map((spec, idx) => (
              <div key={idx} className={styles.specItem}>
                <span className={styles.specLabel}>{spec.tipo}</span>
                <span className={styles.specValue}>{spec.valor}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Especificaciones enriquecidas de Icecat */}
      {icecatSpecs && Object.keys(icecatSpecs).length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Especificaciones Técnicas</h2>
          <table className={styles.specsTable}>
            <tbody>
              {Object.entries(icecatSpecs).map(([key, value]) => {
                // Si el valor es un objeto con campos tipo/valor, mostrar como columnas
                if (typeof value === 'object' && value !== null && 'tipo' in value && 'valor' in value) {
                  return (
                    <tr key={key}>
                      <td className={styles.specLabel}>{String(value.tipo)}</td>
                      <td className={styles.specValue}>{String(value.valor)}</td>
                    </tr>
                  );
                }
                // Si es un objeto, mostrar como JSON
                if (typeof value === 'object' && value !== null) {
                  return (
                    <tr key={key}>
                      <td className={styles.specLabel}>{key}</td>
                      <td className={styles.specValue}>
                        <pre style={{ margin: 0, fontSize: '0.95em', whiteSpace: 'pre-wrap' }}>{JSON.stringify(value, null, 2)}</pre>
                      </td>
                    </tr>
                  );
                }
                // Si es valor simple
                return (
                  <tr key={key}>
                    <td className={styles.specLabel}>{key}</td>
                    <td className={styles.specValue}>{String(value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
