"use client";
import ViaticTable from '../../../../components/ViaticTable';
import ViaticRequestForm from '@/components/ViaticRequestForm';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function ViaticsPage() {
  const { user } = useUser();
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;
  // Para el formulario de usuario, usamos un actividadId fijo o extraído de contexto
  const actividadId = 1;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 24 }}>
        {/* Admin y superadmin ven tabla de gestion */}
        {isAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>{isSuperAdmin ? 'Viáticos de Todos' : 'Gestión de Viáticos'}</h2>
            <ViaticTable />
          </div>
        )}

        {/* Usuario normal y admin (no superadmin) ven su formulario de solicitud */}
        {!isSuperAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>Solicitar Viático</h2>
            <ViaticRequestForm actividadId={actividadId} />
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
