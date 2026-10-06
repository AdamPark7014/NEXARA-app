import { checkUrlAccess } from '../common/rbac/url-matrix';
import { ROLES } from '../common/rbac/roles.v2';
import { diaDeLaSemana } from '../me/kpis-equipo.js';
import {
  areaDe,
  conceptoPagoSemana,
  descuentosSugeridos,
  destinoDeActividad,
  diaControl,
  diasDeActividad,
  diasDeHospedaje,
  diasDeLaSemana,
  domingoDe,
  esCiudadForanea,
  esFalta,
  fechaValida,
  filaControl,
  horaLocal,
  horasBrutas,
  jornadaBrutaMin,
  lugarAutomatico,
  lugarValido,
  lunesDe,
  montoExtras,
  notaDePago,
  notaSemanaAsignada,
  ocultarMontos,
  ocultarMontosTotales,
  pagoPorHora,
  sueldoDelPeriodo,
  totalesControl,
  totalesDeFila,
  type EntradaDia,
  type EntradaFila,
  type EntradaLugar,
  type HorarioNomina,
} from './control-nomina.js';
import { divisorDeHorario } from './sugerencia-nomina.js';

/**
 * Control de nómina semanal: las reglas puras. Semana de prueba: lunes 28-09-2026 → domingo
 * 04-10-2026 (la del Excel de Adam), consultada el lunes 05-10 (ya cerrada).
 */
const LUNES = '2026-09-28';
const DOMINGO = '2026-10-04';
const HOY = '2026-10-05';
const SEMANA = diasDeLaSemana(LUNES).map((d) => d.fecha);
const OFICINA = 'Oficina';

const HORARIO_OFICINA: HorarioNomina = {
  etiqueta: 'Oficina · 10:00 a 18:00',
  entrada: '10:00',
  salida: '18:00',
  jornadaOrdinariaMin: 480,
  dias: [1, 2, 3, 4, 5],
  personalizado: false,
};
const SIN_HORARIO: HorarioNomina = { etiqueta: 'Sin horario fijo (24/7)', jornadaOrdinariaMin: null, dias: [], personalizado: false };

/** Hora de México (UTC−6) → ISO. */
const iso = (fecha: string, hhmm: string) => new Date(`${fecha}T${hhmm}:00-06:00`).toISOString();

function dia(fecha: string, extra: Partial<EntradaDia> = {}): EntradaDia {
  const dow = diaDeLaSemana(fecha);
  return {
    fecha,
    laborable: dow >= 1 && dow <= 5,
    pasado: fecha < HOY,
    checadas: [],
    oficina: OFICINA,
    entrada: null,
    salida: null,
    minutosLaborados: 0,
    ...extra,
  };
}

function trabajado(
  fecha: string,
  opciones: { entrada?: string; salida?: string; sitio?: string | null; fuera?: boolean; destinos?: string[] } = {},
): EntradaDia {
  const entrada = opciones.entrada ?? '10:00';
  const salida = opciones.salida ?? '18:00';
  const sitio = opciones.sitio === undefined ? OFICINA : opciones.sitio;
  const fuera = Boolean(opciones.fuera);
  const brutos = (new Date(iso(fecha, salida)).getTime() - new Date(iso(fecha, entrada)).getTime()) / 60_000;
  return dia(fecha, {
    entrada: iso(fecha, entrada),
    salida: iso(fecha, salida),
    minutosLaborados: brutos - 60,
    destinos: opciones.destinos ?? [],
    checadas: [
      { tipo: 'entrada', sitioNombre: sitio, fueraDeSitio: fuera },
      { tipo: 'salida', sitioNombre: sitio, fueraDeSitio: fuera },
    ],
  });
}

function fila(extra: Partial<EntradaFila> = {}): EntradaFila {
  return {
    userId: 7,
    nombre: 'Ana López',
    area: 'Operación',
    semana: { inicio: LUNES, fin: DOMINGO },
    hoy: HOY,
    horario: HORARIO_OFICINA,
    sueldoSemanal: 2800,
    dias: SEMANA.map((f) => (diaDeLaSemana(f) >= 1 && diaDeLaSemana(f) <= 5 ? trabajado(f) : dia(f))),
    viaticos: [],
    extrasMinutosAprobados: 0,
    extrasMinutosPendientes: 0,
    descuentos: [],
    ...extra,
  };
}

