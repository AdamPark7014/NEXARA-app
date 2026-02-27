"use client";

import { useState } from "react";
import styles from "../console.module.css";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import FinesForm from "@/components/FinesForm";
import FinesTable from "@/components/FinesTable";
import { RoleGuard } from "@/components/RoleGuard";

export default function FinesPage() {
  const { user } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;

  const handleFineCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: "grid", gap: 24 }}>
        {/* Admin y superadmin ven formulario y tabla de gestión */}
        {isAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>
              {isSuperAdmin ? "📋 Gestión de Multas" : "📋 Crear Multa"}
            </h2>
            <FinesForm onFineCreated={handleFineCreated} />
          </div>
        )}

        {/* Tabla de multas - todos ven contenido dinámico */}
        <div>
          <h2 style={{ marginBottom: 16 }}>
            {isAdmin 
              ? (isSuperAdmin ? "Todas las Multas" : "Multas Registradas")
              : "Mis Multas"
            }
          </h2>
          <FinesTable key={refreshKey} showUser={isAdmin} />
        </div>
      </div>
    </RoleGuard>
  );
}
