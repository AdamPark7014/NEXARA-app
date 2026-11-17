export type PeriodoBuzon = { desde: string; hasta: string; motivo: 'ultimos_3_dias' | 'mes_anterior' };

export function diaMexico(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function suma(dia: string, dias: number): string {
  const [y, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}

export function periodosBuzonDiario(ahora: Date = new Date()): PeriodoBuzon[] {
  const hoy = diaMexico(ahora);
  const out: PeriodoBuzon[] = [{ desde: suma(hoy, -2), hasta: hoy, motivo: 'ultimos_3_dias' }];
  if (Number(hoy.slice(8, 10)) === 1) {
    const fin = suma(hoy, -1);
    out.push({ desde: fin.slice(0, 7) + '-01', hasta: fin, motivo: 'mes_anterior' });
  }
  return out;
}

export function interruptorActivo(nombreEnv: string, porOmision = true): boolean {
  const v = process.env[nombreEnv];
  if (v == null || v === '') return porOmision;
  return /^(1|true|yes|on)$/i.test(v.trim());
}