import { RoleGuard } from '../../../components/RoleGuard';
import EvidenceUploader from '../../../components/EvidenceUploader';

export default function MyEvidencesPage() {
  // Aquí deberías obtener el id de la actividad seleccionada por el usuario
  // Para el ejemplo, se usa un id fijo
  const actividadId = 1;
  return (
    <RoleGuard minLevel={10} maxLevel={10}>
      <h2>Subir Evidencia</h2>
      <EvidenceUploader actividadId={actividadId} />
    </RoleGuard>
  );
}
