/**
 * Horario citado por persona y día laboral (México).
 *
 * Capas: lo planeado vive aquí; las checadas son lo real; lo pagable lo arma
 * `resumenJornada`. Prioridad al resolver: HorarioDia → plantilla de turno →
 * WorkSchedule → 10:00–18:00.
 */

export type FuenteHorario = 'horario_dia' | 'work_schedule' | 'default' | 'plantilla_turno';
export type TipoTurno = 'diurno' | 'nocturno' | 'mixto';

export type HorarioCitado = {
  fuente: FuenteHorario;
  /** Día laboral `AAAA-MM-DD` (el de la entrada del turno). */
  fecha: string;
  horaEntrada: string;
  horaSalida: string;
  cruzaMedianoche: boolean;
  graciaMin: number;
  /** Minutos brutos del turno citado (sin restar comida). */
  jornadaCitadaMin: number;
  plantillaTurnoId: number | null;
  motivo: string | null;
  tipo: TipoTurno;
};

export type HorarioDiaFila = {
  horaEntrada: string;
  horaSalida: string;
  graciaMin?: number | null;
  motivo?: string | null;
  plantillaTurnoId?: number | null;
};

export type WorkScheduleLike = {
  horaEntrada?: string | null;
  horaSalida?: string | null;
  graciaMin?: number | null;
  jornadaOrdinariaMin?: number | null;
  dias?: readonly number[] | null;
};

export type PlantillaTurnoLike = {
  id: number;
  horaEntrada: string;
  horaSalida: string;
  tipo?: TipoTurno | null;
  graciaMin?: number | null;
};

export const HORARIO_DEFAULT = {
  entrada: '10:00',
  salida: '18:00',
  graciaMin: 15,
} as const;

/** Compatibilidad con `TURNO_NOCHE_DESDE_H` cuando no hay horario configurado. */
export const UMBRAL_NOCHE_DEFAULT_H = 18;

export type PlantillaTurnoOmision = {
  clave: string;
  nombre: string;
  horaEntrada: string;
  horaSalida: string;
  color: string;
  tipo: TipoTurno;
};

export const PLANTILLAS_TURNO_OMISION: readonly PlantillaTurnoOmision[] = [
  { clave: 'dia_10_18', nombre: 'Día 10–18', horaEntrada: '10:00', horaSalida: '18:00', color: '#3B82F6', tipo: 'diurno' },
  { clave: 'noche_22_06', nombre: 'Noche 22–06', horaEntrada: '22:00', horaSalida: '06:00', color: '#6366F1', tipo: 'nocturno' },
  { clave: 'manana_6_12', nombre: 'Mañana 6–12', horaEntrada: '06:00', horaSalida: '12:00', color: '#10B981', tipo: 'mixto' },
];

