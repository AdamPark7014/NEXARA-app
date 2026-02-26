"use client";
import React, { useState } from 'react';
import { useUser } from '@/components/UserContext';
import LunchBreakForm from '@/components/LunchBreakForm';
import LunchBreaksTable from '@/components/LunchBreaksTable';

const LunchBreakPage = () => {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'checkin' | 'checkout' | 'history'>('checkin');
  const [refreshKey, setRefreshKey] = useState(0);

  if (!user) {
    return <div style={{ textAlign: 'center', padding: 20 }}>Cargando...</div>;
  }

  const isSuperAdmin = user?.isSuperAdmin;
  const isAdmin = user?.permissions?.includes('attendance.manage');

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--primary)', marginBottom: 24 }}>
        🍽️ Gestión de Horas de Comida
      </h1>

      {/* Tabs para usuarios normales */}
      {!isSuperAdmin && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('checkin')}
            style={{
              padding: '10px 16px',
              background: activeTab === 'checkin' ? 'var(--primary)' : 'var(--bg-secondary)',
              color: activeTab === 'checkin' ? '#fff' : 'var(--text-primary)',
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
            onClick={() => setActiveTab('checkout')}
            style={{
              padding: '10px 16px',
              background: activeTab === 'checkout' ? 'var(--primary)' : 'var(--bg-secondary)',
              color: activeTab === 'checkout' ? '#fff' : 'var(--text-primary)',
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
            onClick={() => setActiveTab('history')}
            style={{
              padding: '10px 16px',
              background: activeTab === 'history' ? 'var(--primary)' : 'var(--bg-secondary)',
              color: activeTab === 'history' ? '#fff' : 'var(--text-primary)',
              border: 'none',
              borderRadius: 6,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            📋 Mi Historial
          </button>
        </div>
      )}

      {/* Contenido */}
      {activeTab === 'checkin' && (
        <LunchBreakForm
          key={`checkin-${refreshKey}`}
          isCheckin={true}
          onSuccess={() => {
            setRefreshKey(prev => prev + 1);
            setActiveTab('history');
          }}
        />
      )}

      {activeTab === 'checkout' && (
        <LunchBreakForm
          key={`checkout-${refreshKey}`}
          isCheckin={false}
          onSuccess={() => {
            setRefreshKey(prev => prev + 1);
            setActiveTab('history');
          }}
        />
      )}

      {(activeTab === 'history' || isAdmin || isSuperAdmin) && (
        <LunchBreaksTable key={refreshKey} />
      )}
    </div>
  );
};

export default LunchBreakPage;
