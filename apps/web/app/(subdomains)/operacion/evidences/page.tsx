"use client";
import EvidenceTable from '../../../../components/EvidenceTable';
import ActivityEvidenceFlow from '@/components/ActivityEvidenceFlow';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

export default function EvidencesPage() {
  const { user } = useUser();
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <HelpTab module="evidences" user={user} />
        {/* Admin y superadmin ven tabla de gestion de todas las evidencias */}
        {isAdmin && (
          <EvidenceTable
            title={isSuperAdmin ? 'Evidencias de Todos - Revisión' : 'Evidencias del Equipo - Revisión'}
          />
        )}

        {/* Usuario normal y admin (no superadmin) ven su flujo de evidencias */}
        {!isSuperAdmin && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Mis Evidencias - Registro</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
                Sigue los 5 pasos para completar la evidencia de tu actividad.
              </p>
            </div>
            <ActivityEvidenceFlow />
            <div>
              <EvidenceTable mode="user" title="Historial de Mis Evidencias" />
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
