"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import InlineAlert from "@/components/ui/InlineAlert";
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

const ESTADO: Record<string, { etiqueta: string; tono: StatusTone }> = {
  AVAILABLE: { etiqueta: "En almacén", tono: "neutral" },
  ASSIGNED: { etiqueta: "Fuera del almacén", tono: "neutral" },
  IN_REPAIR: { etiqueta: "En reparación", tono: "warning" },
  RETIRED: { etiqueta: "Retirada", tono: "neutral" },
};

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  font: "inherit",
  fontSize: 16,
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
  const estado = item ? (ESTADO[item.status] ?? { etiqueta: item.status, tono: "neutral" as StatusTone }) : null;
  const paraQue = prestamo?.activity
    ? `${prestamo.activity.anNumber} ${prestamo.activity.titulo}`
    : "préstamo suelto";

  return (
    <Section
      title="Entrada y salida con etiqueta"
      subtitle="Escanea la etiqueta de la herramienta. Aquí aparece quién la tiene y qué toca: entregarla o recibirla."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(codigo);
        }}
        style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}
      >
        <input
          ref={campoRef}
          {...{ [ATRIBUTO_CAMPO_LECTOR]: "" }}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="MUL-12345"
          aria-label="Código de la etiqueta de la herramienta"
          autoComplete="off"
          maxLength={64}
          style={{
            ...inp,
            width: 240,
            fontFamily: "ui-monospace, monospace",
            letterSpacing: "0.06em",
          }}
        />
        <Button
          type="submit"
          variant={hallazgo ? "secondary" : "primary"}
          size="lg"
          loading={buscando}
          disabled={codigo.trim().length < 3}
        >
          Buscar
        </Button>
      </form>

      {aviso && (
        <div style={{ marginTop: 10 }}>
          <InlineAlert variant="danger" message={aviso} onDismiss={() => setAviso(null)} />
        </div>
      )}

      {item && estado && (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>{item.toolName}</strong>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
              {item.model} · Serie {item.serialNumber} · Código {hallazgo?.codigo}
            </span>
            <StatusDot tone={estado.tono} label={estado.etiqueta} />
          </div>

          {prestamo?.status === "APPROVED" && (
            <>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                Aprobada para {prestamo.usuario?.nombre ?? "—"} · {paraQue}
              </div>
              {prestamo.vencido ? (
                <InlineAlert
                  variant="danger"
                  message="El código de recolección de esta solicitud caducó. Hay que volver a aprobarla antes de entregar."
                />
              ) : (
                <div>
                  <Button variant="primary" size="lg" loading={guardando} onClick={() => void entregar()}>
                    Entregar a {prestamo.usuario?.nombre ?? "quien la pidió"}
                  </Button>
                </div>
              )}
            </>
          )}

          {prestamo?.status === "IN_USE" && (
            <>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                La tiene {prestamo.usuario?.nombre ?? "—"} · {paraQue}
              </div>
              {/* Sin <form>: el Enter de un lector con el foco aquí no debe registrar la devolución. */}
              <label style={{ display: "grid", gap: 4, fontSize: 12.5, maxWidth: 520 }}>
                <span>¿Llegó dañada? Describe el daño (si está bien, déjalo vacío)</span>
                <input
                  value={dano}
                  onChange={(e) => setDano(e.target.value)}
                  style={inp}
                  maxLength={500}
                />
              </label>
              <div>
                <Button variant="primary" size="lg" loading={guardando} onClick={() => void recibir()}>
                  {dano.trim() ? "Recibir y mandar a reparación" : "Recibir devolución"}
                </Button>
              </div>
            </>
          )}

          {prestamo?.status === "PENDING" && (
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {prestamo.usuario?.nombre ?? "Alguien"} la pidió ({paraQue}) y la solicitud sigue sin
              aprobar. Apruébala en la lista de abajo para poder entregarla.
            </div>
          )}

          {kit && (
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {kit.assignmentType === "KIT" ? "Es del kit de" : "Está prestada a"}{" "}
              {kit.user?.nombre ?? "—"}.
            </div>
          )}

          {!prestamo && !kit && (
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {item.status === "AVAILABLE"
                ? "Está en almacén y nadie la tiene pedida. Para que salga, primero hay que solicitarla o asignarla a un kit."
                : item.status === "IN_REPAIR"
                  ? "Está en reparación. Cuando vuelva, márcala como disponible en el inventario."
                  : item.status === "RETIRED"
                    ? "Está retirada del inventario."
                    : "No tiene préstamo ni kit activo: revisa su estado en el inventario."}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
