"use client";
import VehicleRequestForm from '@/components/VehicleRequestForm';
import MyVehiclesTable from '@/components/MyVehiclesTable';
import FinesTable from '../../../../components/FinesTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';

export default function MyVehiclesPage() {
  const { user } = useUser();

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>🚗 Mis Vehículos</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Solicita un vehículo y adjunta tu evidencia de entrega.
          </p>
        </div>
        <VehicleRequestForm />
        <MyVehiclesTable />
        <div style={{ marginTop: 24 }}>
          <FinesTable tipo="vehiculo" usuarioId={user?.id} showUser={false} />
        </div>
      </div>
    </RoleGuard>
  );
}
