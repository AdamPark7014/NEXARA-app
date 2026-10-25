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
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { useUser } from "@/components/UserContext";
import AltaUsuarioPanel from "@/components/team/AltaUsuarioPanel";
import AccesoCuentasEnlace from "@/components/team/AccesoCuentasEnlace";
import { cargarContextoAlta } from "@/lib/delegated-users-api";
import q from "@/components/erp/pantalla-quieta.module.css";

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
    <div className={q.zona}>
      <Link href="/erp/dashboard" className={q.volver}>‹ Inicio</Link>
      <PageHeader
        title="Perfiles"
        actions={<AccesoCuentasEnlace />}
      />
      {puede === false ? (
        <p className={q.frase} role="status">No hay perfiles a tu cargo.</p>
      ) : (
        <AltaUsuarioPanel />
      )}
    </div>
  );
}
