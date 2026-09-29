"use client";

/**
 * Perfiles — solo para quien tiene gente a su cargo con algún tipo concedido.
 *
 * Dirección ve toda la empresa; un encargado (Antonio, Luis, David) solo a quien le reporta
 * directo. Desde aquí se da de alta, se cambia la foto fija del equipo y se llega al propio
 * «Mi perfil» — todo lo hace `AltaUsuarioPanel`, que ya trae su propio permiso.
 *
 * Página propia (no vive dentro de Organigrama): esa es solo el árbol de lectura.
 */
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import AltaUsuarioPanel from "@/components/team/AltaUsuarioPanel";
import { cargarContextoAlta } from "@/lib/delegated-users-api";

export default function PerfilesPage() {
  const { token } = useUser();
  const [puede, setPuede] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    void cargarContextoAlta(token).then((ctx) => {
      if (!cancelado) setPuede(ctx.puede);
    });
    return () => {
      cancelado = true;
    };
  }, [token]);

  return (
    <>
      <PageHeader
        eyebrow="Gobierno · Equipo"
        title="Perfiles"
        subtitle="Da de alta a tu gente, cambia su foto fija y entra a tu propio perfil."
      />
      {puede === false ? (
        <EmptyState
          icon="👤"
          title="Aquí no hay nada para ti todavía"
          description="Este módulo es para quien tiene personal a su cargo con algún tipo concedido. Si crees que deberías verlo, pídeselo a dirección."
        />
      ) : (
        <AltaUsuarioPanel />
      )}
    </>
  );
}
