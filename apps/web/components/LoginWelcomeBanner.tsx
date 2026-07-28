"use client";

import { useEffect, useState } from 'react';
import styles from './LoginWelcomeBanner.module.css';

const STORAGE_KEY = 'nexara_login_greeting';

type GreetingPayload = {
  title: string;
  device?: string;
};

const parseGreeting = (raw: string): GreetingPayload => {
  try {
    const parsed = JSON.parse(raw) as Partial<GreetingPayload>;
    if (parsed && typeof parsed.title === 'string' && parsed.title.trim()) {
      return {
        title: parsed.title.trim(),
        device: typeof parsed.device === 'string' ? parsed.device.trim() : undefined,
      };
    }
  } catch {
    // Legacy plain string from older API builds.
  }
  return { title: raw.trim() };
};

export default function LoginWelcomeBanner() {
  const [greeting, setGreeting] = useState<GreetingPayload | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    setGreeting(parseGreeting(raw));
    setIsClosing(false);
    window.sessionStorage.removeItem(STORAGE_KEY);

    const fadeTimer = window.setTimeout(() => setIsClosing(true), 4200);
    const removeTimer = window.setTimeout(() => {
      setGreeting(null);
      setIsClosing(false);
    }, 4800);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!greeting) return null;

  return (
    <div
      className={`${styles.cloud} ${isClosing ? styles.closing : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.glow} aria-hidden />
      <p className={styles.hello}>{greeting.title}</p>
      {greeting.device ? (
        <p className={styles.device}>
          <span className={styles.deviceDot} aria-hidden />
          {greeting.device}
        </p>
      ) : null}
    </div>
  );
}
