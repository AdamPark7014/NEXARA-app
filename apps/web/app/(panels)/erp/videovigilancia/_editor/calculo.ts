/**
 * El cálculo de un diseño ya guardado (ficha y propuesta): por cada nivel, lo que tapa la vista y
 * la cobertura de cada cámara; y el resumen del edificio. El editor lleva su propia versión con
 * caché por cámara.
 */
import { useMemo } from "react";
import { resumenDelPlano } from "@/lib/cctv/editor";
import type { Grabacion } from "@/lib/cctv/infraestructura";
import { listaNiveles, transformarCroquis, type NivelConPlano } from "@/lib/cctv/niveles";
import { tapasDelPlano, type Plano, type Tapa } from "@/lib/cctv/plano";
import { camaraEnMetros, coberturaCamara, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import { resolveAssetUrl } from "@/lib/evidence-display";
import type { Diseno } from "@/lib/cctv/api";

/** El plano (con todos sus niveles) con las URL de los croquis listas para pintarse en la web. */
export function planoDeDiseno(d: Diseno): Plano {
  return transformarCroquis(d.plano, (url) => resolveAssetUrl(url) || url);
}

export type CalculoNivel = NivelConPlano & {
  tapas: Tapa[];
  coberturas: Map<string, PoligonoCobertura[]>;
  esHoja: (t: Tapa) => boolean;
};

export function calcularNivel(n: NivelConPlano): CalculoNivel {
  const { plano } = n;
  const tapas = tapasDelPlano(plano);
  const coberturas = new Map<string, PoligonoCobertura[]>();
  for (const c of plano.camaras) {
    const cm = camaraEnMetros(c, plano.escala);
    coberturas.set(c.id, cm ? coberturaCamara(cm, tapas) : []);
  }
  const muros = new Set(plano.muros.map((m) => m.id));
  const esHoja = (t: Tapa) => !muros.has(t.origen) && plano.aberturas.some((a) => a.id === t.origen && a.tipo === "puerta");
  return { ...n, tapas, coberturas, esHoja };
}

export function useCalculoDiseno(raiz: Plano, grabacion?: Grabacion | null) {
  return useMemo(() => {
    const niveles = listaNiveles(raiz).map(calcularNivel);
    const resumen = resumenDelPlano(raiz, grabacion ?? undefined);
    return { niveles, resumen };
  }, [raiz, grabacion]);
}
