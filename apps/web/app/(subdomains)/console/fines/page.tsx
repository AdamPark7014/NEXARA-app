"use client";

import { useState } from "react";
import styles from "../console.module.css";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import FinesForm from "@/components/FinesForm";
import FinesTable from "@/components/FinesTable";
import { RoleGuard } from "@/components/RoleGuard";
import HelpTab from '@/components/HelpTab';

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

        {/* Tabla de multas - admin ve dos secciones */}
        {isAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>
              {isSuperAdmin ? "Todas las Multas" : "Multas"}
            </h2>
            <FinesTable key={refreshKey} showUser={isAdmin} />
          </div>
        )}

        {/* Admin también ve sus multas, usuarios normales solo ven las suyas */}
        {!isSuperAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>Mis Multas</h2>
            <FinesTable key={refreshKey} showUser={false} usuarioId={user?.id} />
          </div>
        )}
        <HelpTab module="fines" user={user} />
      </div>
    </RoleGuard>
  );
}
