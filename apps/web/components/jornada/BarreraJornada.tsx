"use client";

/**
 * «Registra tu entrada para empezar» (Adam, 20-11-2026: sin entrada no se trabaja).
 * Se abre sola cuando la API responde 409 `JORNADA_NO_ABIERTA` (un solo sitio: `erp-api`).
 * La persona puede seguir consultando; operar pide su jornada abierta.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/base";
import { barreraJornadaActiva, cerrarBarreraJornada, suscribirBarreraJornada } from "@/lib/jornada-candado";

export default function BarreraJornada() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(barreraJornadaActiva());
    return suscribirBarreraJornada(() => setVisible(barreraJornadaActiva()));
  }, []);

  return (
    <Modal
      open={visible}
      onClose={cerrarBarreraJornada}
      title="Registra tu entrada para empezar"
      description="Sin entrada registrada puedes consultar, pero no operar."
      maxWidth={440}
      footer={
        <>
          <Button variant="ghost" onClick={cerrarBarreraJornada}>
            Seguir consultando
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              cerrarBarreraJornada();
              router.push("/erp/asistencias");
            }}
          >
            Ir a Asistencias
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.5 }} data-testid="barrera-jornada">
        Checa tu entrada desde la app NEXARA y vuelve a intentarlo. Si tu jefe o dirección te abrió la checada por web, la
        encuentras en Asistencias, en «Mi jornada».
      </p>
    </Modal>
  );
}
