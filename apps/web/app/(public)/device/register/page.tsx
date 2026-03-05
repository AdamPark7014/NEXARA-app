"use client";

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { saveDeviceIdentity } from '@/lib/device-identity';

function DeviceRegisterContent() {
  const params = useSearchParams();

  const result = useMemo(() => {
    const name = params.get('name') || '';
    const model = params.get('model') || '';
    const serial = params.get('serial') || '';

    if (!name && !model && !serial) {
      return { ok: false, message: 'Missing params: name, model, serial' };
    }

    saveDeviceIdentity({
      name,
      model,
      serial,
      source: 'windows-agent',
    });

    return {
      ok: true,
      name,
      model,
      serial,
    };
  }, [params]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1e3a', color: '#e7f1ff', padding: '24px' }}>
      <section style={{ width: '100%', maxWidth: '640px', border: '1px solid rgba(149,183,231,.35)', borderRadius: '14px', background: 'rgba(12,35,70,.9)', padding: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px' }}>Device Registration</h1>
        {!result.ok ? (
          <p style={{ marginTop: '12px', color: '#ffd7d7' }}>{result.message}</p>
        ) : (
          <>
            <p style={{ marginTop: '12px', color: '#b9cff0' }}>Device identity saved for this browser.</p>
            <ul style={{ marginTop: '12px', lineHeight: 1.8 }}>
              <li><strong>Name:</strong> {result.name || 'n/a'}</li>
              <li><strong>Model:</strong> {result.model || 'n/a'}</li>
              <li><strong>Serial:</strong> {result.serial || 'n/a'}</li>
            </ul>
            <a href="/auth/login" style={{ display: 'inline-block', marginTop: '16px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(149,183,231,.5)', color: '#e7f1ff', textDecoration: 'none' }}>
              Go to Login
            </a>
          </>
        )}
      </section>
    </main>
  );
}

export default function DeviceRegisterPage() {
  return (
    <Suspense fallback={null}>
      <DeviceRegisterContent />
    </Suspense>
  );
}
