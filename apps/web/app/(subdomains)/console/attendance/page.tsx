"use client";
import { useState } from 'react';
import AttendanceForm from '../../../../components/AttendanceForm';
import ConsoleAttendanceTable from './ConsoleAttendanceTable';
import FinesTable from '../../../../components/FinesTable';
import LunchBreakForm from '../../../../components/LunchBreakForm';
import LunchBreaksTable from '../../../../components/LunchBreaksTable';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

export default function AttendancePage() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'attendance' | 'lunch'>('attendance');
  const [lunchSubTab, setLunchSubTab] = useState<'checkin' | 'checkout' | 'history'>('checkin');
  const [refreshKey, setRefreshKey] = useState(0);
  
  const isAdmin = hasPermission(user, PERMISSIONS.ATTENDANCE_MANAGE);
  const isSuperAdmin = user?.email && ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'].includes(user.email.toLowerCase());

  return (
    <RoleGuard permissions={[PERMISSIONS.ATTENDANCE_VIEW]}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--primary)', marginBottom: 24 }}>
          📋 Gestión de Asistencia
        </h1>

        {/* Tabs principales */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '2px solid var(--muted)', paddingBottom: 0 }}>
          <button
            onClick={() => setActiveTab('attendance')}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              color: activeTab === 'attendance' ? 'var(--primary)' : 'var(--text-secondary)',
              border: 'none',
              borderBottom: activeTab === 'attendance' ? '3px solid var(--primary)' : '3px solid transparent',
              fontWeight: activeTab === 'attendance' ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: 15,
            }}
          >
            📅 {isSuperAdmin ? 'Entradas/Salidas de Todos' : isAdmin ? 'Entradas/Salidas de Equipo' : 'Mi Asistencia Diaria'}
          </button>
          <button
            onClick={() => setActiveTab('lunch')}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              color: activeTab === 'lunch' ? 'var(--primary)' : 'var(--text-secondary)',
              border: 'none',
              borderBottom: activeTab === 'lunch' ? '3px solid var(--primary)' : '3px solid transparent',
              fontWeight: activeTab === 'lunch' ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: 15,
            }}
          >
            🍽️ {isSuperAdmin ? 'Horas de Comida de Todos' : isAdmin ? 'Horas de Comida de Equipo' : 'Mi Hora de Comida'}
          </button>
        </div>

        {/* Contenido de Asistencia */}
        {activeTab === 'attendance' && (
          <div style={{ display: 'grid', gap: 24 }}>
            {/* Usuario normal y admin ven su formulario */}
            {!isSuperAdmin && (
              <div>
                <h2 style={{ marginBottom: 16, fontSize: 20 }}>Mi Registro Diario</h2>
                <AttendanceForm />
                
                <div style={{ marginTop: 24 }}>
                  <FinesTable tipo="asistencia" usuarioId={user?.id} showUser={false} />
                </div>
              </div>
            )}

            {/* Solo admins y superadmins ven tabla de otros usuarios */}
            {isAdmin && (
              <div>
                <h2 style={{ marginBottom: 16, fontSize: 20 }}>
                  {isSuperAdmin ? 'Asistencia de Todos los Usuarios' : 'Asistencia del Equipo'}
                </h2>
                <ConsoleAttendanceTable />
              </div>
            )}
          </div>
        )}

        {/* Contenido de Horas de Comida */}
        {activeTab === 'lunch' && (
          <div style={{ display: 'grid', gap: 24 }}>
            {/* Sub-tabs para usuarios normales y admins (NO superadmins) */}
            {!isSuperAdmin && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setLunchSubTab('checkin')}
                  style={{
                    padding: '10px 16px',
                    background: lunchSubTab === 'checkin' ? 'var(--primary)' : 'var(--bg-secondary)',
                    color: lunchSubTab === 'checkin' ? '#fff' : 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  📌 Entrada a Comida
                </button>
                <button
                  onClick={() => setLunchSubTab('checkout')}
                  style={{
                    padding: '10px 16px',
                    background: lunchSubTab === 'checkout' ? 'var(--primary)' : 'var(--bg-secondary)',
                    color: lunchSubTab === 'checkout' ? '#fff' : 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  ✅ Regreso al Trabajo
                </button>
                <button
                  onClick={() => setLunchSubTab('history')}
                  style={{
                    padding: '10px 16px',
                    background: lunchSubTab === 'history' ? 'var(--primary)' : 'var(--bg-secondary)',
                    color: lunchSubTab === 'history' ? '#fff' : 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  📋 {isAdmin ? 'Historial de Todos' : 'Mi Historial'}
                </button>
              </div>
            )}

            {/* Formularios - Solo para usuarios normales y admins (NO superadmins) */}
            {!isSuperAdmin && lunchSubTab === 'checkin' && (
              <LunchBreakForm
                key={`checkin-${refreshKey}`}
                isCheckin={true}
                onSuccess={() => {
                  setRefreshKey(prev => prev + 1);
                  setLunchSubTab('history');
                }}
              />
            )}

            {!isSuperAdmin && lunchSubTab === 'checkout' && (
              <LunchBreakForm
                key={`checkout-${refreshKey}`}
                isCheckin={false}
                onSuccess={() => {
                  setRefreshKey(prev => prev + 1);
                  setLunchSubTab('history');
                }}
              />
            )}

            {/* Tabla - Se muestra en tab history para usuarios/admins, o siempre para superadmins */}
            {(lunchSubTab === 'history' || isSuperAdmin) && (
              <LunchBreaksTable key={refreshKey} />
            )}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
