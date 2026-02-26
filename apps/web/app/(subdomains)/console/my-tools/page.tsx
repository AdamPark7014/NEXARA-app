"use client";
import React, { useState } from 'react';
import MyToolsTable from '@/components/MyToolsTable';
import ToolRequestForm from '@/components/ToolRequestForm';

export default function MyToolsPage() {
  const [showForm, setShowForm] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--primary)' }}>Gestión de Herramientas</h1>
        {!showForm && (
          <button
            className="button-primary"
            onClick={() => setShowForm(true)}
          >
            + Solicitar Herramienta
          </button>
        )}
      </div>

      {showForm ? (
        <ToolRequestForm
          onSuccess={() => {
            setShowForm(false);
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      ) : (
        <MyToolsTable />
      )}
    </div>
  );
}
