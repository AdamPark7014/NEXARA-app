import { RoleGuard } from '../../../components/RoleGuard';
import ViaticRequestForm from '../../../components/ViaticRequestForm';

export default function MyViaticsPage() {
  // Aquí deberías obtener el id de la actividad seleccionada por el usuario
  // Para el ejemplo, se usa un id fijo
  const actividadId = 1;
  return (
    <RoleGuard minLevel={10} maxLevel={10}>
      <h2>Solicitar Viático</h2>
      <ViaticRequestForm actividadId={actividadId} />
    </RoleGuard>
  );
}
