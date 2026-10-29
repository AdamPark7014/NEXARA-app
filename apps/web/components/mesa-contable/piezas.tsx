"use client";

/**
 * Piezas de la Mesa contable (maqueta aprobada 29-10-2026). Se usan solo en las pantallas de
 * `/erp/contabilidad/{por-facturar,pagos-y-gastos,estados}`; los estilos viven en
 * `mesa.module.scss` con tokens `--ui-*`.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { Categoria, LineaPoliza, NivelRevision } from "@/lib/mesa-contable";
import { cifraPoliza } from "@/lib/mesa-contable";
import m from "./mesa.module.scss";

export { m };

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

/* ── Iconos (los trazos de la maqueta) ─────────────────────────────────── */

type IcoProps = { size?: number; color?: string; className?: string };

export function IcoPalomita({ size = 14, color = "currentColor", className }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

export function IcoAviso({ size = 18, color = "currentColor", className }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M12 9v4M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function IcoError({ size = 18, color = "currentColor", className }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  );
}

export function IcoInfo({ size = 18, color = "currentColor", className }: IcoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v5h1" />
    </svg>
  );
}

export function IcoChevron({ dir, size = 16 }: { dir: "izq" | "der"; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={dir === "izq" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

export function IcoCerrar({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IcoLupa({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IcoMas({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/** Icono de una revisión según su nivel: palomita verde, aviso ámbar, aspa roja. */
export function IcoNivel({ nivel, size = 18 }: { nivel: NivelRevision; size?: number }) {
  if (nivel === "ok") return <IcoPalomita size={size} color="var(--ui-brand)" />;
  if (nivel === "error") return <IcoError size={size} color="var(--ui-danger)" />;
  return <IcoAviso size={size} color="var(--ui-warning)" />;
}

/* ── Encabezado ────────────────────────────────────────────────────────── */

export function MesaEncabezado({
  eyebrow,
  titulo,
  junto,
  acciones,
}: {
  eyebrow: ReactNode;
  titulo: ReactNode;
  /** Controles pegados al título (mes, periodo, estado del mes). */
  junto?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <header className={m.head}>
      <div className={m.headText}>
        <span className={m.eyebrow}>{eyebrow}</span>
        <h1 className={m.title}>{titulo}</h1>
      </div>
      {junto ? <div className={m.headInline}>{junto}</div> : null}
      {acciones ? <div className={m.headActions}>{acciones}</div> : null}
    </header>
  );
}

/** ‹ etiqueta › — selector de mes o periodo. */
export function Flechas({
  etiqueta,
  onAnterior,
  onSiguiente,
  siguienteDeshabilitado = false,
  textoAnterior = "Mes anterior",
  textoSiguiente = "Mes siguiente",
}: {
  etiqueta: ReactNode;
  onAnterior: () => void;
  onSiguiente: () => void;
  siguienteDeshabilitado?: boolean;
  textoAnterior?: string;
  textoSiguiente?: string;
}) {
  return (
    <div className={m.arrows}>
      <button type="button" className={cx(m.btn, m.btnIcon)} aria-label={textoAnterior} onClick={onAnterior}>
        <IcoChevron dir="izq" />
      </button>
      <span className={m.periodLabel} aria-live="polite">
        {etiqueta}
      </span>
      <button type="button" className={cx(m.btn, m.btnIcon)} aria-label={textoSiguiente} onClick={onSiguiente} disabled={siguienteDeshabilitado}>
        <IcoChevron dir="der" />
      </button>
    </div>
  );
}

/* ── Avisos y cifras ───────────────────────────────────────────────────── */

export type TonoAviso = "info" | "warning" | "success" | "danger";

export function Aviso({ tono, titulo, children, role }: { tono: TonoAviso; titulo?: ReactNode; children?: ReactNode; role?: "status" | "alert" }) {
  const icono =
    tono === "success" ? <IcoPalomita size={18} /> : tono === "danger" ? <IcoError size={18} /> : tono === "warning" ? <IcoAviso size={18} /> : <IcoInfo size={18} />;
  return (
    <div className={m.notice} data-tone={tono} role={role}>
      {icono}
      <span>
        {titulo ? <strong>{titulo}</strong> : null}
        {titulo && children ? " " : null}
        {children}
      </span>
    </div>
  );
}

export function Kpis({ children, columnas = 5, etiqueta }: { children: ReactNode; columnas?: number; etiqueta: string }) {
  return (
    <section aria-label={etiqueta} className={m.kpis} style={{ "--kpi-cols": columnas } as CSSProperties}>
      {children}
    </section>
  );
}

export type Tinta = "danger" | "warning" | "ok" | "info" | "muted";

export function Kpi({
  etiqueta,
  valor,
  pista,
  tintaValor,
  tintaPista,
  pistaFuerte = false,
  oscura = false,
  cargando = false,
}: {
  etiqueta: ReactNode;
  valor: ReactNode;
  pista?: ReactNode;
  tintaValor?: Tinta;
  tintaPista?: Tinta;
  pistaFuerte?: boolean;
  oscura?: boolean;
  cargando?: boolean;
}) {
  return (
    <div className={cx(m.kpi, oscura && m.kpiDark)} aria-busy={cargando || undefined}>
      <span className={m.kpiLabel}>{etiqueta}</span>
      <span className={m.kpiValue} data-tinta={oscura ? undefined : tintaValor}>
        {cargando ? <span className="ui-skeleton" style={{ width: 96, height: 26 }} aria-hidden="true" /> : valor}
      </span>
      {pista != null && pista !== "" ? (
        <span className={m.kpiHint} data-tinta={oscura ? undefined : tintaPista} data-fuerte={pistaFuerte ? "true" : undefined}>
          {pista}
        </span>
      ) : null}
    </div>
  );
}

/** Chip de categoría (origen o tipo de movimiento). */
export function Etiqueta({ categoria, children, chica = false }: { categoria: Categoria; children: ReactNode; chica?: boolean }) {
  return (
    <span className={cx(m.tag, chica && m.tagSm)} data-cat={categoria}>
      {children}
    </span>
  );
}

/** Control segmentado de la maqueta (botones con `aria-pressed`). */
export function Segmentos<T extends string>({
  items,
  valor,
  onCambio,
  etiqueta,
}: {
  items: ReadonlyArray<{ id: T; texto: ReactNode }>;
  valor: T;
  onCambio: (id: T) => void;
  etiqueta: string;
}) {
  return (
    <div className={m.segmented} role="group" aria-label={etiqueta}>
      {items.map((it) => (
        <button key={it.id} type="button" className={m.segment} aria-pressed={valor === it.id} onClick={() => onCambio(it.id)}>
          {it.texto}
        </button>
      ))}
    </div>
  );
}

/** Póliza (cuenta / debe / haber); el cero se pinta como raya tenue. */
export function TablaPoliza({ lineas, caption }: { lineas: LineaPoliza[]; caption: string }) {
  return (
    <table className={m.poliza}>
      <caption className={m.srOnly}>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Cuenta</th>
          <th scope="col" className={m.r}>
            Debe
          </th>
          <th scope="col" className={m.r}>
            Haber
          </th>
        </tr>
      </thead>
      <tbody>
        {lineas.map((l, i) => (
          <tr key={`${l.cuenta}-${i}`}>
            <td>{l.cuenta}</td>
            <td className={cx(m.r, Math.abs(l.debe) < 0.005 && m.zero)}>{cifraPoliza(l.debe)}</td>
            <td className={cx(m.r, Math.abs(l.haber) < 0.005 && m.zero)}>{cifraPoliza(l.haber)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Diálogo ───────────────────────────────────────────────────────────── */

/**
 * Diálogo modal mínimo: se pinta dentro de la página (hereda las tintas de la Mesa), atrapa
 * el foco con Tab, cierra con Escape o tocando el velo y devuelve el foco a quien lo abrió.
 */
export function Dialogo({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
  acciones,
  onEnviar,
}: {
  abierto: boolean;
  titulo: ReactNode;
  descripcion?: ReactNode;
  onCerrar: () => void;
  children?: ReactNode;
  acciones: ReactNode;
  onEnviar?: () => void;
}) {
  const idTitulo = useId();
  const idDesc = useId();
  const caja = useRef<HTMLFormElement>(null);
  const previo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    previo.current = (document.activeElement as HTMLElement | null) ?? null;
    const t = window.setTimeout(() => {
      const primero = caja.current?.querySelector<HTMLElement>("textarea, input, select, button");
      primero?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      previo.current?.focus?.();
    };
  }, [abierto]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCerrar();
        return;
      }
      if (e.key !== "Tab" || !caja.current) return;
      const focos = Array.from(
        caja.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), textarea, input:not([disabled]), select"),
      );
      if (!focos.length) return;
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    },
    [onCerrar],
  );

  if (!abierto) return null;
  return (
    <div
      className={m.scrim}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <form
        ref={caja}
        className={m.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descripcion ? idDesc : undefined}
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          onEnviar?.();
        }}
      >
        <h2 id={idTitulo}>{titulo}</h2>
        {descripcion ? <p id={idDesc}>{descripcion}</p> : null}
        {children}
        <div className={m.dialogActions}>{acciones}</div>
      </form>
    </div>
  );
}

/* ── Menú de fila ──────────────────────────────────────────────────────── */

/**
 * Botón «···» con un menú corto. El menú va en posición fija (calculada del botón) para que
 * la tarjeta con scroll horizontal no lo recorte; se cierra con Escape, al hacer scroll o
 * al tocar fuera.
 */
export function MenuFila({ etiqueta, opciones }: { etiqueta: string; opciones: Array<{ texto: string; onElegir: () => void }> }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  const cerrar = useCallback((devolverFoco = false) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    const ancho = 200;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8)) });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (menu.current?.contains(e.target as Node) || boton.current?.contains(e.target as Node)) return;
      cerrar();
    };
    const alMover = () => cerrar();
    document.addEventListener("mousedown", fuera);
    window.addEventListener("scroll", alMover, true);
    window.addEventListener("resize", alMover);
    const t = window.setTimeout(() => menu.current?.querySelector<HTMLElement>("button")?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("scroll", alMover, true);
      window.removeEventListener("resize", alMover);
    };
  }, [abierto, cerrar]);

  return (
    <span className={m.menuWrap}>
      <button
        ref={boton}
        type="button"
        className={cx(m.btn, m.btnIcon)}
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => setAbierto((v) => !v)}
      >
        <IcoMas />
      </button>
      {abierto ? (
        <div
          ref={menu}
          id={idMenu}
          role="menu"
          aria-label={etiqueta}
          className={m.menu}
          style={pos ? { position: "fixed", top: pos.top, left: pos.left, right: "auto", minWidth: 200 } : { visibility: "hidden" }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cerrar(true);
            }
          }}
        >
          {opciones.map((o) => (
            <button
              key={o.texto}
              type="button"
              role="menuitem"
              className={m.menuItem}
              onClick={() => {
                cerrar();
                o.onElegir();
              }}
            >
              {o.texto}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
