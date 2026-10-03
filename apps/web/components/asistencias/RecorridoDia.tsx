"use client";

import { useMemo, type ReactNode } from "react";
import LoginOutlinedIcon from "@mui/icons-material/LoginOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import { Timeline, TimelineItem } from "@/components/base";
import { buildDayRoutePoints, googleMapsPointUrl, googleMapsRouteUrl, pointCoords, toCoord, type GpsCoordPoint } from "@/lib/gps-map-links";
import { horaCorta } from "./formato";
import s from "./recorrido.module.css";

/**
 * Recorrido de un día como línea de tiempo: entrada → algunas ubicaciones → salida.
 *
 * Cada punto lleva su hora y un «Ver en mapa»; nunca las coordenadas crudas. Con muchos
 * puntos se muestran unos cuantos repartidos en el día y el resto va en «Ver recorrido
 * completo», que abre la ruta trazada en Maps.
 */

export type ChecadaConUbicacion = {
  type: string;
  timestamp: string;
  entryLatitude?: unknown;
  entryLongitude?: unknown;
  exitLatitude?: unknown;
  exitLongitude?: unknown;
};

export type PuntoRecorrido = GpsCoordPoint & { id?: number; ultimaActualizacion?: string };

function mapaDeChecada(c: ChecadaConUbicacion | undefined): string | null {
  if (!c) return null;
  const lat = toCoord(c.type === "salida" ? c.exitLatitude : c.entryLatitude);
  const lng = toCoord(c.type === "salida" ? c.exitLongitude : c.entryLongitude);
  return lat != null && lng != null ? googleMapsPointUrl(lat, lng) : null;
}

function ultimaDelTipo(lista: ChecadaConUbicacion[] | undefined, tipo: "entrada" | "salida") {
  const del = (lista ?? []).filter((a) => a.type === tipo);
  if (!del.length) return undefined;
  return del.reduce((max, a) => (a.timestamp > max.timestamp ? a : max));
}

/** `n` elementos repartidos a lo largo de la lista (incluye el primero y el último). */
function repartidos<T>(lista: T[], n: number): T[] {
  if (lista.length <= n) return lista;
  const out: T[] = [];
  const paso = (lista.length - 1) / (n - 1);
  for (let i = 0; i < n; i += 1) out.push(lista[Math.round(i * paso)]!);
  return out;
}

export function EnlaceMapa({ href, children = "Ver en mapa" }: { href: string; children?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={s.lugar}>
      <PlaceOutlinedIcon aria-hidden="true" />
      {children}
    </a>
  );
}

export default function RecorridoDia({
  attendances,
  trajectory = [],
  maxPuntos = 5,
  enJornada = false,
  ariaLabel = "Recorrido del día",
}: {
  attendances?: ChecadaConUbicacion[];
  trajectory?: PuntoRecorrido[];
  /** Ubicaciones intermedias que se muestran como mucho. */
  maxPuntos?: number;
  /** Sin salida y con la jornada abierta: el último renglón dice que sigue trabajando. */
  enJornada?: boolean;
  ariaLabel?: string;
}) {
  const entrada = ultimaDelTipo(attendances, "entrada");
  const salida = ultimaDelTipo(attendances, "salida");

  const puntos = useMemo(
    () =>
      trajectory
        .filter((p) => pointCoords(p) && p.ultimaActualizacion)
        .sort((a, b) => String(a.ultimaActualizacion).localeCompare(String(b.ultimaActualizacion))),
    [trajectory],
  );
  const visibles = useMemo(() => repartidos(puntos, maxPuntos), [puntos, maxPuntos]);
  const ocultos = puntos.length - visibles.length;
  const rutaUrl = useMemo(() => googleMapsRouteUrl(buildDayRoutePoints(attendances, trajectory)), [attendances, trajectory]);

  if (!entrada && !salida && puntos.length === 0) {
    return <p className={s.vacio}>Sin recorrido: no hay checadas con ubicación ni puntos GPS de este día.</p>;
  }

  const entradaUrl = mapaDeChecada(entrada);
  const salidaUrl = mapaDeChecada(salida);

  return (
    <Timeline ariaLabel={ariaLabel} className={s.timeline}>
      {entrada ? (
        <TimelineItem
          state="done"
          icon={<LoginOutlinedIcon aria-hidden="true" />}
          title={`Entrada · ${horaCorta(entrada.timestamp)}`}
          meta={entradaUrl ? <EnlaceMapa href={entradaUrl} /> : <span className={s.sinLugar}>Sin ubicación</span>}
        />
      ) : null}

      {visibles.map((p, i) => {
        const c = pointCoords(p)!;
        return (
          <TimelineItem
            key={p.id ?? `${p.ultimaActualizacion}-${i}`}
            title={horaCorta(p.ultimaActualizacion)}
            meta={<EnlaceMapa href={googleMapsPointUrl(c.lat, c.lng)}>Ubicación en mapa</EnlaceMapa>}
          />
        );
      })}

      {ocultos > 0 && rutaUrl ? (
        <TimelineItem
          icon={<RouteOutlinedIcon aria-hidden="true" />}
          title={`${ocultos} ubicaci${ocultos === 1 ? "ón" : "ones"} más`}
          meta={<EnlaceMapa href={rutaUrl}>Ver recorrido completo</EnlaceMapa>}
        />
      ) : null}

      {salida ? (
        <TimelineItem
          state="done"
          icon={<LogoutOutlinedIcon aria-hidden="true" />}
          title={`Salida · ${horaCorta(salida.timestamp)}`}
          meta={salidaUrl ? <EnlaceMapa href={salidaUrl} /> : <span className={s.sinLugar}>Sin ubicación</span>}
        />
      ) : enJornada ? (
        <TimelineItem state="current" title="Sigue en jornada" meta="Aún no registra su salida" />
      ) : null}
    </Timeline>
  );
}
