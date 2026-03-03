"use client";

import { useEffect, useState } from 'react';
import styles from './LoginWelcomeBanner.module.css';

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
    <div className={styles.banner} role="status" aria-live="polite">
      <strong className={styles.title}>Bienvenido</strong>
      <span>{message}</span>
    </div>
  );
}
