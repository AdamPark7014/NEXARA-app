"use client";

/**
 * NEXARA · Piezas del almacén (sistema visual v2).
 *
 * Lo que repiten el inventario, el lector y las herramientas, para que todo se vea
 * igual: foto (o icono si no hay), campo de escaneo grande, tarjeta del resultado
 * de un escaneo, celda de producto y celda de existencias con semáforo.
 *
 * Candidatas a subir a `components/base` cuando otro módulo las necesite.
 */
import { forwardRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import HandymanOutlined from "@mui/icons-material/HandymanOutlined";
import QrCodeScannerOutlined from "@mui/icons-material/QrCodeScannerOutlined";
import { Button, Input, StatusBadge, TONE_COLOR, type Tone } from "@/components/base";
import { resolveAssetUrl } from "@/lib/evidence-display";
import s from "./PiezasAlmacen.module.css";

/* ─── Foto ─────────────────────────────────────────────────────────────── */

/**
 * Foto cuadrada de un producto o una herramienta. Sin foto (o si no carga) enseña
 * el icono del tipo, nunca un hueco. Con `href` abre la foto completa.
 */
export function FotoAlmacen({
  src,
  alt = "",
  size = 40,
  tipo = "producto",
  href,
  className,
}: {
  src?: string | null;
  alt?: string;
  size?: number;
  tipo?: "producto" | "herramienta";
  href?: string | null;
  className?: string;
}) {
  const url = src ? resolveAssetUrl(src) : null;
  const [fallo, setFallo] = useState<string | null>(null);
  const conFoto = Boolean(url) && fallo !== url;
  const Icono = tipo === "herramienta" ? HandymanOutlined : Inventory2Outlined;
  const cuerpo = conFoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url as string} alt={alt} loading="lazy" onError={() => setFallo(url)} />
  ) : (
    <Icono aria-hidden="true" />
  );
  const clases = [s.foto, className].filter(Boolean).join(" ");
  const estilo = { width: size, height: size };
  if (href && conFoto) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={clases} style={estilo} title={alt || "Ver foto"}>
        {cuerpo}
      </a>
    );
  }
  return (
    <span className={clases} style={estilo} aria-hidden={conFoto ? undefined : true}>
      {cuerpo}
    </span>
  );
}

/* ─── Celda de producto ────────────────────────────────────────────────── */

/** Foto + nombre + una línea de datos. Con `onClick` el nombre abre el detalle. */
export function CeldaProducto({
  nombre,
  meta,
  foto,
  tipo = "producto",
  onClick,
  title,
  disabled,
}: {
  nombre: ReactNode;
  meta?: ReactNode;
  foto?: string | null;
  tipo?: "producto" | "herramienta";
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  const texto = (
    <span className={s.productoTexto}>
      <span className={s.productoNombre}>{nombre}</span>
      {meta ? <span className={s.productoMeta}>{meta}</span> : null}
    </span>
  );
  return (
    <span className={s.producto}>
      <FotoAlmacen src={foto} tipo={tipo} size={40} />
      {onClick ? (
        <button type="button" className={s.productoBoton} onClick={onClick} title={title} disabled={disabled}>
          {texto}
        </button>
      ) : (
        texto
      )}
    </span>
  );
}

/* ─── Existencias con semáforo ─────────────────────────────────────────── */

/**
 * Cifra de existencias + insignia del semáforo + barra contra el doble del mínimo
 * (la barra llena = el doble del mínimo; la mitad = justo el mínimo).
 */
export function CeldaExistencia({
  existencia,
  minimo,
  texto,
  tono,
  formato = (n: number) => String(n),
}: {
  existencia: number;
  minimo: number;
  texto: string;
  tono: Tone;
  formato?: (n: number) => string;
}) {
  const pct = minimo > 0 ? Math.min(100, (existencia / (minimo * 2)) * 100) : existencia > 0 ? 50 : 0;
  return (
    <span className={s.nivel}>
      <span className={s.nivelFila}>
        <span className={s.nivelNum}>{formato(existencia)}</span>
        <StatusBadge label={texto} tone={tono} size="sm" />
      </span>
      <span className={s.nivelBarra} aria-hidden="true">
        <span className={s.nivelRelleno} style={{ width: `${pct}%`, background: TONE_COLOR[tono] }} />
      </span>
    </span>
  );
}

/* ─── Campo de escaneo ─────────────────────────────────────────────────── */

type CampoEscaneoProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onSubmit" | "size"> & {
  /** Se llama con «Buscar» o con el Enter del teclado. */
  onBuscar: () => void;
  /** Texto del botón. */
  botonTexto?: ReactNode;
  /** El botón deja de ser el primario cuando ya hay un resultado en pantalla. */
  botonVariante?: "primary" | "secondary";
  buscando?: boolean;
  /** Bloquea el botón (código vacío o muy corto). */
  botonDeshabilitado?: boolean;
  /** Código en mayúsculas y monoespaciado (etiquetas de herramienta). */
  mono?: boolean;
  /** Línea bajo el campo; por defecto, cómo se usa el lector. */
  pista?: ReactNode;
  /** El lector está escuchando (punto verde junto a la pista). */
  lectorActivo?: boolean;
  invalid?: boolean;
};

