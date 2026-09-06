"use client";

import { useEffect } from "react";
import AppShell from "@/components/app-shell/AppShell";
import { ToastViewport } from "@/components/Toast";
import { usePathname } from "next/navigation";
import { IntegraChrome } from "./_IntegraChrome";
import { arrancarConsolaIntegra } from "./_arranque";
import { exponerResumenEnConsola } from "./_perf";

export default function IntegraLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  /**
   * Dispara de golpe los cuatro viajes independientes del arranque —capacidades,
   * salud, panel y cámaras— y el sondeo del media server.
   *
   * Va aquí y no en los componentes que pintan por un motivo concreto: `AppShell`
   * no renderiza a sus hijos hasta que hay `user`, así que ni la barra de
   * contexto ni la página existen todavía y no habría una sola petición en vuelo.
   * El layout sí monta desde el primer commit. Quien pinta recoge después la
   * respuesta que ya viene volando (`tomarArranque`), y si no la encuentra pide
   * como siempre: nada depende de que esto haya ocurrido.
   */
  useEffect(() => {
    arrancarConsolaIntegra();
    exponerResumenEnConsola();
  }, []);

  if (pathname && (pathname.includes("/login") || pathname.includes("/auth"))) {
    return <>{children}</>;
  }

  return (
    <>
      <ToastViewport />
      <AppShell panel="integra">
        <IntegraChrome>{children}</IntegraChrome>
      </AppShell>
    </>
  );
}
