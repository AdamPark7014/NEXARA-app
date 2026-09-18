import type { ConfirmState } from "@/components/ui/ConfirmDialog";
import type { ProyectoDetalle } from "@/lib/proyectos-api";
import type { OpcionPersona } from "./personas";

/** Lo que recibe cada pestaña del detalle. Toda mutación pasa por `mutar`. */
export type SeccionProps = {
  proyecto: ProyectoDetalle;
  token: string;
  hoy: string;
  ocupado: boolean;
  personas: OpcionPersona[];
  /**
   * Ejecuta una llamada que devuelve el proyecto completo, reemplaza el estado con la respuesta
   * y muestra el error de la API si falla. Devuelve `true` si salió bien.
   */
  mutar: (accion: () => Promise<ProyectoDetalle>, exito?: string) => Promise<boolean>;
  confirmar: (estado: ConfirmState) => void;
};
