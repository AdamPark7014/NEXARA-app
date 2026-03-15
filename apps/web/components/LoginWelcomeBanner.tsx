"use client";

import { useEffect, useState } from 'react';
import styles from './LoginWelcomeBanner.module.css';

const STORAGE_KEY = 'nexara_login_greeting';

export default function LoginWelcomeBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const greeting = window.sessionStorage.getItem(STORAGE_KEY);
    if (!greeting) return;

    setMessage(greeting);
    setIsClosing(false);
    window.sessionStorage.removeItem(STORAGE_KEY);

    // Start fade-out shortly before removing the banner from the DOM.
    const fadeTimer = window.setTimeout(() => {
      setIsClosing(true);
    }, 4500);

    const removeTimer = window.setTimeout(() => {
      setMessage(null);
      setIsClosing(false);
    }, 5000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!message) return null;

  return (
    <div className={`${styles.banner} ${isClosing ? styles.closing : ""}`} role="status" aria-live="polite">
      <strong className={styles.title}>Bienvenido</strong>
      <span>{message}</span>
    </div>
  );
}
