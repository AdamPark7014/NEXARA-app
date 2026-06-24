/**
 * ERP Panel Layout — Server Component (no "use client").
 * Envuelve todas las páginas del panel ERP con el ToastViewport.
 * AppShell se re-habilita en cada página individualmente cuando sea necesario.
 *
 * NOTA: mantener este layout como Server Component evita el hydration mismatch
 * que ocurría cuando era "use client" con usePathname().
 */
import { ToastViewport } from "@/components/Toast";

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ToastViewpo