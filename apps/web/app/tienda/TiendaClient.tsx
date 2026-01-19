"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import styles from "./tienda-new.module.css";
import { generateProductSlug } from "@/lib/seo-utils";

type Product = {
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
  protegidoNum?: number;
  activo?: boolean;
  activoNum?: number;
  sustituto?: string;
  sources?: Array<{ supplier: string; price?: number; stock?: number; currency?: string }>;
  createdAt?: string;
  updatedAt?: string;
  source?: string;
  rawPrice?: string | number;
  supplierProducts?: string;
  maxStock?: number;
};

type CartItem = {
  id: string;
  name?: string;
  price?: number | string;
  currency?: string;
  image?: string;
  quantity: number;
  mpn?: string;
};

type Props = {
  products: Product[];
  initialDollarRate?: number | null;
};

async function fetchDollarRate(): Promise<number | null> {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      return data.rates?.MXN || null;
    }
  } catch {
    // fallback
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      return data.rates?.MXN || null;
    }
  } catch {
    // fallback
  }

  return null;
}

function applyMarkupAndRound(price?: number): number | undefined {
  if (price === undefined) return undefined;
  
  // Aumentar 20%
  const withMarkup = price * 1.2;
  
  // Determinar el múltiplo para redondear según el rango de precio
  let roundTo = 1;
  if (withMarkup >= 10000) roundTo = 1000;      // $10,000+ redondea a miles
  else if (withMarkup >= 1000) roundTo = 100;   // $1,000-$9,999 redondea a centenas
  else if (withMarkup >= 100) roundTo = 10;     // $100-$999 redondea a decenas
  else roundTo = 1;                              // < $100 redondea a unidades
  
  // Redondear al múltiplo superior
  const rounded = Math.ceil(withMarkup / roundTo) * roundTo;
  
  // Restar 1 centavo para terminación en .99
  return rounded - 0.01;
}


  function formatPrice(price?: number) {
    if (price === undefined) return "";
    // Siempre mostrar en pesos
    const symbol = "$";
    const formatted = price.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${symbol}${formatted} MXN`;
  }

export default function TiendaClient({ products, initialDollarRate }: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [brand, setBrand] = useState("Todas");
  const [category, setCategory] = useState("Todas");
  const [subcategory, setSubcategory] = useState("Todas");
  const [supplier, setSupplier] = useState("Todos");
  const [currency, setCurrency] = useState("Todas");
    const [minPrice, setMinPrice] = useState(""); 
    const [maxPrice, setMaxPrice] = useState(""); 
  const [sortBy, setSortBy] = useState("default");
  const [page, setPage] = useState(1);
  const [dollarRate, setDollarRate] = useState<number | null>(initialDollarRate ?? null);
  const [cartNotification, setCartNotification] = useState<{ visible: boolean; product: string; count: number }>({ visible: false, product: '', count: 0 });
  const [cartCount, setCartCount] = useState(0);
  const pageSize = 32;

  // Función para agregar IVA y convertir USD a MXN en tiempo real
  function getPriceInMXN(price: number, currency?: string): number {
    // Agregar 16% de IVA al precio base
    const priceWithIVA = price * 1.16;
    if (currency === 'USD' && dollarRate) {
      return priceWithIVA * dollarRate;
    }
    return priceWithIVA;
  }

  // Debounce para búsqueda (mejora rendimiento)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Cargar y actualizar contador del carrito
  useEffect(() => {
    const updateCartCount = () => {
      try {
        const cart = JSON.parse(localStorage.getItem('nexara-cart') || '[]') as CartItem[];
        const total = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        setCartCount(total);
      } catch (error) {
        console.error('Error reading cart:', error);
      }
    };

    updateCartCount();

    // Escuchar cambios del carrito desde otras pestañas
    window.addEventListener('cartUpdated', updateCartCount);
    window.addEventListener('storage', updateCartCount);

    return () => {
      window.removeEventListener('cartUpdated', updateCartCount);
      window.removeEventListener('storage', updateCartCount);
    };
  }, []);

  // Función para agregar al carrito con localStorage
  const addToCart = (product: Product) => {
    try {
      const cart = JSON.parse(localStorage.getItem('nexara-cart') || '[]') as CartItem[];
      const existingItem = cart.find(item => item.id === product.id);
      
      if (existingItem) {
        existingItem.quantity = (existingItem.quantity || 1) + 1;
      } else {
        cart.push({
          id: product.id,
          name: product.name,
          price: product.rawPrice,
          image: product.image,
          quantity: 1,
        });
      }
      
      localStorage.setItem('nexara-cart', JSON.stringify(cart));
      
      // Mostrar notificación
      setCartNotification({ 
        visible: true, 
        product: product.name || 'Producto', 
        count: existingItem ? existingItem.quantity : 1 
      });
      
      // Ocultar notificación después de 3 segundos
      setTimeout(() => setCartNotification({ visible: false, product: '', count: 0 }), 3000);
      
      // Dispatch custom event para actualizar el carrito en otros componentes
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { cart } }));
    } catch (error) {
      console.error('Error al agregar al carrito:', error);
    }
  };

  // Actualizar contador cuando se agrega al carrito
  useEffect(() => {
    const updateCount = () => {
      try {
        const cart = JSON.parse(localStorage.getItem('nexara-cart') || '[]') as CartItem[];
        const total = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        setCartCount(total);
      } catch (error) {
        console.error('Error updating cart count:', error);
      }
    };

    window.addEventListener('cartUpdated', updateCount);
    return () => window.removeEventListener('cartUpdated', updateCount);
  }, []);

  // Actualizar tasa de dólar cada 5 minutos
  useEffect(() => {
    const updateRate = async () => {
      const rate = await fetchDollarRate();
      if (rate) setDollarRate(rate);
    };

    // Actualizar inmediatamente si no hay tasa inicial
    if (!dollarRate) {
      updateRate();
    }

    // Configurar intervalo de 5 minutos
    const interval = setInterval(updateRate, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [dollarRate]);

  const { brands, categories, subcategories, filtered } = useMemo(() => {
    const brandsSet = new Set<string>();
    const categoriesSet = new Set<string>();
    const subcategoriesSet = new Set<string>();

    let list = products;

    list.forEach((p) => {
      if (p.brand) brandsSet.add(p.brand);
      if (p.category) categoriesSet.add(p.category);
      if (p.subcategory) subcategoriesSet.add(p.subcategory);
    });

    const searchLower = debouncedSearch.trim().toLowerCase();
    list = list.filter((p) => {
      const matchesSearch = !searchLower
        || p.name?.toLowerCase().includes(searchLower)
        || (p.brand?.toLowerCase().includes(searchLower) ?? false)
        || (p.category?.toLowerCase().includes(searchLower) ?? false)
        || (p.subcategory?.toLowerCase().includes(searchLower) ?? false);
      const matchesBrand = brand === "Todas" || p.brand === brand;
      const matchesCategory = category === "Todas" || p.category === category;
      const matchesSubcategory = subcategory === "Todas" || p.subcategory === subcategory;
      const matchesCurrency = true;
      const min = minPrice ? Number(minPrice) : undefined;
      const max = maxPrice ? Number(maxPrice) : undefined;
      const priceVal = typeof p.rawPrice === 'number' ? p.rawPrice : (typeof p.rawPrice === 'string' ? parseFloat(p.rawPrice) : undefined);
      const priceOk = priceVal === undefined ? true : ((min === undefined || priceVal >= min) && (max === undefined || priceVal <= max));
      return matchesSearch && matchesBrand && matchesCategory && matchesSubcategory && matchesCurrency && priceOk;
    });

    // Ordenamiento
    if (sortBy === "price-asc") {
      list = [...list].sort((a, b) => {
        const priceA = typeof a.rawPrice === "string" ? parseFloat(a.rawPrice) : (typeof a.rawPrice === 'number' ? a.rawPrice : 0);
        const priceB = typeof b.rawPrice === "string" ? parseFloat(b.rawPrice) : (typeof b.rawPrice === 'number' ? b.rawPrice : 0);
        return priceA - priceB;
      });
    } else if (sortBy === "price-desc") {
      list = [...list].sort((a, b) => {
        const priceA = typeof a.rawPrice === "string" ? parseFloat(a.rawPrice) : (typeof a.rawPrice === 'number' ? a.rawPrice : 0);
        const priceB = typeof b.rawPrice === "string" ? parseFloat(b.rawPrice) : (typeof b.rawPrice === 'number' ? b.rawPrice : 0);
        return priceB - priceA;
      });
    } else if (sortBy === "name-asc") {
      list = [...list].sort((a, b) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    } else if (sortBy === "name-desc") {
      list = [...list].sort((a, b) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        return nameB.localeCompare(nameA);
      });
    } else {
      list = [...list].sort((a, b) => {
        const brandA = typeof a.brand === "string" ? a.brand : (a.brand !== undefined && a.brand !== null ? String(a.brand) : "");
        const brandB = typeof b.brand === "string" ? b.brand : (b.brand !== undefined && b.brand !== null ? String(b.brand) : "");
        const byBrand = brandA.localeCompare(brandB);
        if (byBrand !== 0) return byBrand;
        const nameA = typeof a.name === "string" ? a.name : (a.name !== undefined && a.name !== null ? String(a.name) : "");
        const nameB = typeof b.name === "string" ? b.name : (b.name !== undefined && b.name !== null ? String(b.name) : "");
        return nameA.localeCompare(nameB);
      });
    }

    return {
      brands: Array.from(brandsSet).sort(),
      categories: Array.from(categoriesSet).sort(),
      subcategories: Array.from(subcategoriesSet).sort(),
      filtered: list,
    };
  }, [products, debouncedSearch, brand, category, subcategory, minPrice, maxPrice, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  return (
    <div className={styles.container}>
      {/* Botón flotante del carrito */}
      <Link href="/tienda/carrito" className={styles.cartFloatingBtn} title="Ver carrito">
        <span className={styles.cartIcon}>🛒</span>
        {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
      </Link>

      {cartNotification.visible && (
        <div className={styles.cartToast}>
          <div className={styles.cartToastContent}>
            <span className={styles.cartToastIcon}>✓</span>
            <div className={styles.cartToastText}>
              <p className={styles.cartToastTitle}>¡Agregado al carrito!</p>
              <p className={styles.cartToastMessage}>{cartNotification.product}</p>
            </div>
            <span className={styles.cartToastBadge}>{cartNotification.count}</span>
          </div>
        </div>
      )}
      <section className={styles.filterSection}>
        <div className={styles.filterContainer}>
          <h2 className={styles.filterTitle}>Filtros</h2>
          <div className={styles.filterGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Buscar</label>
              <div className={styles.searchWrapper}>
                <input
                  className={styles.input}
                  placeholder="Nombre, marca, clave o modelo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search !== debouncedSearch && (
                  <span className={styles.searchIndicator}>Buscando...</span>
                )}
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Marca</label>
              <select className={styles.select} value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option key="brand-all">Todas</option>
                {brands.map((b, i) => {
                  const val = String(b);
                  return <option key={val + '-' + i}>{val}</option>;
                })}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Categoría</label>
              <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option key="category-all">Todas</option>
                {categories.map((c, i) => {
                  const val = String(c);
                  return <option key={val + '-' + i}>{val}</option>;
                })}
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Subcategoría</label>
              <select className={styles.select} value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
                <option key="subcategory-all">Todas</option>
                {subcategories.map((c, i) => {
                  const val = String(c);
                  return <option key={val + '-' + i}>{val}</option>;
                })}
              </select>
            </div>
            {/* Proveedor filter removed */}
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Moneda</label>
              <select className={styles.select} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>Todas</option>
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Ordenar por</label>
              <select className={styles.select} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="default">Por defecto</option>
                <option value="price-asc">Precio: menor a mayor</option>
                <option value="price-desc">Precio: mayor a menor</option>
                <option value="name-asc">Nombre: A-Z</option>
                <option value="name-desc">Nombre: Z-A</option>
              </select>
            </div>
            <div className={styles.priceGroup}>
              <label className={styles.label}>Rango de precio</label>
              <div className={styles.priceInputs}>
                <input
                  className={styles.priceInput}
                  type="number"
                  min="0"
                  placeholder="Mín."
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
                <span className={styles.priceSeparator}>-</span>
                <input
                  className={styles.priceInput}
                  type="number"
                  min="0"
                  placeholder="Máx."
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.actions}>
              <button className={styles.clearBtn} onClick={() => {
                setSearch("");
                setBrand("Todas");
                setCategory("Todas");
                setSubcategory("Todas");
                setSupplier("Todos");
                setCurrency("Todas");
                setMinPrice("");
                setMaxPrice("");
                setSortBy("default");
                setPage(1);
              }}>Limpiar filtros</button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.resultBar}>
        <div className={styles.resultInfo}>
          <span className={styles.resultCount}>
            {filtered.length} {filtered.length === 1 ? 'producto encontrado' : 'productos encontrados'}
          </span>
          {(search || brand !== "Todas" || category !== "Todas" || supplier !== "Todos" || sortBy !== "default") && (
            <span className={styles.filterActive}>• Filtros activos</span>
          )}
        </div>
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            title="Página anterior"
          >
            ← Anterior
          </button>
          <span className={styles.pageInfo}>Página {currentPage} de {totalPages}</span>
          <button
            className={styles.pageBtn}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            title="Página siguiente"
          >
            Siguiente →
          </button>
        </div>
      </section>

      <section className={styles.grid}>
        {paginated.map((p) => {
          // Priorizar imageUrl de Icecat sobre las imágenes originales
          const productImage = p.imageUrl || p.image;
          const hasIcecatData = !!(p.icecatId || p.specifications);
          
          return (
            <article key={p.id} className={styles.card}>
              <div className={styles.cardImageWrap}>
                {productImage ? (
                  <Image
                    src={productImage}
                    alt={p.name || "Producto"}
                    fill
                    sizes="(max-width: 900px) 100vw, 240px"
                    className={styles.cardImage}
                  />
                ) : (
                  <div className={styles.cardImageFallback}>Sin imagen</div>
                )}
                {p.source && <span className={styles.sourceBadge}>{p.source}</span>}
                {hasIcecatData && <span className={styles.icecatBadge}>✓</span>}
              </div>
              <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>{p.name}</h3>
              {p.brand && (
                <p className={styles.muted}>
                  Marca: {String(p.brand)}
                </p>
              )}
              {p.category && <p className={styles.muted}>Categoría: {p.category}</p>}
              {p.subcategory && <p className={styles.muted}>Subcategoría: {p.subcategory}</p>}
              {Array.isArray(p.sources) && p.sources.length > 0 ? (
                (() => {
                  const ctSource = p.sources.find((s: { supplier: string }) => s.supplier === 'CT Internacional');
                  if (ctSource && typeof ctSource.price === 'number' && !isNaN(ctSource.price)) {
                    return (
                      <p className={styles.price}>
                        {formatPrice(applyMarkupAndRound(getPriceInMXN(ctSource.price, ctSource.currency)))}
                      </p>
                    );
                  } else if (typeof p.rawPrice === 'number' && !isNaN(p.rawPrice)) {
                    return (
                      <p className={styles.price}>
                        {formatPrice(applyMarkupAndRound(getPriceInMXN(p.rawPrice, undefined)))}
                      </p>
                    );
                  }
                  return null;
                })()
              ) : (
                typeof p.rawPrice === 'number' && !isNaN(p.rawPrice) ? (
                  <p className={styles.price}>
                    {formatPrice(applyMarkupAndRound(getPriceInMXN(p.rawPrice, undefined)))}
                  </p>
                ) : null
              )}
              {/* Mostrar stock total de CT Internacional si existe, debajo del precio, si no, usar maxStock */}
              {Array.isArray(p.sources) && p.sources.length > 0 ? (
                (() => {
                  const ctSource = p.sources.find((s: { supplier: string }) => s.supplier === 'CT Internacional');
                  if (ctSource && typeof ctSource.stock === 'number') {
                    return (
                      <p className={styles.muted}>
                        Stock: <strong>{ctSource.stock}</strong>
                      </p>
                    );
                  } else if (typeof p.maxStock === 'number') {
                    return (
                      <p className={styles.muted}>
                        Stock: <strong>{p.maxStock}</strong>
                      </p>
                    );
                  }
                  return null;
                })()
              ) : (
                typeof p.maxStock === 'number' ? (
                  <p className={styles.muted}>
                    Stock: <strong>{p.maxStock}</strong>
                  </p>
                ) : null
              )}
              {p.description && <p className={styles.description}>{p.description}</p>}
              <div className={styles.cardActions}>
                {typeof p.id === 'string' || typeof p.id === 'number' ? (
                  <Link
                    href={`/tienda/${generateProductSlug(
                      String(p.name || "producto"),
                      typeof p.brand === 'string' ? p.brand : undefined,
                      String(p.id)
                    )}`}
                    className={styles.link}
                  >
                    Ver detalle
                  </Link>
                ) : (
                  <span className={styles.linkDisabled} title="Sin identificador único">Sin detalle</span>
                )}
                <button 
                  className={styles.buyBtn} 
                  onClick={() => addToCart(p)}
                  title="Agregar este producto al carrito"
                >
                  🛒 Agregar
                </button>
              </div>
            </div>
          </article>
          );
        })}
      </section>
    </div>
  );
}
