/**
 * Acta de reunión con IA (`POST reuniones/:id/acta-ia`). La IA propone minuta y acuerdos;
 * se guardan con los endpoints de siempre solo los que la persona deja marcados.
 */
import type { AgreementKind } from "@/lib/meetings-api";

export type Referencia = { id: number; nombre: string };

export type AcuerdoPropuesto = {
  tipo: AgreementKind;
  descripcion: string;
  textoResponsable: string | null;
  responsable: Referencia | null;
  responsableCandidatos: Referencia[];
  fechaCompromiso: string | null;
};

export type ActaPropuesta = {
  minuta: string;
  resumen: string;
  temas: Array<{ titulo: string; detalle: string }>;
  decisiones: string[];
  acuerdos: AcuerdoPropuesto[];
  pendientesSinDueno: string[];
  uso: { modelo: string; tokensEntrada: number; tokensSalida: number; usdAprox: number | null };
};

/** Lo que queda en la tarjeta de cada acuerdo después de revisarlo. */
export type AcuerdoEditable = {
  incluir: boolean;
  tipo: AgreementKind;
  descripcion: string;
  responsableId: string;
  fechaCompromiso: string;
};

export function editables(acta: ActaPropuesta): AcuerdoEditable[] {
  return acta.acuerdos.map((a) => ({
    incluir: true,
    tipo: a.tipo,
    descripcion: a.descripcion,
    responsableId: a.responsable ? String(a.responsable.id) : "",
    fechaCompromiso: a.fechaCompromiso ?? "",
  }));
}

/** Un acuerdo sin responsable no se puede guardar (regla del API); lección y riesgo sí. */
export function faltaResponsable(a: AcuerdoEditable): boolean {
  return a.incluir && a.tipo === "ACUERDO" && !a.responsableId;
}

export function cuerposParaGuardar(lista: AcuerdoEditable[]) {
  return lista
    .filter((a) => a.incluir && a.descripcion.trim() && !faltaResponsable(a))
    .map((a) => ({
      tipo: a.tipo,
      descripcion: a.descripcion.trim(),
      responsableId: a.tipo === "ACUERDO" && a.responsableId ? Number(a.responsableId) : null,
      fechaCompromiso: a.tipo === "ACUERDO" && a.fechaCompromiso ? a.fechaCompromiso : null,
    }));
}

/** Formatos de transcripción que se leen en el navegador: texto, subtítulos VTT/SRT. */
export function limpiarTranscripcion(texto: string): string {
  return texto
    .replace(/^WEBVTT.*$/m, "")
    .split(/\r?\n/)
    .filter((l) => !/^\d+$/.test(l.trim()) && !/-->/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
