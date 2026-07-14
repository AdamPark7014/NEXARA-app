"use client";
import React, { useEffect, useRef, useState } from 'react';
import { getSocketBaseUrl } from '@/lib/api-base';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
function BackupRestorePanel() {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, {
      auth: { token: user.token },
      transports: ['websocket', 'polling'],
    });

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const relevantModels = new Set(['user', 'role', 'department', 'notification']);

    const onEntityUpdated = (event: { model?: string }) => {
      const normalizedModel = event?.model?.toLowerCase();
      if (!normalizedModel || !relevantModels.has(normalizedModel)) return;

      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        setMsg('Se detectaron cambios recientes en datos del sistema.');
      }, 350);
    };

    socket.on('entity:updated', onEntityUpdated);

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      socket.off('entity:updated', onEntityUpdated);
      socket.disconnect();
    };
  }, [user]);

  if (!user || !hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)) return null;

  // Exportar backup general
  const handleExport = async () => {
    try {
      const res = await fetch('/api/export/all', {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) return setMsg('Error al exportar backup');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nexara-backup.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setMsg('Error al exportar backup');
    }
  };

  // Importar backup general
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setMsg(null);
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import/all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });
      if (!res.ok) {
        setMsg('Error al importar backup');
        return;
      }
      const data = await res.json();
      setMsg(data.message || 'Importación exitosa');
    } catch {
      setMsg('Error al importar backup');
    }
  };

  return (
    <div className={styles.backupPanel}>
      <button type="button" className={`button-secondary ${styles.backupButton}`} onClick={handleExport}>Exportar Backup</button>
      <button type="button" className={`button-primary ${styles.backupButton}`} onClick={() => fileInputRef.current?.click()}>Importar Backup</button>
      <input
        type="file"
        accept="application/json"
        ref={fileInputRef}
        className={styles.hiddenFileInput}
        onChange={handleImport}
      />
      {msg && <span className={msg.startsWith('Error') ? styles.backupError : styles.backupSuccess}>{msg}</span>}
    </div>
  );
}
import Link from 'next/link';
import Image from 'next/image';
import styles from './Header.module.css';

import { usePathname } from 'next/navigation';

const navLinks = [
  { name: 'Inicio', href: '/' },
  { name: 'Soluciones', href: '/soluciones' },
  { name: 'Servicios', href: '/servicios' },
  { name: 'Nosotros', href: '/nosotros' },
  { name: 'Contacto', href: '/contacto' },
];

const isHomeRoute = (pathname: string | null) =>
  pathname === '/' || pathname === '/nexara' || pathname === '/nexara/';

/** Rutas con hero full-bleed: header transparente hasta hacer scroll. */
const isFlushHeroRoute = (pathname: string | null) => {
  if (!pathname) return false;
  const p = pathname.replace(/\/+$/, '') || '/';
  return (
    isHomeRoute(p) ||
    p === '/servicios' ||
    p === '/soluciones' ||
    p === '/nosotros' ||
    p === '/contacto' ||
    p === '/proyectos' ||
    p === '/cobertura' ||
    p === '/blog' ||
    p === '/Nexara-Ingenieros' ||
    p.startsWith('/soluciones/')
  );
};

export default function Header() {
  const pathname = usePathname();
  const isConsole = Boolean(pathname && pathname.startsWith('/console'));
  const isFlushHero = isFlushHeroRoute(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isFlushHero) {
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 64);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isFlushHero]);

  const isActiveLink = (href: string) => {
    if (!pathname) return false;
    const baseHref = href.split("#")[0] || "/";
    if (baseHref === "/") return pathname === "/";
    return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen((prev) => !prev);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      return;
    }

    // Bloquear scroll del documento sin dejar segundo scrollport raro.
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const headerClass = [
    styles.header,
    isConsole ? styles.consoleHeader : '',
    styles.headerPublic,
    isFlushHero && !scrolled ? styles.headerTransparent : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={headerClass}>
      <div className={styles.headerInner}>
        <div className={styles.logoSection}>
          <Link href="/" onClick={closeMobileMenu} className={styles.logoLink} aria-label="Nexara — Inicio">
            <Image
              src="/logo-nexara-lockup.png"
              alt="Nexara"
              width={220}
              height={69}
              className={styles.logoLockup}
              priority
            />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className={styles.navLinks}>
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className={`${styles.link} ${isActiveLink(link.href) ? styles.linkActive : ''}`}
              aria-current={isActiveLink(link.href) ? 'page' : undefined}
            >
              {link.name}
            </Link>
          ))}
        </nav>

        <div className={styles.rightSection}>
          {(pathname && pathname.startsWith('/console')) && <BackupRestorePanel />}

          <Link href="/contacto" className={styles.contactCta} onClick={closeMobileMenu}>
            Cotiza tu proyecto
            <span aria-hidden className={styles.contactArrow}>→</span>
          </Link>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className={`${styles.mobileMenuButton} ${mobileMenuOpen ? styles.active : ''}`}
            onClick={toggleMobileMenu}
            aria-label="Menú"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-main-menu"
          >
            <span className={styles.hamburgerLine}></span>
            <span className={styles.hamburgerLine}></span>
            <span className={styles.hamburgerLine}></span>
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className={styles.mobileMenuOverlay} onClick={closeMobileMenu}>
          <nav id="mobile-main-menu" className={styles.mobileMenu} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Menú principal móvil">
            {navLinks.map((link) => (
              <Link 
                key={link.name} 
                href={link.href} 
                className={`${styles.mobileLink} ${isActiveLink(link.href) ? styles.mobileLinkActive : ''}`}
                onClick={closeMobileMenu}
                aria-current={isActiveLink(link.href) ? 'page' : undefined}
              >
                {link.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
