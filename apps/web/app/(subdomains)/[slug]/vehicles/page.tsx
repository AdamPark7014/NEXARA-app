import VehicleTable from '../../../../components/VehicleTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';

export default function VehiclesPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>Vehiculos</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Administra solicitudes, aprobaciones y evidencias de entrega/devolucion.
          </p>
        </div>
        <VehicleTable />
      </div>
    </RoleGuard>
  );
}
