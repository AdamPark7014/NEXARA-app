import { RoleGuard } from '@/components/RoleGuard';
import EvidenceUploader from '@/components/EvidenceUploader';
import EvidenceTable from '@/components/EvidenceTable';
import { PERMISSIONS } from '@/lib/permissions';

export default function MyEvidencesPage() {
  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Mis Evidencias</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
          Selecciona una actividad y agrega comentarios y fotos para tu evidencia.
        </p>
        <EvidenceUploader />
      </div>
      <EvidenceTable mode="user" />
    </RoleGuard>
  );
}
