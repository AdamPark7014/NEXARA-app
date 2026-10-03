"use client";

import { InfoPopover } from "@/components/base";

/**
 * La explicación detrás de una ⓘ.
 *
 * La pantalla no lleva párrafos de ayuda: quien ya sabe no los lee y quien no sabe los
 * necesita una vez. Se abre, se lee, se cierra (Escape o tocar fuera también la cierran).
 * Es la ventanita de ayuda del sistema (`InfoPopover`), con la etiqueta como título.
 */
export default function InfoBreve({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  return (
    <InfoPopover label={etiqueta} title={etiqueta}>
      {texto}
    </InfoPopover>
  );
}
