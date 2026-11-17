import {
  aplicarTopeAvance,
  calcularAvance,
  calcularSalud,
  diasEntre,
  resumirRequerimientos,
  siguienteHito,
} from './proyecto-salud.js';
import { etiquetaEstadoProyecto, puedeTransicionar } from './proyecto-estado.js';

const HOY = new Date('2026-09-17T12:00:00.000Z');

describe('avance del proyecto', () => {
  it('sale de las actividades: cerradas sobre el total', () => {
    const avance = calcularAvance([
      { estatus: 'Finalizada' },
      { estatus: 'Cancelada' },
      { estatus: 'En Proceso' },
      { estatus: 'Pendiente' },
    ]);
    expect(avance.total).toBe(4);
    expect(avance.cerradas).toBe(2);
    expect(avance.finalizadas).toBe(1);
    expect(avance.abiertas).toBe(2);
    expect(avance.porcentaje).toBe(50);
    expect(avance.origen).toBe('actividades');
  });

  it('acepta las dos grafías históricas de Finalizada/Finalizado', () => {
    expect(calcularAvance([{ estatus: 'Finalizado' }, { estatus: 'Finalizada' }]).porcentaje).toBe(100);
  });

  it('sin actividades se apoya en el cronograma', () => {
    const avance = calcularAvance([], [
      { status: 'CUMPLIDO' },
      { status: 'PENDIENTE' },
      { status: 'CANCELADO' },
    ]);
    expect(avance.origen).toBe('hitos');
    expect(avance.porcentaje).toBe(50);
  });

  it('sin nada de lo anterior el avance es desconocido, no cero', () => {
    const avance = calcularAvance([], []);
    expect(avance.porcentaje).toBeNull();
    expect(avance.origen).toBe('ninguno');
  });
});

describe('salud del proyecto', () => {
  it('lo que pidió dirección: fin planeado pasado con actividades abiertas es retraso', () => {
    const salud = calcularSalud(
      {
        status: 'ACTIVE',
        endDate: '2026-09-10T00:00:00.000Z',
        actividades: [{ estatus: 'Finalizada' }, { estatus: 'En Proceso' }],
      },
      HOY,
    );
    expect(salud.salud).toBe('RETRASADO');
    expect(salud.enRiesgo).toBe(true);
    expect(salud.diasDeRetraso).toBe(7);
    expect(salud.motivo).toContain('1 actividad abierta');
  });

  it('fin planeado pasado pero todo cerrado: no es retraso, es que falta cerrarlo', () => {
    const salud = calcularSalud(
      {
        status: 'ACTIVE',
        endDate: '2026-09-10T00:00:00.000Z',
        actividades: [{ estatus: 'Finalizada' }, { estatus: 'Finalizada' }],
      },
      HOY,
    );
    expect(salud.salud).toBe('EN_RIESGO');
    expect(salud.motivo).toMatch(/Listo para cerrar|falta darlo por terminado/);
  });

  it('dentro del plazo y con margen: en tiempo', () => {
    const salud = calcularSalud(
      { status: 'ACTIVE', endDate: '2026-12-01T00:00:00.000Z', actividades: [{ estatus: 'Pendiente' }] },
      HOY,
    );
    expect(salud.salud).toBe('EN_TIEMPO');
    expect(salud.enRiesgo).toBe(false);
    expect(salud.diasRestantes).toBe(75);
  });

  it('la semana previa al cierre avisa antes de que sea tarde', () => {
    const salud = calcularSalud(
      { status: 'ACTIVE', endDate: '2026-09-20T00:00:00.000Z', actividades: [{ estatus: 'Pendiente' }] },
      HOY,
    );
    expect(salud.salud).toBe('EN_RIESGO');
    expect(salud.diasRestantes).toBe(3);
  });

  it('un hito vencido enciende el aviso aunque el fin planeado siga lejos', () => {
    const salud = calcularSalud(
      {
        status: 'ACTIVE',
        endDate: '2026-12-01T00:00:00.000Z',
        actividades: [{ estatus: 'Pendiente' }],
        hitos: [{ plannedDate: '2026-09-01T00:00:00.000Z', status: 'PENDIENTE' }],
      },
      HOY,
    );
    expect(salud.salud).toBe('EN_RIESGO');
    expect(salud.hitosVencidos).toBe(1);
  });

  it('un hito vencido pero ya cumplido no cuenta', () => {
    const salud = calcularSalud(
      {
        status: 'ACTIVE',
        endDate: '2026-12-01T00:00:00.000Z',
        hitos: [
          { plannedDate: '2026-09-01T00:00:00.000Z', status: 'CUMPLIDO', actualDate: '2026-09-02T00:00:00.000Z' },
          { plannedDate: '2026-09-01T00:00:00.000Z', status: 'CANCELADO' },
        ],
      },
      HOY,
    );
    expect(salud.hitosVencidos).toBe(0);
    expect(salud.enRiesgo).toBe(false);
  });

  it('sin fecha de fin lo dice en vez de fingir que va bien', () => {
    const salud = calcularSalud({ status: 'ACTIVE', endDate: null }, HOY);
    expect(salud.salud).toBe('SIN_PLAN');
    expect(salud.motivo).toContain('no se puede saber');
  });

  it('terminado a tiempo y terminado tarde se distinguen', () => {
    const aTiempo = calcularSalud(
      { status: 'COMPLETED', endDate: '2026-09-20T00:00:00.000Z', actualEndDate: '2026-09-15T00:00:00.000Z' },
      HOY,
    );
    expect(aTiempo.salud).toBe('TERMINADO');
    expect(aTiempo.diasDeRetraso).toBe(0);

    const tarde = calcularSalud(
      { status: 'COMPLETED', endDate: '2026-09-01T00:00:00.000Z', actualEndDate: '2026-09-15T00:00:00.000Z' },
      HOY,
    );
    expect(tarde.diasDeRetraso).toBe(14);
    expect(tarde.motivo).toContain('después de lo planeado');
  });

  it('en pausa no se disfraza de proyecto sano: el calendario sigue corriendo', () => {
    const salud = calcularSalud(
      { status: 'ON_HOLD', endDate: '2026-12-01T00:00:00.000Z', actividades: [{ estatus: 'Pendiente' }] },
      HOY,
    );
    expect(salud.salud).toBe('EN_RIESGO');
    expect(salud.motivo).toContain('en pausa');
  });

  it('cancelado no va retrasado: ya no consume calendario', () => {
    const salud = calcularSalud({ status: 'CANCELLED', endDate: '2026-01-01T00:00:00.000Z' }, HOY);
    expect(salud.salud).toBe('CANCELADO');
    expect(salud.enRiesgo).toBe(false);
    expect(salud.diasDeRetraso).toBe(0);
  });

  it('planeado con el arranque por delante no es riesgo', () => {
    const salud = calcularSalud({ status: 'PLANNED', endDate: '2026-12-01T00:00:00.000Z' }, HOY);
    expect(salud.salud).toBe('PLANEADO');
    expect(salud.enRiesgo).toBe(false);
  });
});