const LUGAR_BASE: EntradaLugar = { laborable: true, pasado: true, checadas: [], oficina: OFICINA };

describe('semana', () => {
  it('cualquier día se lleva a su lunes y la semana va de lunes a domingo', () => {
    expect(lunesDe('2026-10-01')).toBe(LUNES);
    expect(lunesDe('2026-10-04')).toBe(LUNES);
    expect(lunesDe(LUNES)).toBe(LUNES);
    expect(domingoDe(LUNES)).toBe(DOMINGO);
  });

  it('los siete días con el nombre y el número de su Excel, sábado y domingo incluidos', () => {
    expect(diasDeLaSemana(LUNES)).toEqual([
      { fecha: '2026-09-28', nombre: 'LUNES', numero: '28' },
      { fecha: '2026-09-29', nombre: 'MARTES', numero: '29' },
      { fecha: '2026-09-30', nombre: 'MIÉRCOLES', numero: '30' },
      { fecha: '2026-10-01', nombre: 'JUEVES', numero: '01' },
      { fecha: '2026-10-02', nombre: 'VIERNES', numero: '02' },
      { fecha: '2026-10-03', nombre: 'SÁBADO', numero: '03' },
      { fecha: '2026-10-04', nombre: 'DOMINGO', numero: '04' },
    ]);
  });

  it('valida fechas reales y arma el concepto del pago', () => {
    expect(fechaValida('2026-09-28')).toBe(true);
    expect(fechaValida('2026-02-30')).toBe(false);
    expect(fechaValida('28/09/2026')).toBe(false);
    expect(conceptoPagoSemana(LUNES)).toBe('Nómina semana 28/09–04/10');
  });
});

describe('horas en bruto (las de su Excel)', () => {
  it('10:00 → 18:00 = 8.00, con la comida dentro', () => {
    expect(horasBrutas(iso(LUNES, '10:00'), iso(LUNES, '18:00'))).toBe(8);
  });

  it('dos decimales: 7.97 y 10.67 como en su formato', () => {
    expect(horasBrutas(iso(LUNES, '10:00'), iso(LUNES, '17:58'))).toBe(7.97);
    expect(horasBrutas(iso(LUNES, '10:00'), iso(LUNES, '20:40'))).toBe(10.67);
  });

  it('minuto contra minuto: los segundos no cuentan (igual que restar las HH:MM)', () => {
    const entrada = new Date(new Date(iso(LUNES, '10:00')).getTime() + 40_000);
    const salida = new Date(new Date(iso(LUNES, '17:58')).getTime() + 10_000);
    expect(horasBrutas(entrada, salida)).toBe(7.97);
  });

  it('sin salida (o sin entrada) son 0.00', () => {
    expect(horasBrutas(iso(LUNES, '10:00'), null)).toBe(0);
    expect(horasBrutas(null, null)).toBe(0);
  });

  it('la hora se lee en México', () => {
    expect(horaLocal('2026-09-28T16:00:00.000Z')).toBe('10:00');
    expect(horaLocal('2026-09-29T02:40:00.000Z')).toBe('20:40');
    expect(horaLocal(null)).toBeNull();
  });
});

