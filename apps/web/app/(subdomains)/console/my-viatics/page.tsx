"use client";
import ViaticRequestForm from '@/components/ViaticRequestForm';
import { RoleGuard } from '../../../../components/RoleGuard';
import { PERMISSIONS } from '@/lib/permissions';

export default function MyViaticsPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>💰 Mis Viáticos</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Solicita viáticos para tus actividades y da seguimiento a tus solicitudes.
          </p>
        </div>
        <ViaticRequestForm actividadId={1} />
      </div>
    </RoleGuard>
  );
}
