"use client";

/**
 * Icono y selector del tipo de artículo (Herramienta · Equipo · Consumible · Por medida).
 * Las etiquetas, tonos y reglas viven en `lib/tipos-articulo.ts`; aquí solo se traduce
 * el tipo a su icono y se pinta.
 */
import type { ComponentType } from "react";
import HandymanOutlined from "@mui/icons-material/HandymanOutlined";
import TvOutlined from "@mui/icons-material/TvOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import {
  TIPOS_ARTICULO,
  etiquetaTipoArticulo,
  normalizarTipoArticulo,
  tonoTipoArticulo,
  type TipoArticulo,
} from "@/lib/tipos-articulo";
import s from "./TipoArticulo.module.css";

type Icono = ComponentType<{ fontSize?: "inherit" | "small" | "medium"; "aria-hidden"?: boolean | "true" }>;

const ICONO: Record<TipoArticulo, Icono> = {
  HERRAMIENTA: HandymanOutlined,
  EQUIPO: TvOutlined,
  CONSUMIBLE: Inventory2Outlined,
  MEDIDA: StraightenOutlined,
};

/** Cuadrito de color con el icono del tipo. Sin tipo: gris, con un icono genérico. */
export function IconoTipoArticulo({
  tipo,
  size = "md",
  className,
}: {
  tipo: TipoArticulo | string | null | undefined;
  /** xs 16 px (en una línea de texto) · sm 20 px (celdas, chips) · md 32 px (listas). */
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const id = normalizarTipoArticulo(tipo);
  const Componente = id ? ICONO[id] : CategoryOutlined;
  return (
    <span
      className={[s.icono, className].filter(Boolean).join(" ")}
      data-tono={tonoTipoArticulo(id)}
      data-size={size}
      title={etiquetaTipoArticulo(id)}
      aria-hidden="true"
    >
      <Componente fontSize="inherit" aria-hidden="true" />
    </span>
  );
}

/** Icono + nombre del tipo, en línea («🔧 Herramienta»). */
export function EtiquetaTipoArticulo({ tipo }: { tipo: TipoArticulo | string | null | undefined }) {
  return (
    <span className={s.etiqueta}>
      <IconoTipoArticulo tipo={tipo} size="sm" />
      {etiquetaTipoArticulo(tipo)}
    </span>
  );
}

/**
 * Los cuatro tipos como opciones grandes con icono (grupo de radio). `deshabilitados`
 * apaga los que no aplican (al editar un producto no se puede volver herramienta).
 */
export function SelectorTipoArticulo({
  value,
  onChange,
  deshabilitados = [],
  ariaLabel = "Tipo de artículo",
  invalid = false,
  describedBy,
}: {
  value: TipoArticulo | null;
  onChange: (tipo: TipoArticulo) => void;
  deshabilitados?: readonly TipoArticulo[];
  ariaLabel?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div
      className={s.selector}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
    >
      {TIPOS_ARTICULO.map((t) => {
        const activo = value === t.id;
        const apagado = deshabilitados.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={activo}
            className={s.opcion}
            data-activo={activo ? "true" : undefined}
            data-tono={t.tono}
            disabled={apagado}
            title={t.ayuda}
            onClick={() => onChange(t.id)}
          >
            <IconoTipoArticulo tipo={t.id} size="sm" />
            <span className={s.opcionTexto}>{t.etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}