describe('lugar del día', () => {
  it('checada en la geocerca de la oficina → Oficina', () => {
    const r = lugarAutomatico({ ...LUGAR_BASE, checadas: [{ tipo: 'entrada', sitioNombre: 'Oficina', fueraDeSitio: false }] });
    expect(r.lugar).toBe('Oficina');
  });

  it('checada fuera de todo sitio → Foráneo', () => {
    const r = lugarAutomatico({
      ...LUGAR_BASE,
      checadas: [{ tipo: 'entrada', sitioNombre: 'Oficina', fueraDeSitio: true }],
    });
    expect(r.lugar).toBe('Foráneo');
  });

  it('checada en el sitio de una sucursal o actividad → Foráneo', () => {
    const r = lugarAutomatico({
      ...LUGAR_BASE,
      checadas: [{ tipo: 'entrada', sitioNombre: 'OXXO Centro', fueraDeSitio: false }],
    });
    expect(r).toEqual({ lugar: 'Foráneo', motivo: 'Checó en el sitio de OXXO Centro' });
  });

  it('checada sin ubicación: manda la actividad foránea o el hospedaje; si no hay nada, Oficina', () => {
    const sinUbicacion = [{ tipo: 'entrada', sitioNombre: null, fueraDeSitio: false }];
    expect(lugarAutomatico({ ...LUGAR_BASE, checadas: sinUbicacion, actividadForanea: true }).lugar).toBe('Foráneo');
    expect(lugarAutomatico({ ...LUGAR_BASE, checadas: sinUbicacion, hospedaje: true }).lugar).toBe('Foráneo');
    expect(lugarAutomatico({ ...LUGAR_BASE, checadas: sinUbicacion }).lugar).toBe('Oficina');
  });

  it('en la oficina gana aunque la actividad del día sea foránea', () => {
    const r = lugarAutomatico({
      ...LUGAR_BASE,
      actividadForanea: true,
      checadas: [{ tipo: 'entrada', sitioNombre: 'Oficina', fueraDeSitio: false }],
    });
    expect(r.lugar).toBe('Oficina');
  });

  it('guardia programada → Guardia (con o sin checada)', () => {
    expect(lugarAutomatico({ ...LUGAR_BASE, laborable: false, guardia: true }).lugar).toBe('Guardia');
    expect(
      lugarAutomatico({
        ...LUGAR_BASE,
        laborable: false,
        guardia: true,
        checadas: [{ tipo: 'entrada', sitioNombre: null, fueraDeSitio: false }],
      }).lugar,
    ).toBe('Guardia');
  });

  it('sábado o domingo sin checada ni guardia → Descanso', () => {
    expect(lugarAutomatico({ ...LUGAR_BASE, laborable: false }).lugar).toBe('Descanso');
  });

  it('sábado con checada se cuenta como trabajado', () => {
    const r = lugarAutomatico({
      ...LUGAR_BASE,
      laborable: false,
      checadas: [{ tipo: 'entrada', sitioNombre: 'Oficina', fueraDeSitio: false }],
    });
    expect(r.lugar).toBe('Oficina');
  });

  it('vacaciones o permiso aprobado, y falta justificada', () => {
    expect(lugarAutomatico({ ...LUGAR_BASE, permiso: 'Vacaciones' }).lugar).toBe('Vacaciones');
    expect(lugarAutomatico({ ...LUGAR_BASE, permiso: 'Permiso' }).lugar).toBe('Permiso');
    expect(lugarAutomatico({ ...LUGAR_BASE, justificada: true }).lugar).toBe('Falta justificada');
  });

  it('día laborable que ya pasó sin checada → Falta', () => {
    expect(lugarAutomatico(LUGAR_BASE)).toEqual({ lugar: 'Falta', motivo: 'Día laborable sin checada' });
  });

  it('sin checada pero con hospedaje o actividad foránea → Foráneo (no se sugiere descontar)', () => {
    expect(lugarAutomatico({ ...LUGAR_BASE, hospedaje: true }).lugar).toBe('Foráneo');
    expect(lugarAutomatico({ ...LUGAR_BASE, actividadForanea: true }).lugar).toBe('Foráneo');
  });

  it('hoy, los días por venir y antes de su ingreso quedan vacíos', () => {
    expect(lugarAutomatico({ ...LUGAR_BASE, pasado: false }).lugar).toBeNull();
    expect(lugarAutomatico({ ...LUGAR_BASE, antesDeIngreso: true }).lugar).toBeNull();
  });

  it('lo escrito a mano se normaliza al lugar canónico', () => {
    expect(lugarValido('foraneo')).toBe('Foráneo');
    expect(lugarValido('FALTA JUSTIFICADA')).toBe('Falta justificada');
    expect(lugarValido(' oficina ')).toBe('Oficina');
    expect(lugarValido('Home office')).toBeNull();
    expect(lugarValido(null)).toBeNull();
  });
});

