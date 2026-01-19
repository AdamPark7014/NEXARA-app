"use client";

import styles from "./tienda.module.css";

interface CategoriasTabProps {
  source: string;
}

export default function CategoriasTab({ source }: CategoriasTabProps) {
  const categorias = [
    { id: 1, name: "Laptops", count: 15, products: "Computadoras portátiles", status: "Activa", source: "nexara" },
    { id: 2, name: "Periféricos", count: 45, products: "Mouse, teclados, etc.", status: "Activa", source: "nexara" },
    { id: 3, name: "Monitores", count: 8, products: "Pantallas LCD/LED", status: "Activa", source: "syscom" },
    { id: 4, name: "Cables y Adaptadores", count: 60, products: "Conectividad", status: "Activa", source: "ct-internacional" },
    { id: 5, name: "Accesorios", count: 32, products: "Diversos accesorios", status: "Activa", source: "nexara" },
  ];

  const filteredCategorias = source === "todos" 
    ? categorias 
    : categorias.filter(c => c.source === source);

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h3 className={styles.subTitle}>🏷️ Categorías</h3>
        <button className={styles.btnPrimary}>➕ Nueva Categoría</button>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Productos</th>
              <th>Descripción</th>
              <th>Estado</th>
              <th>Fuente</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredCategorias.length > 0 ? (
              filteredCategorias.map((categoria) => (
                <tr key={categoria.id}>
                  <td><strong>{categoria.name}</strong></td>
                  <td className={styles.count}><span className={styles.badge}>{categoria.count}</span></td>
                  <td>{categoria.products}</td>
                  <td>
                    <span className={`${styles.badge} ${styles.activa}`}>
                      {categoria.status}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.sourceBadge} ${styles[categoria.source]}`}>
                      {categoria.source === "nexara" && "🏢 Nexara"}
                      {categoria.source === "syscom" && "📡 SYSCOM"}
                      {categoria.source === "ct-internacional" && "🌍 CT"}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    <button className={styles.btnSmall} title="Editar">✎</button>
                    <button className={styles.btnSmall} title="Ver productos">👁️</button>
                    <button className={styles.btnSmall} title="Eliminar">🗑️</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className={styles.emptyMessage}>No hay categorías disponibles para esta fuente</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
