"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, CardHead, StatusBadge, type Tone } from "@/components/base";
import { DialogoDevolucion, DialogoEntrega } from "@/components/herramientas/EvidenciaPrestamo";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import { buscarHerramientaPorCodigo, type HallazgoDeHerramienta } from "@/lib/almacen-api";
import { ATRIBUTO_CAMPO_LECTOR, useLectorDeCodigos } from "@/lib/lector-codigos";
import { CampoEscaneo, TarjetaHallazgo, claseMono } from "./PiezasAlmacen";
import s from "./HerramientasPorEtiquetaPanel.module.css";

/** Dónde está la herramienta. El tono dice el estado, nunca pide acción por sí solo. */
const ESTADO: Record<string, { etiqueta: string; tono: Tone }> = {
  AVAILABLE: { etiqueta: "En almacén", tono: "success" },
  ASSIGNED: { etiqueta: "Fuera del almacén", tono: "info" },
  IN_REPAIR: { etiqueta: "En reparación", tono: "warning" },
  RETIRED: { etiqueta: "Retirada", tono: "neutral" },
};

type Props = {
  /** Se llama tras entregar o recibir, para que las listas de al lado se recarguen. */
  onCambio?: () => void;
  /** Apaga el lector mientras otra cosa de la pantalla lo está usando. */
  activo?: boolean;
};

/**
 * Entrada y salida de herramienta con su etiqueta.
 *
 * Quien atiende el mostrador no busca en una lista: escanea la etiqueta que lleva la
 * herramienta y la pantalla le dice de quién es el préstamo y qué toca —entregarla a
 * quien la tiene aprobada, o recibirla de quien la trae—. Usa los mismos servicios de
 * entrega y devolución de siempre; lo único nuevo es que el código decide la herramienta.
 */
