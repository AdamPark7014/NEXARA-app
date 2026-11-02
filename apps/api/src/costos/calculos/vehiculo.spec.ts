import { tarifaEquipo } from './tarifa-equipo';
import {
  autonomia,
  costoParado,
  desgaste,
  desgloseDeTarifa,
  kmDelPeriodo,
  kmDeSalida,
  odometroVigente,
  precioVigente,
  programaDeServicio,
  proximoServicio,
  rendimientoVigente,
  tanquesMedidos,
  tarifaDeVehiculo,
  valorEstimado,
  type CargaDeCalculo,
  type ServicioDeCalculo,
} from './vehiculo';

/** La camioneta de los casos a mano del documento. */
const FICHA = {
  valor: 480000,
  valorLlantas: 12000,
  rescatePct: 0.3,
  vidaUnidades: 200000,
  unidadesAnio: 30000,
  tasaInteres: 0.12,
  primaSeguro: 0.04,
  ko: 0.6,
  rendimiento: 9,
  precioCombustible: 24.5,
  costoAceite: 1200,
  aceiteCadaUnidades: 10000,
  vidaLlantasUnidades: 50000,
};

const carga = (fecha: string, odometro: number, litros: number, tanqueLleno = true, precio = 24.5): CargaDeCalculo => ({
  fecha,
  odometro,
  litros,
  importe: litros * precio,
  tanqueLleno,
});

describe('tanques medidos', () => {
  it('un tanque va de un lleno al siguiente: 450 km entre 52.3 L son 8.6 km/L', () => {
    const t = tanquesMedidos([carga('2026-10-20', 12030, 50), carga('2026-10-28', 12480, 52.3)]);
    expect(t).toEqual([{ fecha: '2026-10-28', km: 450, litros: 52.3, kmPorLitro: 8.6 }]);
  });

  it('una carga parcial se suma a la siguiente', () => {
    const t = tanquesMedidos([
      carga('2026-10-01', 10000, 60),
      carga('2026-10-05', 10200, 20, false),
      carga('2026-10-10', 10500, 40),
    ]);
    // 500 km entre 20 + 40 L.
    expect(t).toEqual([{ fecha: '2026-10-10', km: 500, litros: 60, kmPorLitro: 8.33 }]);
  });

  it('lo anterior al primer lleno no se mide: no se sabe con cuánto venía', () => {
    const t = tanquesMedidos([carga('2026-10-01', 10000, 15, false), carga('2026-10-05', 10300, 40)]);
    expect(t).toEqual([]);
  });

  it('un rendimiento imposible es un dedazo: no se promedia, y el siguiente tanque arranca de ahí', () => {
    const t = tanquesMedidos([
      carga('2026-10-01', 10000, 50),
      carga('2026-10-05', 19000, 50), // 180 km/L
      carga('2026-10-10', 19430, 50),
    ]);
    expect(t).toEqual([{ fecha: '2026-10-10', km: 430, litros: 50, kmPorLitro: 8.6 }]);
  });

  it('se ordenan por odómetro aunque se capturen en desorden', () => {
    const t = tanquesMedidos([carga('2026-10-28', 12480, 52.3), carga('2026-10-20', 12030, 50)]);
    expect(t).toHaveLength(1);
    expect(t[0].km).toBe(450);
  });
});

describe('rendimiento vigente', () => {
  const tanque = (kmPorLitro: number, litros = 50) => ({ fecha: '2026-10-01', km: kmPorLitro * litros, litros, kmPorLitro });

  it('sin tres tanques manda el oficial, y dice cuántos faltan', () => {
    const r = rendimientoVigente(11.9, [tanque(8.6), tanque(8.4)]);
    expect(r).toMatchObject({ usado: 11.9, fuente: 'OFICIAL', tanques: 2, faltan: 1, real: 8.5 });
  });

  it('con tres tanques manda el real, pesado por litros', () => {
    const r = rendimientoVigente(11.9, [tanque(9, 20), tanque(8, 60), tanque(8.5, 20)]);
    // (180 + 480 + 170) / 100 L
    expect(r).toMatchObject({ usado: 8.3, real: 8.3, fuente: 'REAL', faltan: 0 });
  });

  it('solo promedia los ocho tanques más recientes', () => {
    const viejos = Array.from({ length: 5 }, () => tanque(20));
    const nuevos = Array.from({ length: 8 }, () => tanque(8));
    expect(rendimientoVigente(null, [...viejos, ...nuevos]).real).toBe(8);
  });

  it('sin oficial ni cargas no inventa nada', () => {
    expect(rendimientoVigente(null, [])).toMatchObject({ usado: null, fuente: 'SIN_DATO', faltan: 3 });
  });
});

