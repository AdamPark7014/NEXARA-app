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
  { id: "SIN_CONEXION_FUERA_DE_VENTANA", label: "Fuera de ventana" },
] as const;

/** Un rechazo por GPS falso no es lo mismo que uno por abrir la web: se pintan distinto. */
const TONO: Record<string, "danger" | "warning" | "outline"> = {
  MOCK_LOCATION: "danger",
  VIAJE_IMPOSIBLE: "danger",
  UBICACION_VIEJA: "warning",
  SIN_CONEXION_FUERA_DE_VENTANA: "warning",
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
              <p className={estilo.popParrafo}>El servidor no registró estas checadas.</p>
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
              {porGpsFalso === 1 ? "1 intento" : `${porGpsFalso} intentos`} con ubicación simulada en estas fechas.
            </Alert>
          ) : null}
        </div>
      ) : null}

      {cargando && !items ? (
        <SkeletonRows rows={4} label="Buscando intentos rechazados" />
      ) : visibles.length ? (
        <div className={tabla.tabla} role="table" aria-label="Intentos de checada rechazados">
          <div className={`${tabla.cabeza} ${estilo.rechazos} ${estilo.cabecera}`} role="row">
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
                <span className={estilo.dato}>Cuándo</span>
                {fechaHora(r.at)}
              </span>
              <span className={tabla.celda} role="cell">
                <span className={estilo.dato}>Persona</span>
                <span className={tabla.fuerte}>{r.persona?.nombre ?? "—"}</span>
                <span className={tabla.tenue}>{r.persona?.puesto ?? r.persona?.email ?? ""}</span>
              </span>
              <span role="cell">
                <span className={estilo.dato}>Intentó</span>
                {r.type === "salida" ? "Salida" : "Entrada"}
              </span>
              <span className={tabla.celda} role="cell">
                <span className={estilo.dato}>Motivo</span>
                <Badge tone={TONO[r.motivo] ?? "outline"} dot>
                  {r.motivoEtiqueta || MOTIVO_RECHAZO_ETIQUETA[r.motivo] || r.motivo}
                </Badge>
                {r.detalle ? <span className={tabla.tenue}>{r.detalle}</span> : null}
              </span>
              <span className={tabla.celda} role="cell">
                <span className={estilo.dato}>Aparato</span>
                <span className={tabla.tenue}>{r.origen ? ORIGEN_ETIQUETA[r.origen] ?? r.origen : "—"}</span>
                <span className={tabla.tenue}>{r.deviceInfo ?? ""}</span>
              </span>
              <span role="cell">
                <span className={estilo.dato}>Dónde</span>
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
