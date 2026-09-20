"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Avatar } from "@/components/base";
import { PrioridadChip, SemaforoDot } from "@/components/pizarra/PizarraKpi";
import { resolveAssetUrl } from "@/lib/evidence-display";
import type { Prioridad, Semaforo } from "@/lib/team-board-api";

export type PersonaPhotoCardProps = {
  href?: string;
  nombre: string;
  puesto?: string | null;
  avatarUrl?: string | null;
  /** Foto grande 180–240px (default 200). */
  photoSize?: number;
  title: string;
  subtitle?: string | null;
  prioridad?: Prioridad;
  semaforo?: Semaforo;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

/**
 * Tarjeta unificada con foto grande para Equipo, Asignadas por mí y Solicitudes.
 * Mis actividades conserva su propio layout.
 */
export default function PersonaPhotoCard({
  href,
  nombre,
  puesto,
  avatarUrl,
  photoSize = 200,
  title,
  subtitle,
  prioridad,
  semaforo,
  meta,
  actions,
  children,
}: PersonaPhotoCardProps) {
  const size = Math.min(240, Math.max(180, Math.round(photoSize)));
  const src = avatarUrl ? resolveAssetUrl(avatarUrl) : null;

  const shell: CSSProperties = {
    display: "grid",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    border: "1px solid var(--ui-border, var(--border))",
    background: "var(--ui-surface, var(--surface))",
    color: "inherit",
    textDecoration: "none",
    minWidth: 0,
  };

  const body = (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: size,
            height: size,
            borderRadius: 16,
            overflow: "hidden",
            flex: "0 0 auto",
            background: "var(--ui-bg-2, var(--bg-secondary, #f3f4f6))",
            display: "grid",
            placeItems: "center",
          }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={nombre}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Avatar url={null} name={nombre} size={Math.min(96, Math.floor(size * 0.45))} />
          )}
        </span>
        <div style={{ textAlign: "center", minWidth: 0, width: "100%" }}>
          <div style={{ fontWeight: 650, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis" }}>
            {nombre}
          </div>
          {puesto ? (
            <div style={{ fontSize: 12, color: "var(--ui-fg-2, var(--text-secondary))" }}>{puesto}</div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <SemaforoDot semaforo={semaforo} />
        <PrioridadChip prioridad={prioridad} />
        <span
          style={{
            fontWeight: 700,
            fontSize: 14,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {title}
        </span>
      </div>

      {subtitle ? (
        <div style={{ fontSize: 12.5, color: "var(--ui-fg-2, var(--text-secondary))" }}>{subtitle}</div>
      ) : null}
      {meta}
      {children}
    </>
  );

  return (
    <div style={shell}>
      {href ? (
        <Link href={href} style={{ color: "inherit", textDecoration: "none", display: "grid", gap: 10 }}>
          {body}
        </Link>
      ) : (
        body
      )}
      {actions ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{actions}</div> : null}
    </div>
  );
}
