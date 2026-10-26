"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { saveDeviceIdentity } from "@/lib/device-identity";
import PublicIcon from "@/app/components/PublicIcon";
import s from "@/components/sitio/sitio.module.css";
import i from "@/components/sitio/interior.module.css";

function DeviceRegisterContent() {
  const params = useSearchParams();

  const result = useMemo(() => {
    const name = params.get("name") || "";
    const model = params.get("model") || "";
    const serial = params.get("serial") || "";

    if (!name && !model && !serial) {
      return { ok: false as const, message: "Faltan los datos del equipo (name, model y serial)." };
    }

    saveDeviceIdentity({
      name,
      model,
      serial,
      source: "windows-agent",
    });

    return { ok: true as const, name, model, serial };
  }, [params]);

  return (
    <main className={i.servicioPagina} aria-label="Registro de equipo">
      <div className={`${i.panel} ${i.panelAngosto}`}>
        <span className={i.panelIcono}>
          <PublicIcon name={result.ok ? "monitor" : "alert"} size={24} />
        </span>
        <h1 className={i.panelTitulo}>{result.ok ? "Equipo registrado" : "No se pudo registrar el equipo"}</h1>
        {!result.ok ? (
          <p className={i.panelTexto} role="alert">
            {result.message} Vuelve a abrir el enlace desde el agente de NEXARA en el equipo.
          </p>
        ) : (
          <>
            <p className={i.panelTexto}>Este navegador ya identifica al equipo. Inicia sesión para continuar.</p>
            <dl className={s.datos} style={{ textAlign: "left" }}>
              {[
                ["Nombre", result.name],
                ["Modelo", result.model],
                ["Serie", result.serial],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta} className={s.dato}>
                  <dt className={s.datoEtiqueta}>{etiqueta}</dt>
                  <dd className={s.datoValor}>{valor || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className={i.panelAcciones}>
              <Link href="/auth/login" className={`${s.boton} ${s.botonPrimario}`}>
                Iniciar sesión
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function DeviceRegisterPage() {
  return (
    <Suspense fallback={null}>
      <DeviceRegisterContent />
    </Suspense>
  );
}