describe('falta (el amarillo)', () => {
  const base = { laborable: true, pasado: true, conChecada: false };
  it('laborable, ya pasó y sin checada', () => {
    expect(esFalta({ ...base, lugar: 'Falta' })).toBe(true);
    expect(esFalta({ ...base, lugar: 'Foráneo' })).toBe(true);
  });
  it('no es falta si checó, si no ha pasado, si es descanso o si está explicada', () => {
    expect(esFalta({ ...base, conChecada: true, lugar: 'Oficina' })).toBe(false);
    expect(esFalta({ ...base, pasado: false, lugar: null })).toBe(false);
    expect(esFalta({ ...base, laborable: false, lugar: 'Descanso' })).toBe(false);
    for (const lugar of ['Vacaciones', 'Permiso', 'Falta justificada', 'Guardia', 'Descanso'] as const) {
      expect(esFalta({ ...base, lugar })).toBe(false);
    }
    expect(esFalta({ ...base, antesDeIngreso: true, lugar: null })).toBe(false);
  });
});

describe('foráneo por ciudad', () => {
  it('Puebla y su zona metropolitana no son foráneas', () => {
    expect(esCiudadForanea({ ciudad: 'Puebla' })).toBe(false);
    expect(esCiudadForanea({ ciudad: 'Puebla, Pue.' })).toBe(false);
    expect(esCiudadForanea({ ciudad: 'San Andrés Cholula', estado: 'Puebla' })).toBe(false);
    expect(esCiudadForanea({ ciudad: 'CUAUTLANCINGO' })).toBe(false);
  });
  it('otra ciudad (aunque sea del estado de Puebla) sí lo es', () => {
    expect(esCiudadForanea({ ciudad: 'Tehuacán', estado: 'Puebla' })).toBe(true);
    expect(esCiudadForanea({ ciudad: 'Ciudad de México' })).toBe(true);
  });
  it('sin ciudad decide el estado; sin nada no se afirma nada', () => {
    expect(esCiudadForanea({ estado: 'Veracruz' })).toBe(true);
    expect(esCiudadForanea({ estado: 'Puebla' })).toBe(false);
    expect(esCiudadForanea({})).toBe(false);
  });
});

describe('actividades y hospedaje del día', () => {
  it('una actividad es del día por su periodo o por sus fechas (como la geocerca)', () => {
    expect(diasDeActividad({ fechas: [], periodoInicio: '2026-09-29', periodoFin: '2026-10-01' }, SEMANA)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ]);
    expect(diasDeActividad({ fechas: [iso('2026-10-02', '09:00'), null] }, SEMANA)).toEqual(['2026-10-02']);
  });

  it('el hospedaje cubre el periodo de su actividad; sin periodo, el día que se pidió', () => {
    expect(
      diasDeHospedaje({ fechaSolicitud: iso('2026-09-25', '12:00'), periodos: [{ inicio: '2026-09-28', fin: '2026-09-30' }] }, SEMANA),
    ).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
    expect(diasDeHospedaje({ fechaSolicitud: iso('2026-10-01', '12:00'), periodos: [] }, SEMANA)).toEqual(['2026-10-01']);
  });

  it('el destino es el cliente (y la sucursal si dice algo más)', () => {
    expect(destinoDeActividad({ id: 1, cliente: 'Hotel Casa Azul' })).toBe('Hotel Casa Azul');
    expect(destinoDeActividad({ id: 1, cliente: 'OXXO', sucursal: 'OXXO Centro' })).toBe('OXXO Centro');
    expect(destinoDeActividad({ id: 1, cliente: 'Banorte', sucursal: 'Suc. 120' })).toBe('Banorte · Suc. 120');
    expect(destinoDeActividad({ id: 1, titulo: 'Instalación CCTV' })).toBe('Instalación CCTV');
  });
});

describe('área', () => {
  it('por rol y, si no, por departamento', () => {
    expect(areaDe({ roleKey: 'ing_campo' })).toBe('Operación');
    expect(areaDe({ roleKey: 'enc_soporte' })).toBe('Operación');
    expect(areaDe({ roleKey: 'administrativo', departamento: 'Administración' })).toBe('Administrativo');
    expect(areaDe({ roleKey: null, departamento: 'Operaciones' })).toBe('Operación');
    expect(areaDe({ roleKey: 'contabilidad' })).toBe('Administrativo');
  });
});

