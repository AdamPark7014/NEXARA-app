"use client";
import React, { useEffect, useRef } from 'react';
import { useUser } from './UserContext';

// Nota: Para producción, usa un componente de mapa real como react-leaflet o google-maps-react
const GpsMap = () => {
  const { user } = useUser();
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    // Simulación: fetch de ubicaciones según rol
    // En producción, reemplaza por fetch('/api/gps', { headers: { Authorization: ... } })
    // y renderiza los pines en el mapa
  }, [user]);

  return (
    <div className="card">
      <h2 style={{ color: 'var(--primary)', marginBottom: 12 }}>Mapa GPS (Demo)</h2>
      <div
        ref={mapRef}
        style={{
          width: '100%',
          height: 400,
          background: 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          border: '1px solid var(--muted)',
        }}
      >
        <span style={{ color: 'var(--text-secondary)' }}>
          Mapa de ubicaciones aquí (solo visible según jerarquía)
        </span>
      </div>
    </div>
  );
};

export default GpsMap;
