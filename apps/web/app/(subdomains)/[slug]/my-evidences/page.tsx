import { RoleGuard } from '@/components/RoleGuard';
import ActivityEvidenceFlow from '@/components/ActivityEvidenceFlow';
import EvidenceTable from '@/components/EvidenceTable';
import { PERMISSIONS } from '@/lib/permissions';

export default function MyEvidencesPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: 'grid', gap: 16, paddingBottom: 'calc(var(--console-bottom-nav-clearance, 0px) + 20px)' }}>
        <div className="card" style={{ padding: 14 }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>📸 Mis Evidencias</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Sigue los 5 pasos para completar la evidencia de tu actividad.
          </p>
        </div>
        <ActivityEvidenceFlow />
        <EvidenceTable mode="user" title="Historial de Mis Evidencias" />
      </div>
    </RoleGuard>
  );
}