describe('pago por hora (divisorDeHorario de la sugerencia de nómina)', () => {
  it('con horario: sueldo ÷ 40 h y la fórmula a la vista', () => {
    const r = pagoPorHora(2800, HORARIO_OFICINA);
    expect(r.pagoPorHora).toBe(70);
    expect(r.divisorHoras).toBe(40);
    expect(r.formula).toContain('÷ 40 h');
    expect(r.formula).toContain('por hora');
  });

  it('sin horario fijo: ÷ 48 h (jornada diurna legal)', () => {
    const r = pagoPorHora(2400, SIN_HORARIO);
    expect(r.divisorHoras).toBe(48);
    expect(r.pagoPorHora).toBe(50);
  });

  it('sin sueldo no hay pago por hora', () => {
    const r = pagoPorHora(null, HORARIO_OFICINA);
    expect(r.pagoPorHora).toBeNull();
    expect(r.formula).toMatch(/Sin sueldo/);
  });

  it('la jornada de un día de su horario va en bruto (10:00 → 18:00 = 480 min)', () => {
    expect(jornadaBrutaMin(HORARIO_OFICINA, divisorDeHorario(HORARIO_OFICINA))).toBe(480);
    expect(jornadaBrutaMin({ ...HORARIO_OFICINA, salida: '19:30' }, divisorDeHorario(HORARIO_OFICINA))).toBe(570);
    expect(jornadaBrutaMin(SIN_HORARIO, divisorDeHorario(SIN_HORARIO))).toBe(480);
  });
});

describe('sueldo del periodo', () => {
  const divisor = divisorDeHorario(HORARIO_OFICINA);
  const base = { sueldoSemanal: 2800, divisor, jornadaMin: 480, semana: { desde: LUNES, hasta: DOMINGO }, hoy: HOY };
  const semana = (minutos: (f: string) => number, lugar: (f: string) => any = () => 'Oficina') =>
    SEMANA.map((f) => ({ fecha: f, lugar: diaDeLaSemana(f) % 6 === 0 ? 'Descanso' : lugar(f), minutos: minutos(f) }));

  it('cumplió su horario: sueldo completo', () => {
    const r = sueldoDelPeriodo({ ...base, dias: semana((f) => (diaDeLaSemana(f) % 6 === 0 ? 0 : 480)) });
    expect(r.sueldoPeriodo).toBe(2800);
    expect(r.explicacion).toMatch(/Cumplió su horario/);
  });

  it('trabajó menos: proporcional (35 h de 40 h = 87.5 %)', () => {
    const r = sueldoDelPeriodo({ ...base, dias: semana((f) => (diaDeLaSemana(f) % 6 === 0 ? 0 : 420)) });
    expect(r.sueldoPeriodo).toBe(2450);
    expect(r.cumplimientoPct).toBe(88);
  });

  it('una falta injustificada no baja el proporcional (se descuenta aparte)', () => {
    const r = sueldoDelPeriodo({
      ...base,
      dias: semana(
        (f) => (diaDeLaSemana(f) % 6 === 0 || f === '2026-09-29' ? 0 : 480),
        (f) => (f === '2026-09-29' ? 'Falta' : 'Oficina'),
      ),
    });
    expect(r.sueldoPeriodo).toBe(2800);
    expect(r.explicacion).toMatch(/se descuentan aparte/);
  });

  it('semana en curso: devengado a la fecha (miércoles → 2/7)', () => {
    const r = sueldoDelPeriodo({
      ...base,
      hoy: '2026-09-30',
      dias: semana((f) => (f < '2026-09-30' ? 480 : 0)),
    });
    expect(r.devengado).toBe(800);
    expect(r.sueldoPeriodo).toBe(800);
  });

  it('sin sueldo: null y la explicación', () => {
    const r = sueldoDelPeriodo({ ...base, sueldoSemanal: null, dias: semana(() => 480) });
    expect(r.sueldoPeriodo).toBeNull();
    expect(r.explicacion).toMatch(/Sin sueldo/);
  });
});

