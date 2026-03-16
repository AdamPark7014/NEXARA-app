"use client";

import { useEffect, useState } from "react";
import ToolRequestsTable from "@/components/ToolRequestsTable";
import MyToolsTable from "@/components/MyToolsTable";
import ToolRequestForm from "@/components/ToolRequestForm";
import ToolMyKitPanel from "@/components/ToolMyKitPanel";
import ToolInventoryPanel from "@/components/ToolInventoryPanel";
import ToolUserKitPanel from "@/components/ToolUserKitPanel";
import FinesTable from "@/components/FinesTable";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import HelpTab from '@/components/HelpTab';

export default function ToolsPage() {
  const { user } = useUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const isAdmin = hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
  const isSuperAdmin = user?.isSuperAdmin;
  const [activeTab, setActiveTab] = useState<'request' | 'my-kit' | 'manage' | 'inventory' | 'fines'>(
    isSuperAdmin ? 'inventory' : 'request',
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setActiveTab(isSuperAdmin ? 'inventory' : 'request');
  }, [isSuperAdmin]);

  const handleRequestSuccess = () => {
    setRefreshKey((previous) => previous + 1);
  };

  const canSeeManagement = isAdmin || isSuperAdmin;

  const tabButtonStyle = (tab: typeof activeTab) => ({
    padding: isMobile ? '12px 14px' : '10px 16px',
    background: activeTab === tab ? 'var(--primary)' : 'var(--bg-secondary)',
    color: activeTab === tab ? '#fff' : 'var(--text-primary)',
    border: 'none',
    borderRadius: 8,
    fontWeight: 500,
    cursor: 'pointer',
    width: '100%',
    transition: 'all 0.2s',
  }) as React.CSSProperties;

  return (
    <RoleGuard permissions={[PERMISSIONS.CONSOLE_ACCESS]}>
      <div style={{ display: "grid", gap: 18 }}>
        <h1 style={{ color: 'var(--primary)', marginBottom: 0 }}>🧰 Gestión de Herramientas</h1>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
          {!isSuperAdmin && (
            <>
              <button onClick={() => setActiveTab('request')} style={tabButtonStyle('request')}>
                📝 Solicitar
              </button>
              <button onClick={() => setActiveTab('my-kit')} style={tabButtonStyle('my-kit')}>
                🧰 Mi Kit
              </button>
            </>
          )}

          {canSeeManagement && (
            <>
              <button onClick={() => setActiveTab('manage')} style={tabButtonStyle('manage')}>
                👥 Usuarios
              </button>
              <button onClick={() => setActiveTab('inventory')} style={tabButtonStyle('inventory')}>
                🏭 Inventario
              </button>
              <button onClick={() => setActiveTab('fines')} style={tabButtonStyle('fines')}>
                💸 Multas
              </button>
            </>
          )}
        </div>

        {!isSuperAdmin && activeTab === 'request' && (
          <div style={{ display: 'grid', gap: 24 }}>
            <ToolRequestForm onSuccess={handleRequestSuccess} />
            <MyToolsTable key={`my-tools-${refreshKey}`} />
          </div>
        )}

        {!isSuperAdmin && activeTab === 'my-kit' && <ToolMyKitPanel />}

        {canSeeManagement && activeTab === 'manage' && (
          <div style={{ display: 'grid', gap: 24 }}>
            <ToolUserKitPanel />
            <ToolRequestsTable key={`admin-requests-${refreshKey}`} />
          </div>
        )}

        {canSeeManagement && activeTab === 'inventory' && <ToolInventoryPanel />}

        {canSeeManagement && activeTab === 'fines' && (
          <FinesTable tipo="herramienta" showUser={true} />
        )}
        <HelpTab module="tools" user={user} />
      </div>
    </RoleGuard>
  );
}

