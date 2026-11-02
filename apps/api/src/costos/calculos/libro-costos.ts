/**
 * Libro de costos: de lo que la operación ya registra a renglones de costo.
 *
 * El libro **solo lee**: reloj de actividades, viáticos, gastos y salidas de almacén. Nada regresa a
 * nómina, facturas ni pólizas. Cada renglón guarda su `origen` (`SESION:12`), que es único: volver a
 * calcular actualiza ese renglón, no agrega otro.
 *
 * Módulo puro: lo que entra ya viene leído de la base y las tarifas ya vienen calculadas.
 */
import { grupoDePartida, type PartidaAgrupable } from '../../cotizaciones/partidas-grupos.js';
import { numero, redondear } from './numeros.js';

export const RUBROS = ['MATERIAL', 'MANO_OBRA', 'VEHICULO', 'HERRAMIENTA', 'VIATICO_GASTO', 'SUBCONTRATO'] as const;
export type Rubro = (typeof RUBROS)[number];

export type MovimientoCalculado = {
  origen: string;
  rubro: Rubro;
  /** Día de trabajo, `YYYY-MM-DD`. */
  fecha: string;
  activityId: number;
  userId: number | null;
  cantidad: number;
  unidad: string;
  costoUnitario: number;
  importe: number;
  /** Algo que quien revisa debe saber de este renglón. */
  nota: string | null;
  /** En un viaje: km, tarifa de ese día y de qué se compone. */
  detalle?: DetalleViaje | null;
};

export type DetalleViaje = {
  vehicleId: number;
  km: number;
  /** Pesos por km, por parte: `co`, `d`, `im`, `sm`, `mn`, `lb`, `n`, `otros`. */
  tarifa: Record<string, number>;
  rendimiento: 'REAL' | 'OFICIAL' | 'SIN_DATO';
};

/* ── Mano de obra ─────────────────────────────────────────────────────────── */

export type SesionDeReloj = {
  id: number;
  activityId: number;
  userId: number;
  startedAt: Date;
  /** Sin cerrar no se costea: sigue corriendo. */
  endedAt: Date | null;
  endReason?: string | null;
};

export type HorasDeSesion = {
  horas: number;
  /** El sistema la cerró solo y se le recortó a una jornada. */
  recortada: boolean;
  /** Había otro reloj de esa persona corriendo al mismo tiempo. */
  compartida: boolean;
};

/** Cierres del sistema: el reloj siguió sin que necesariamente hubiera trabajo. */
const CIERRES_AUTOMATICOS = new Set(['TOPE_12H', 'CORTE_DIA']);

/**
 * Horas que se pagan de cada sesión. Dos correcciones sobre el reloj en bruto:
 * - Si el sistema la cerró solo (se les olvidó), cuenta a lo mucho una jornada.
 * - Si la misma persona tenía dos relojes a la vez, ese tiempo se reparte entre los dos: una hora
 *   de sueldo no se puede cobrar dos veces.
 */
export function horasEfectivas(
  sesiones: readonly SesionDeReloj[],
  horasJornada = 8,
): Map<number, HorasDeSesion> {
  const salida = new Map<number, HorasDeSesion>();
  const porPersona = new Map<number, Array<{ id: number; inicio: number; fin: number }>>();

  for (const s of sesiones) {
    if (!s.endedAt) continue;
    const inicio = s.startedAt.getTime();
    const finReal = s.endedAt.getTime();
    if (!(finReal > inicio)) {
      salida.set(s.id, { horas: 0, recortada: false, compartida: false });
      continue;
    }
    const automatica = CIERRES_AUTOMATICOS.has(String(s.endReason ?? ''));
    const tope = inicio + horasJornada * 3_600_000;
    const fin = automatica ? Math.min(finReal, tope) : finReal;
    salida.set(s.id, { horas: 0, recortada: fin < finReal, compartida: false });
    const lista = porPersona.get(s.userId) ?? [];
    lista.push({ id: s.id, inicio, fin });
    porPersona.set(s.userId, lista);
  }

  for (const lista of porPersona.values()) {
    const cortes = [...new Set(lista.flatMap((s) => [s.inicio, s.fin]))].sort((a, b) => a - b);
    for (let i = 0; i < cortes.length - 1; i += 1) {
      const desde = cortes[i];
      const hasta = cortes[i + 1];
      const activas = lista.filter((s) => s.inicio <= desde && s.fin >= hasta);
      if (!activas.length) continue;
      const parte = (hasta - desde) / activas.length / 3_600_000;
      for (const s of activas) {
        const fila = salida.get(s.id)!;
        fila.horas += parte;
        if (activas.length > 1) fila.compartida = true;
      }
    }
  }
  for (const fila of salida.values()) fila.horas = redondear(fila.horas, 4);
  return salida;
}

