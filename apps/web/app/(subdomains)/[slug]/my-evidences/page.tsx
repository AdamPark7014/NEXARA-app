import { RoleGuard } from '@/components/RoleGuard';
import ActivityEvidenceFlow from '@/components/ActivityEvidenceFlow';
import EvidenceTable from '@/components/EvidenceTable';
import { PERMISSIONS } from '@/lib/permissions';

export default function MyEvidencesPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Mis Evidencias</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
          Sigue los 5 pasos para completar la evidencia de tu actividad.
        </p>
      </div>
      <ActivityEvidenceFlow />
      <EvidenceTable mode="user" />
    </RoleGuard>
  );
}
