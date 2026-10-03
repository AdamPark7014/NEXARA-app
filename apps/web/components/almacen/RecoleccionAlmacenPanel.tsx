"use client";

import { useCallback, useEffect, useState } from "react";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import {
  Alert,
  Button,
  Card,
  CardHead,
  DataTable,
  Field,
  Input,
  PersonCell,
  SkeletonRows,
  StatusBadge,
  type Column,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import {
  buscarPorCodigoDeRecoleccion,
  entregarConCodigo,
  listarPendientesDeRecoleccion,
  type BusquedaPickup,
  type PendienteDeRecoleccion,
} from "@/lib/almacen-api";
import InfoBreve from "./InfoBreve";
import s from "./RecoleccionAlmacenPanel.module.css";

const INFO =
  "Código de 6 caracteres (48 h). Teclea aquí para entregar; queda quién y cuándo.";

/** Vigencia del código con su tono: rojo caducó, ámbar caduca pronto, verde vigente. */
function vigencia(p: { vencido: boolean; horasRestantes: number | null }) {
  if (p.vencido) {
    return <StatusBadge size="sm" tone="danger" label="Caducó" title="Hay que volver a pedirla" />;
  }
  if (p.horasRestantes == null) return <StatusBadge size="sm" tone="neutral" label="Sin caducidad" />;
  if (p.horasRestantes <= 6) {
    return <StatusBadge size="sm" tone="warning" label={`Caduca en ${p.horasRestantes} h`} />;
  }
  return <StatusBadge size="sm" tone="success" label={`${p.horasRestantes} h`} />;
}

/**
 * Mostrador del almacén: teclea el código, verifica y entrega.
 *
 * La lista de abajo es lo que espera ser recogido; el buscador de arriba es el flujo
 * real, porque el técnico llega diciendo su código, no el folio de su solicitud.
 */
export default function RecoleccionAlmacenPanel() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [pendientes, setPendientes] = useState<PendienteDeRecoleccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [hallazgo, setHallazgo] = useState<BusquedaPickup | null>(null);
  const [entregando, setEntregando] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setPendientes(await listarPendientesDeRecoleccion(token));
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar lo pendiente de entregar"));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const buscar = async () => {
    const limpio = codigo.trim();
    if (!token || !limpio) return;
    setBuscando(true);
    setHallazgo(null);
    try {
      setHallazgo(await buscarPorCodigoDeRecoleccion(token, limpio));
    } catch (e) {
      toast.error(formatApiError(e, "No se encontró el código"));
    } finally {
      setBuscando(false);
    }
  };

  const entregar = async (toolRequestId: number, pickupCode: string, recogidaPorId?: number) => {
    if (!token) return;
    setEntregando(true);
    try {
      await entregarConCodigo(token, toolRequestId, { pickupCode, recogidaPorId });
      toast.success("Herramienta entregada");
      setHallazgo(null);
      setCodigo("");
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo entregar la herramienta"));
    } finally {
      setEntregando(false);
    }
  };

  const columnas: Column<PendienteDeRecoleccion>[] = [
    {
      key: "codigo",
      label: "Código",
      width: 92,
      render: (p) => <strong className={s.codigoCelda}>{p.pickupCode ?? "—"}</strong>,
    },
    {
      key: "herramienta",
      label: "Herramienta",
      width: 220,
      render: (p) => (
        <div className={s.doble}>
          <strong className={s.fuerte}>{p.toolName}</strong>
          <span className={s.tenue}>
            {p.model} · {p.serialNumber}
          </span>
        </div>
      ),
    },
    {
      key: "quien",
      label: "Para",
      width: 170,
      render: (p) =>
        p.usuario?.nombre ? <PersonCell name={p.usuario.nombre} size={24} /> : <span className={s.vacio}>—</span>,
    },
    {
      key: "ot",
      label: "Actividad",
      width: 150,
      render: (p) =>
        p.activity ? (
          <span className={s.actividad} title={p.activity.titulo}>
            {p.activity.anNumber}
          </span>
        ) : (
          <span className={s.vacio}>Préstamo suelto</span>
        ),
    },
    { key: "vigencia", label: "Código válido", width: 132, render: (p) => vigencia(p) },
  ];

  const caducados = pendientes.filter((p) => p.vencido).length;

  return (
    <div className={s.panel}>
      <Card>
        <CardHead
          title="Entregar con código"
          actions={<InfoBreve etiqueta="Código de recolección" texto={INFO} />}
        />
        <div className={s.cuerpo}>
          <div className={s.mostrador}>
            <Field label="Código de recolección" className={s.campoCodigo}>
              <Input
                controlSize="lg"
                className={s.codigo}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void buscar();
                }}
                placeholder="A3F7KD"
                aria-label="Código de recolección"
                maxLength={10}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </Field>
            {/* Mientras no hay hallazgo, verificar es la acción a la que vino;
                en cuanto lo hay, el primario pasa a la entrega y este baja a gris. */}
            <Button
              variant={hallazgo?.valido ? "secondary" : "primary"}
              size="lg"
              onClick={() => void buscar()}
              loading={buscando}
              disabled={!codigo.trim()}
            >
              Verificar
            </Button>
          </div>

          {hallazgo && (
            // Sin recuadro: los datos de la solicitud se separan del buscador con
            // aire, y lo que sí necesita caja es el motivo del rechazo.
            <div className={s.hallazgo}>
              <div className={s.hallazgoHead}>
                <strong className={s.hallazgoNombre}>{hallazgo.solicitud.toolName}</strong>
                <span className={s.tenue}>
                  {hallazgo.solicitud.model} · {hallazgo.solicitud.serialNumber}
                </span>
                {vigencia(hallazgo.solicitud)}
              </div>
              <PersonCell
                name={hallazgo.solicitud.usuario?.nombre ?? "—"}
                title={`Para ${hallazgo.solicitud.usuario?.nombre ?? "—"}`}
                subtitle={
                  hallazgo.solicitud.activity
                    ? `${hallazgo.solicitud.activity.anNumber} ${hallazgo.solicitud.activity.titulo}`
                    : "Préstamo suelto"
                }
                size={32}
              />
              {!hallazgo.valido && hallazgo.mensaje && (
                <Alert tone="danger" role="alert">
                  {hallazgo.mensaje}
                </Alert>
              )}
              {hallazgo.valido && (
                <div className={s.hallazgoAcciones}>
                  <Button
                    variant="primary"
                    size="lg"
                    iconStart={<HandshakeOutlinedIcon />}
                    loading={entregando}
                    onClick={() =>
                      void entregar(
                        hallazgo.solicitud.id,
                        hallazgo.solicitud.pickupCode ?? codigo,
                        hallazgo.solicitud.usuario?.id,
                      )
                    }
                  >
                    Entregar herramienta
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Esperando a que las recojan"
          subtitle={
            pendientes.length > 0
              ? `${pendientes.length} herramienta${pendientes.length === 1 ? "" : "s"}, ${caducados} con el código caducado`
              : undefined
          }
        />
        {error && (
          <div className={s.aviso}>
            <Alert
              tone={pendientes.length > 0 ? "warning" : "danger"}
              role="alert"
              action={
                <Button size="sm" variant="secondary" onClick={() => void cargar()}>
                  Reintentar
                </Button>
              }
            >
              {pendientes.length > 0 ? `${error}. Se muestra lo último que cargó.` : error}
            </Alert>
          </div>
        )}
        {cargando && pendientes.length === 0 ? (
          <div className={s.carga}>
            <SkeletonRows rows={4} label="Cargando herramientas por entregar" />
          </div>
        ) : error && pendientes.length === 0 ? null : (
          <DataTable
            columns={columnas}
            rows={pendientes}
            rowKey={(p) => p.id}
            density="compact"
            flush
            ariaLabel="Herramientas esperando a que las recojan"
            rowActionsLabel="Entregar"
            rowActions={(p) => (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Entregar ${p.toolName} a ${p.usuario?.nombre ?? "quien la pidió"}`}
                disabled={p.vencido || !p.pickupCode || entregando}
                onClick={() => void entregar(p.id, p.pickupCode ?? "", p.usuario?.id)}
              >
                Entregar
              </Button>
            )}
            emptyTitle="Nadie tiene nada que recoger"
            emptyDescription="Cuando se apruebe un préstamo, la herramienta aparecerá aquí con el código que trae quien viene por ella."
          />
        )}
      </Card>
    </div>
  );
}
