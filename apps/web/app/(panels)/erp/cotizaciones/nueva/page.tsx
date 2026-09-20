"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import EditorCotizacion from "../_editor/EditorCotizacion";

/**
 * Nueva cotización: el mismo editor, en blanco o desde una plantilla de la empresa (arriba se
 * ofrecen; `?plantilla=` la aplica directo). Se guarda sola en cuanto tiene cliente (ahí se emite el
 * folio). «Hacer cotización» desde una actividad comercial llega con `?activityId=`.
 */
function NuevaCotizacion() {
  const search = useSearchParams();
  const activityId = Number(search.get("activityId")) || null;
  const plantillaId = Number(search.get("plantilla")) || null;
  return <EditorCotizacion inicial={null} activityId={activityId} plantillaId={plantillaId} />;
}

export default function NuevaCotizacionPage() {
  return (
    <Suspense fallback={null}>
      <NuevaCotizacion />
    </Suspense>
  );
}
