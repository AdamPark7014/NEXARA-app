"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, CardHead, Field, Input, StatusBadge, type Tone } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import {
  buscarHerramientaPorCodigo,
  devolverHerramienta,
  entregarConCodigo,
  type HallazgoDeHerramienta,
} from "@/lib/almacen-api";
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
  const [guardando, setGuardando] = useState(false);
  const [hallazgo, setHallazgo] = useState<HallazgoDeHerramienta | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dano, setDano] = useState("");

  useEffect(() => {
    ocupadoRef.current = buscando || guardando;
  }, [buscando, guardando]);

  const buscar = useCallback(
    async (crudo: string) => {
      const limpio = crudo.trim();
      if (!token || limpio.length < 3 || ocupadoRef.current) return;
      setBuscando(true);
      setAviso(null);
      setHallazgo(null);
      setDano("");
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
    setDano("");
    onCambio?.();
    campoRef.current?.focus();
  };

  const entregar = async () => {
    const prestamo = hallazgo?.prestamo;
    if (!token || !hallazgo || !prestamo) return;
    setGuardando(true);
    try {
      await entregarConCodigo(token, prestamo.id, {
        pickupCode: prestamo.pickupCode ?? undefined,
        recogidaPorId: prestamo.usuario?.id,
      });
      terminar(`${hallazgo.item.toolName} entregada a ${prestamo.usuario?.nombre ?? "quien la pidió"}`);
    } catch (e) {
      setAviso(formatApiError(e, "No se pudo entregar la herramienta"));
    } finally {
      setGuardando(false);
    }
  };

  const recibir = async () => {
    const prestamo = hallazgo?.prestamo;
    if (!token || !hallazgo || !prestamo) return;
    setGuardando(true);
    try {
      await devolverHerramienta(token, prestamo.id, dano);
      terminar(
        dano.trim()
          ? `${hallazgo.item.toolName} recibida con daño: pasa a reparación`
          : `${hallazgo.item.toolName} recibida y de vuelta en almacén`,
      );
    } catch (e) {
      setAviso(formatApiError(e, "No se pudo registrar la devolución"));
    } finally {
      setGuardando(false);
    }
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
        subtitle="Escanea la etiqueta de la herramienta. Aquí aparece quién la tiene y qué toca: entregarla o recibirla."
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
                <Button variant="primary" size="lg" loading={guardando} onClick={() => void entregar()}>
                  Entregar a {prestamo.usuario?.nombre ?? "quien la pidió"}
                </Button>
              ) : prestamo?.status === "IN_USE" ? (
                <Button
                  variant="primary"
                  size="lg"
                  loading={guardando}
                  onClick={() => void recibir()}
                >
                  {dano.trim() ? "Recibir y mandar a reparación" : "Recibir devolución"}
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
                    El código de recolección de esta solicitud caducó. Hay que volver a aprobarla antes de entregar.
                  </Alert>
                ) : null}
              </>
            )}

            {prestamo?.status === "IN_USE" && (
              <>
                <p className={s.linea}>
                  La tiene {prestamo.usuario?.nombre ?? "—"} · {paraQue}
                </p>
                {/* Sin <form>: el Enter de un lector con el foco aquí no debe registrar la devolución. */}
                <Field label="¿Llegó dañada? Describe el daño (si está bien, déjalo vacío)" className={s.campoDano}>
                  <Input controlSize="lg" value={dano} onChange={(e) => setDano(e.target.value)} maxLength={500} />
                </Field>
              </>
            )}

            {prestamo?.status === "PENDING" && (
              <p className={s.linea}>
                {prestamo.usuario?.nombre ?? "Alguien"} la pidió ({paraQue}) y la solicitud sigue sin
                aprobar. Apruébala en la lista de abajo para poder entregarla.
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
                  ? "Está en almacén y nadie la tiene pedida. Para que salga, primero hay que solicitarla o asignarla a un kit."
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
    </Card>
  );
}
