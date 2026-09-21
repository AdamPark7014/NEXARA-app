"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { resolveAssetUrl } from "@/lib/evidence-display";
import type { TeamBoardUser } from "@/lib/team-board-api";
import {
  ARO_DE_ESTADO,
  contextoActividad,
  iniciales,
  queHace,
  tintaPersona,
  type EstadoAro,
} from "@/components/pizarra/equipo-estado";
import s from "./EquipoPersonaCard.module.css";

const CLASE_ARO: Record<EstadoAro, string> = {
  trabajando: s.aroTrabajando,
  retraso: s.aroRetraso,
  libre: s.aroLibre,
};

const TINTAS = [s.tinta0, s.tinta1, s.tinta2, s.tinta3];

const TITULO_ARO: Record<EstadoAro, string> = {
  trabajando: "Trabajando",
  retraso: "Con retraso o sin actividad",
  libre: "Libre",
};

/**
 * Foto redonda con el aro de estado. El aro ES el estado: verde trabajando,
 * ámbar con retraso o sin nada abierto, azul libre. Se lee de lejos sin texto.
 */
export function AvatarAro({
  nombre,
  avatarUrl,
  estado,
  size = 74,
  className,
}: {
  nombre: string;
  avatarUrl?: string | null;
  /** Sin estado el aro queda neutro: la foto identifica, no informa. */
  estado?: EstadoAro | null;
  size?: number;
  className?: string;
}) {
  const src = avatarUrl ? resolveAssetUrl(avatarUrl) : "";
  const etiqueta = estado ? TITULO_ARO[estado] : undefined;
  return (
    <span
      className={[s.aro, estado ? CLASE_ARO[estado] : "", className].filter(Boolean).join(" ")}
      style={{ "--foto": `${size}px` } as CSSProperties}
      title={etiqueta}
      aria-label={etiqueta}
      role={etiqueta ? "img" : undefined}
      aria-hidden={etiqueta ? undefined : true}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.foto} src={src} alt="" />
      ) : (
        <span className={[s.ini, TINTAS[tintaPersona(nombre)]].join(" ")} aria-hidden="true">
          {iniciales(nombre)}
        </span>
      )}
    </span>
  );
}

/** Rejilla de gente: `repeat(auto-fit, minmax(140px, 1fr))`. */
export const rejillaEquipo = s.rejilla;

/**
 * Tarjeta compacta de una persona de «Mi equipo».
 *
 * Los KPI (a tiempo / eficiencia / productividad) y el conteo de cerradas ya no
 * caben ni ayudan aquí: viven completos en su ficha, a un clic, que es a donde
 * lleva la tarjeta.
 */
export default function EquipoPersonaCard({
  user,
  isSelf = false,
  ahora = Date.now(),
}: {
  user: TeamBoardUser;
  isSelf?: boolean;
  ahora?: number;
}) {
  const estado = ARO_DE_ESTADO[user.status] ?? "retraso";
  const actividad = queHace(user);
  const contexto = contextoActividad(user, ahora);
  const espera = user.enEsperaAprobacion ?? 0;
  return (
    <Link
      href={`/erp/pizarra/${user.id}`}
      className={[s.tarjeta, isSelf ? s.tarjetaYo : ""].filter(Boolean).join(" ")}
    >
      <AvatarAro nombre={user.nombre} avatarUrl={user.avatarUrl} estado={estado} />
      <span className={s.nombre}>{user.nombre}</span>
      {user.puesto ? <span className={s.puesto}>{user.puesto}</span> : null}
      <span className={s.actividad} title={actividad}>
        {actividad}
      </span>
      {contexto ? <span className={s.contexto}>{contexto}</span> : null}
      {isSelf || user.enCorreccion || espera > 0 ? (
        <span className={s.marcas}>
          {isSelf ? <span className={[s.marca, s.marcaYo].join(" ")}>Tú</span> : null}
          {user.enCorreccion ? (
            <span className={[s.marca, s.marcaCorrige].join(" ")} title="Está corrigiendo evidencia devuelta">
              Corrigiendo
            </span>
          ) : null}
          {espera > 0 ? (
            <span className={[s.marca, s.marcaEspera].join(" ")} title="Entregadas que nadie ha aprobado">
              {espera > 1 ? `${espera} en espera` : "En espera"}
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}