/** `HH:MM` válido (00:00–23:59), o null. */
export function horaValida(valor?: string | null): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((valor ?? '').trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Minutos desde medianoche de un `HH:MM` válido; -1 si no. */
export function hmAMinutos(hm: string): number {
  const v = horaValida(hm);
  if (!v) return -1;
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
}

export function cruzaMedianocheHm(entrada: string, salida: string): boolean {
  const a = hmAMinutos(entrada);
  const b = hmAMinutos(salida);
  if (a < 0 || b < 0) return false;
  return b <= a;
}

/** Duración bruta del turno; si la salida no es después de la entrada, suma 24 h. */
export function minutosEntreHm(entrada: string, salida: string): number {
  const a = hmAMinutos(entrada);
  const b = hmAMinutos(salida);
  if (a < 0 || b < 0) return 0;
  return b > a ? b - a : b + 24 * 60 - a;
}

export function tipoTurnoDe(entrada: string, salida: string): TipoTurno {
  if (cruzaMedianocheHm(entrada, salida)) return 'nocturno';
  const a = hmAMinutos(entrada);
  const b = hmAMinutos(salida);
  if (a < 0 || b < 0) return 'diurno';
  // Fuera del rango normal de empresa (10-18) pero sin cruzar medianoche → mixto (p. ej. 6-12).
  const normalIni = 10 * 60;
  const normalFin = 18 * 60;
  if (a < normalIni || b > normalFin) {
    if (a >= 20 * 60 || (b > 0 && b <= 6 * 60 && a > b)) return 'nocturno';
    return 'mixto';
  }
  return 'diurno';
}

export function resolverHorario(p: {
  fecha: string;
  dia?: HorarioDiaFila | null;
  workSchedule?: WorkScheduleLike | null;
  plantillaTurno?: PlantillaTurnoLike | null;
  graciaDefault?: number;
}): HorarioCitado {
  const graciaBase =
    typeof p.graciaDefault === 'number' && Number.isFinite(p.graciaDefault) && p.graciaDefault >= 0
      ? Math.round(p.graciaDefault)
      : HORARIO_DEFAULT.graciaMin;

  const diaEnt = horaValida(p.dia?.horaEntrada);
  const diaSal = horaValida(p.dia?.horaSalida);
  if (p.dia && diaEnt && diaSal) {
    const gracia =
      typeof p.dia.graciaMin === 'number' && p.dia.graciaMin >= 0 ? Math.round(p.dia.graciaMin) : graciaBase;
    return armar({
      fuente: 'horario_dia',
      fecha: p.fecha,
      horaEntrada: diaEnt,
      horaSalida: diaSal,
      graciaMin: gracia,
      plantillaTurnoId: p.dia.plantillaTurnoId ?? null,
      motivo: p.dia.motivo?.trim() || null,
      tipo: tipoTurnoDe(diaEnt, diaSal),
    });
  }

  const ptEnt = horaValida(p.plantillaTurno?.horaEntrada);
  const ptSal = horaValida(p.plantillaTurno?.horaSalida);
  if (p.plantillaTurno && ptEnt && ptSal) {
    const gracia =
      typeof p.plantillaTurno.graciaMin === 'number' && p.plantillaTurno.graciaMin >= 0
        ? Math.round(p.plantillaTurno.graciaMin)
        : graciaBase;
    return armar({
      fuente: 'plantilla_turno',
      fecha: p.fecha,
      horaEntrada: ptEnt,
      horaSalida: ptSal,
      graciaMin: gracia,
      plantillaTurnoId: p.plantillaTurno.id,
      motivo: null,
      tipo: p.plantillaTurno.tipo ?? tipoTurnoDe(ptEnt, ptSal),
    });
  }

  const wsEnt = horaValida(p.workSchedule?.horaEntrada);
  const wsSal = horaValida(p.workSchedule?.horaSalida);
  if (wsEnt || wsSal) {
    const horaEntrada = wsEnt ?? HORARIO_DEFAULT.entrada;
    const horaSalida = wsSal ?? HORARIO_DEFAULT.salida;
    const gracia =
      typeof p.workSchedule?.graciaMin === 'number' && p.workSchedule.graciaMin >= 0
        ? Math.round(p.workSchedule.graciaMin)
        : graciaBase;
    return armar({
      fuente: 'work_schedule',
      fecha: p.fecha,
      horaEntrada,
      horaSalida,
      graciaMin: gracia,
      plantillaTurnoId: null,
      motivo: null,
      tipo: tipoTurnoDe(horaEntrada, horaSalida),
    });
  }

  return armar({
    fuente: 'default',
    fecha: p.fecha,
    horaEntrada: HORARIO_DEFAULT.entrada,
    horaSalida: HORARIO_DEFAULT.salida,
    graciaMin: graciaBase,
    plantillaTurnoId: null,
    motivo: null,
    tipo: 'diurno',
  });
}

function armar(p: {
  fuente: FuenteHorario;
  fecha: string;
  horaEntrada: string;
  horaSalida: string;
  graciaMin: number;
  plantillaTurnoId: number | null;
  motivo: string | null;
  tipo: TipoTurno;
}): HorarioCitado {
  return {
    ...p,
    cruzaMedianoche: cruzaMedianocheHm(p.horaEntrada, p.horaSalida),
    jornadaCitadaMin: minutosEntreHm(p.horaEntrada, p.horaSalida),
  };
}

/**
 * Hora local a partir de la cual una entrada cuenta como «de noche» para segundo
 * turno / no cortar a las 23:30. Con horario configurado que cruza medianoche o
 * es nocturno, manda la hora de entrada citada; si no, 18.
 */
export function umbralNocheH(horario?: { horaEntrada?: string | null; horaSalida?: string | null; tipo?: TipoTurno | null } | null): number {
  const ent = horaValida(horario?.horaEntrada);
  const sal = horaValida(horario?.horaSalida);
  if (!ent || !sal) return UMBRAL_NOCHE_DEFAULT_H;
  const tipo = horario?.tipo ?? tipoTurnoDe(ent, sal);
  if (tipo === 'nocturno' || cruzaMedianocheHm(ent, sal)) {
    return Math.floor(hmAMinutos(ent) / 60);
  }
  return UMBRAL_NOCHE_DEFAULT_H;
}

export function horaLocalDe(fecha: Date, tz = 'America/Mexico_City'): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(fecha);
  return Number(h) % 24;
}

