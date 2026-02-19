"use client";
import Link from "next/link";
import React from "react";
import { usePathname } from "next/navigation";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Si estamos en /panel/console/*, /panel/web/* o /panel/contabilidad/*, no renderizar el sidebar general
  if (
    pathname &&
    (pathname.startsWith("/panel/console") ||
      pathname.startsWith("/panel/web") ||
      pathname.startsWith("/panel/ventas") ||
      pathname.startsWith("/panel/contabilidad") ||
      pathname.startsWith("/panel/tickets"))
  ) {
    return (
      <main
        style={{
          flex: 1,
          background: "var(--background)",
          color: "var(--foreground)",
          padding: 0,
        }}
      >
        {children}
      </main>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        gap: "var(--panel-gap)",
        padding: "var(--panel-padding-y) var(--panel-padding-x)",
      }}
    >
      <aside
        style={{
          width: "var(--panel-sidebar-width)",
          background: "var(--surface)",
          color: "var(--foreground)",
          padding: "var(--panel-padding-y)",
          boxShadow: "2px 0 8px var(--shadow)",
          borderRight: "1px solid var(--muted)",
        }}
      >
        <h2
          style={{
            color: "var(--primary)",
            fontWeight: 700,
            fontSize: 24,
            marginBottom: 32,
            letterSpacing: 1,
          }}
        >
          Panel
        </h2>
        <nav style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Link href="/panel/dashboard" style={{ color: "var(--foreground)", textDecoration: "none", fontWeight: 500 }}>Dashboard</Link>
          <Link href="/panel/clients" style={{ color: "var(--foreground)", textDecoration: "none", fontWeight: 500 }}>Clientes</Link>
          <Link href="/panel/proyectos" style={{ color: "var(--foreground)", textDecoration: "none", fontWeight: 500 }}>Proyectos</Link>
          <Link href="/panel/contactos" style={{ color: "var(--foreground)", textDecoration: "none", fontWeight: 500 }}>Contactos</Link>
        </nav>
      </aside>
      <main
        style={{
          flex: 1,
          background: "var(--background)",
          color: "var(--foreground)",
          padding: "var(--panel-padding-y) var(--panel-padding-x)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
