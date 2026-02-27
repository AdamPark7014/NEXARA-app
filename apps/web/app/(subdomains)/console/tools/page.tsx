"use client";

import ToolRequestsTable from "@/components/ToolRequestsTable";
import MyToolsTable from "@/components/MyToolsTable";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export default function ToolsPage() {
  const { user } = useUser();
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: "grid", gap: 24 }}>
        {/* Admin y superadmin ven tabla de gestion */}
        {isAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>
              {isSuperAdmin ? "🔧 Todas las Herramientas" : "🔧 Gestión de Herramientas"}
            </h2>
            <ToolRequestsTable />
          </div>
        )}

        {/* Todos ven su tabla personal de herramientas */}
        <div>
          <h2 style={{ marginBottom: 16 }}>🔧 Mis Herramientas</h2>
          <MyToolsTable />
        </div>
      </div>
    </RoleGuard>
  );
}

