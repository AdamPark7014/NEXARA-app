"use client";

import styles from "./tienda.module.css";

interface DescuentosTabProps {
  source: string;
}

export default function DescuentosTab({ source }: DescuentosTabProps) {
  const descuentos = [
    { id: 1, name: "Descuento Laptops", type: "Porcentaje", value: "15%", products: 15, start: "2025-01-01", end: "2025-02-01", status: "Activo", source: "nexara" },
    { id: 2, name: "Black Friday", type: "Fijo", value: "$50", products: 45, start: "2025-01-15", end: "2025-01-20", status: "Próximo", source: "nexara" },
    { id: 3, name: "Ofertas SYSCOM", type: "Porcentaje", value: "20%", products: 12, start: "2024-12-20", end: "2025-01-31", status: "Activo", source: "syscom" },
    { id: 4, name: "CT Aniversario", type: "Mixto", value: "10% + $25", products: 8, start: "2025-01-05", end: "2025-01-15", status: "Finalizado", source: "ct-internacional" },
    { id: 5, name: "Clearance", type: "Porcentaje", value: "30%", products: 20, start: "2025-01-10", end: "2025-01-25", status: "Activo", source: "nexara" },
  ];

  const filteredDescuentos = source === "todos" 
    ? descuentos 
    : descuentos.filter(d => d.source === source);

  const getStatusClass = (status: string) => {
    switch (status) {
      case "Activo":
        return styles.activo;
      case "Próximo":
        return styles.proximo;
      case "Finalizado":
        return styles.finalizado;
      default:
        return "";
    }
  };

  return (
    <div>
      <div className={styles.sectionHeader}>
        <h3 className={styles.subTitle}>🎁 Descuentos y Promociones</h3>
        <button className={styles.btnPrimary}>➕ Nueva Promoción</button>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Productos</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Estado</th>
              <th>Fuente</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredDescuentos.length > 0 ? (
              filteredDescuentos.map((descuento) => (
                <tr key={descuento.id}>
                  <td><strong>{descuento.name}</strong></td>
                  <td>{descuento.type}</td>
                  <td className={styles.price}><span className={styles.discountValue}>{descuento.value}</span></td>
                  <td className={styles.count}><span className={styles.badge}>{descuento.products}</span></td>
                  <td className={styles.date}>{descuento.start}</td>
                  <td className={styles.date}>{descuento.end}</td>
                  <td>
                    <span className={`${styles.badge} ${getStatusClass(descuento.status)}`}>
                      {descuento.status}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.sourceBadge} ${styles[descuento.source]}`}>
                      {descuento.source === "nexara" && "🏢 Nexara"}
                      {descuento.source === "syscom" && "📡 SYSCOM"}
                      {descuento.source === "ct-internacional" && "🌍 CT"}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    <button className={styles.btnSmall} title="Editar">✎</button>
                    <button className={styles.btnSmall} title="Ver detalles">👁️</button>
                    <button className={styles.btnSmall} title="Duplicar">📋</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className={styles.emptyMessage}>No hay descuentos disponibles para esta fuente</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
