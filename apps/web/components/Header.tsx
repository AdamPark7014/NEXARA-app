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
  { name: 'Servicios', href: '/servicios' },
  { name: 'Nosotros', href: '/nosotros' },
  { name: 'Proyectos', href: '/proyectos' },
  { name: 'Blog', href: '/blog' },
];

const isHomeRoute = (pathname: string | null) =>
  pathname === '/' || pathname === '/nexara' || pathname === '/nexara/';

export default function Header() {
  const pathname = usePathname();
  const isConsole = Boolean(pathname && pathname.startsWith('/console'));
  const isHome = isHomeRoute(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // En la home el header arranca transparente sobre el hero y, al hacer scroll
  // más allá de ~80 px, se condensa con blur para garantizar legibilidad.
  useEffect(() => {
    if (!isHome) {
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

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
      return;
    }

    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  // El componente `Header` SOLO se monta dentro de `(public)/layout.tsx`,
  // así que el estilo "limpio" (`.headerPublic`) aplica siempre. Lo único
  // que cambia entre rutas es si arriba se muestra transparente sobre el
  // hero (sólo en home, antes de hacer scroll).
  const headerClass = [
    styles.header,
    isConsole ? styles.consoleHeader : '',
    styles.headerPublic,
    isHome && !scrolled ? styles.headerTransparent : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={headerClass}>
      <div className={styles.headerInner}>
        <div className={styles.logoSection}>
          <Link href="/" onClick={closeMobileMenu} className={styles.logoLink}>
            <Image src="/logo-nexara.png" alt="Nexara Logo" className={styles.logo} width={200} height={62} priority />
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
            Contactar
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
