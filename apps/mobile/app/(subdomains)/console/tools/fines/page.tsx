"use client";

import { useState } from "react";
import styles from "../../console.module.css";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import HelpTab from '@/components/HelpTab';

export default function FinesManagementPage() {
  const { user } = useUser();
  const [showForm, setShowForm] = useState(false);

  if (!user) return null;

  // Solo admins pueden acceder
  if (!hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.accessDenied}>
          <p>No tienes permiso para acceder a este módulo</p>
        </div>
      </div>
    );
  }

  const fineReasons = [
    { id: "activity", label: "Incumplimiento de actividades" },
    { id: "attendance", label: "No llegar a laborar" },
    { id: "late", label: "Llegada tardía a laborar" },
    { id: "vehicle", label: "Daño a vehículo de la empresa" },
    { id: "tool", label: "Daño de herramienta" },
  ];

  return (
    <div className={styles.pageContainer}>
      <HelpTab module="tools-fines" user={user} />
      <div className={styles.pageHeader}>
        <h1>Gestión de Multas</h1>
        <p>Crear y administrar multas asignadas a usuarios</p>
      </div>

      <div className={styles.toolsSection}>
        <div className={styles.toolsHeader}>
          <h2>Crear Nueva Multa</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className={styles.primaryButton}
          >
            {showForm ? "Cerrar formulario" : "Nueva multa"}
          </button>
        </div>

        {showForm && (
          <div className={styles.formCard}>
            <form className={styles.fineForm}>
              <div className={styles.formGroup}>
                <label htmlFor="user">Usuario</label>
                <input
                  type="text"
                  id="user"
                  placeholder="Buscar usuario..."
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="reason">Motivo de la multa</label>
                <select id="reason" className={styles.formInput}>
                  <option value="">Selecciona un motivo</option>
                  {fineReasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="amount">Monto de la multa</label>
                <input
                  type="number"
                  id="amount"
                  placeholder="0.00"
                  className={styles.formInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="description">Descripción</label>
                <textarea
                  id="description"
                  placeholder="Detalles adicionales de la multa..."
                  className={styles.formInput}
                  rows={4}
                />
              </div>

              <div className={styles.formActions}>
                <button type="submit" className={styles.primaryButton}>
                  Crear multa
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className={styles.secondaryButton}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className={styles.toolsSection}>
        <h2>Multas Asignadas</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Motivo</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className={styles.emptyTableMessage}>
                  No hay multas registradas
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
