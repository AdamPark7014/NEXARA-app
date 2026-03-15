"use client";

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './LoginWelcomeBanner.module.css';

const STORAGE_KEY = 'nexara_login_greeting';

export default function LoginWelcomeBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const timersRef = useRef<number[]>([]);
  const pathname = usePathname();

  const clearTimers = () => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    clearTimers();

    const greeting = window.sessionStorage.getItem(STORAGE_KEY);
    if (!greeting) return;

    window.sessionStorage.removeItem(STORAGE_KEY);
    setMessage(greeting);
    setIsClosing(false);

    const fadeTimer = window.setTimeout(() => {
      setIsClosing(true);
    }, 3200);

    const removeTimer = window.setTimeout(() => {
      setMessage(null);
      setIsClosing(false);
    }, 3800);

    timersRef.current = [fadeTimer, removeTimer];

    return () => {
      clearTimers();
    };
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        clearTimers();
      }
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
