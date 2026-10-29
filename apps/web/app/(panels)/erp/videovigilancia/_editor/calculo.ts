/**
 * El cálculo de un diseño ya guardado (ficha y propuesta): lo que tapa la vista, la cobertura de
 * cada cámara y el resumen. El editor lleva su propia versión con caché por cámara.
 */
import { useMemo } from "react";
import { resumenDelPlano } from "@/lib/cctv/editor";
import type { Grabacion } from "@/lib/cctv/infraestructura";
import { tapasDelPlano, type Plano, type Tapa } from "@/lib/cctv/plano";
import { camaraEnMetros, coberturaCamara, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import { resolveAssetUrl } from "@/lib/evidence-display";
import type { Diseno } from "@/lib/cctv/api";

/** El plano con la URL del croquis lista para pintarse en la web. */
export function planoDeDiseno(d: Diseno): Plano {
  const p = d.plano;
  return p.croquis ? { ...p, croquis: { ...p.croquis, url: resolveAssetUrl(p.croquis.url) || p.croquis.url } } : p;
}

export function useCalculoDiseno(plano: Plano, grabacion?: Grabacion | null) {
  return useMemo(() => {
    const tapas = tapasDelPlano(plano);
    const coberturas = new Map<string, PoligonoCobertura[]>();
    for (const c of plano.camaras) {
      const cm = camaraEnMetros(c, plano.escala);
      coberturas.set(c.id, cm ? coberturaCamara(cm, tapas) : []);
    }
    const muros = new Set(plano.muros.map((m) => m.id));
    const esHoja = (t: Tapa) => !muros.has(t.origen) && plano.aberturas.some((a) => a.id === t.origen && a.tipo === "puerta");
    const resumen = resumenDelPlano(plano, grabacion ?? undefined);
    return { tapas, coberturas, esHoja, resumen };
  }, [plano, grabacion]);
}