describe('extras, descuentos y totales', () => {
  it('extras aprobados × pago por hora × 2; sin pago por hora, null', () => {
    expect(montoExtras(120, 70)).toBe(280);
    expect(montoExtras(90, 70)).toBe(210);
    expect(montoExtras(0, 70)).toBe(0);
    expect(montoExtras(120, null)).toBeNull();
  });

  it('cada falta injustificada sugiere descontar un día de sueldo (semanal ÷ 7)', () => {
    const dias = [
      { fecha: '2026-09-29', lugar: 'Falta' as const },
      { fecha: '2026-09-30', lugar: 'Oficina' as const },
      { fecha: '2026-10-01', lugar: 'Falta justificada' as const },
    ];
    expect(descuentosSugeridos({ sueldoSemanal: 2800, dias })).toEqual([
      { fecha: '2026-09-29', concepto: 'Falta injustificada · MARTES 29/09', monto: 400 },
    ]);
    expect(descuentosSugeridos({ sueldoSemanal: 2800, dias, yaAceptadas: ['2026-09-29'] })).toEqual([]);
    expect(descuentosSugeridos({ sueldoSemanal: null, dias })).toEqual([]);
  });

  it('SUBTOTAL = sueldo + viáticos + extras; TOTAL = SUBTOTAL − DESCUENTOS', () => {
    expect(totalesDeFila({ sueldoPeriodo: 2520, viaticos: 120, extrasMonto: 280, descuentosTotal: 400 })).toEqual({
      subtotal: 2920,
      total: 2520,
    });
    // Sin sueldo (su Excel con $0): solo los viáticos.
    expect(totalesDeFila({ sueldoPeriodo: null, viaticos: 509.5, extrasMonto: null, descuentosTotal: 0 })).toEqual({
      subtotal: 509.5,
      total: 509.5,
    });
  });
});

describe('nota de la fila', () => {
  const foraneo = (f: string, destinos: string[]) => ({ lugar: 'Foráneo' as const, laborable: true, evaluable: true, destinos, fecha: f });
  const lv = SEMANA.slice(0, 5);

  it('toda la semana foráneo en la misma obra → «* Toda la semana asignado a …»', () => {
    const dias = lv.map((f) => foraneo(f, ['Hotel Casa Azul']));
    expect(notaSemanaAsignada(dias)).toBe('* Toda la semana asignado a Hotel Casa Azul');
  });

  it('un día en oficina, una falta o destinos distintos: sin nota', () => {
    expect(notaSemanaAsignada(lv.map((f, i) => (i === 2 ? { ...foraneo(f, []), lugar: 'Oficina' as const } : foraneo(f, ['Hotel Casa Azul']))))).toBeNull();
    expect(notaSemanaAsignada(lv.map((f, i) => (i === 2 ? { ...foraneo(f, []), lugar: 'Falta' as const } : foraneo(f, ['Hotel Casa Azul']))))).toBeNull();
    expect(notaSemanaAsignada(lv.map((f, i) => foraneo(f, [i < 3 ? 'Hotel Casa Azul' : 'OXXO Centro'])))).toBeNull();
  });

  it('las vacaciones no rompen la semana; un solo día no es «toda la semana»', () => {
    const dias = lv.map((f, i) => (i === 4 ? { ...foraneo(f, []), lugar: 'Vacaciones' as const } : foraneo(f, ['Hotel Casa Azul'])));
    expect(notaSemanaAsignada(dias)).toBe('* Toda la semana asignado a Hotel Casa Azul');
    expect(notaSemanaAsignada([foraneo(lv[0], ['Hotel Casa Azul'])])).toBeNull();
  });
});

describe('día del control', () => {
  it('jornada normal: HH:MM, 8.00 en bruto y 7.00 netas', () => {
    const d = diaControl(trabajado(LUNES));
    expect(d).toMatchObject({ entrada: '10:00', salida: '18:00', horas: 8, horasNetas: 7, lugar: 'Oficina', falta: false });
    expect(d.lugarOrigen).toBe('auto');
  });

  it('el ajuste manual manda y queda quién y cuándo; el automático sigue a la vista', () => {
    const d = diaControl(
      dia('2026-09-29', { manual: { lugar: 'Oficina', nota: 'Olvidó checar', porId: 1, por: 'Christian', at: '2026-10-05T17:00:00.000Z' } }),
    );
    expect(d.lugar).toBe('Oficina');
    expect(d.lugarAuto).toBe('Falta');
    expect(d.lugarOrigen).toBe('manual');
    expect(d.nota).toBe('Olvidó checar');
    expect(d.ajuste).toEqual({ porId: 1, por: 'Christian', at: '2026-10-05T17:00:00.000Z' });
    // Sigue sin checada: el amarillo de su Excel se queda.
    expect(d.falta).toBe(true);
  });

  it('sin salida: horas en 0.00 y la nota', () => {
    const d = diaControl(dia(LUNES, { entrada: iso(LUNES, '10:00'), checadas: [{ tipo: 'entrada', sitioNombre: OFICINA, fueraDeSitio: false }] }));
    expect(d.horas).toBe(0);
    expect(d.nota).toBe('Sin salida registrada');
  });
});