export function movimientosDeSesiones(
  sesiones: readonly SesionDeReloj[],
  tarifaDe: (userId: number, inicio: Date) => number,
  fechaDe: (inicio: Date) => string,
  horasJornada = 8,
): MovimientoCalculado[] {
  const horas = horasEfectivas(sesiones, horasJornada);
  const salida: MovimientoCalculado[] = [];
  for (const s of sesiones) {
    const h = horas.get(s.id);
    if (!h || !(h.horas > 0)) continue;
    const tarifa = tarifaDe(s.userId, s.startedAt);
    const notas = [
      tarifa > 0 ? null : 'Sin sueldo capturado: vale cero',
      h.recortada ? `Cierre automático: se cuenta a lo mucho ${horasJornada} h` : null,
      h.compartida ? 'Reloj encimado con otra actividad: el tiempo se reparte' : null,
    ].filter(Boolean);
    salida.push({
      origen: `SESION:${s.id}`,
      rubro: 'MANO_OBRA',
      fecha: fechaDe(s.startedAt),
      activityId: s.activityId,
      userId: s.userId,
      cantidad: h.horas,
      unidad: 'h',
      costoUnitario: tarifa,
      importe: redondear(h.horas * tarifa),
      nota: notas.length ? notas.join('. ') : null,
    });
  }
  return salida;
}

/* ── Viáticos y gastos ────────────────────────────────────────────────────── */

export type ViaticoDeLibro = {
  id: number;
  actividadId: number | null;
  usuarioId: number;
  categoria: string | null;
  estatus: string;
  montoSolicitado: unknown;
  montoAprobado: unknown;
  montoComprobado: unknown;
  fecha: string;
  repartos: ReadonlyArray<{ actividadId: number; monto: unknown }>;
};

const ESTATUS_SIN_COSTO = new Set(['RECHAZADO', 'PENDIENTE', 'CANCELADO']);

/**
 * Lo que de verdad costó un viático: lo comprobado; si aún no se comprueba, lo aprobado. Lo pendiente
 * o rechazado todavía no es un costo. Gasolina y casetas son del rubro de vehículos.
 */
export function movimientosDeViatico(v: ViaticoDeLibro): MovimientoCalculado[] {
  if (ESTATUS_SIN_COSTO.has(String(v.estatus ?? '').trim().toUpperCase())) return [];
  const comprobado = v.montoComprobado == null ? null : numero(v.montoComprobado);
  const aprobado = v.montoAprobado == null ? null : numero(v.montoAprobado);
  const importe = comprobado ?? aprobado ?? numero(v.montoSolicitado);
  if (!(importe > 0)) return [];
  const categoria = String(v.categoria ?? '').trim().toUpperCase();
  const rubro: Rubro = categoria === 'COMBUSTIBLE' || categoria === 'CASETA' ? 'VEHICULO' : 'VIATICO_GASTO';
  const nota = comprobado == null ? 'Sin comprobar todavía: se usa lo aprobado' : null;

  const base = {
    rubro,
    fecha: v.fecha,
    userId: v.usuarioId,
    cantidad: 1,
    unidad: 'viático',
    nota,
  };

  const partes = v.repartos.map((r) => ({ actividadId: r.actividadId, monto: numero(r.monto) }));
  const sumaPartes = partes.reduce((a, p) => a + p.monto, 0);
  if (partes.length && sumaPartes > 0) {
    // El reparto se capturó sobre lo aprobado: si se comprobó otra cifra, se mantiene la proporción.
    let acumulado = 0;
    return partes.map((p, i) => {
      const parte =
        i === partes.length - 1 ? redondear(importe - acumulado) : redondear((p.monto / sumaPartes) * importe);
      acumulado = redondear(acumulado + parte);
      return { ...base, origen: `VIATICO:${v.id}:${p.actividadId}`, activityId: p.actividadId, costoUnitario: parte, importe: parte };
    });
  }
  if (!v.actividadId) return [];
  return [
    { ...base, origen: `VIATICO:${v.id}`, activityId: v.actividadId, costoUnitario: redondear(importe), importe: redondear(importe) },
  ];
}