describe('días entre fechas', () => {
  it('cuenta días naturales, no husos', () => {
    expect(diasEntre(new Date('2026-09-10T23:00:00.000Z'), new Date('2026-09-11T01:00:00.000Z'))).toBe(1);
    expect(diasEntre(new Date('2026-09-10T00:00:00.000Z'), new Date('2026-09-10T23:59:00.000Z'))).toBe(0);
  });
});

describe('requerimientos', () => {
  it('los que no aplican no cuentan ni a favor ni en contra', () => {
    const r = resumirRequerimientos([
      { status: 'CUMPLIDO' },
      { status: 'PENDIENTE' },
      { status: 'NO_APLICA' },
    ]);
    expect(r.total).toBe(2);
    expect(r.cumplidos).toBe(1);
    expect(r.porcentaje).toBe(50);
  });

  it('sin requerimientos el porcentaje es desconocido', () => {
    expect(resumirRequerimientos([]).porcentaje).toBeNull();
  });
});

describe('vocabulario de estados', () => {
  it('traduce los cinco estados', () => {
    expect(etiquetaEstadoProyecto('PLANNED')).toBe('Planeado');
    expect(etiquetaEstadoProyecto('ACTIVE')).toBe('En curso');
    expect(etiquetaEstadoProyecto('ON_HOLD')).toBe('En pausa');
    expect(etiquetaEstadoProyecto('COMPLETED')).toBe('Terminado');
    expect(etiquetaEstadoProyecto('CANCELLED')).toBe('Cancelado');
  });

  it('no deja terminar lo que nunca arrancó ni reabrir a cualquier estado', () => {
    expect(puedeTransicionar('PLANNED', 'COMPLETED')).toBe(false);
    expect(puedeTransicionar('PLANNED', 'ACTIVE')).toBe(true);
    expect(puedeTransicionar('COMPLETED', 'ACTIVE')).toBe(true);
    expect(puedeTransicionar('COMPLETED', 'ON_HOLD')).toBe(false);
    expect(puedeTransicionar('ACTIVE', 'ACTIVE')).toBe(true);
  });
});

