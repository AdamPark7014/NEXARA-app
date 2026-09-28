"use client";

/** Botón «Acceso a cuentas»: solo lo ve el dueño (Christian); para cualquier otra persona no aparece. */
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { puedeEntrarACuentas } from "@/lib/account-access-api";

export default function AccesoCuentasEnlace() {
  const { token } = useUser();
  const [puede, setPuede] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    void puedeEntrarACuentas(token).then((v) => {
      if (!cancelado) setPuede(v);
    });
    return () => {
      cancelado = true;
    };
  }, [token]);

  if (!puede) return null;
  return (
    <Button variant="secondary" onClick={() => { window.location.href = "/erp/acceso-cuentas"; }}>
      Acceso a cuentas
    </Button>
  );
}