export type GastoDeLibro = {
  id: number;
  actividadId: number;
  usuarioId: number;
  isAdministrative: boolean;
  estatusPago: string;
  montoSolicitado: unknown;
  fecha: string;
};

/** Solo gastos de operación ya autorizados. Los administrativos son indirectos, no de un proyecto. */
export function movimientoDeGasto(g: GastoDeLibro): MovimientoCalculado | null {
  if (g.isAdministrative) return null;
  const estatus = String(g.estatusPago ?? '').trim().toUpperCase();
  if (estatus !== 'APROBADO' && estatus !== 'PAGADO') return null;
  const importe = redondear(numero(g.montoSolicitado));
  if (!(importe > 0)) return null;
  return {
    origen: `GASTO:${g.id}`,
    rubro: 'VIATICO_GASTO',
    fecha: g.fecha,
    activityId: g.actividadId,
    userId: g.usuarioId,
    cantidad: 1,
    unidad: 'gasto',
    costoUnitario: importe,
    importe,
    nota: null,
  };
}

/* ── Almacén ──────────────────────────────────────────────────────────────── */

export type SalidaDeLibro = {
  id: number;
  activityId: number | null;
  type: string;
  quantity: unknown;
  unitCost: unknown;
  totalCost: unknown;
  fecha: string;
};

/** Salida a una actividad a su costo; una devolución resta. Una salida sin costo se avisa. */
export function movimientoDeSalida(m: SalidaDeLibro): MovimientoCalculado | null {
  if (!m.activityId) return null;
  const signo = m.type === 'DISPATCH' ? 1 : m.type === 'RETURN' ? -1 : 0;
  if (!signo) return null;
  const cantidad = numero(m.quantity);
  const unitario = numero(m.unitCost);
  const total = numero(m.totalCost) || redondear(cantidad * unitario);
  return {
    origen: `SALIDA:${m.id}`,
    rubro: 'MATERIAL',
    fecha: m.fecha,
    activityId: m.activityId,
    userId: null,
    cantidad: signo * cantidad,
    unidad: 'pza',
    costoUnitario: unitario,
    importe: redondear(signo * total),
    nota: total > 0 ? null : 'Salida sin costo: vale cero',
  };
}

/* ── Vehículos ────────────────────────────────────────────────────────────── */

export type ViajeDeLibro = {
  id: number;
  vehicleId: number;
  activityId: number;
  userId: number | null;
  fecha: string;
  km: number;
  tarifa: Record<string, number> & { total: number };
  rendimiento: DetalleViaje['rendimiento'];
};

/** Un viaje cuesta sus km a la tarifa de ese día. La tarifa ya trae gasolina, desgaste y lo demás. */
export function movimientoDeViaje(v: ViajeDeLibro, kmSospechoso: number): MovimientoCalculado {
  const { total, fijos, consumos, ...partes } = v.tarifa as Record<string, number>;
  return {
    origen: `VEHICULO:${v.id}`,
    rubro: 'VEHICULO',
    fecha: v.fecha,
    activityId: v.activityId,
    userId: v.userId,
    cantidad: v.km,
    unidad: 'km',
    costoUnitario: total,
    importe: redondear(v.km * total),
    nota:
      v.km > kmSospechoso
        ? 'Más de 3,000 km en una salida: revisa el odómetro'
        : v.rendimiento === 'REAL'
          ? null
          : 'Con rendimiento oficial: faltan cargas reales',
    detalle: { vehicleId: v.vehicleId, km: v.km, tarifa: partes, rendimiento: v.rendimiento },
  };
}

/**
 * Un viaje conserva la tarifa con que se costeó: si la gasolina sube después, no se reescribe lo que ya
 * pasó. Si cambiaron los km (se corrigió el odómetro) se recalcula el importe con esa misma tarifa.
 */