describe('siguiente etapa del cronograma', () => {
  it('es la abierta con la fecha planeada más próxima', () => {
    const h = siguienteHito([
      { id: 1, name: 'Levantamiento', plannedDate: '2026-09-01', status: 'CUMPLIDO', orden: 0 },
      { id: 2, name: 'Instalación', plannedDate: '2026-10-10', status: 'PENDIENTE', orden: 2 },
      { id: 3, name: 'Compras', plannedDate: '2026-09-25', status: 'EN_CURSO', orden: 1 },
    ]);
    expect(h?.id).toBe(3);
  });

  it('las que tienen fecha real o están canceladas ya no cuentan', () => {
    const h = siguienteHito([
      { id: 1, name: 'Compras', plannedDate: '2026-09-20', actualDate: '2026-09-19', status: 'PENDIENTE' },
      { id: 2, name: 'Permisos', plannedDate: '2026-09-21', status: 'CANCELADO' },
      { id: 3, name: 'Pruebas', plannedDate: '2026-10-01', status: 'PENDIENTE' },
    ]);
    expect(h?.id).toBe(3);
  });

  it('sin fecha van al final, en su orden', () => {
    const h = siguienteHito([
      { id: 1, name: 'Entrega', plannedDate: null, status: 'PENDIENTE', orden: 3 },
      { id: 2, name: 'Capacitación', plannedDate: null, status: 'PENDIENTE', orden: 1 },
    ]);
    expect(h?.id).toBe(2);
    expect(
      siguienteHito([
        { id: 1, name: 'Sin fecha', plannedDate: null, status: 'PENDIENTE', orden: 0 },
        { id: 2, name: 'Con fecha', plannedDate: '2027-01-01', status: 'PENDIENTE', orden: 5 },
      ])?.id,
    ).toBe(2);
  });

  it('si ya no queda ninguna abierta devuelve null', () => {
    expect(siguienteHito([{ id: 1, status: 'CUMPLIDO' }])).toBeNull();
    expect(siguienteHito([])).toBeNull();
  });
});


describe('avance honesto y ficha incompleta', () => {
  it('con hitos y actividades pondera por hitos', () => {
    const avance = calcularAvance(
      [{ estatus: 'Finalizada' }, { estatus: 'Pendiente' }],
      [{ status: 'CUMPLIDO' }, { status: 'PENDIENTE' }],
    );
    expect(avance.origen).toBe('hitos');
    expect(avance.porcentaje).toBe(50);
    expect(avance.total).toBe(2);
  });

  it('100% solo si COMPLETED; si no, tope 99', () => {
    const lleno = { total: 1, cerradas: 1, finalizadas: 1, abiertas: 0, porcentaje: 100, origen: 'actividades' as const };
    expect(aplicarTopeAvance(lleno, 'ACTIVE').porcentaje).toBe(99);
    expect(aplicarTopeAvance(lleno, 'COMPLETED').porcentaje).toBe(100);
  });

  it('sin FICHA: INCOMPLETO y sin porcentaje', () => {
    const salud = calcularSalud(
      {
        status: 'ACTIVE',
        endDate: '2026-12-01T00:00:00.000Z',
        fichaCompleta: false,
        faltantesFicha: 3,
        actividades: [{ estatus: 'Finalizada' }],
      },
      HOY,
    );
    expect(salud.salud).toBe('INCOMPLETO');
    expect(salud.avance.porcentaje).toBeNull();
    expect(salud.motivo).toContain('faltan 3');
  });

  it('todo cerrado pero abierto: Listo para cerrar y max 99%', () => {
    const salud = calcularSalud(
      {
        status: 'ACTIVE',
        endDate: '2026-12-01T00:00:00.000Z',
        actividades: [{ estatus: 'Finalizada' }, { estatus: 'Finalizada' }],
      },
      HOY,
    );
    expect(salud.motivo).toMatch(/Listo para cerrar/);
    expect(salud.avance.porcentaje).toBeLessThanOrEqual(99);
  });
});

describe('cierre honesto frente a fechas reales y hitos abiertos', () => {
  it('una fecha de entrega por sí sola no termina el proyecto', () => {
    const r = calcularSalud({ status: 'ACTIVE', endDate: '2026-12-01', actualEndDate: '2026-11-15', actividades: [{ estatus: 'Finalizada' }] }, new Date('2026-11-16'));
    expect(r.salud).not.toBe('TERMINADO');
    expect(r.avance.porcentaje).toBe(99);
  });
  it('actividades cerradas con un hito pendiente no dicen Listo para cerrar', () => {
    const r = calcularSalud({ status: 'ACTIVE', endDate: '2026-12-01', actividades: [{ estatus: 'Finalizada' }], hitos: [{ status: 'PENDIENTE', plannedDate: '2026-11-30' }] }, new Date('2026-11-16'));
    expect(r.motivo).not.toContain('Listo para cerrar');
    expect(r.avance.porcentaje).toBe(0);
  });
});
