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
              {isSuperAdmin ? "🔧 Todas las Herramientas" : "🔧 Herramientas"}
            </h2>
            <ToolRequestsTable />
          </div>
        )}

        {/* Solo usuarios normales y admins (no superadmin) ven sus herramientas */}
        {!isSuperAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>🔧 Mis Herramientas</h2>
            <MyToolsTable />
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