export function conservarTarifaDeViaje(
  m: MovimientoCalculado,
  guardado: { costoUnitario: unknown; detalle?: unknown } | null | undefined,
): MovimientoCalculado {
  if (!guardado || !m.origen.startsWith('VEHICULO:')) return m;
  const costoUnitario = numero(guardado.costoUnitario);
  const previo = guardado.detalle as Partial<DetalleViaje> | null | undefined;
  return {
    ...m,
    costoUnitario,
    importe: redondear(m.cantidad * costoUnitario),
    detalle: m.detalle && previo?.tarifa ? { ...m.detalle, tarifa: previo.tarifa, rendimiento: previo.rendimiento ?? m.detalle.rendimiento } : m.detalle,
  };
}

/**
 * La gasolina de un vehículo con ficha ya viene en sus km: si además entrara el viático al proyecto,
 * contaría doble. Sin ficha, o sin vehículo (un taxi, un coche propio), sigue entrando directo.
 */
export function gasolinaYaEnKm(
  v: { categoria?: string | null; vehicleId?: number | null },
  vehiculosConFicha: { has(id: number): boolean },
): boolean {
  return (
    String(v.categoria ?? '').trim().toUpperCase() === 'COMBUSTIBLE' &&
    v.vehicleId != null &&
    vehiculosConFicha.has(v.vehicleId)
  );
}

/* ── Sumas para las pantallas ─────────────────────────────────────────────── */

export type TotalesRubro = Record<Rubro, number>;

export function rubrosEnCero(): TotalesRubro {
  return Object.fromEntries(RUBROS.map((r) => [r, 0])) as TotalesRubro;
}

export function sumarPorRubro(filas: ReadonlyArray<{ rubro: string; importe: unknown }>): TotalesRubro {
  const total = rubrosEnCero();
  for (const f of filas) {
    if ((RUBROS as readonly string[]).includes(f.rubro)) total[f.rubro as Rubro] += numero(f.importe);
  }
  for (const r of RUBROS) total[r] = redondear(total[r]);
  return total;
}

export const sumaDe = (t: TotalesRubro): number => redondear(RUBROS.reduce((a, r) => a + t[r], 0));

export type PartidaCotizada = PartidaAgrupable & { unitCost?: unknown; qty?: number | null };

export type Cotizado = {
  porRubro: TotalesRubro;
  /** Partidas sin costo interno: el cotizado se queda corto. */
  partidasSinCosto: number;
  partidas: number;
};

/**
 * Lo cotizado por rubro, con el costo interno de cada partida. Mientras no haya matrices (Fase 2) es
 * lo único que hay: equipos y materiales a su rubro y mano de obra al suyo.
 */
export function cotizadoPorRubro(items: readonly PartidaCotizada[]): Cotizado {
  const porRubro = rubrosEnCero();
  let partidasSinCosto = 0;
  for (const item of items) {
    const costo = item.unitCost == null ? 0 : numero(item.unitCost);
    if (!(costo > 0)) {
      partidasSinCosto += 1;
      continue;
    }
    const rubro: Rubro = grupoDePartida(item) === 'MANO_DE_OBRA' ? 'MANO_OBRA' : 'MATERIAL';
    porRubro[rubro] += costo * (Number(item.qty) || 0);
  }
  for (const r of RUBROS) porRubro[r] = redondear(porRubro[r]);
  return { porRubro, partidasSinCosto, partidas: items.length };
}

export type VentaCotizacion = {
  subtotal: unknown;
  discountTotal: unknown;
  marginPercent?: unknown;
};

/** Venta sin IVA de una cotización: subtotal menos descuentos, con el margen general si lo trae. */
export function ventaSinIva(c: VentaCotizacion): number {
  const base = numero(c.subtotal) - numero(c.discountTotal);
  return redondear(base * (1 + numero(c.marginPercent) / 100));
}

export type Margen = { importe: number; pct: number | null };

/** Sobre la venta, igual que el reporte de Contabilidad. Sin venta el porcentaje es null, no 0. */
export function margen(venta: number, costo: number): Margen {
  const importe = redondear(venta - costo);
  return { importe, pct: venta > 0 ? redondear((importe / venta) * 100, 1) : null };
}