describe('fila completa', () => {
  it('semana cumplida en oficina con viáticos y extras aprobados', () => {
    const f = filaControl(
      fila({
        viaticos: [{ id: 3, concepto: 'Alimentación', monto: 120, estatus: 'Aprobado' }],
        extrasMinutosAprobados: 120,
        extrasMinutosPendientes: 90,
      }),
    );
    expect(f.horasTotales).toBe(40);
    expect(f.horasNetasTotales).toBe(35);
    expect(f.dias.map((d) => d.lugar)).toEqual(['Oficina', 'Oficina', 'Oficina', 'Oficina', 'Oficina', 'Descanso', 'Descanso']);
    expect(f.pagoPorHora).toBe(70);
    expect(f.sueldoPeriodo).toBe(2800);
    expect(f.viaticos).toBe(120);
    // Solo las aprobadas: 2 h × $70 × 2. Las 1.5 h pendientes van aparte.
    expect(f.extrasMonto).toBe(280);
    expect(f.extrasMinutosPendientes).toBe(90);
    expect(f.subtotal).toBe(3200);
    expect(f.total).toBe(3200);
    expect(f.avisos.join(' ')).toMatch(/1.5 h de tiempo extra sin aprobar/);
    expect(f.faltas).toBe(0);
  });

  it('una falta: amarillo, descuento sugerido sin aplicar; aceptado, se resta', () => {
    const dias = fila().dias.map((d) => (d.fecha === '2026-09-29' ? dia('2026-09-29') : d));
    const sinAceptar = filaControl(fila({ dias }));
    expect(sinAceptar.faltas).toBe(1);
    expect(sinAceptar.faltasInjustificadas).toBe(1);
    expect(sinAceptar.dias[1]).toMatchObject({ lugar: 'Falta', falta: true, entrada: null, horas: 0 });
    expect(sinAceptar.descuentosSugeridos).toEqual([
      { fecha: '2026-09-29', concepto: 'Falta injustificada · MARTES 29/09', monto: 400 },
    ]);
    // Se ve en DESCUENTOS como sugerido sin aceptar, pero no resta.
    expect(sinAceptar.descuentos).toEqual([
      {
        id: 'sugerido-2026-09-29',
        concepto: 'Falta injustificada · MARTES 29/09',
        monto: 400,
        sugerido: true,
        aceptado: false,
        fecha: '2026-09-29',
      },
    ]);
    expect(sinAceptar.descuentosTotal).toBe(0);
    expect(sinAceptar.descuentosSugeridosTotal).toBe(400);
    expect(sinAceptar.total).toBe(2800);

    const aceptada = filaControl(
      fila({
        dias,
        descuentos: [{ id: 9, concepto: 'Falta injustificada · MARTES 29/09', monto: 400, sugerido: true, fecha: '2026-09-29' }],
      }),
    );
    expect(aceptada.descuentosSugeridos).toEqual([]);
    expect(aceptada.descuentos).toEqual([
      { id: 9, concepto: 'Falta injustificada · MARTES 29/09', monto: 400, sugerido: true, aceptado: true, fecha: '2026-09-29' },
    ]);
    expect(aceptada.descuentosTotal).toBe(400);
    expect(aceptada.total).toBe(2400);
    expect(notaDePago(aceptada, LUNES)).toContain('Descuentos: $400.00 (Falta injustificada · MARTES 29/09 $400.00)');
  });

  it('toda la semana foránea en la misma obra: nota automática; la manual manda', () => {
    const dias = SEMANA.map((f) =>
      diaDeLaSemana(f) % 6 === 0 ? dia(f) : trabajado(f, { sitio: 'Hotel Casa Azul', destinos: ['Hotel Casa Azul'] }),
    );
    const auto = filaControl(fila({ dias }));
    expect(auto.notaFila).toBe('* Toda la semana asignado a Hotel Casa Azul');
    expect(auto.notaFilaOrigen).toBe('auto');
    const manual = filaControl(fila({ dias, notaManual: 'Apoyo en Tehuacán' }));
    expect(manual.notaFila).toBe('Apoyo en Tehuacán');
    expect(manual.notaFilaOrigen).toBe('manual');
    const vacia = filaControl(fila({ dias, notaManual: '' }));
    expect(vacia.notaFila).toBeNull();
    expect(vacia.notaFilaOrigen).toBe('manual');
  });

  it('sin sueldo: montos de sueldo y extras en null, subtotal solo con viáticos', () => {
    const f = filaControl(
      fila({ sueldoSemanal: null, viaticos: [{ id: 1, concepto: 'Hospedaje', monto: 509.5, estatus: 'Pagado' }], extrasMinutosAprobados: 60 }),
    );
    expect(f.sueldo).toBeNull();
    expect(f.pagoPorHora).toBeNull();
    expect(f.sueldoPeriodo).toBeNull();
    expect(f.extrasMonto).toBeNull();
    expect(f.subtotal).toBe(509.5);
    expect(f.avisos[0]).toMatch(/Sin sueldo/);
  });

  it('quien no ve montos recibe horas y lugares, el dinero en null', () => {
    const f = ocultarMontos(filaControl(fila({ viaticos: [{ id: 1, concepto: 'x', monto: 10, estatus: 'Aprobado' }] })));
    expect(f.horasTotales).toBe(40);
    expect(f.dias[0].lugar).toBe('Oficina');
    for (const k of ['sueldo', 'pagoPorHora', 'viaticos', 'extrasMonto', 'sueldoPeriodo', 'descuentosTotal', 'subtotal', 'total'] as const) {
      expect(f[k]).toBeNull();
    }
    expect(f.viaticosDetalle).toEqual([]);
    expect(f.descuentos).toEqual([]);
  });

  it('totales de la semana y la nota del pago', () => {
    const a = filaControl(fila({ extrasMinutosAprobados: 120 }));
    const b = filaControl(fila({ userId: 8, nombre: 'Beto', sueldoSemanal: null }));
    const t = totalesControl([a, b]);
    expect(t).toMatchObject({ personas: 2, horasTotales: 80, sinSueldo: 1, sueldoPeriodo: 2800, extrasMonto: 280, total: 3080 });
    expect(ocultarMontosTotales(t).total).toBeNull();
    const nota = notaDePago(a, LUNES);
    expect(nota).toContain('Nómina semana 28/09–04/10');
    expect(nota).toContain('Total: $3,080.00');
  });
});

