"use client";

/**
 * Piezas compartidas de Actividades (sistema visual v2) que no existen en `components/base`:
 *
 * - `RouteTabs`: pestañas que navegan (cada una es una ruta: Detalle · Evidencias · Historial).
 * - `MoreMenu`: menú «···» para las acciones que no deben competir con el primario
 *   (cancelar, eliminar).
 * - `useArchivoProtegido` + `ProtectedEvidencePhoto`: foto de `/uploads` descargada con la
 *   sesión, en la tarjeta `EvidencePhoto` de la galería; si ya no existe lo dice en el hueco.
 *
 * Solo tokens `--ui-*`: claro y oscuro salen de los tokens.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, EvidencePhoto, EvidenceSlot } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { resolveAssetUrl } from "@/lib/evidence-display";
import type { RoleKey } from "@/lib/rbac";
import s from "./_piezas.module.css";

/* ─── Pestañas por ruta ─────────────────────────────────────────────────── */

export type RouteTab = {
  id: string;
  label: ReactNode;
  href: string;
  count?: number | null;
  /** Roles que la ven (vacío = todos). Superadministración ve todas. */
  roles?: RoleKey[];
};

/**
 * Pestañas subrayadas que navegan. Activa la de ruta más larga que coincide, para que
 * «Detalle» (`/erp/actividades/5`) no se quede encendida en `/erp/actividades/5/historial`.
 */
export function RouteTabs({ items, ariaLabel = "Secciones" }: { items: ReadonlyArray<RouteTab>; ariaLabel?: string }) {
  const pathname = usePathname() ?? "";
  const { user } = useUser();
  const role = ((user?.roleKey as RoleKey | undefined) || (user?.role as RoleKey | undefined) || null);
  const isSuper = Boolean(user?.isSuperAdmin);

  const visibles = useMemo(
    () => items.filter((t) => !t.roles || t.roles.length === 0 || isSuper || (role ? t.roles.includes(role) : false)),
    [items, role, isSuper],
  );

  const activa = useMemo(() => {
    let mejor: RouteTab | null = null;
    for (const t of visibles) {
      if (pathname === t.href || pathname.startsWith(`${t.href}/`)) {
        if (!mejor || t.href.length > mejor.href.length) mejor = t;
      }
    }
    return mejor?.id ?? null;
  }, [visibles, pathname]);

  return (
    <nav aria-label={ariaLabel} className={s.tabs}>
      {visibles.map((t) => {
        const on = t.id === activa;
        return (
          <Link key={t.id} href={t.href} className={s.tab} aria-current={on ? "page" : undefined}>
            {t.label}
            {t.count != null ? <span className={s.count}>{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/* ─── Menú «···» ────────────────────────────────────────────────────────── */

export type MenuAction = {
  id: string;
  label: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
};

function Puntos() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
    </svg>
  );
}

/** Botón «···» con las acciones secundarias. Se cierra con Esc o al pulsar fuera. */
export function MoreMenu({ items, label = "Más acciones" }: { items: ReadonlyArray<MenuAction>; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div className={s.menu} ref={ref}>
      <Button
        variant="ghost"
        icon
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Puntos />
      </Button>
      {open ? (
        <ul id={menuId} role="menu" aria-label={label} className={s.menuList}>
          {items.map((it) => (
            <li key={it.id} role="none">
              <Button
                role="menuitem"
                variant={it.danger ? "danger-ghost" : "ghost"}
                fullWidth
                iconStart={it.icon}
                disabled={it.disabled}
                className={s.menuItem}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.label}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ─── Fotos protegidas ──────────────────────────────────────────────────── */

export type ArchivoProtegido = { url: string; estado: "cargando" | "listo" | "error" };

/** Descarga con la sesión los archivos protegidos de /uploads y avisa si ya no existen en el servidor. */
export function useArchivoProtegido(src: string | null | undefined, tipo?: string): ArchivoProtegido {
  const url = resolveAssetUrl(src);
  const protegido = url.startsWith("/uploads/");
  const [archivo, setArchivo] = useState<ArchivoProtegido>(() =>
    protegido ? { url: "", estado: "cargando" } : { url, estado: url ? "listo" : "error" },
  );

  useEffect(() => {
    if (!url) {
      setArchivo({ url: "", estado: "error" });
      return;
    }
    if (!protegido) {
      setArchivo({ url, estado: "listo" });
      return;
    }
    let cancelado = false;
    let blobUrl: string | null = null;
    setArchivo({ url: "", estado: "cargando" });
    void (async () => {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelado) return;
        // El PDF se embebe como blob con su tipo: así el visor del navegador lo muestra en vez de descargarlo.
        blobUrl = URL.createObjectURL(tipo ? new Blob([blob], { type: tipo }) : blob);
        setArchivo({ url: blobUrl, estado: "listo" });
      } catch {
        if (!cancelado) setArchivo({ url: "", estado: "error" });
      }
    })();
    return () => {
      cancelado = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url, protegido, tipo]);

  return archivo;
}

function Reloj() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.8V8l2.2 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Miniatura de la galería con una foto protegida; mientras carga o si falta, un hueco que lo dice. */
export function ProtectedEvidencePhoto({
  url,
  alt,
  caption,
  flag,
  onClick,
}: {
  url: string;
  alt: string;
  caption?: ReactNode;
  flag?: ReactNode;
  onClick?: () => void;
}) {
  const foto = useArchivoProtegido(url);
  if (foto.estado === "cargando") return <EvidenceSlot icon={<Reloj />} label="Cargando foto…" badge={null} />;
  if (foto.estado === "error") return <EvidenceSlot label="Esta foto ya no está en el servidor" badge={null} />;
  return <EvidencePhoto src={foto.url} alt={alt} caption={caption} flag={flag} onClick={onClick} />;
}

/* ─── Iconos de trazo para metadatos ────────────────────────────────────── */

const trazo = { stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IcoCliente() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="6" cy="5.5" r="2.4" {...trazo} />
      <path d="M1.8 13.5c.5-2.3 2.2-3.6 4.2-3.6s3.7 1.3 4.2 3.6M10.6 3.4a2.3 2.3 0 0 1 0 4.3M12 9.9c1.2.5 2 1.7 2.2 3.6" {...trazo} />
    </svg>
  );
}

export function IcoSitio() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M8 14s4.6-4.1 4.6-7.6A4.6 4.6 0 0 0 3.4 6.4C3.4 9.9 8 14 8 14z" {...trazo} />
      <circle cx="8" cy="6.4" r="1.7" {...trazo} />
    </svg>
  );
}

export function IcoCalendario() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.3" y="3.2" width="11.4" height="10.3" rx="2" {...trazo} />
      <path d="M2.3 6.6h11.4M5.4 1.9v2.4M10.6 1.9v2.4" {...trazo} />
    </svg>
  );
}

export function IcoCamara() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M2.5 5.5h2.2l1.1-1.6h4.4l1.1 1.6h2.2v7h-11z" {...trazo} />
      <circle cx="8" cy="8.8" r="2.1" {...trazo} />
    </svg>
  );
}

export function IcoDocumento() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 1.8h5.2L12.4 5v9.2H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9 1.8V5h3.4M6 8.2h4.2M6 10.6h4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IcoFormulario() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.8" y="2" width="10.4" height="12" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.3 5.6l1 1 1.8-2M9.6 5.8h1.6M5.3 9.6l1 1 1.8-2M9.6 9.8h1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