describe('precio y autonomía', () => {
  it('el precio sale de las últimas cinco cargas, pesado por litros', () => {
    const cargas = [
      carga('2026-01-01', 1000, 50, true, 30),
      carga('2026-02-01', 2000, 10, true, 20),
      carga('2026-03-01', 3000, 30, true, 24),
      carga('2026-04-01', 4000, 10, true, 20),
      carga('2026-05-01', 5000, 30, true, 24),
      carga('2026-06-01', 6000, 20, true, 25),
    ];
    // La de $30 ya no entra: (200 + 720 + 200 + 720 + 500) / 100 L
    expect(precioVigente(cargas, 99)).toBe(23.4);
  });

  it('sin cargas usa el de la ficha; sin ficha, nada', () => {
    expect(precioVigente([], 24.5)).toBe(24.5);
    expect(precioVigente([], null)).toBeNull();
  });

  it('autonomía: 80 L a 8.6 km/L son 688 km', () => {
    expect(autonomia(80, 8.6)).toBe(688);
    expect(autonomia(null, 8.6)).toBeNull();
  });
});

describe('tarifa del vehículo', () => {
  it('con el rendimiento oficial sale $6.64 por km, como en el mockup', () => {
    const { tarifa, rendimiento } = tarifaDeVehiculo(FICHA, 11.91, []);
    expect(rendimiento.fuente).toBe('OFICIAL');
    expect(tarifa.total).toBeCloseTo(6.64, 2);
  });

  it('con tres tanques reales a 8.6 km/L sube a $7.43 por km', () => {
    const cargas = [
      carga('2026-09-01', 10000, 50),
      carga('2026-09-10', 10430, 50),
      carga('2026-09-20', 10860, 50),
      carga('2026-09-30', 11290, 50),
    ];
    const { tarifa, rendimiento, precioLitro } = tarifaDeVehiculo(FICHA, 11.91, cargas);
    expect(rendimiento).toMatchObject({ fuente: 'REAL', usado: 8.6 });
    expect(precioLitro).toBe(24.5);
    expect(tarifa.total).toBeCloseTo(7.43, 2);
    // Las partes del mockup.
    expect(tarifa.co).toBeCloseTo(2.85, 2);
    expect(tarifa.d).toBeCloseTo(1.62, 2);
    expect(tarifa.im).toBeCloseTo(1.22, 2);
    expect(tarifa.mn).toBeCloseTo(0.97, 2);
    expect(tarifa.sm).toBeCloseTo(0.41, 2);
    expect(tarifa.n).toBeCloseTo(0.24, 2);
    expect(tarifa.lb).toBeCloseTo(0.12, 2);
  });

  it('el desglose suma la tarifa y no enseña lo que vale cero', () => {
    const t = tarifaEquipo(FICHA);
    const partes = desgloseDeTarifa(t);
    expect(partes.reduce((a, p) => a + p.importe, 0)).toBeCloseTo(t.total, 1);
    expect(partes.map((p) => p.clave)).not.toContain('otros');
    expect(partes[0].nombre).toBe('Gasolina');
  });
});

