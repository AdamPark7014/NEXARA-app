"use client";
import React, { useRef, useState } from 'react';
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
      <button className="button-secondary" style={{ fontSize: 13 }} onClick={handleExport}>Exportar Backup</button>
      <button className="button-primary" style={{ fontSize: 13 }} onClick={() => fileInputRef.current?.click()}>Importar Backup</button>
      <input
        type="file"
        accept="application/json"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleImport}
      />
      {msg && <span style={{ color: msg.startsWith('Error') ? 'var(--danger)' : 'var(--accent)', fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
import Link from 'next/link';
import Image from 'next/image';
import styles from './Header.module.css';

import { usePathname } from 'next/navigation';

const navLinks = [
  { name: 'Inicio', href: '/' },
  { name: 'Nexara', href: '/nexara' },
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

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

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
            <Link key={link.name} href={link.href} className={styles.link}>
              {link.name}
            </Link>
          ))}
        </nav>

        <div className={styles.rightSection}>
          {(pathname && pathname.startsWith('/console')) && <BackupRestorePanel />}
          <button
            className={styles.switch}
            onClick={toggleDarkMode}
            aria-label={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {darkMode ? '🌙' : '☀️'}
          </button>
          
          {/* Mobile Menu Button */}
          <button 
            className={`${styles.mobileMenuButton} ${mobileMenuOpen ? styles.active : ''}`}
            onClick={toggleMobileMenu}
            aria-label="Menú"
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
          <nav className={styles.mobileMenu} onClick={(e) => e.stopPropagation()}>
            {navLinks.map((link) => (
              <Link 
                key={link.name} 
                href={link.href} 
                className={styles.mobileLink}
                onClick={closeMobileMenu}
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