/** Sustituye el umbral fijo de 18:00 cuando hay horario configurado. */
export function esEntradaDeNocheConHorario(
  entrada: Date,
  horario?: { horaEntrada?: string | null; horaSalida?: string | null; tipo?: TipoTurno | null } | null,
  tz = 'America/Mexico_City',
): boolean {
  return horaLocalDe(entrada, tz) >= umbralNocheH(horario);
}

export type TurnoProgramado = {
  userId: number;
  fecha: string;
  horaEntrada: string;
  horaSalida: string;
};

export type AvisosProgramacion = {
  solapes: Array<{ userId: number; fechaA: string; fechaB: string; detalle: string }>;
  descansoCorto: Array<{ userId: number; fechaA: string; fechaB: string; horasDescanso: number; detalle: string }>;
  masDe6Seguidos: Array<{ userId: number; desde: string; hasta: string; dias: number; detalle: string }>;
  extraSobreTope: Array<{ userId: number; semana: string; minutosExtraEst: number; tope: number; detalle: string }>;
};

/**
 * Validaciones al programar: avisos, no candados (salvo solapes, que se listan
 * para que quien programa decida; el servicio puede rechazar solapes duros).
 */
export function avisosProgramacion(p: {
  turnos: readonly TurnoProgramado[];
  /** Lo que ya está citado alrededor (no se guarda): sirve para medir descanso, racha y extra de la semana. */
  contexto?: readonly TurnoProgramado[];
  topeExtraSemanaMin?: number;
  rangoNormal?: { inicio: string; fin: string };
}): AvisosProgramacion {
  const out: AvisosProgramacion = { solapes: [], descansoCorto: [], masDe6Seguidos: [], extraSobreTope: [] };
  const rango = p.rangoNormal ?? { inicio: HORARIO_DEFAULT.entrada, fin: HORARIO_DEFAULT.salida };
  const tope = p.topeExtraSemanaMin ?? 9 * 60;

  const clave = (u: number, f: string) => `${u}:${f}`;
  const nuevos = new Set(p.turnos.map((t) => clave(t.userId, t.fecha)));
  const toca = (u: number, ...fechas: string[]) => fechas.some((f) => nuevos.has(clave(u, f)));
  const semanasNuevas = new Set(p.turnos.map((t) => clave(t.userId, lunesDe(t.fecha))));

  const porPersona = new Map<number, TurnoProgramado[]>();
  const contexto = (p.contexto ?? []).filter((t) => !nuevos.has(clave(t.userId, t.fecha)));
  for (const t of [...p.turnos, ...contexto]) {
    if (!horaValida(t.horaEntrada) || !horaValida(t.horaSalida)) continue;
    const list = porPersona.get(t.userId) ?? [];
    list.push(t);
    porPersona.set(t.userId, list);
  }

  for (const [userId, turnos] of porPersona) {
    const ordenados = [...turnos].sort((a, b) =>
      a.fecha === b.fecha ? hmAMinutos(a.horaEntrada) - hmAMinutos(b.horaEntrada) : a.fecha < b.fecha ? -1 : 1,
    );
    const intervalos = ordenados.map((t) => intervaloAbsoluto(t));

    for (let i = 0; i < intervalos.length; i++) {
      for (let j = i + 1; j < intervalos.length; j++) {
        const a = intervalos[i];
        const b = intervalos[j];
        if (a.fin > b.inicio && b.fin > a.inicio && toca(userId, ordenados[i].fecha, ordenados[j].fecha)) {
          out.solapes.push({
            userId,
            fechaA: ordenados[i].fecha,
            fechaB: ordenados[j].fecha,
            detalle: `Turnos encimados el ${ordenados[i].fecha} (${ordenados[i].horaEntrada}–${ordenados[i].horaSalida}) y ${ordenados[j].fecha} (${ordenados[j].horaEntrada}–${ordenados[j].horaSalida})`,
          });
        }
      }
    }

    for (let i = 0; i < intervalos.length - 1; i++) {
      const fin = intervalos[i].fin;
      const ini = intervalos[i + 1].inicio;
      const horas = (ini - fin) / (60 * 60 * 1000);
      if (horas >= 0 && horas < 8 && toca(userId, ordenados[i].fecha, ordenados[i + 1].fecha)) {
        out.descansoCorto.push({
          userId,
          fechaA: ordenados[i].fecha,
          fechaB: ordenados[i + 1].fecha,
          horasDescanso: Math.round(horas * 10) / 10,
          detalle: `Menos de 8 h de descanso entre el ${ordenados[i].fecha} y el ${ordenados[i + 1].fecha} (${Math.round(horas * 10) / 10} h)`,
        });
      }
    }

    const dias = [...new Set(ordenados.map((t) => t.fecha))].sort();
    let racha = 1;
    let desde = dias[0] ?? '';
    for (let i = 1; i < dias.length; i++) {
      if (sumaDias(dias[i - 1], 1) === dias[i]) {
        racha += 1;
        const ultimo = sumaDias(dias[i], 1) !== dias[i + 1];
        const tramo = dias.slice(i - racha + 1, i + 1);
        // Una sola vez por racha, cuando termina, y solo si un turno nuevo la forma.
        if (racha > 6 && ultimo && toca(userId, ...tramo)) {
          out.masDe6Seguidos.push({
            userId,
            desde,
            hasta: dias[i],
            dias: racha,
            detalle: `Más de 6 días seguidos (${desde} → ${dias[i]})`,
          });
        }
      } else {
        racha = 1;
        desde = dias[i];
      }
    }

    const porSemana = new Map<string, number>();
    for (const t of ordenados) {
      const clave = lunesDe(t.fecha);
      const laborados = minutosEntreHm(t.horaEntrada, t.horaSalida);
      const ordinarios = minutosDentroDeRango(t.horaEntrada, t.horaSalida, rango.inicio, rango.fin);
      const extra = Math.max(0, laborados - ordinarios);
      porSemana.set(clave, (porSemana.get(clave) ?? 0) + extra);
    }
    for (const [semana, minutosExtraEst] of porSemana) {
      if (minutosExtraEst > tope && semanasNuevas.has(`${userId}:${semana}`)) {
        out.extraSobreTope.push({
          userId,
          semana,
          minutosExtraEst,
          tope,
          detalle: `Extra estimado ${minutosExtraEst} min en semana del ${semana} (tope ${tope})`,
        });
      }
    }
  }

  return out;
}

