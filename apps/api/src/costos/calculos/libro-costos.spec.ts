import {
  conservarTarifaDeViaje,
  cotizadoPorRubro,
  gasolinaYaEnKm,
  horasEfectivas,
  margen,
  movimientoDeGasto,
  movimientoDeSalida,
  movimientoDeViaje,
  movimientosDeSesiones,
  movimientosDeViatico,
  sumaDe,
  sumarPorRubro,
  ventaSinIva,
  type SesionDeReloj,
  type ViaticoDeLibro,
} from './libro-costos';

const hora = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 21, h, m));
const sesion = (id: number, inicio: Date, fin: Date | null, extra: Partial<SesionDeReloj> = {}): SesionDeReloj => ({
  id,
  activityId: 100 + id,
  userId: 7,
  startedAt: inicio,
  endedAt: fin,
  ...extra,
});

describe('horas efectivas del reloj', () => {
  it('una sesión normal cuenta lo que duró', () => {
    expect(horasEfectivas([sesion(1, hora(9), hora(13, 30))]).get(1)?.horas).toBe(4.5);
  });

  it('dos relojes encimados de la misma persona se reparten: 9-13 y 11-15 suman 6 h, no 8', () => {
    const h = horasEfectivas([sesion(1, hora(9), hora(13)), sesion(2, hora(11), hora(15))]);
    // 9-11 solo la 1 (2 h); 11-13 entre las dos (1 h y 1 h); 13-15 solo la 2 (2 h).
    expect(h.get(1)).toEqual({ horas: 3, recortada: false, compartida: true });
    expect(h.get(2)).toEqual({ horas: 3, recortada: false, compartida: true });
  });

  it('personas distintas no se reparten nada', () => {
    const h = horasEfectivas([sesion(1, hora(9), hora(13)), sesion(2, hora(9), hora(13), { userId: 8 })]);
    expect(h.get(1)?.horas).toBe(4);
    expect(h.get(2)?.horas).toBe(4);
    expect(h.get(1)?.compartida).toBe(false);
  });

  it('una sesión que cerró el sistema a las 12 h cuenta a lo mucho una jornada', () => {
    const h = horasEfectivas([sesion(1, hora(8), hora(20), { endReason: 'TOPE_12H' })]);
    expect(h.get(1)).toEqual({ horas: 8, recortada: true, compartida: false });
  });

  it('un corte de día de 3 h se queda en 3 h', () => {
    const h = horasEfectivas([sesion(1, hora(8), hora(11), { endReason: 'CORTE_DIA' })]);
    expect(h.get(1)).toEqual({ horas: 3, recortada: false, compartida: false });
  });

  it('una jornada larga cerrada por la persona no se recorta', () => {
    expect(horasEfectivas([sesion(1, hora(8), hora(20), { endReason: 'FIN' })]).get(1)?.horas).toBe(12);
  });

  it('la que sigue corriendo no se cuenta', () => {
    expect(horasEfectivas([sesion(1, hora(8), null)]).has(1)).toBe(false);
  });

  it('una sesión al revés vale cero', () => {
    expect(horasEfectivas([sesion(1, hora(10), hora(9))]).get(1)?.horas).toBe(0);
  });
});

describe('mano de obra al libro', () => {
  const fecha = () => '2026-10-21';

  it('horas por tarifa, con su origen', () => {
    const [m] = movimientosDeSesiones([sesion(1, hora(9), hora(13))], () => 125.19, fecha);
    expect(m).toMatchObject({
      origen: 'SESION:1',
      rubro: 'MANO_OBRA',
      activityId: 101,
      userId: 7,
      cantidad: 4,
      unidad: 'h',
      costoUnitario: 125.19,
      importe: 500.76,
      nota: null,
    });
  });

  it('sin sueldo vale cero y lo dice', () => {
    const [m] = movimientosDeSesiones([sesion(1, hora(9), hora(13))], () => 0, fecha);
    expect(m.importe).toBe(0);
    expect(m.nota).toMatch(/Sin sueldo/);
  });

  it('dice cuándo recortó o repartió', () => {
    const [a] = movimientosDeSesiones([sesion(1, hora(8), hora(20), { endReason: 'TOPE_12H' })], () => 100, fecha);
    expect(a.nota).toMatch(/Cierre automático/);
    expect(a.importe).toBe(800);
    const [b] = movimientosDeSesiones([sesion(1, hora(9), hora(13)), sesion(2, hora(11), hora(15))], () => 100, fecha);
    expect(b.nota).toMatch(/encimado/);
  });

  it('no agrega renglones sin horas', () => {
    expect(movimientosDeSesiones([sesion(1, hora(10), hora(10))], () => 100, fecha)).toEqual([]);
  });
});

