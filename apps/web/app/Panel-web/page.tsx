"use client";

import styles from "./dashboard.module.css";

export default function Dashboard() {
  const stats = [
    { label: "Ingresos Totales", value: "$45,230", change: "+12.5%", icon: "💰" },
    { label: "Órdenes", value: "328", change: "+8.2%", icon: "📦" },
    { label: "Clientes", value: "1,245", change: "+15.3%", icon: "👥" },
    { label: "Conversión", value: "3.2%", change: "+2.1%", icon: "📈" },
  ];

  const recentOrders = [
    { id: 1, customer: "Juan García", product: "Laptop ACER", amount: "$1,299", status: "Completado", date: "2025-01-08" },
    { id: 2, customer: "María López", product: "Mouse USB", amount: "$45", status: "Pendiente", date: "2025-01-08" },
    { id: 3, customer: "Carlos Ruiz", product: "Monitor 27\"", amount: "$399", status: "Enviado", date: "2025-01-07" },
  ];

  return (
    <div className={styles.dashboard}>
      <h2 className={styles.sectionTitle}>Bienvenido al Panel de Administración</h2>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {stats.map((stat, idx) => (
          <div key={idx} className={styles.statCard}>
            <div className={styles.statIcon}>{stat.icon}</div>
            <div className={styles.statContent}>
              <p className={styles.statLabel}>{stat.label}</p>
              <h3 className={styles.statValue}>{stat.value}</h3>
              <span className={styles.statChange}>{stat.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Orders */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionSubtitle}>Órdenes Recientes</h3>
          <a href="#" className={styles.seeAll}>Ver todas</a>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Producto</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id}>
                  <td>{order.customer}</td>
                  <td>{order.product}</td>
                  <td className={styles.amount}>{order.amount}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[order.status.toLowerCase()]}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>{order.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Quick Actions */}
      <section className={styles.section}>
        <h3 className={styles.sectionSubtitle}>Acciones Rápidas</h3>
        <div className={styles.actionsGrid}>
          <button className={styles.actionBtn}>➕ Nueva Orden</button>
          <button className={styles.actionBtn}>👤 Nuevo Cliente</button>
          <button className={styles.actionBtn}>📊 Generar Reporte</button>
          <button className={styles.actionBtn}>⚙️ Configuración</button>
        </div>
      </section>
    </div>
  );
}