function intervaloAbsoluto(t: TurnoProgramado): { inicio: number; fin: number } {
  const base = Date.parse(`${t.fecha}T00:00:00Z`);
  const ini = base + hmAMinutos(t.horaEntrada) * 60_000;
  let fin = base + hmAMinutos(t.horaSalida) * 60_000;
  if (fin <= ini) fin += 24 * 60 * 60_000;
  return { inicio: ini, fin };
}

/** Minutos del turno que caen dentro de [rangoIni, rangoFin) el mismo día civil del inicio. */
export function minutosDentroDeRango(entrada: string, salida: string, rangoIni: string, rangoFin: string): number {
  const e = hmAMinutos(entrada);
  const s0 = hmAMinutos(salida);
  const ri = hmAMinutos(rangoIni);
  const rf = hmAMinutos(rangoFin);
  if (e < 0 || s0 < 0 || ri < 0 || rf < 0) return 0;
  const s = s0 <= e ? s0 + 24 * 60 : s0;
  // Solo el tramo del primer día civil hasta min(salida, 24:00) intersecta el rango del día de entrada.
  const finDia1 = Math.min(s, 24 * 60);
  const a = Math.max(e, ri);
  const b = Math.min(finDia1, rf);
  let total = Math.max(0, b - a);
  // Si cruza medianoche, el tramo del día siguiente (0 → s0) también puede caer en 10–18.
  if (s > 24 * 60) {
    const a2 = Math.max(0, ri);
    const b2 = Math.min(s - 24 * 60, rf);
    total += Math.max(0, b2 - a2);
  }
  return total;
}

export function sumaDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Minutos de un turno que caen fuera del rango normal (la extra prevista, si se autoriza). */
export function extraPrevista(entrada: string, salida: string, descansa = false, rango: { inicio: string; fin: string } = { inicio: HORARIO_DEFAULT.entrada, fin: HORARIO_DEFAULT.salida }): number {
  const total = minutosEntreHm(entrada, salida);
  return descansa ? total : Math.max(0, total - minutosDentroDeRango(entrada, salida, rango.inicio, rango.fin));
}

/** Lunes de la semana ISO-ish (UTC por la fecha civil). */
export function lunesDe(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const dow = t.getUTCDay(); // 0=dom
  const delta = dow === 0 ? -6 : 1 - dow;
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}