/**
 * El campo del mostrador: 48 px, letra de 18 px, icono de lector y el botón de
 * buscar al lado. Es un `<form>`, así el Enter del teclado busca; el lector USB
 * lo atiende `useLectorDeCodigos` aunque el foco esté en otro lado.
 */
export const CampoEscaneo = forwardRef<HTMLInputElement, CampoEscaneoProps>(function CampoEscaneo(
  {
    onBuscar,
    botonTexto = "Buscar",
    botonVariante = "primary",
    buscando = false,
    botonDeshabilitado = false,
    mono = false,
    pista = "Dispara el lector sobre el código: no hace falta hacer clic en el campo.",
    lectorActivo = true,
    invalid,
    className,
    ...rest
  },
  ref,
) {
  return (
    <div className={s.escaneo}>
      <form
        className={s.escaneoFila}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onBuscar();
        }}
      >
        <div className={s.escaneoCampo}>
          <Input
            ref={ref}
            controlSize="lg"
            iconStart={<QrCodeScannerOutlined fontSize="small" />}
            invalid={invalid}
            autoComplete="off"
            spellCheck={false}
            wrapperClassName={s.escaneoWrap}
            className={[s.escaneoInput, mono ? s.escaneoMono : "", className].filter(Boolean).join(" ")}
            {...rest}
          />
        </div>
        <Button
          type="submit"
          variant={botonVariante}
          size="lg"
          className={s.escaneoBoton}
          loading={buscando}
          disabled={botonDeshabilitado}
        >
          {botonTexto}
        </Button>
      </form>
      {pista ? (
        <p className={s.escaneoPista}>
          <span className={s.escaneoListo} data-off={lectorActivo ? undefined : "true"} aria-hidden="true" />
          {pista}
        </p>
      ) : null}
    </div>
  );
});

/* ─── Tarjeta del resultado ────────────────────────────────────────────── */

/**
 * Lo que apareció al escanear: foto, nombre, datos e insignias arriba; el formulario
 * o el texto de qué toca en medio; y las acciones (primario a la derecha) abajo.
 */
export function TarjetaHallazgo({
  foto,
  tipo = "producto",
  eyebrow,
  titulo,
  meta,
  insignias,
  children,
  acciones,
  tono,
  ariaLabel,
}: {
  foto?: string | null;
  tipo?: "producto" | "herramienta";
  eyebrow?: ReactNode;
  titulo: ReactNode;
  meta?: ReactNode;
  insignias?: ReactNode;
  children?: ReactNode;
  acciones?: ReactNode;
  /** Borde de aviso cuando el resultado pide atención. */
  tono?: "warning" | "danger";
  ariaLabel?: string;
}) {
  const fotoUrl = foto ? resolveAssetUrl(foto) : null;
  return (
    <section className={s.hallazgo} data-tono={tono} aria-label={ariaLabel}>
      <div className={s.hallazgoCabeza}>
        <FotoAlmacen src={foto} tipo={tipo} size={72} href={fotoUrl} alt={typeof titulo === "string" ? titulo : ""} />
        <div className={s.hallazgoTexto}>
          {eyebrow ? <p className={s.hallazgoEyebrow}>{eyebrow}</p> : null}
          <h3 className={s.hallazgoTitulo}>{titulo}</h3>
          {meta ? <p className={s.hallazgoMeta}>{meta}</p> : null}
          {insignias ? <div className={s.hallazgoInsignias}>{insignias}</div> : null}
        </div>
      </div>
      {children ? <div className={s.hallazgoCuerpo}>{children}</div> : null}
      {acciones ? <div className={s.hallazgoPie}>{acciones}</div> : null}
    </section>
  );
}

/* ─── Estado de una herramienta ────────────────────────────────────────── */

export type EstadoHerramienta = { etiqueta: string; tono: Tone };

/**
 * Estado legible de una herramienta del inventario. `ASSIGNED` se separa en
 * «En kit» o «Prestada» cuando se sabe por qué está fuera.
 */
export function estadoHerramienta(status: string, fuera?: "kit" | "prestamo" | null): EstadoHerramienta {
  switch (status) {
    case "AVAILABLE":
      return { etiqueta: "Disponible", tono: "success" };
    case "ASSIGNED":
      if (fuera === "kit") return { etiqueta: "En kit", tono: "info" };
      if (fuera === "prestamo") return { etiqueta: "Prestada", tono: "violet" };
      return { etiqueta: "Asignada", tono: "info" };
    case "IN_REPAIR":
      return { etiqueta: "En reparación", tono: "warning" };
    case "RETIRED":
      return { etiqueta: "Retirada", tono: "neutral" };
    default:
      return { etiqueta: status || "Sin estado", tono: "neutral" };
  }
}

/** Clase para texto monoespaciado (claves y códigos). */
export const claseMono = s.mono;
