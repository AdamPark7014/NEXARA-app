import { RoleGuard } from '../../../components/RoleGuard';
import VehicleRequestForm from '../../../components/VehicleRequestForm';

export default function MyVehiclesPage() {
  // Aquí deberías obtener el id de la actividad seleccionada por el usuario
  // Para el ejemplo, se usa un id fijo
  const actividadId = 1;
  return (
    <RoleGuard minLevel={10} maxLevel={10}>
      <h2>Solicitar Vehículo</h2>
      <VehicleRequestForm actividadId={actividadId} />
    </RoleGuard>
  );
}
