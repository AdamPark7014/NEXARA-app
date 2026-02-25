"use client";

import { useState } from "react";
import styles from "../../console.module.css";
import { useUser } from "@/components/UserContext";
import { hasAnyPermission, PERMISSIONS } from "@/lib/permissions";

export default function MyToolsPage() {
  const { user } = useUser();
  const [showRequest, setShowRequest] = useState(false);

  if (!user) return null;

  const canView = hasAnyPermission(user, [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN]);
  if (!canView) return null;

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1>Mis herramientas</h1>
        <p>Solicita y revisa las herramientas que tienes asignadas</p>
      </div>

      <div className={styles.toolsSection}>
        <div className={styles.toolsHeader}>
          <h2>Solicitar herramienta</h2>
          <button className={styles.primaryButton} onClick={() => setShowRequest(!showRequest)}>
            {showRequest ? "Cerrar solicitud" : "Nueva solicitud"}
          </button>
        </div>

        {showRequest && (
          <div className={styles.formCard}>
            <form className={styles.fineForm}>
              <div className={styles.formGroup}>
                <label htmlFor="tool">Herramienta requerida</label>
                <input id="tool" className={styles.formInput} placeholder="Ej. Taladro, Laptop, Equipo de seguridad" />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="reason">Motivo de uso</label>
                <textarea id="reason" className={styles.formInput} rows={3} placeholder="Describe para qué la necesitas" />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="period">Periodo estimado</label>
                <input id="period" className={styles.formInput} placeholder="Ej. 3 días" />
              </div>
              <div className={styles.formActions}>
                <button type="submit" className={styles.primaryButton}>Enviar solicitud</button>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowRequest(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className={styles.toolsSection}>
        <h2>Herramientas en uso</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Herramienta</th>
                <th>Fecha préstamo</th>
                <th>Fecha devolución</th>
                <th>Estado</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className={styles.emptyTableMessage}>No tienes herramientas asignadas</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