describe('rutas del control (matriz de URLs)', () => {
  const ruta = '/api/employee-payments/control-semanal';
  it('contabilidad puede ver, ajustar, quitar descuentos y cerrar', () => {
    expect(checkUrlAccess(ROLES.CONTABILIDAD, `${ruta}?semana=${LUNES}`, 'GET').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.CONTABILIDAD, `${ruta}/dia`, 'PATCH').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.CONTABILIDAD, `${ruta}/descuentos/5`, 'DELETE').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.CONTABILIDAD, `${ruta}/cerrar`, 'POST').allowed).toBe(true);
  });
  it('el rol CEO lee el control como el resto de la API; editar sigue siendo de super admin (Christian lo es por correo)', () => {
    expect(checkUrlAccess(ROLES.CEO, `${ruta}?semana=${LUNES}`, 'GET').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.CEO, `${ruta}/fila`, 'PATCH').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.SUPER_ADMIN, `${ruta}/reabrir`, 'POST').allowed).toBe(true);
  });
  it('la regla no abre el resto de Pagos a contabilidad (PATCH a un pago sigue cerrado)', () => {
    expect(checkUrlAccess(ROLES.CONTABILIDAD, '/api/employee-payments/12', 'PATCH').allowed).toBe(false);
  });
  it('un ingeniero de campo no entra', () => {
    expect(checkUrlAccess(ROLES.ING_CAMPO, `${ruta}?semana=${LUNES}`, 'GET').allowed).toBe(false);
  });
});
