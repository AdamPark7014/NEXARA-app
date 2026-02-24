"use client";
import EvidenceTable from '../../../../components/EvidenceTable';
import ActivityEvidenceFlow from '@/components/ActivityEvidenceFlow';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function EvidencesPage() {
  const { user } = useUser();
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 24 }}>
        {/* Admin y superadmin ven tabla de gestion de todas las evidencias */}
        {isAdmin && (
          <div>
            <h2 style={{ marginBottom: 16 }}>{isSuperAdmin ? 'Evidencias de Todos' : 'Gestión de Evidencias'}</h2>
            <EvidenceTable />
          </div>
        )}

        {/* Usuario normal y admin (no superadmin) ven su flujo de evidencias */}
        {!isSuperAdmin && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Mis Evidencias</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                Sigue los 5 pasos para completar la evidencia de tu actividad.
              </p>
            </div>
            <ActivityEvidenceFlow />
            <EvidenceTable mode="user" />
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
