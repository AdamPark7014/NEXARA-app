"use client";
import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
function BackupRestorePanel() {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const socketUrl = (process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
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
    const res = await fetch('/api/export/all', {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!res.ok) return alert('Error al exportar backup');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexara-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  // Importar backup general
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setMsg(null);
    const file = e.target.files?.[0];
    if (!file || !user) return;
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
  { name: 'Sobre nosotros', href: '/nexara' },
  { name: 'Servicios', href: '/servicios' },
  { name: 'Catálogo', href: '/proyectos' },
  { name: 'Contacto', href: '/contacto' },
];

import { useTheme } from './ThemeContext';


export default function Header() {
  const { darkMode, toggleDarkMode } = useTheme();
  const pathname = usePathname();
  const isConsole = Boolean(pathname && pathname.startsWith('/console'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActiveLink = (href: string) => {
    if (!pathname) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
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
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <header className={`${styles.header} ${isConsole ? styles.consoleHeader : ''}`}>
      <div className={styles.headerInner}>
        <div className={styles.logoSection}>
          <Link href="/" onClick={closeMobileMenu}>
            <Image src="/logo-nexara.png" alt="Nexara Logo" className={styles.logo} width={120} height={40} priority />
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
          <button
            type="button"
            className={styles.switch}
            onClick={toggleDarkMode}
            aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {darkMode ? '🌙' : '☀️'}
          </button>
          
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
