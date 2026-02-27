"use client";

import { useState } from "react";
import styles from "../console.module.css";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import FinesForm from "@/components/FinesForm";
import FinesTable from "@/components/FinesTable";

export default function FinesPage() {
  const { user } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);

  if (!user) return null;

  // Solo admins y superadmins pueden acceder
  const isAdmin = hasPermission(user, PERMISSIONS.FINES_MANAGE);
  if (!isAdmin) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.accessDenied}>
          <p>⛔ No tienes permiso para acceder a este módulo</p>
        </div>
      </div>
    );
  }

  const handleFineCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1>📋 Gestión de Multas</h1>
        <p>
          {user?.isSuperAdmin
            ? "Panel de control: crear y administrar todas las multas del sistema"
            : "Panel de control: crear y administrar multas de tu departamento"}
        </p>
      </div>

      <div className={styles.toolsSection}>
        {/* Formulario para crear multas */}
        <div style={{ marginBottom: 32 }}>
          <FinesForm onFineCreated={handleFineCreated} />
        </div>

        {/* Tabla de todas las multas */}
        <div>
          <h2 style={{ marginBottom: 16, color: "var(--primary)" }}>
            {user?.isSuperAdmin ? "Todas las Multas" : "Multas Registradas"}
          </h2>
          <FinesTable key={refreshKey} showUser={true} />
        </div>
      </div>
    </div>
  );
}
