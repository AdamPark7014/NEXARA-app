import { RoleGuard } from '../../../components/RoleGuard';
import AttendanceForm from '../../../components/AttendanceForm';

export default function AttendancePage() {
  return (
    <RoleGuard minLevel={10} maxLevel={10}>
      <AttendanceForm />
    </RoleGuard>
  );
}
