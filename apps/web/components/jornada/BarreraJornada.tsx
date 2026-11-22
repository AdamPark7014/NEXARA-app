"use client";

/**
 * «Registra tu entrada para empezar» (Adam, 20-11-2026: sin entrada no se trabaja).
 * Se abre sola cuando la API responde 409 `JORNADA_NO_ABIERTA`, venga de `erpFetch` o de un `fetch`
 * directo: al montarse vigila todas las respuestas del navegador (`vigilarRespuestasDeJornada`).
 * También sincroniza el estado con el servidor usando `sincronizarBarreraJornada(token)` y, si
 * la webCheckin está abierta (`webAbierta`), muestra el formulario de asistencias dinámico.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/base";
import { barreraJornadaActiva, cerrarBarreraJornada, suscribirBarreraJornada, vigilarRespuestasDeJornada, sincronizarBarreraJornada, type EstadoJornadaCandado } from "@/lib/jornada-candado";
import { useUser } from "@/components/UserContext";

const ChecarEnWeb = dynamic(() => import("@/components/asistencias/ChecarEnWeb"), { ssr: false });

export default function BarreraJornada() {
  const router = useRouter();
  const { user } = useUser();
  const token = user?.token ?? null;
  const [visible, setVisible] = useState(false);
  const [estado, setEstado] = useState<EstadoJornadaCandado | null>(null);

  useEffect(() => {
    setVisible(barreraJornadaActiva());
    return suscribirBarreraJornada(() => setVisible(barreraJornadaActiva()));
  }, []);

  useEffect(() => vigilarRespuestasDeJornada(), []);

  useEffect(() => {
    let cancelado = false;
    void sincronizarBarreraJornada(token).then((e) => {
      if (!cancelado && e) setEstado(e);
    });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const webAbierta = estado?.webCheckinAbierta === true;

  return (
    <Modal
      open={visible}
      onClose={cerrarBarreraJornada}
      title="Registra tu entrada para empezar"
      description="Sin entrada registrada puedes consultar, pero no operar."
      maxWidth={480}
      footer={
        <>
          <Button variant="ghost" onClick={cerrarBarreraJornada}>
            Seguir consultando
          </Button>
          {!webAbierta ? (
            <Button
              variant="primary"
              onClick={() => {
                cerrarBarreraJornada();
                router.push("/erp/asistencias");
              }}
            >
              Ir a Asistencias
            </Button>
          ) : null}
        </>
      }
    >
      {webAbierta ? (
        <div data-testid="barrera-jornada-web">
          <p style={{ margin: "0 0 12px", lineHeight: 1.5 }}>
            Dirección te abrió la checada por web. Registra tu entrada aquí y vuelve a operar.
          </p>
          <ChecarEnWeb token={token} />
        </div>
      ) : (
        <p style={{ margin: 0, lineHeight: 1.5 }} data-testid="barrera-jornada">
          Checa tu entrada desde la app NEXARA y vuelve a intentarlo. Si tu jefe o dirección te abrió la checada por web, la
          encuentras en Asistencias, en «Mi jornada».
        </p>
      )}
    </Modal>
  );
}