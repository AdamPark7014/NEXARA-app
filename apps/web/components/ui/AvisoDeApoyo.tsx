"use client";

import type { CSSProperties } from "react";
import { Alert } from "@/components/base/estados";
import { Button } from "@/components/base/Button";
import { enumerarConNi, type CargaDeApoyo } from "@/lib/lista-de-apoyo";

/**
 * El aviso que va dentro de un formulario cuando la lista de alguno de sus campos no llegó
 * (`useListaDeApoyo`): dice qué no cargó, por qué, y la vuelve a pedir. Varias listas caídas a la
 * vez (el servidor no contesta) salen en un solo aviso, con un solo «Reintentar».
 *
 * No pinta nada mientras cargan, cuando llegaron, ni cuando un refresco falla con la lista ya a
 * la vista: en ese caso el formulario sigue sirviendo.
 */
export default function AvisoDeApoyo({
  de,
  className,
  style,
}: {
  de: ReadonlyArray<CargaDeApoyo>;
  className?: string;
  /** El aviso trae su margen de abajo; dentro de una rejilla con `gap` se le quita por aquí. */
  style?: CSSProperties;
}) {
  const caidas = de.filter((a) => a.noCargo);
  if (caidas.length === 0) return null;
  const reintentando = caidas.some((a) => a.estado === "reintentando");
  const causas = [...new Set(caidas.map((a) => a.causa).filter((c): c is string => Boolean(c)))];
  return (
    <Alert
      tone="danger"
      dense
      role="alert"
      className={className}
      style={style}
      title={`No se pudieron cargar ${enumerarConNi(caidas.map((a) => a.nombre))}`}
      action={
        <Button
          size="sm"
          variant="secondary"
          loading={reintentando}
          onClick={() => {
            for (const a of caidas) void a.recargar();
          }}
        >
          Reintentar
        </Button>
      }
    >
      {causas.length > 0 ? causas.join(" ") : "Vuelve a intentarlo."}
    </Alert>
  );
}
