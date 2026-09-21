/**
 * Reparto de un viático entre varias actividades.
 *
 * Un mismo viaje cubre varias actividades de clientes distintos —dos servicios
 * en la misma salida, la gasolina es una sola—. Hasta ahora el costo entero
 * caía sobre `Viatico.actividadId`: un proyecto pagaba de más y el otro de
 * menos, y el P&L por proyecto mentía sin que nada avisara.
 *
 * La regla que sostiene todo lo demás: **la suma de las partes es exactamente
 * el total del viático**. Ni más (el costo se duplicaría) ni menos (se
 * perdería). Se comprueba aquí, en centavos enteros, porque en coma flotante
 * 0.1 + 0.2 no es 0.3 y un reparto legítimo sería rechazado.
 *
 * Este módulo es puro a propósito: no toca Prisma ni Nest, así que la regla se
 * puede probar sola y el servicio solo añade el aislamiento por empresa.
 */

export type ParteEntrada = {
  actividadId?: number | string | null;
  monto?: number | string | null;
  nota?: string | null;
};

export type Parte = {
  actividadId: number;
  monto: number;
  nota: string | null;
};

/** Importe → centavos enteros. Redondea al centavo más cercano. */
export function aCentavos(valor: unknown): number {
  const n =
    typeof valor === 'object' && valor && 'toNumber' in (valor as object)
      ? (valor as { toNumber: () => number }).toNumber()
      : Number(valor);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

const pesos = (centavos: number) =>
  `$${(centavos / 100).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Limpia la entrada del cliente. No valida la suma — eso es `validarReparto`,
 * para que el error pueda decir a la vez qué partes hay y cuánto falta.
 */
export function normalizarPartes(raw: unknown): Parte[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error('El reparto debe ser una lista de partes (actividad y monto).');
  }
  return raw.map((entrada: ParteEntrada, i) => {
    const actividadId = Number(entrada?.actividadId);
    if (!Number.isInteger(actividadId) || actividadId <= 0) {
      throw new Error(
        `La parte ${i + 1} del reparto no indica a qué actividad se carga. Elige una actividad.`,
      );
    }
    const monto = Number(entrada?.monto);
    if (!Number.isFinite(monto)) {
      throw new Error(
        `La parte ${i + 1} del reparto no trae un importe válido. Captura cuánto carga esa actividad.`,
      );
    }
    const nota = typeof entrada?.nota === 'string' ? entrada.nota.trim().slice(0, 255) : '';
    return { actividadId, monto, nota: nota || null };
  });
}

export type ResultadoReparto = { ok: true } | { ok: false; mensaje: string };

/**
 * La suma de las partes tiene que cuadrar con el total, al centavo.
 *
 * Devuelve el fallo en vez de lanzarlo para que quien llame decida el tipo de
 * excepción; el texto ya viene listo para enseñarse junto al campo.
 */
export function validarReparto(partes: Parte[], total: unknown): ResultadoReparto {
  if (partes.length === 0) return { ok: true };

  const totalCent = aCentavos(total);
  if (!Number.isFinite(totalCent) || totalCent <= 0) {
    return {
      ok: false,
      mensaje: 'El viático no tiene un monto válido, así que no hay nada que repartir.',
    };
  }

  if (partes.length === 1) {
    // Una sola parte no es un reparto: es el viático de siempre. Se permite
    // igual —simplifica la pantalla— pero tiene que cuadrar como cualquier otro.
  }

  const vistas = new Set<number>();
  for (const parte of partes) {
    if (vistas.has(parte.actividadId)) {
      return {
        ok: false,
        mensaje:
          `La actividad #${parte.actividadId} aparece dos veces en el reparto. ` +
          'Junta las dos partes en una sola con el monto sumado.',
      };
    }
    vistas.add(parte.actividadId);

    const cent = aCentavos(parte.monto);
    if (!Number.isFinite(cent) || cent <= 0) {
      return {
        ok: false,
        mensaje:
          `La parte de la actividad #${parte.actividadId} es de ${pesos(cent || 0)}. ` +
          'Cada parte tiene que ser mayor que cero; si esa actividad no carga nada, quítala del reparto.',
      };
    }
  }

  const sumaCent = partes.reduce((acc, p) => acc + aCentavos(p.monto), 0);
  if (sumaCent === totalCent) return { ok: true };

  const diferencia = totalCent - sumaCent;
  const falta = diferencia > 0;
  return {
    ok: false,
    mensaje:
      `El reparto suma ${pesos(sumaCent)} y el viático es de ${pesos(totalCent)}: ` +
      `${falta ? 'faltan' : 'sobran'} ${pesos(Math.abs(diferencia))}. ` +
      `${falta ? 'Reparte lo que falta' : 'Baja alguna parte'} o corrige el monto del viático.`,
  };
}

