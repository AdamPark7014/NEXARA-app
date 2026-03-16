"use client";
import React, { useEffect, useState } from 'react';
import { useUser } from '@/components/UserContext';
import LunchBreakForm from '@/components/LunchBreakForm';
import LunchBreaksTable from '@/components/LunchBreaksTable';
import HelpTab from '../../../../components/HelpTab';

const LunchBreakPage = () => {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'checkin' | 'checkout' | 'history'>('checkin');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!user) {
    return <div style={{ textAlign: 'center', padding: 20 }}>Cargando...</div>;
  }

  const isSuperAdmin = user?.isSuperAdmin;
  const isAdmin = user?.permissions?.includes('attendance.manage');

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? 12 : 24 }}>
      <HelpTab module="lunch-breaks" user={user} />
      <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 600, color: 'var(--primary)', marginBottom: isMobile ? 14 : 24 }}>
        🍽️ Gestión de Horas de Comida
      </h1>

      {/* Tabs - Se muestran para usuarios normales Y admins (NO para superadmins) */}
      {!isSuperAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => setActiveTab('checkin')}
            style={{
              padding: isMobile ? '12px 14px' : '10px 16px',
              background: activeTab === 'checkin' ? 'var(--primary)' : 'var(--bg-secondary)',
              color: activeTab === 'checkin' ? '#fff' : 'var(--text-primary)',
              border: 'none',
              borderRadius: 6,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              width: '100%',
              textAlign: 'center',
            }}
          >
            📌 Entrada a Comida
          </button>
          <button
            onClick={() => setActiveTab('checkout')}
            style={{
              padding: isMobile ? '12px 14px' : '10px 16px',
              background: activeTab === 'checkout' ? 'var(--primary)' : 'var(--bg-secondary)',
              color: activeTab === 'checkout' ? '#fff' : 'var(--text-primary)',
              border: 'none',
              borderRadius: 6,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              width: '100%',
              textAlign: 'center',
            }}
          >
            ✅ Regreso al Trabajo
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: isMobile ? '12px 14px' : '10px 16px',
              background: activeTab === 'history' ? 'var(--primary)' : 'var(--bg-secondary)',
              color: activeTab === 'history' ? '#fff' : 'var(--text-primary)',
              border: 'none',
              borderRadius: 6,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              width: '100%',
              textAlign: 'center',
            }}
          >
            📋 {isAdmin ? 'Historial de Todos' : 'Mi Historial'}
          </button>
        </div>
      )}

      {/* Formularios - Solo para usuarios normales y admins (NO superadmins) */}
      {!isSuperAdmin && activeTab === 'checkin' && (
        <LunchBreakForm
          key={`checkin-${refreshKey}`}
          isCheckin={true}
          onSuccess={() => {
            setRefreshKey(prev => prev + 1);
            setActiveTab('history');
          }}
        />
      )}

      {!isSuperAdmin && activeTab === 'checkout' && (
        <LunchBreakForm
          key={`checkout-${refreshKey}`}
          isCheckin={false}
          onSuccess={() => {
            setRefreshKey(prev => prev + 1);
            setActiveTab('history');
          }}
        />
      )}

      {/* Tabla - Se muestra en tab history para usuarios/admins, o siempre para superadmins */}
      {(activeTab === 'history' || isSuperAdmin) && (
        <LunchBreaksTable key={refreshKey} />
      )}
    </div>
  );
};

export default LunchBreakPage;
