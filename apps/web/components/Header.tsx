"use client";
import React, { useEffect, useRef, useState } from 'react';
import { useUser } from './UserContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
function BackupRestorePanel() {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
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
  { name: 'Quiénes somos', href: '/nexara' },
  { name: 'Soluciones', href: '/soluciones' },
  { name: 'Servicios', href: '/servicios' },
  { name: 'Proyectos', href: '/proyectos' },
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