describe('viajes y odómetro', () => {
  it('km de una salida: 12,480 − 12,324 = 156', () => {
    expect(kmDeSalida(12324, 12480)).toBe(156);
  });

  it('sin los dos números, o si no avanzó, no hay viaje', () => {
    expect(kmDeSalida(null, 12480)).toBeNull();
    expect(kmDeSalida(12324, null)).toBeNull();
    expect(kmDeSalida(12480, 12480)).toBeNull();
    expect(kmDeSalida(12480, 12000)).toBeNull();
  });

  it('el odómetro vigente es la lectura más alta, aunque se haya capturado antes', () => {
    expect(
      odometroVigente([
        { fecha: '2026-10-28', odometro: 12000 },
        { fecha: '2026-10-20', odometro: 12480 },
        { fecha: '2026-10-29', odometro: -1 },
      ]),
    ).toEqual({ km: 12480, fecha: '2026-10-20' });
    expect(odometroVigente([])).toBeNull();
  });

  it('km del periodo: la última lectura dentro menos la última antes de empezar', () => {
    const lecturas = [
      { fecha: '2026-09-28', odometro: 11000 },
      { fecha: '2026-10-03', odometro: 11200 },
      { fecha: '2026-10-30', odometro: 12240 },
      { fecha: '2026-11-02', odometro: 12300 },
    ];
    expect(kmDelPeriodo(lecturas, new Date('2026-10-01'), new Date('2026-11-01'))).toBe(1240);
  });

  it('sin lectura anterior cuenta desde la primera del periodo; sin lecturas, cero', () => {
    const lecturas = [
      { fecha: '2026-10-03', odometro: 11200 },
      { fecha: '2026-10-30', odometro: 12240 },
    ];
    expect(kmDelPeriodo(lecturas, new Date('2026-10-01'), new Date('2026-11-01'))).toBe(1040);
    expect(kmDelPeriodo([], new Date('2026-10-01'), new Date('2026-11-01'))).toBe(0);
  });
});

describe('costo de estar parado', () => {
  const t = tarifaEquipo(FICHA);

  it('2,500 km planeados al mes y 1,240 reales: 1,260 km × ($1.224 + $0.408) = $2,056.32', () => {
    expect(costoParado(t, 30000, 1240, 1 / 12)).toEqual({ kmParados: 1260, importe: 2056.32 });
  });

  it('si anduvo más de lo planeado no hay nada parado', () => {
    expect(costoParado(t, 30000, 3000, 1 / 12)).toEqual({ kmParados: 0, importe: 0 });
  });

  it('a media semana solo cuenta lo que ya debió recorrer', () => {
    expect(costoParado(t, 36500, 0, 10 / 365).kmParados).toBe(1000);
  });
});

describe('desgaste', () => {
  const servicio = (odometro: number, concepto: string, planIds: number[] = []): ServicioDeCalculo => ({
    fecha: '2026-09-05',
    odometro,
    concepto,
    costo: 1200,
    planIds,
  });
  const entrada = { odometro: 12480, vidaKm: 200000, vidaLlantasKm: 50000, aceiteCadaKm: 10000 };

  it('los porcentajes del mockup: 6 % de vida, 25 % de llantas y de aceite', () => {
    const d = desgaste(entrada, [servicio(10020, 'Aceite y filtro')]);
    expect(d.vida).toEqual({ pct: 6, km: 12480, totalKm: 200000 });
    expect(d.llantas).toEqual({ pct: 25, quedanKm: 37520 });
    expect(d.aceite).toEqual({ pct: 25, ultimoKm: 10020 });
  });

  it('llantas nuevas vuelven a contar desde ese servicio; rotarlas, no', () => {
    expect(desgaste(entrada, [servicio(10000, 'Rotar llantas')]).llantas.quedanKm).toBe(37520);
    expect(desgaste(entrada, [servicio(10000, 'Cambio de llantas')]).llantas.quedanKm).toBe(47520);
  });

  it('sin servicio de aceite no presume un porcentaje', () => {
    expect(desgaste(entrada, []).aceite).toEqual({ pct: null, ultimoKm: null });
  });

  it('sin ficha no hay vida que medir, pero el km sigue', () => {
    const d = desgaste({ odometro: 500 }, []);
    expect(d.vida).toEqual({ pct: null, km: 500, totalKm: null });
    expect(d.llantas).toEqual({ pct: null, quedanKm: null });
  });

  it('comprado usado: solo cuenta lo que ha recorrido desde entonces', () => {
    expect(desgaste({ ...entrada, odometroCompra: 2480 }, []).vida.km).toBe(10000);
  });

  it('nunca pasa de 100 %', () => {
    expect(desgaste({ ...entrada, odometro: 900000 }, []).vida.pct).toBe(100);
  });

  it('valor estimado: $480,000 − 12,480 km × $1.62 = $459,782, y no baja del rescate', () => {
    expect(valorEstimado(FICHA, 1.62, 12480)).toBe(459782);
    expect(valorEstimado(FICHA, 1.62, 900000)).toBe(144000);
  });
});

