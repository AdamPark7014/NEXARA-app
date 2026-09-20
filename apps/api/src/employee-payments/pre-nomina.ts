/**
 * Pre-nómina: lo que se va a pagar, antes de pagarlo.
 *
 * El dueño lo pidió así: «control certero de las horas laboradas con base en los
 * registros personales, así como tiempo extra real». Hasta ahora nómina sumaba
 * `AttendanceDay.totalMinutes`, que es entrada → salida en bruto: la comida iba dentro,
 * y una jornada sin salida arrastraba lo que arrastrara. Aquí se usan las horas netas
 * que ya calcula el módulo de KPI, y el tiempo extra solo cuenta si un jefe lo aprobó.
 *
 * Archivo puro a propósito: sin Prisma ni Nest. Los números de una nómina tienen que
 * poder probarse sin base de datos.
 */

/** Minutos a horas con dos decimales. El redondeo ocurre una sola vez, al final. */
export function horas(minutos: number): number {
  return Math.round((minutos / 60) * 100) / 100;
}

/** Lo que aporta una persona a la pre-nómina. */
export type FilaPreNomina = {
  userId: number;
  nombre: string;
  puesto: string | null;
  /** Nomenclatura de RH. */
  numeroEmpleado: string | null;
  horario: string;
  diasConJornada: number;
  diasSinChecada: number;
  faltasJustificadas: number;
  retardos: number;
  minutosTarde: number;
  /** Jornada menos comida. Esto es lo que se paga como ordinario. */
  minutosLaborados: number;
  minutosProductivos: number;
  minutosInactivos: number;
  productividadPct: number | null;
  /** Tiempo extra que salió del cálculo, haya sido aprobado o no. */
  minutosExtraCalculados: number | null;
  /** Lo único que se puede pagar como extra. */
  minutosExtraAprobados: number;
  /** Lo calculado que sigue esperando decisión. Si no es cero, la nómina no está lista. */
  minutosExtraPendientes: number;
  diasExtraPendientes: number;
  /** Jornadas que la tarea de las 23:30 tuvo que cerrar: horas que nadie confirmó. */
  cierresAutomaticos: number;
  jornadasSinSalida: number;
  /** Pagos ya capturados para este periodo (`EmployeePayment`). */
  montoCapturado: number;
  pagos: number;
  /** Por qué esta fila todavía no se puede pagar a ojos cerrados. */
  avisos: string[];
};

export type ResumenPreNomina = {
  personas: number;
  minutosLaborados: number;
  minutosProductivos: number;
  minutosExtraAprobados: number;
  minutosExtraPendientes: number;
  /** Personas con algo que revisar antes de pagar. */
  conAvisos: number;
  montoCapturado: number;
};

/** Lo que entra por cada persona: sus totales de KPI más lo ya capturado en pagos. */
export type EntradaPreNomina = {
  userId: number;
  nombre: string;
  puesto?: string | null;
  numeroEmpleado?: string | null;
  horario: string;
  totales: {
    diasConJornada: number;
    diasSinChecada: number;
    faltasJustificadas: number;
    retardos: number;
    minutosTarde: number;
    minutosLaborados: number;
    minutosProductivos: number;
    minutosInactivos: number;
    productividadPct: number | null;
    minutosExtra: number | null;
    minutosExtraAprobados: number;
    minutosExtraPendientes: number;
    diasExtraPendientes: number;
    cierresAutomaticos: number;
    jornadasSinSalida: number;
  };
  /** Pagos del periodo que el módulo de pagos ya tiene capturados. */
  pagos?: Array<{ amount: number }>;
};

/**
 * Los avisos de una fila.
 *
 * No bloquean nada —quien paga decide— pero tienen que estar a la vista: cada uno es una
 * razón concreta por la que el número de horas podría no ser el real. Se escriben en el
 * mismo orden siempre, para que dos exportaciones del mismo periodo se puedan comparar.
 */
export function avisosDeFila(t: EntradaPreNomina['totales']): string[] {
  const out: string[] = [];
  if (t.diasExtraPendientes > 0) {
    out.push(
      `${t.diasExtraPendientes} día(s) con tiempo extra sin aprobar (${horas(t.minutosExtraPendientes)} h no se pagan)`,
    );
  }
  if (t.jornadasSinSalida > 0) out.push(`${t.jornadasSinSalida} jornada(s) sin salida registrada`);
  if (t.cierresAutomaticos > 0) out.push(`${t.cierresAutomaticos} salida(s) puestas por el cierre automático`);
  if (t.diasSinChecada > 0) out.push(`${t.diasSinChecada} día(s) laborable(s) sin checar`);
  return out;
}

/** Una fila de pre-nómina a partir de los totales de KPI de una persona. */
export function filaPreNomina(e: EntradaPreNomina): FilaPreNomina {
  const t = e.totales;
  const pagos = e.pagos ?? [];
  return {
    userId: e.userId,
    nombre: e.nombre,
    puesto: e.puesto ?? null,
    numeroEmpleado: e.numeroEmpleado ?? null,
    horario: e.horario,
    diasConJornada: t.diasConJornada,
    diasSinChecada: t.diasSinChecada,
    faltasJustificadas: t.faltasJustificadas,
    retardos: t.retardos,
    minutosTarde: t.minutosTarde,
    minutosLaborados: t.minutosLaborados,
    minutosProductivos: t.minutosProductivos,
    minutosInactivos: t.minutosInactivos,
    productividadPct: t.productividadPct,
    minutosExtraCalculados: t.minutosExtra,
    minutosExtraAprobados: t.minutosExtraAprobados,
    minutosExtraPendientes: t.minutosExtraPendientes,
    diasExtraPendientes: t.diasExtraPendientes,
    cierresAutomaticos: t.cierresAutomaticos,
    jornadasSinSalida: t.jornadasSinSalida,
    montoCapturado: pagos.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    pagos: pagos.length,
    avisos: avisosDeFila(t),
  };
}

/** El pie del reporte. Los porcentajes se sacan de los totales, no se promedian. */
export function resumenPreNomina(filas: FilaPreNomina[]): ResumenPreNomina {
  const s = (f: (x: FilaPreNomina) => number) => filas.reduce((acc, x) => acc + f(x), 0);
  return {
    personas: filas.length,
    minutosLaborados: s((f) => f.minutosLaborados),
    minutosProductivos: s((f) => f.minutosProductivos),
    minutosExtraAprobados: s((f) => f.minutosExtraAprobados),
    minutosExtraPendientes: s((f) => f.minutosExtraPendientes),
    conAvisos: filas.filter((f) => f.avisos.length > 0).length,
    montoCapturado: s((f) => f.montoCapturado),
  };
}

/**
 * Lo que se le sugiere al módulo de pagos como «minutos del periodo».
 *
 * Es la suma de lo laborado neto más el extra **aprobado**. El extra pendiente queda
 * fuera a propósito: mientras nadie lo autorice, no es una hora pagable, y meterlo en la
 * sugerencia haría que se pagara solo con que alguien le diera a «calcular».
 */
export function minutosPagables(t: {
  minutosLaborados: number;
  minutosExtraAprobados: number;
}): number {
  return Math.max(0, Math.round(t.minutosLaborados + t.minutosExtraAprobados));
}
