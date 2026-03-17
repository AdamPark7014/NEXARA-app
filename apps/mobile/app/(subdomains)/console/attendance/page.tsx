"use client";

import HelpTab from '@/components/HelpTab';
import { useEffect, useState } from 'react';
import AttendanceForm from '../../../../components/AttendanceForm';
import ConsoleAttendanceTable from './ConsoleAttendanceTable';
import FinesTable from '../../../../components/FinesTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function AttendancePage() {
  const { user } = useUser();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  
  const isAdmin = hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE);
  const isSuperAdmin = user?.email && ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'].includes(user.email.toLowerCase());

  return (
    <RoleGuard permissions={[PERMISSIONS.ATTENDANCE_VIEW]}>
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', padding: isMobile ? 12 : 24 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 600, color: 'var(--primary)', marginBottom: isMobile ? 14 : 24 }}>
          📋 Gestión de Asistencia
        </h1>
        <HelpTab module="attendance" user={user} />
        <div style={{ display: 'grid', gap: 24 }}>
          {!isSuperAdmin && (
            <div>
              <h2 style={{ marginBottom: 16, fontSize: 20 }}>Mi Registro Diario</h2>
              <AttendanceForm />

              <div style={{ marginTop: 24 }}>
                <FinesTable tipo="asistencia" usuarioId={user?.id} showUser={false} />
              </div>
            </div>
          )}

          {isAdmin && (
            <div>
              <h2 style={{ marginBottom: 16, fontSize: 20 }}>
                {isSuperAdmin ? 'Asistencia de Todos los Usuarios' : 'Asistencia del Equipo'}
              </h2>
              <ConsoleAttendanceTable />
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
