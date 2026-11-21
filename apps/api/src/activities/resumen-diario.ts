/**
 * Resumen diario para dirección (21-11-2026): lo que la plataforma hizo sola en las últimas 24 horas, en
 * un solo mensaje por el chat. Antes nadie se enteraba de qué se cerró por reloj ni de quién olvidó checar.
 *
 * Puro: las consultas viven en `resumen-diario.service.ts`. Sin Claude: es conteo y lista.
 */
export type DatosResumenDiario = {
  /** Actividades que pasaron a «No cumplida» por cierre de jornada. */
  noCumplidas: Array<{ id: number; anNumber: string | null; titulo: string; personas: string[] }>;
  /** Jornadas que nadie cerró y el sistema cerró solo. */
  jornadasCerradasSolas: string[];
  /** Personas con una actividad corriendo sin jornada abierta. */
  trabajandoSinEntrada: string[];
  /** Evidencias entregadas que llevan más de un día sin revisar. */
  porValidarAtrasadas: number;
};

const MAX_RENGLONES = 12;

export function hayAlgoQueResumir(d: DatosResumenDiario): boolean {
  return (
    d.noCumplidas.length > 0 ||
    d.jornadasCerradasSolas.length > 0 ||
    d.trabajandoSinEntrada.length > 0 ||
    d.porValidarAtrasadas > 0
  );
}

const lista = (nombres: string[]) => {
  const unicos = [...new Set(nombres.map((n) => n.trim()).filter(Boolean))];
  if (unicos.length <= 6) return unicos.join(', ');
  return `${unicos.slice(0, 6).join(', ')} y ${unicos.length - 6} más`;
};

/** Texto del mensaje, con las ligas de siempre `[etiqueta](/erp/…)`. Vacío si no pasó nada. */
export function textoResumenDiario(d: DatosResumenDiario): string {
  if (!hayAlgoQueResumir(d)) return '';
  const partes: string[] = ['Resumen de ayer: lo que la plataforma cerró o detectó sola.'];

  if (d.noCumplidas.length) {
    const n = d.noCumplidas.length;
    partes.push(`${n} ${n === 1 ? 'actividad quedó' : 'actividades quedaron'} como «No cumplida» al cierre de jornada:`);
    for (const a of d.noCumplidas.slice(0, MAX_RENGLONES)) {
      const quien = a.personas.length ? ` · ${lista(a.personas)}` : '';
      partes.push(`- [${a.anNumber ?? `#${a.id}`}](/erp/actividades/${a.id}) ${a.titulo.trim().slice(0, 70)}${quien}`);
    }
    if (n > MAX_RENGLONES) partes.push(`- y ${n - MAX_RENGLONES} más en [Actividades](/erp/actividades)`);
  }
  if (d.jornadasCerradasSolas.length) {
    const n = d.jornadasCerradasSolas.length;
    partes.push(
      `${n} ${n === 1 ? 'jornada se cerró sola' : 'jornadas se cerraron solas'} porque no checaron salida: ${lista(d.jornadasCerradasSolas)}. Revísalas en [Asistencias](/erp/asistencias).`,
    );
  }
  if (d.trabajandoSinEntrada.length) {
    partes.push(`Trabajando sin entrada ahora mismo: ${lista(d.trabajandoSinEntrada)}.`);
  }
  if (d.porValidarAtrasadas > 0) {
    const n = d.porValidarAtrasadas;
    partes.push(`${n} ${n === 1 ? 'evidencia lleva' : 'evidencias llevan'} más de un día sin revisar.`);
  }
  return partes.join('\n');
}

/** ¿El resumen está encendido? Se apaga con `RESUMEN_DIARIO=0`. */
export function resumenDiarioEncendido(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = String(env.RESUMEN_DIARIO ?? '').trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'no' || v === 'off');
}