/** Estado del anticipo: qué se entregó, qué se comprobó y quién le debe a quién. */
export type ResumenLiquidacion = {
  /** Lo autorizado a entregar; mientras no haya resolución, lo solicitado. */
  entregado: number;
  /** Suma de tickets entregados. `null` = todavía nadie comprobó nada. */
  comprobado: number | null;
  /** entregado − comprobado. `null` mientras no haya comprobación. */
  saldo: number | null;
  /** CUADRADO | POR_DEVOLVER (sobró dinero) | POR_REEMBOLSAR (gastó de más) | SIN_COMPROBAR */
  estado: 'SIN_COMPROBAR' | 'CUADRADO' | 'POR_DEVOLVER' | 'POR_REEMBOLSAR';
};

export function resumenLiquidacion(viatico: {
  montoSolicitado?: unknown;
  montoAprobado?: unknown;
  montoComprobado?: unknown;
}): ResumenLiquidacion {
  const aprobadoCent = aCentavos(viatico.montoAprobado);
  const solicitadoCent = aCentavos(viatico.montoSolicitado);
  const entregadoCent =
    viatico.montoAprobado != null && Number.isFinite(aprobadoCent)
      ? aprobadoCent
      : Number.isFinite(solicitadoCent)
        ? solicitadoCent
        : 0;

  if (viatico.montoComprobado == null) {
    return {
      entregado: entregadoCent / 100,
      comprobado: null,
      saldo: null,
      estado: 'SIN_COMPROBAR',
    };
  }

  const comprobadoCent = aCentavos(viatico.montoComprobado);
  const saldoCent = entregadoCent - (Number.isFinite(comprobadoCent) ? comprobadoCent : 0);
  return {
    entregado: entregadoCent / 100,
    comprobado: (Number.isFinite(comprobadoCent) ? comprobadoCent : 0) / 100,
    saldo: saldoCent / 100,
    estado: saldoCent === 0 ? 'CUADRADO' : saldoCent > 0 ? 'POR_DEVOLVER' : 'POR_REEMBOLSAR',
  };
}

/**
 * Reparte un total entre varias actividades en partes iguales, al centavo.
 *
 * Existe porque asignar un viático semanal a una cuadrilla se captura una vez
 * y se carga a las cinco actividades de la semana: pedirle al usuario que
 * teclee cinco importes que sumen exacto es pedirle que haga la división
 * larga, y el primer centavo que baile lo rechaza `validarReparto`.
 *
 * El sobrante se da de a un centavo a las primeras partes. Repartir $100 entre
 * 3 da 33.34 / 33.33 / 33.33, no tres de 33.33 que suman 99.99.
 */
export function repartirEnPartesIguales(total: unknown, actividadIds: number[]): Parte[] {
  const centavosTotal = aCentavos(total);
  if (!Number.isFinite(centavosTotal) || centavosTotal <= 0) {
    throw new Error('El monto a repartir debe ser mayor que cero.');
  }
  const ids = actividadIds.filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) {
    throw new Error('Hace falta al menos una actividad para repartir el viático.');
  }
  if (ids.length > centavosTotal) {
    throw new Error(
      `No se puede repartir ${pesos(centavosTotal)} entre ${ids.length} actividades: ` +
        'a alguna le tocaría menos de un centavo.',
    );
  }

  const base = Math.floor(centavosTotal / ids.length);
  const sobrante = centavosTotal - base * ids.length;
  return ids.map((actividadId, i) => ({
    actividadId,
    monto: (base + (i < sobrante ? 1 : 0)) / 100,
    nota: null,
  }));
}