describe('viáticos al libro', () => {
  const base: ViaticoDeLibro = {
    id: 5,
    actividadId: 50,
    usuarioId: 7,
    categoria: 'ALIMENTACION',
    estatus: 'Aprobado',
    montoSolicitado: 1000,
    montoAprobado: 800,
    montoComprobado: null,
    fecha: '2026-10-21',
    repartos: [],
  };

  it('sin comprobar usa lo aprobado, no lo solicitado', () => {
    const [m] = movimientosDeViatico(base);
    expect(m.importe).toBe(800);
    expect(m.nota).toMatch(/Sin comprobar/);
  });

  it('comprobado manda', () => {
    const [m] = movimientosDeViatico({ ...base, montoComprobado: 650 });
    expect(m.importe).toBe(650);
    expect(m.nota).toBeNull();
  });

  it.each(['Pendiente', 'Rechazado', 'rechazado '])('%s todavía no es costo', (estatus) => {
    expect(movimientosDeViatico({ ...base, estatus })).toEqual([]);
  });

  it('gasolina y casetas van a vehículos', () => {
    expect(movimientosDeViatico({ ...base, categoria: 'COMBUSTIBLE' })[0].rubro).toBe('VEHICULO');
    expect(movimientosDeViatico({ ...base, categoria: 'caseta' })[0].rubro).toBe('VEHICULO');
    expect(movimientosDeViatico(base)[0].rubro).toBe('VIATICO_GASTO');
  });

  it('el reparto mantiene la proporción y cuadra al centavo', () => {
    const m = movimientosDeViatico({
      ...base,
      montoComprobado: 100,
      repartos: [
        { actividadId: 1, monto: 100 },
        { actividadId: 2, monto: 100 },
        { actividadId: 3, monto: 100 },
      ],
    });
    expect(m.map((x) => x.importe)).toEqual([33.33, 33.33, 33.34]);
    expect(m.map((x) => x.origen)).toEqual(['VIATICO:5:1', 'VIATICO:5:2', 'VIATICO:5:3']);
    expect(m.reduce((a, x) => a + x.importe, 0)).toBeCloseTo(100, 2);
  });

  it('sin actividad ni reparto no tiene a dónde ir', () => {
    expect(movimientosDeViatico({ ...base, actividadId: null })).toEqual([]);
  });
});

describe('gastos al libro', () => {
  const g = { id: 9, actividadId: 50, usuarioId: 7, isAdministrative: false, estatusPago: 'Aprobado', montoSolicitado: 300, fecha: '2026-10-21' };

  it('autorizado entra', () => {
    expect(movimientoDeGasto(g)).toMatchObject({ origen: 'GASTO:9', rubro: 'VIATICO_GASTO', importe: 300 });
    expect(movimientoDeGasto({ ...g, estatusPago: 'Pagado' })?.importe).toBe(300);
  });

  it('pendiente no entra', () => {
    expect(movimientoDeGasto({ ...g, estatusPago: 'Pendiente' })).toBeNull();
  });

  it('el administrativo es indirecto, no de un proyecto', () => {
    expect(movimientoDeGasto({ ...g, isAdministrative: true })).toBeNull();
  });
});

describe('salidas de almacén al libro', () => {
  const s = { id: 3, activityId: 50, type: 'DISPATCH', quantity: 10, unitCost: 9.5, totalCost: 95, fecha: '2026-10-21' };

  it('salida a su costo', () => {
    expect(movimientoDeSalida(s)).toMatchObject({ origen: 'SALIDA:3', rubro: 'MATERIAL', cantidad: 10, importe: 95 });
  });

  it('una devolución resta', () => {
    expect(movimientoDeSalida({ ...s, type: 'RETURN' })).toMatchObject({ cantidad: -10, importe: -95 });
  });

  it('una salida sin costo vale cero y lo dice', () => {
    const m = movimientoDeSalida({ ...s, unitCost: 0, totalCost: 0 });
    expect(m?.importe).toBe(0);
    expect(m?.nota).toMatch(/sin costo/);
  });

  it('sin actividad, u otro tipo de movimiento, no entra', () => {
    expect(movimientoDeSalida({ ...s, activityId: null })).toBeNull();
    expect(movimientoDeSalida({ ...s, type: 'TRANSFER' })).toBeNull();
  });
});

describe('sumas', () => {
  it('por rubro y total', () => {
    const t = sumarPorRubro([
      { rubro: 'MANO_OBRA', importe: 100.1 },
      { rubro: 'MANO_OBRA', importe: '50.2' },
      { rubro: 'MATERIAL', importe: 10 },
      { rubro: 'OTRO', importe: 99 },
    ]);
    expect(t.MANO_OBRA).toBe(150.3);
    expect(t.MATERIAL).toBe(10);
    expect(sumaDe(t)).toBe(160.3);
  });

  it('margen del mockup: 275,000 de venta con 229,254 de costo es 16.6 %', () => {
    expect(margen(275_000, 229_254)).toEqual({ importe: 45_746, pct: 16.6 });
  });

  it('sin venta no hay porcentaje', () => {
    expect(margen(0, 100).pct).toBeNull();
  });
});

