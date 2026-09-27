"use client";

import { useEffect, useState } from "react";
import EditorCotizacion from "../_editor/EditorCotizacion";

/**
 * Nueva cotización: el mismo editor, en blanco o desde una plantilla de la empresa (arriba se
 * ofrecen; `?plantilla=` la aplica directo). Se guarda sola en cuanto tiene cliente (ahí se emite el
 * folio). «Hacer cotización» desde una actividad comercial llega con `?activityId=`.
 */
export default function NuevaCotizacionPage() {
  const [origen, setOrigen] = useState<{ activityId: number | null; plantillaId: number | null } | null>(null);

  // El editor arranca con los parámetros ya leídos: la plantilla y la actividad se aplican al montar.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    setOrigen({
      activityId: Number(qs.get("activityId")) || null,
      plantillaId: Number(qs.get("plantilla")) || null,
    });
  }, []);

  if (!origen) return null;
  return <EditorCotizacion inicial={null} activityId={origen.activityId} plantillaId={origen.plantillaId} />;
}
