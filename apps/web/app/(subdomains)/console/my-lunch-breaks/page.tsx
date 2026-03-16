"use client";
import React, { useState, useEffect } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import LunchBreakForm from '@/components/LunchBreakForm';
import LunchBreaksTable from '@/components/LunchBreaksTable';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

export default function MyLunchBreaksPage() {
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

  if (!user) return <div style={{ textAlign: 'center', padding: 20 }}>Cargando...</div>;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? 12 : 24 }}>
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>🍽️ Mis Breaks y Comidas</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Registra tu entrada y salida de comida, y consulta tu historial personal.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
          {(['checkin', 'checkout', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: isMobile ? '12px 14px' : '10px 16px',
                background: activeTab === tab ? 'var(--primary)' : 'var(--bg-secondary)',
                color: activeTab === tab ? '#fff' : 'var(--text-primary)',
                border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.2s', width: '100%', textAlign: 'center',
              }}
            >
              {tab === 'checkin' ? '📌 Entrada a Comida' : tab === 'checkout' ? '✅ Regreso al Trabajo' : '📋 Mi Historial'}
            </button>
          ))}
        </div>

        {activeTab === 'checkin' && (
          <LunchBreakForm
            key={`checkin-${refreshKey}`}
            isCheckin={true}
            onSuccess={() => { setRefreshKey(p => p + 1); setActiveTab('history'); }}
          />
        )}

        {activeTab === 'checkout' && (
          <LunchBreakForm
            key={`checkout-${refreshKey}`}
            isCheckin={false}
              <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
                <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? 12 : 24 }}>
                  <HelpTab module="my-lunch-breaks" user={user} />
                  <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                    <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>🍽️ Mis Breaks y Comidas</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      Registra tu entrada y salida de comida, y consulta tu historial personal.
                    </p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
                    {(['checkin', 'checkout', 'history'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                          padding: isMobile ? '12px 14px' : '10px 16px',
                          background: activeTab === tab ? 'var(--primary)' : 'var(--bg-secondary)',
                          color: activeTab === tab ? '#fff' : 'var(--text-primary)',
                          border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer',
                          transition: 'all 0.2s', width: '100%', textAlign: 'center',
                        }}
                      >
                        {tab === 'checkin' ? '📌 Entrada a Comida' : tab === 'checkout' ? '✅ Regreso al Trabajo' : '📋 Mi Historial'}
                      </button>
                    ))}
                  </div>
                  {activeTab === 'checkin' && (
                    <LunchBreakForm
                      key={`checkin-${refreshKey}`}
                      isCheckin={true}
                      onSuccess={() => { setRefreshKey(p => p + 1); setActiveTab('history'); }}
                    />
                  )}
                  {activeTab === 'checkout' && (
                    <LunchBreakForm
                      key={`checkout-${refreshKey}`}
                      isCheckin={false}
                      onSuccess={() => { setRefreshKey(p => p + 1); setActiveTab('history'); }}
                    />
                  )}
                  {activeTab === 'history' && (
                    <LunchBreaksTable key={refreshKey} />
                  )}
                </div>
              </RoleGuard>
            );
