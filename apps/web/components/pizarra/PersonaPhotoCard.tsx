"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AvatarAro } from "@/components/pizarra/EquipoPersonaCard";
import { PrioridadChip, SemaforoBadge } from "@/components/pizarra/PizarraKpi";
import type { Prioridad, Semaforo } from "@/lib/team-board-api";
import s from "./PersonaPhotoCard.module.css";

export type PersonaPhotoCardProps = {
  href?: string;
  nombre: string;
  puesto?: string | null;
  avatarUrl?: string | null;
  /** Foto redonda de 56-120px (default 88). Se acota: 200px era media tarjeta. */
  photoSize?: number;
  title: string;
  subtitle?: string | null;
  prioridad?: Prioridad;
  semaforo?: Semaforo;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

const CLASE_SEMAFORO: Record<Semaforo, string> = {
  rojo: s.semRojo,
  amarillo: s.semAmarillo,
  verde: s.semVerde,
};

/**
 * Tarjeta con foto para «Solicitudes de equipo» y el detalle del flujo.
 *
 * Mismo lenguaje que «Mi equipo» (foto redonda, textos centrados, nada
 * cortado), pero sin aro de estado: aquí la persona no es el sujeto del
 * estado — lo es la actividad o la solicitud, que ya traen su semáforo
 * (franja superior e insignia).
 */
export default function PersonaPhotoCard({
  href,
  nombre,
  puesto,
  avatarUrl,
  photoSize = 88,
  title,
  subtitle,
  prioridad,
  semaforo,
  meta,
  actions,
  children,
}: PersonaPhotoCardProps) {
  const size = Math.min(120, Math.max(56, Math.round(photoSize)));

  const body = (
    <>
      <div className={s.persona}>
        <AvatarAro nombre={nombre} avatarUrl={avatarUrl} size={size} />
        <div className={s.nombre}>{nombre}</div>
        {puesto ? <div className={s.puesto}>{puesto}</div> : null}
      </div>

      {semaforo || prioridad ? (
        <div className={s.insignias}>
          <SemaforoBadge semaforo={semaforo} />
          <PrioridadChip prioridad={prioridad} />
        </div>
      ) : null}

      <div className={s.titulo} title={title}>
        {title}
      </div>

      {subtitle ? <div className={s.subtitulo}>{subtitle}</div> : null}
      {meta}
      {children}
    </>
  );

  return (
    <div className={[s.tarjeta, semaforo ? CLASE_SEMAFORO[semaforo] : ""].filter(Boolean).join(" ")}>
      {href ? (
        <Link href={href} className={s.enlace}>
          {body}
        </Link>
      ) : (
        <div className={s.cuerpo}>{body}</div>
      )}
      {actions ? <div className={s.acciones}>{actions}</div> : null}
    </div>
  );
}
