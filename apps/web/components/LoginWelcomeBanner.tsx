"use client";

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'nexara_login_greeting';

export default function LoginWelcomeBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const greeting = window.sessionStorage.getItem(STORAGE_KEY);
    if (!greeting) return;

    setMessage(greeting);
    window.sessionStorage.removeItem(STORAGE_KEY);

    const timer = window.setTimeout(() => {
      setMessage(null);
    }, 7000);

    return () => window.clearTimeout(timer);
  }, []);

  if (!message) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9999,
        maxWidth: 420,
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid rgba(15,106,214,0.22)',
        background: 'linear-gradient(135deg, rgba(15,106,214,0.16), rgba(22,169,110,0.14))',
        color: 'var(--foreground)',
        boxShadow: '0 10px 24px rgba(7, 24, 52, 0.24)',
        fontSize: 13,
      }}
      role="status"
      aria-live="polite"
    >
      <strong style={{ display: 'block', marginBottom: 4 }}>Bienvenido</strong>
      <span>{message}</span>
    </div>
  );
}
