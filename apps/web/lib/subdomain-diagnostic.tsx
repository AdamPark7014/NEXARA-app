'use client';

import { useEffect, useState } from 'react';

/**
 * Componente de diagnóstico para verificar que el middleware está funcionando
 * Muestra información sobre el subdominio actual y ayuda a depurar problemas
 */

interface DiagnosticInfo {
  hostname: string;
  subdomain: string | null;
  currentPath: string;
  isProduction: boolean;
  status: 'working' | 'checking' | 'error';
  message: string;
}

export function SubdomainDiagnostic() {
  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo>({
    hostname: typeof window !== 'undefined' ? window.location.hostname : '',
    subdomain: null,
    currentPath: typeof window !== 'undefined' ? window.location.pathname : '',
    isProduction: typeof window !== 'undefined' ? !window.location.hostname.includes('localhost') : false,
    status: 'checking',
    message: 'Verificando configuración...',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const isProduction = !hostname.includes('localhost') && !hostname.includes('127.0.0.1');

    // Detectar subdominio
    let subdomain: string | null = null;
    const hostParts = hostname.split('.');

    if (isProduction) {
      // nexara.com.mx o subdominio.nexara.com.mx
      if (hostParts.length >= 3 && hostParts[0] !== 'www') {
        subdomain = hostParts[0];
      }
    } else {
      // Desarrollo local
      if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
        // En desarrollo, buscar parámetro o asumir que es localhost
        subdomain = null;
      }
    }

    let status: 'working' | 'checking' | 'error' = 'working';
    let message = 'Configuración correcta ✓';

    if (isProduction && !subdomain) {
      status = 'error';
      message = 'No se detectó subdominio en producción. Verifica tu DNS.';
    }

    setDiagnostic({
      hostname,
      subdomain,
      currentPath: pathname,
      isProduction,
      status,
      message,
    });
  }, []);

  const statusColor = {
    working: 'green',
    checking: 'orange',
    error: 'red',
  }[diagnostic.status];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        fontSize: '12px',
        fontFamily: 'monospace',
        maxWidth: '300px',
        zIndex: 9999,
        border: `2px solid ${statusColor}`,
      }}
    >
      <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
        🔍 Diagnóstico de Subdominio
      </div>
      <div>Host: <code>{diagnostic.hostname}</code></div>
      <div>
        Subdominio:{' '}
        <code style={{ color: statusColor }}>
          {diagnostic.subdomain || 'ninguno (dominio principal)'}
        </code>
      </div>
      <div>Ruta: <code>{diagnostic.currentPath}</code></div>
      <div>Ambiente: {diagnostic.isProduction ? 'Producción' : 'Desarrollo'}</div>
      <div style={{ marginTop: '8px', color: statusColor }}>
        {diagnostic.message}
      </div>
    </div>
  );
}

/**
 * Hook para usar información del subdominio en componentes
 */
export function useSubdomain() {
  const [subdomain, setSubdomain] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hostname = window.location.hostname;
    const hostParts = hostname.split('.');
    const isProduction = !hostname.includes('localhost') && !hostname.includes('127.0.0.1');

    let detected: string | null = null;

    if (isProduction && hostParts.length >= 3 && hostParts[0] !== 'www') {
      detected = hostParts[0];
    }

    setSubdomain(detected);
  }, []);

  return subdomain;
}