export default function HerramientasPorEtiquetaPanel({ onCambio, activo = true }: Props) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const campoRef = useRef<HTMLInputElement>(null);
  const ocupadoRef = useRef(false);

  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [hallazgo, setHallazgo] = useState<HallazgoDeHerramienta | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Entregar y recibir piden fotos de antes y después: cada uno abre su diálogo.
  const [dialogo, setDialogo] = useState<"entregar" | "recibir" | null>(null);

  useEffect(() => {
    // Con un diálogo abierto, un disparo del lector no debe cambiar la herramienta de fondo.
    ocupadoRef.current = buscando || dialogo !== null;
  }, [buscando, dialogo]);

  const buscar = useCallback(
    async (crudo: string) => {
      const limpio = crudo.trim();
      if (!token || limpio.length < 3 || ocupadoRef.current) return;
      setBuscando(true);
      setAviso(null);
      setHallazgo(null);
      try {
        const r = await buscarHerramientaPorCodigo(token, limpio);
        if (r) setHallazgo(r);
        else setAviso(`Ninguna herramienta tiene la etiqueta «${limpio.toUpperCase()}».`);
        setCodigo("");
      } catch (e) {
        setAviso(formatApiError(e, "No se pudo buscar la herramienta"));
      } finally {
        setBuscando(false);
      }
    },
    [token],
  );

  useLectorDeCodigos({ onEscaneo: (leido) => void buscar(leido), activo });

  const terminar = (mensaje: string) => {
    toast.success(mensaje);
    setHallazgo(null);
    onCambio?.();
    campoRef.current?.focus();
  };

  const item = hallazgo?.item;
  const prestamo = hallazgo?.prestamo ?? null;
  const kit = hallazgo?.kit ?? null;
  const estado = item ? (ESTADO[item.status] ?? { etiqueta: item.status, tono: "neutral" as Tone }) : null;
  const paraQue = prestamo?.activity
    ? `${prestamo.activity.anNumber} ${prestamo.activity.titulo}`
    : "préstamo suelto";

  return (
    <Card aria-label="Entrada y salida con etiqueta">
      <CardHead
        title="Entrada y salida con etiqueta"
        subtitle="Escanea la etiqueta de la herramienta para ver quién la tiene y si toca entregarla o recibirla."
      />
      <div className={s.cuerpo}>
        <CampoEscaneo
          ref={campoRef}
          {...{ [ATRIBUTO_CAMPO_LECTOR]: "" }}
          mono
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          onBuscar={() => void buscar(codigo)}
          placeholder="MUL-12345"
          aria-label="Código de la etiqueta de la herramienta"
          maxLength={64}
          buscando={buscando}
          botonDeshabilitado={codigo.trim().length < 3}
          botonVariante={hallazgo ? "secondary" : "primary"}
          lectorActivo={activo}
          pista="Dispara el lector sobre la etiqueta: no hace falta hacer clic en el campo."
        />

        {aviso && (
          <Alert tone="danger" role="alert" onDismiss={() => setAviso(null)}>
            {aviso}
          </Alert>
        )}

        {item && estado && (
          <TarjetaHallazgo
            tipo="herramienta"
            ariaLabel="Herramienta escaneada"
            foto={item.panoramicPhotoUrl}
            tono={prestamo?.status === "APPROVED" && prestamo.vencido ? "danger" : undefined}
            eyebrow="Herramienta"
            titulo={item.toolName}
            meta={
              <>
                {item.model} · Serie {item.serialNumber} · Código <code className={claseMono}>{hallazgo?.codigo}</code>
              </>
            }
            insignias={<StatusBadge label={estado.etiqueta} tone={estado.tono} dot />}
            acciones={
              prestamo?.status === "APPROVED" && !prestamo.vencido ? (
                <Button variant="primary" size="lg" onClick={() => setDialogo("entregar")}>
                  Entregar a {prestamo.usuario?.nombre ?? "quien la pidió"}
                </Button>
              ) : prestamo?.status === "IN_USE" ? (
                <Button variant="primary" size="lg" onClick={() => setDialogo("recibir")}>
                  Recibir devolución
                </Button>
              ) : undefined
            }
          >
            {prestamo?.status === "APPROVED" && (
              <>
                <p className={s.linea}>
                  Aprobada para {prestamo.usuario?.nombre ?? "—"} · {paraQue}
                </p>
                {prestamo.vencido ? (
                  <Alert tone="danger">
                    El código de recolección de esta solicitud caducó y hay que volver a aprobarla antes de entregar.
                  </Alert>
                ) : null}
              </>
            )}

            {prestamo?.status === "IN_USE" && (
              <>
                <p className={s.linea}>
                  La tiene {prestamo.usuario?.nombre ?? "—"} · {paraQue}
                </p>
                <p className={s.linea}>
                  Al recibirla se registra en qué estado vuelve y sus fotos, junto a las de cuando salió.
                </p>
              </>
            )}

            {prestamo?.status === "PENDING" && (
              <p className={s.linea}>
                {prestamo.usuario?.nombre ?? "Alguien"} la pidió ({paraQue}) y la solicitud sigue sin aprobar, así que apruébala en la lista de abajo para poder entregarla.
              </p>
            )}

            {kit && (
              <p className={s.linea}>
                {kit.assignmentType === "KIT" ? "Es del kit de" : "Está prestada a"}{" "}
                {kit.user?.nombre ?? "—"}.
              </p>
            )}

            {!prestamo && !kit && (
              <p className={s.linea}>
                {item.status === "AVAILABLE"
                  ? "Está en almacén, nadie la tiene pedida y para que salga hay que solicitarla o asignarla a un kit."
                  : item.status === "IN_REPAIR"
                    ? "Está en reparación. Cuando vuelva, márcala como disponible en el inventario."
                    : item.status === "RETIRED"
                      ? "Está retirada del inventario."
                      : "No tiene préstamo ni kit activo: revisa su estado en el inventario."}
              </p>
            )}
          </TarjetaHallazgo>
        )}
      </div>

      <DialogoEntrega
        token={token}
        prestamo={
          dialogo === "entregar" && item && prestamo
            ? {
                id: prestamo.id,
                toolName: item.toolName,
                detalle: `${item.model} · Serie ${item.serialNumber}`,
                persona: prestamo.usuario?.nombre ?? null,
                pickupCode: prestamo.pickupCode,
                recogidaPorId: prestamo.usuario?.id,
              }
            : null
        }
        onCerrar={() => setDialogo(null)}
        onListo={terminar}
      />
      <DialogoDevolucion
        token={token}
        prestamo={
          dialogo === "recibir" && item && prestamo
            ? {
                id: prestamo.id,
                toolName: item.toolName,
                detalle: `${item.model} · Serie ${item.serialNumber}`,
                persona: prestamo.usuario?.nombre ?? null,
                fotosEntrega: (prestamo.deliveryPhotos ?? []).map((f) => f.url),
                entregadaEl: prestamo.deliveryDate ?? null,
              }
            : null
        }
        onCerrar={() => setDialogo(null)}
        onListo={terminar}
      />
    </Card>
  );
}
