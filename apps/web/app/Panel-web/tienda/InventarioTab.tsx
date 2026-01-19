"use client";

import styles from "./tienda.module.css";

interface InventarioTabProps {
  source: string;
}

export default function InventarioTab({ source }: InventarioTabProps) {
  const inventario = [
    { id: 1, product: "Laptop ACER", sku: "ACER-001", stock: 45, min: 20, max: 100, status: "Óptimo", source: "nexara" },
    { id: 2, product: "Mouse USB", sku: "MOUSE-001", stock: 120, min: 50, max: 200, status: "Óptimo", source: "nexara" },
    { id: 3, product: "Monitor 27\"", sku: "MON-001", stock: 12, min: 10, max: 50, status: "Bajo", source: "syscom" },
    { id: 4, product: "Teclado Mecánico", sku: "KEY-001", stock: 8, min: 15, max: 60, status: "Crítico", source: "ct-internacional" },
    { id: 5, product: "Cable HDMI", sku: "HDMI-001", stock: 250, min: 100, max: 500, status: "Óptimo", source: "nexara" },
  ];

  const filteredInventario = source === "todos" 
    ? inventario 
    : inventario.filter(i => i.source === source);

  const getStatusClass = (status: string) => {
    switch (status) {
      case "Óptimo":
        return styles.optimo;
      case "Bajo":
        return styles.bajo;
      case "Crítico":
        return styles.critico;
      default:
        return "";
    }
  };

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h3 className={styles.subTitle}>📊 Inventario</h3>
        <button className={styles.btnPrimary}>📤 Generar Reporte</button>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Stock Actual</th>
              <th>Stock Mín</th>
              <th>Stock Máx</th>
              <th>Estado</th>
              <th>Fuente</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventario.length > 0 ? (
              filteredInventario.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.product}</strong></td>
                  <td className={styles.sku}>{item.sku}</td>
                  <td className={`${styles.stock} ${getStatusClass(item.status)}`}>{item.stock}</td>
                  <td>{item.min}</td>
                  <td>{item.max}</td>
                  <td>
                    <span className={`${styles.badge} ${getStatusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.sourceBadge} ${styles[item.source]}`}>
                      {item.source === "nexara" && "🏢 Nexara"}
                      {item.source === "syscom" && "📡 SYSCOM"}
                      {item.source === "ct-internacional" && "🌍 CT"}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    <button className={styles.btnSmall} title="Editar stock">✎</button>
                    <button className={styles.btnSmall} title="Ver historial">📊</button>
                    <button className={styles.btnSmall} title="Alertas">🔔</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className={styles.emptyMessage}>No hay inventario disponible para esta fuente</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