describe('lo cotizado', () => {
  it('reparte por grupo con el costo interno, y cuenta lo que no trae costo', () => {
    const c = cotizadoPorRubro([
      { name: 'Cámara bala', qty: 10, unitCost: 1850, unit: 'pza' },
      { name: 'Instalación de cámara', qty: 10, unitCost: 400, grupo: 'MANO_DE_OBRA' },
      { name: 'Cable UTP', qty: 300, unitCost: 9.5, grupo: 'MATERIALES' },
      { name: 'Sin costo', qty: 1, unitCost: null },
      { name: 'Costo en cero', qty: 1, unitCost: 0 },
    ]);
    expect(c.porRubro.MATERIAL).toBe(21_350);
    expect(c.porRubro.MANO_OBRA).toBe(4_000);
    expect(c.partidasSinCosto).toBe(2);
    expect(c.partidas).toBe(5);
  });

  it('venta sin IVA con y sin margen general', () => {
    expect(ventaSinIva({ subtotal: 1000, discountTotal: 100 })).toBe(900);
    expect(ventaSinIva({ subtotal: 1000, discountTotal: 100, marginPercent: 20 })).toBe(1080);
  });
});

describe('viajes en el libro', () => {
  const tarifa = { d: 1.62, im: 1.224, sm: 0.408, mn: 0.972, co: 2.8488, lb: 0.12, n: 0.24, otros: 0, fijos: 4.224, consumos: 3.2088, total: 7.43 };
  const viaje = { id: 7, vehicleId: 2, activityId: 40, userId: 5, fecha: '2026-10-28', km: 156, tarifa, rendimiento: 'REAL' as const };

  it('156 km a $7.43 son $1,159.08, y guarda de qué se compone', () => {
    const m = movimientoDeViaje(viaje, 3000);
    expect(m).toMatchObject({
      origen: 'VEHICULO:7',
      rubro: 'VEHICULO',
      activityId: 40,
      userId: 5,
      cantidad: 156,
      unidad: 'km',
      costoUnitario: 7.43,
      importe: 1159.08,
      nota: null,
    });
    expect(m.detalle).toEqual({
      vehicleId: 2,
      km: 156,
      rendimiento: 'REAL',
      tarifa: { d: 1.62, im: 1.224, sm: 0.408, mn: 0.972, co: 2.8488, lb: 0.12, n: 0.24, otros: 0 },
    });
  });

  it('avisa si aún usa el rendimiento oficial, o si los km parecen un dedazo', () => {
    expect(movimientoDeViaje({ ...viaje, rendimiento: 'OFICIAL' }, 3000).nota).toMatch(/rendimiento oficial/);
    expect(movimientoDeViaje({ ...viaje, km: 45000 }, 3000).nota).toMatch(/revisa el odómetro/);
  });

  it('un viaje conserva la tarifa de su día aunque la de hoy sea otra', () => {
    const hoy = movimientoDeViaje({ ...viaje, tarifa: { ...tarifa, total: 9 } }, 3000);
    const m = conservarTarifaDeViaje(hoy, { costoUnitario: '7.4300', detalle: { tarifa: { co: 2.84 }, rendimiento: 'OFICIAL' } });
    expect(m.costoUnitario).toBe(7.43);
    expect(m.importe).toBe(1159.08);
    expect(m.detalle).toMatchObject({ tarifa: { co: 2.84 }, rendimiento: 'OFICIAL' });
  });

  it('si se corrigió el odómetro, recalcula con esa misma tarifa', () => {
    const hoy = movimientoDeViaje({ ...viaje, km: 100, tarifa: { ...tarifa, total: 9 } }, 3000);
    expect(conservarTarifaDeViaje(hoy, { costoUnitario: 7.43 }).importe).toBe(743);
  });

  it('solo aplica a viajes y solo si ya estaba guardado', () => {
    const nuevo = movimientoDeViaje(viaje, 3000);
    expect(conservarTarifaDeViaje(nuevo, undefined)).toBe(nuevo);
    const otro = { ...nuevo, origen: 'SESION:1', costoUnitario: 100, importe: 100, cantidad: 1 };
    expect(conservarTarifaDeViaje(otro, { costoUnitario: 1 }).costoUnitario).toBe(100);
  });

  it('la gasolina de un vehículo con ficha ya va en sus km; la demás entra directa', () => {
    const conFicha = new Set([2]);
    expect(gasolinaYaEnKm({ categoria: 'COMBUSTIBLE', vehicleId: 2 }, conFicha)).toBe(true);
    expect(gasolinaYaEnKm({ categoria: 'combustible ', vehicleId: 2 }, conFicha)).toBe(true);
    expect(gasolinaYaEnKm({ categoria: 'COMBUSTIBLE', vehicleId: 3 }, conFicha)).toBe(false);
    expect(gasolinaYaEnKm({ categoria: 'COMBUSTIBLE', vehicleId: null }, conFicha)).toBe(false);
    expect(gasolinaYaEnKm({ categoria: 'CASETA', vehicleId: 2 }, conFicha)).toBe(false);
  });
});
