import type { PropuestaActividad, CampoPropuesto } from "./asistente-ia-api";
import { desglosarPorDias, fechasLaborablesEnRango, MINUTOS_JORNADA_NETOS, repartirCamposPorDia } from "./actividad-un-solo-dia";

const DESFASE = "-06:00";
function aIso(dia: string, hora: string | null): string | null {
  const h = hora && /^\d{2}:\d{2}$/.test(hora) ? hora : "09:00";
  const d = new Date(`${dia}T${h}:00${DESFASE}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Si la frase pide varios días, propone N actividades de un día con cantidad y tiempo
 * repartidos (Cámara 1–10, 11–20…), editables en cada tarjeta antes de crear.
 */
export function expandirPropuestasMultiDia(propuestas: PropuestaActividad[]): PropuestaActividad[] {
  const out: PropuestaActividad[] = [];
  for (const p of propuestas) {
    const ag = p.agenda;
    if (!ag?.dia || !ag.hasta || ag.hasta <= ag.dia) { out.push(p); continue; }
    const fechas = fechasLaborablesEnRango(ag.dia, ag.hasta);
    if (fechas.length <= 1) {
      const payload = { ...p.payload };
      delete payload.periodoInicio; delete payload.periodoFin;
      out.push({ ...p, agenda: { ...ag, hasta: null }, payload });
      continue;
    }
    const campos: CampoPropuesto[] = p.camposEvidencia ?? [];
    const numerados = campos.filter((c) => /^(.+?)\s+\d+$/.test(c.nombre.trim()));
    const cantidadTotal = numerados.length || Math.max(0, Math.floor(Number((p.payload as {cantidad?:number}).cantidad ?? 0) || 0));
    const prefijo = numerados[0] ? /^(.+?)\s+\d+$/.exec(numerados[0].nombre.trim())?.[1]?.trim() : null;
    const unidad = prefijo ? (prefijo.toLowerCase().endsWith("a") ? `${prefijo}s` : prefijo) : "unidades";
    const porDia = typeof p.duracionMin === "number" && p.duracionMin > 0 ? p.duracionMin : MINUTOS_JORNADA_NETOS;
    const dias = desglosarPorDias({
      trabajo: p.titulo, desde: ag.dia, diasLaborables: fechas.length,
      cantidadTotal, unidad, tiempoTotalMin: porDia * fechas.length,
    }).map((d, i) => ({ ...d, fecha: fechas[i] ?? d.fecha }));
    const camposPorDia = repartirCamposPorDia(campos, dias.map((d) => d.cantidad));
    const serieClave = `ia-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    for (let i = 0; i < dias.length; i++) {
      const d = dias[i]!;
      const iso = aIso(d.fecha, ag.hora);
      const payload: Record<string, unknown> = {
        ...p.payload, titulo: d.titulo, tiempoEstimadoMin: d.tiempoEstimadoMin,
        fechaInicio: iso ?? undefined, fechaEntregaEsperada: iso ?? undefined, fechaMaxima: iso ?? undefined,
        serieClave, serieDia: d.dia, serieTotal: d.total,
      };
      delete payload.periodoInicio; delete payload.periodoFin;
      if (d.alcance) {
        const ind = String(p.indicaciones ?? payload.indicaciones ?? "").trim();
        payload.indicaciones = [ind, d.alcance].filter(Boolean).join("\n") || null;
      }
      out.push({
        ...p, titulo: d.titulo,
        resumen: `${p.tipoEtiqueta} · día ${d.dia} de ${d.total}${d.alcance ? ` · ${d.alcance}` : ""}`,
        agenda: { dia: d.fecha, hora: ag.hora, hasta: null, horaDicha: ag.horaDicha, horaPorEntrada: ag.horaPorEntrada, diaDicho: ag.diaDicho, compromiso: null },
        duracionMin: d.tiempoEstimadoMin, fechaInicio: iso,
        camposEvidencia: camposPorDia[i] ?? [],
        indicaciones: (payload.indicaciones as string | null) ?? p.indicaciones ?? null,
        avisos: [...(p.avisos ?? []), `Desglose: día ${d.dia} de ${d.total} (trabajo de varios días → una actividad por día).`],
        payload,
      });
    }
  }
  return out;
}