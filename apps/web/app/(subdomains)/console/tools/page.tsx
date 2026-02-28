"use client";

import { useState } from "react";
import ToolRequestsTable from "@/components/ToolRequestsTable";
import MyToolsTable from "@/components/MyToolsTable";
import ToolRequestForm from "@/components/ToolRequestForm";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default function ToolsPage() {
  const { user } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;

  // DEBUG: Verificar valores
  console.log('🔍 DEBUG Tools Page:', {
    user: user?.nombre,
    isSuperAdmin,
    isAdmin,
    shouldShowForm: !isSuperAdmin
  });

  const handleRequestSuccess = () => {
    setRefreshKey((previous) => previous + 1);
  };

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: "grid", gap: 24 }}>
        {/* Admin y usuarios normales pueden solicitar herramienta. Superadmin no. */}
        {!isSuperAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>📝 Solicitar Herramienta</h2>
            <ToolRequestForm onSuccess={handleRequestSuccess} />
          </div>
        )}

        {/* Admin y superadmin ven tabla de gestion */}
        {isAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>
              {isSuperAdmin ? "🔧 Todas las Herramientas" : "🔧 Herramientas"}
            </h2>
            <ToolRequestsTable key={`admin-${refreshKey}`} />
          </div>
        )}

        {/* Solo usuarios normales y admins (no superadmin) ven sus herramientas */}
        {!isSuperAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>🔧 Mis Herramientas</h2>
            <MyToolsTable key={`my-tools-${refreshKey}`} />
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

