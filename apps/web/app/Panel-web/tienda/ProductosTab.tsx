"use client";

import styles from "./tienda.module.css";
import { useEffect, useState } from "react";
import { fetchCTProducts } from "./fetchCTProducts";
import type { Producto } from "./fetchCTProducts";

interface ProductosTabProps {
  source: string;
}
export default function ProductosTab({ source }: ProductosTabProps) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(false);

  // Espacio para futuras APIs
  async function fetchAllProducts() {
    // Cargar productos de CT
    const ct = await fetchCTProducts();
    // Aquí puedes agregar fetchs de otras APIs y concatenar los resultados
    // const syscom = await fetchSyscomProducts();
    // const nexara = await fetchNexaraProducts();
    // return [...ct, ...syscom, ...nexara];
    return ct;
  }

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      if (source === "ct-internacional") {
        const prods = await fetchCTProducts();
        if (!ignore) setProductos(prods);
      } else if (source === "todos") {
        const all = await fetchAllProducts();
        if (!ignore) setProductos(all);
      } else {
        // Ejemplo estático para otras fuentes
        const ejemplo: Producto[] = [
          { id: "1", name: "Laptop ACER", sku: "ACER-001", price: 1299, sources: [{ supplier: "nexara", stock: 45 }] },
          { id: "2", name: "Mouse USB", sku: "MOUSE-001", price: 45, sources: [{ supplier: "nexara", stock: 120 }] },
          { id: "3", name: "Monitor 27\"", sku: "MON-001", price: 399, sources: [{ supplier: "syscom", stock: 12 }] },
          { id: "4", name: "Teclado Mecánico", sku: "KEY-001", price: 150, sources: [{ supplier: "ct-internacional", stock: 8 }] },
          { id: "5", name: "Cable HDMI", sku: "HDMI-001", price: 25, sources: [{ supplier: "nexara", stock: 250 }] },
        ];
        setProductos(ejemplo.filter(p => p.sources?.some(s => s.supplier === source)));
      }
      setLoading(false);
    }
    load();
    return () => { ignore = true; };
  }, [source]);

  // Espacio para lógica de agregar producto
  function handleAgregarProducto() {
    // Aquí puedes abrir un modal o navegar a un formulario de alta
    alert('Funcionalidad para agregar producto próximamente.');
  }

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h3 className={styles.subTitle}>📦 Productos</h3>
        <button className={styles.btnPrimary} onClick={handleAgregarProducto}>➕ Agregar Producto</button>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>SKU</th>
              <th>Mejor Precio</th>
              <th>Mayor Stock</th>
              <th>Proveedores</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className={styles.emptyMessage}>Cargando productos...</td></tr>
            ) : productos.length > 0 ? (
              productos.map((product) => {
                // Mostrar todos los proveedores con stock y precio
                const sources = Array.isArray(product.sources) ? product.sources : [];
                return (
                  <tr key={product.id}>
                    <td><strong>{product.name}</strong></td>
                    <td className={styles.sku}>{product.sku}</td>
                    <td className={styles.price}>
                      {product.price !== undefined ? `$${Number(product.price).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-'}
                    </td>
                    <td className={styles.stock}>
                      {Array.isArray(product.sources) && product.sources.length > 0
                        ? (() => {
                            const allStocks = product.sources.map(s => {
                              if (typeof s.stock === 'number') return s.stock;
                              if (typeof s.stock === 'object' && s.stock !== null) {
                                return Object.values(s.stock).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
                              }
                              return 0;
                            });
                            const maxStock = Math.max(...allStocks);
                            return isFinite(maxStock) ? maxStock : '-';
                          })()
                        : '-'}
                    </td>
                    <td>
                      {sources.length > 0 ? (
                        <ul className={styles.supplierList}>
                          {sources.map((src: { supplier?: string; stock?: number | Record<string, number>; price?: number }, idx: number) => {
                            let stockTotal: number | string = '-';
                            if (typeof src.stock === 'object' && src.stock !== null) {
                              stockTotal = Object.values(src.stock as Record<string, number>).reduce(
                                (sum: number, v: number) => sum + (typeof v === 'number' ? v : 0),
                                0
                              );
                            } else if (typeof src.stock === 'number') {
                              stockTotal = src.stock;
                            }
                            return (
                              <li key={idx}>
                                <span className={styles.supplierName}>{src.supplier}:</span> 
                                <span className={styles.supplierPrice}>${src.price?.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2}) ?? '-'}</span> / 
                                <span className={styles.supplierStock}>Stock: {stockTotal}</span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : '-'}
                    </td>
                    <td className={styles.actions}>
                      {product.sources?.some(s => s.supplier === "nexara") && (
                        <>
                          <button className={styles.btnSmall} title="Editar">✎</button>
                          <button className={styles.btnSmall} title="Eliminar">🗑️</button>
                        </>
                      )}
                      <button className={styles.btnSmall} title="Ver">👁️</button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className={styles.emptyMessage}>No hay productos disponibles para esta fuente</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
