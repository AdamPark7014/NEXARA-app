"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { AvatarAro } from "@/components/pizarra/EquipoPersonaCard";
import { PrioridadChip, SemaforoDot } from "@/components/pizarra/PizarraKpi";
import type { Prioridad, Semaforo } from "@/lib/team-board-api";

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

/** Dos renglones completos: lo que importa ya no se corta a media palabra. */
const DOS_RENGLONES: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  overflowWrap: "anywhere",
};

/**
 * Tarjeta con foto para «Asignadas por mí» y «Solicitudes de equipo».
 *
 * Mismo lenguaje que «Mi equipo» (foto redonda, textos centrados, nada
 * cortado), pero sin aro de estado: aquí la persona no es el sujeto del
 * estado — lo es la actividad o la solicitud, que ya traen su semáforo.
 * «Mis actividades» conserva su propio layout.
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

  const shell: CSSProperties = {
    display: "grid",
    gap: 8,
    padding: "var(--ui-s3)",
    borderRadius: "var(--ui-radius-lg)",
    border: "1px solid var(--ui-border)",
    background: "var(--ui-surface)",
    color: "inherit",
    textDecoration: "none",
    minWidth: 0,
  };

  const body = (
    <>
      <div style={{ display: "grid", justifyItems: "center", gap: 2, minWidth: 0 }}>
        <AvatarAro nombre={nombre} avatarUrl={avatarUrl} size={size} />
        <div
          style={{
            fontWeight: 600,
            fontSize: "var(--ui-fs-body)",
            lineHeight: "var(--ui-lh-label)",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {nombre}
        </div>
        {puesto ? (
          <div
            style={{
              fontSize: "var(--ui-fs-caption)",
              lineHeight: "var(--ui-lh-caption)",
              color: "var(--ui-fg-2)",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {puesto}
          </div>
        ) : null}
      </div>

      {semaforo || prioridad ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <SemaforoDot semaforo={semaforo} />
          <PrioridadChip prioridad={prioridad} />
        </div>
      ) : null}

      <div
        style={{
          ...DOS_RENGLONES,
          fontWeight: 600,
          fontSize: "var(--ui-fs-meta)",
          lineHeight: "var(--ui-lh-meta)",
          textAlign: "center",
        }}
        title={title}
      >
        {title}
      </div>

      {subtitle ? (
        <div
          style={{
            ...DOS_RENGLONES,
            fontSize: "var(--ui-fs-caption)",
            lineHeight: "var(--ui-lh-caption)",
            color: "var(--ui-fg-2)",
            textAlign: "center",
          }}
        >
          {subtitle}
        </div>
      ) : null}
      {meta}
      {children}
    </>
  );

  return (
    <div style={shell}>
      {href ? (
        <Link href={href} style={{ color: "inherit", textDecoration: "none", display: "grid", gap: 8 }}>
          {body}
        </Link>
      ) : (
        body
      )}
      {actions ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{actions}</div> : null}
    </div>
  );
}
