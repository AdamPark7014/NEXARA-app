"use client";

import Sidebar from "./Sidebar";
import styles from "./panel.module.css";

export default function PanelLayout({ children }: { children: React.ReactNode }) {

  return (
    <div className={styles.panelContainer}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className={styles.mainContent}>
        <div className={styles.topBar}>
          <h1 className={styles.pageTitle}>Panel de Administración</h1>
          <div className={styles.topBarActions}>
            <input 
              type="text" 
              placeholder="Buscar..." 
              className={styles.searchInput}
              aria-label="Buscador"
            />
            <button 
              className={styles.notificationBtn}
              aria-label="Notificaciones"
            >
              🔔
            </button>
          </div>
        </div>

        <div className={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}
