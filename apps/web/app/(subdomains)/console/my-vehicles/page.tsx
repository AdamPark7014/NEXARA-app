import { RoleGuard } from '@/components/RoleGuard';
import VehicleRequestForm from '@/components/VehicleRequestForm';
import MyVehiclesTable from '@/components/MyVehiclesTable';
import { PERMISSIONS } from '@/lib/permissions';

export default function MyVehiclesPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>Mis Vehiculos</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Solicita un vehiculo y adjunta tu evidencia de entrega.
          </p>
        </div>
        <VehicleRequestForm />
        <MyVehiclesTable />
      </div>
    </RoleGuard>
  );
}