describe('programa de servicio', () => {
  const hoy = new Date('2026-10-28T12:00:00Z');
  const plan = [
    { id: 1, concepto: 'Aceite y filtro', cadaKm: 10000, cadaMeses: 6 },
    { id: 2, concepto: 'Rotar llantas', cadaKm: 10000, cadaMeses: null },
    { id: 3, concepto: 'Filtro de aire', cadaKm: 20000, cadaMeses: null },
    { id: 4, concepto: 'Líquido de frenos', cadaKm: 40000, cadaMeses: 24 },
  ];
  const hecho: ServicioDeCalculo = {
    fecha: '2026-09-05',
    odometro: 10020,
    concepto: 'Servicio de 10,000',
    costo: 1550,
    planIds: [1, 2],
  };
  const contexto = { odometro: 12480, odometroAlta: 5000, fechaBase: '2026-06-30', hoy };

  it('lo hecho cuenta desde la última vez, por km y por fecha', () => {
    const [aceite] = programaDeServicio(plan, [hecho], contexto);
    expect(aceite).toMatchObject({
      ultimoKm: 10020,
      ultimaFecha: '2026-09-05',
      proximoKm: 20020,
      proximaFecha: '2027-03-05',
      faltanKm: 7540,
      estado: 'OK',
    });
  });

  it('lo que no tiene registro toca en el siguiente múltiplo arriba del odómetro de alta', () => {
    const p = programaDeServicio(plan, [hecho], contexto);
    expect(p[2]).toMatchObject({ ultimoKm: null, proximoKm: 20000, faltanKm: 7520 });
    expect(p[3].proximoKm).toBe(40000);
    // Sin lectura de alta: el primer intervalo.
    expect(programaDeServicio(plan, [], { odometro: 500, hoy })[0].proximoKm).toBe(10000);
  });

  it('un vehículo de 120,000 km al darlo de alta no nace con todo vencido', () => {
    const p = programaDeServicio(plan, [], { odometro: 120000, odometroAlta: 120000, hoy });
    expect(p.every((s) => s.estado !== 'VENCIDO')).toBe(true);
    expect(p[0].proximoKm).toBe(130000);
  });

  it('vencido por km, por fecha, y pronto cuando faltan menos de 1,000 km o 30 días', () => {
    const km = programaDeServicio(plan, [hecho], { ...contexto, odometro: 20340 });
    expect(km[0]).toMatchObject({ estado: 'VENCIDO', faltanKm: -320 });
    const fecha = programaDeServicio(plan, [hecho], { ...contexto, hoy: new Date('2027-03-10') });
    expect(fecha[0].estado).toBe('VENCIDO');
    const pronto = programaDeServicio(plan, [hecho], { ...contexto, odometro: 19500 });
    expect(pronto[0].estado).toBe('PRONTO');
  });

  it('próxima visita: junta lo que toca casi al mismo tiempo y da la fecha más cercana', () => {
    const p = proximoServicio(programaDeServicio(plan, [hecho], contexto));
    expect(p).toMatchObject({ km: 20000, faltanKm: 7520, fecha: '2027-03-05', estado: 'OK' });
    expect(p?.conceptos.sort()).toEqual(['Aceite y filtro', 'Filtro de aire', 'Rotar llantas']);
  });

  it('lo vencido va primero; sin programa no hay próxima visita', () => {
    const p = proximoServicio(programaDeServicio(plan, [hecho], { ...contexto, odometro: 20340 }));
    expect(p?.estado).toBe('VENCIDO');
    expect(proximoServicio([])).toBeNull();
  });
});
