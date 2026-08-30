import { headers } from "next/headers";
import { Suspense } from "react";
import PanelLogin from "@/components/PanelLogin";

function deniedPanelMessage(denied: string | null | undefined): string | undefined {
  if (denied === "contabilidad") {
    return "No tienes acceso al panel de contabilidad. Inicia sesión con una cuenta autorizada o solicita permisos a un administrador.";
  }
  return undefined;
}

function resolveLoginSkin(host: string | null): "default" | "integra" {
  const h = (host || "").split(":")[0].toLowerCase();
  if (h.startsWith("integra.") || h === "integra.localhost" || h.endsWith(".integra.localhost")) {
    return "integra";
  }
  return "default";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { denied?: string };
}) {
  const h = await headers();
  const skin = resolveLoginSkin(h.get("x-forwarded-host") || h.get("host"));
  const accessNotice = deniedPanelMessage(searchParams?.denied);

  return (
    <Suspense
      fallback={
        <PanelLogin
          redirectTo="/dashboard"
          title="Iniciar sesión"
          subtitle="Ingresa a tu cuenta de NEXARA"
          skin={skin}
        />
      }
    >
      <PanelLogin
        redirectTo="/dashboard"
        title="Iniciar sesión"
        subtitle="Ingresa a tu cuenta de NEXARA"
        accessNotice={accessNotice}
        smartRedirect={true}
        skin={skin}
      />
    </Suspense>
  );
}
