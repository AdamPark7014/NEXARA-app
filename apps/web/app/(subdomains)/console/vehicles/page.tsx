"use client";
import VehicleTable from '../../../../components/VehicleTable';
import VehicleRequestForm from '@/components/VehicleRequestForm';
import MyVehiclesTable from '@/components/MyVehiclesTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function VehiclesPage() {
  const { user } = useUser();
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 24 }}>
        {/* Admin y superadmin ven tabla de gestion */}
        {isAdmin && (
          <div>
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>
                {isSuperAdmin ? 'Vehículos de Todos' : 'Gestión de Vehículos'}
              </h1>
              <p style={{ color: 'var(--text-secondary)' }}>
                Administra solicitudes, aprobaciones y evidencias de entrega/devolución.
              </p>
            </div>
            <VehicleTable />
          </div>
        )}

        {/* Usuario normal y admin (no superadmin) ven su formulario y tabla personal */}
        {!isSuperAdmin && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>Mis Vehículos</h1>
              <p style={{ color: 'var(--text-secondary)' }}>
                Solicita un vehículo y adjunta tu evidencia de entrega.
              </p>
            </div>
            <VehicleRequestForm />
            <MyVehiclesTable />
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
