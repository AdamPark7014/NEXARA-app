"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { Alert, Badge, Button, Card, CardHead, EmptyState, InfoPopover, Segmented, SkeletonRows, tabla } from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import {
  MOTIVO_RECHAZO_ETIQUETA,
  ORIGEN_ETIQUETA,
  fetchChecadasRechazadas,
  type ChecadaRechazada,
} from "@/lib/asistencia-confiable-api";
import { googleMapsPointUrl } from "@/lib/gps-map-links";
import estilo from "./asistencia-confiable.module.css";
import rec from "./recorrido.module.css";

/**
 * Quién intentó checar y no pudo.
 *
 * Antes un rechazo por GPS falso no dejaba rastro en ningún lado: al día siguiente no
 * había forma de demostrar que había ocurrido. Esta es la vista de esos intentos, con lo
 * que hace falta para hablar con alguien: cuándo, desde qué teléfono, desde dónde y por
 * qué no pasó.
 */

const MOTIVOS = [
  { id: "", label: "Todos" },
  { id: "MOCK_LOCATION", label: "GPS falso" },
  { id: "VIAJE_IMPOSIBLE", label: "Viaje imposible" },
  { id: "UBICACION_VIEJA", label: "Ubicación vieja" },
  { id: "ORIGEN_WEB", label: "Navegador" },
  { id: "FIN_DE_SEMANA_SIN_GUARDIA", label: "Sin guardia" },
] as const;

/** Un rechazo por GPS falso no es lo mismo que uno por abrir la web: se pintan distinto. */
const TONO: Record<string, "danger" | "warning" | "outline"> = {
  MOCK_LOCATION: "danger",
  VIAJE_IMPOSIBLE: "danger",
  UBICACION_VIEJA: "warning",
  ORIGEN_WEB: "outline",
  FIN_DE_SEMANA_SIN_GUARDIA: "outline",
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ChecadasRechazadas({ token, desde, hasta }: { token: string; desde: string; hasta: string }) {
  const [items, setItems] = useState<ChecadaRechazada[] | null>(null);
  const [motivo, setMotivo] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setItems(await fetchChecadasRechazadas(token, { from: desde, to: hasta }));
    } catch (e) {
      setItems(null);
      setError(formatApiError(e, "No se pudieron cargar los intentos rechazados"));
    } finally {
      setCargando(false);
    }
  }, [token, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(
    () => (items ?? []).filter((r) => !motivo || r.motivo === motivo),
    [items, motivo],
  );

  const porGpsFalso = useMemo(
    () => (items ?? []).filter((r) => r.motivo === "MOCK_LOCATION").length,
    [items],
  );

  return (
    <Card>
      <CardHead
        title="Intentos rechazados"
        actions={
          <>
            <span className={estilo.desliza}>
              <Segmented
                items={MOTIVOS.map((m) => ({ id: m.id, label: m.label }))}
                value={motivo}
                onChange={setMotivo}
                ariaLabel="Filtrar por motivo"
              />
            </span>
            <InfoPopover label="¿Qué es esto?" title="Intentos rechazados">
              <p className={estilo.popParrafo}>
                Checadas que el servidor <strong className={estilo.fuerte}>no</strong> registró. No cuentan
                como jornada ni llegan a nómina; quedan aquí para que se pueda ver quién intentó checar, desde
                dónde y con qué teléfono.
              </p>
              <ul className={estilo.popLista}>
                <li>
                  <strong className={estilo.fuerte}>Ubicación simulada</strong>: el teléfono avisó que el
                  punto lo produjo una app de GPS falso. Sus jefes reciben el aviso.
                </li>
                <li>
                  <strong className={estilo.fuerte}>Viaje imposible</strong>: la distancia desde su checada
                  anterior no se puede recorrer en ese tiempo.
                </li>
                <li>
                  <strong className={estilo.fuerte}>Ubicación guardada</strong>: el teléfono mandó una
                  posición de hace más de media hora en vez de medir una nueva.
                </li>
                <li>
                  <strong className={estilo.fuerte}>Desde el navegador</strong>: alguien abrió la web para
                  checar. Solo se checa desde la app; si no puede usar su teléfono, su jefe registra la checada.
                </li>
              </ul>
            </InfoPopover>
          </>
        }
      />

      {error || porGpsFalso > 0 ? (
        <div className={estilo.avisos}>
          {error ? (
            <Alert
              tone="danger"
              role="alert"
              action={
                <Button size="sm" onClick={() => void cargar()}>
                  Reintentar
                </Button>
              }
            >
              {error}
            </Alert>
          ) : null}
          {porGpsFalso > 0 ? (
            <Alert tone="warning">
              {porGpsFalso === 1 ? "1 intento" : `${porGpsFalso} intentos`} con ubicación simulada en estas fechas. Sus
              jefes ya recibieron el aviso.
            </Alert>
          ) : null}
        </div>
      ) : null}

      {cargando && !items ? (
        <SkeletonRows rows={4} label="Buscando intentos rechazados" />
      ) : visibles.length ? (
        <div className={tabla.tabla} role="table" aria-label="Intentos de checada rechazados">
          <div className={`${tabla.cabeza} ${estilo.rechazos}`} role="row">
            <span role="columnheader">Cuándo</span>
            <span role="columnheader">Persona</span>
            <span role="columnheader">Intentó</span>
            <span role="columnheader">Motivo</span>
            <span role="columnheader">Aparato</span>
            <span role="columnheader">Dónde</span>
          </div>
          {visibles.map((r) => (
            <div key={r.id} className={`${tabla.fila} ${estilo.rechazos}`} role="row">
              <span className={tabla.num} role="cell">
                {fechaHora(r.at)}
              </span>
              <span className={tabla.celda} role="cell">
                <span className={tabla.fuerte}>{r.persona?.nombre ?? "—"}</span>
                <span className={tabla.tenue}>{r.persona?.puesto ?? r.persona?.email ?? ""}</span>
              </span>
              <span role="cell">{r.type === "salida" ? "Salida" : "Entrada"}</span>
              <span className={tabla.celda} role="cell">
                <Badge tone={TONO[r.motivo] ?? "outline"} dot>
                  {r.motivoEtiqueta || MOTIVO_RECHAZO_ETIQUETA[r.motivo] || r.motivo}
                </Badge>
                {r.detalle ? <span className={tabla.tenue}>{r.detalle}</span> : null}
              </span>
              <span className={tabla.celda} role="cell">
                <span className={tabla.tenue}>{r.origen ? ORIGEN_ETIQUETA[r.origen] ?? r.origen : "—"}</span>
                <span className={tabla.tenue}>{r.deviceInfo ?? ""}</span>
              </span>
              <span role="cell">
                {r.lat != null && r.lng != null ? (
                  <a
                    href={googleMapsPointUrl(r.lat, r.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className={rec.lugar}
                  >
                    <PlaceOutlinedIcon aria-hidden="true" />
                    Ver en mapa
                  </a>
                ) : (
                  <span className={tabla.tenue}>Sin ubicación</span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : items?.length && motivo ? (
        <EmptyState
          icon={<BlockOutlinedIcon fontSize="inherit" aria-hidden="true" />}
          title="Ninguno de ese tipo"
          description="Hubo otros intentos rechazados en estas fechas: quita el filtro para verlos."
        />
      ) : items ? (
        <EmptyState
          icon={<BlockOutlinedIcon fontSize="inherit" aria-hidden="true" />}
          title="Ningún intento rechazado"
          description="Nadie intentó checar de una forma que el servidor no pudiera comprobar."
        />
      ) : null}
    </Card>
  );
}
