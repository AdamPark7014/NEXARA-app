import { RoleGuard } from '../../../components/RoleGuard';

export default function MyActivitiesPage() {
  return (
    <RoleGuard minLevel={10} maxLevel={10}>
      <h2>Mis Actividades</h2>
      {/* Aquí iría la tabla de actividades filtrada solo para el staff/ingeniero logueado */}
    </RoleGuard>
  );
}
