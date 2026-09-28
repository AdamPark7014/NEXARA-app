import { decisionAvisoAtraso, etiquetaSemaforo, evaluarSemaforo, horasRecordatorioDe } from './semaforo-actividad';
import { destinatariosDeAtraso, textoAvisoAtraso } from './activity-overdue-recipients';

const AHORA = new Date('2026-09-18T18:00:00.000Z');
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000);
const en = (min: number) => new Date(AHORA.getTime() + min * 60_000);

describe('semáforo por el reloj', () => {
  it('rojo si pasó la hora de inicio y no ha empezado, con los minutos', () => {
    const luz = evaluarSemaforo({ fechaInicio: hace(75), estatus: 'Pendiente', ahora: AHORA });
    expect(luz.semaforo).toBe('rojo');
    expect(luz.motivo).toBe('inicio');
    expect(luz.minutosAtraso).toBe(75);
    expect(etiquetaSemaforo(luz)).toBe('Atrasada · 1 h 15 min');
  });

  it('rojo si pasó el tope (fecha máxima o entrega, la que sea antes) y sigue abierta', () => {
    const porMaxima = evaluarSemaforo({
      fechaInicio: hace(600),
      inicioRealAt: hace(500),
      fechaMaxima: hace(40),
      fechaEntregaEsperada: en(120),
      estatus: 'En Proceso',
      ahora: AHORA,
    });
    expect(porMaxima.motivo).toBe('tope');
    expect(porMaxima.minutosAtraso).toBe(40);
    const porEntrega = evaluarSemaforo({
      inicioRealAt: hace(30),
      fechaEntregaEsperada: hace(15),
      estatus: 'En Proceso',
      ahora: AHORA,
    });
    expect(porEntrega.semaforo).toBe('rojo');
    expect(porEntrega.minutosAtraso).toBe(15);
  });

  it('la prioridad alta o media, sin hora vencida, no la pone roja ni naranja', () => {
    expect(evaluarSemaforo({ estatus: 'Pendiente', ahora: AHORA }).semaforo).toBe('verde');
    expect(
      evaluarSemaforo({ fechaInicio: en(180), fechaMaxima: en(400), estatus: 'Pendiente', ahora: AHORA }).semaforo,
    ).toBe('verde');
  });

  it('naranja solo cuando faltan 30 min o menos', () => {
    const inicio = evaluarSemaforo({ fechaInicio: en(12), estatus: 'Pendiente', ahora: AHORA });
    expect(inicio.semaforo).toBe('amarillo');
    expect(inicio.motivo).toBe('inicio');
    expect(etiquetaSemaforo(inicio)).toBe('Atención · 12 min');
    const tope = evaluarSemaforo({
      inicioRealAt: hace(20),
      fechaMaxima: en(20),
      estatus: 'En Proceso',
      ahora: AHORA,
    });
    expect(tope.semaforo).toBe('amarillo');
    expect(etiquetaSemaforo(tope)).toBe('Por vencer · 20 min');
    expect(
      evaluarSemaforo({ fechaInicio: en(31), estatus: 'Pendiente', ahora: AHORA }).semaforo,
    ).toBe('verde');
  });

  it('en curso y dentro del tope está en tiempo, aunque se le haya acabado el plan', () => {
    expect(
      evaluarSemaforo({
        fechaInicio: hace(200),
        inicioRealAt: hace(180),
        fechaMaxima: en(90),
        estatus: 'En Proceso',
        ahora: AHORA,
      }).semaforo,
    ).toBe('verde');
  });

  it('cerrada o cancelada no se queda roja', () => {
    expect(
      evaluarSemaforo({ fechaMaxima: hace(10), estatus: 'Finalizada', ahora: AHORA }).semaforo,
    ).toBe('verde');
    expect(evaluarSemaforo({ fechaInicio: hace(10), cancelada: true, ahora: AHORA }).semaforo).toBe('verde');
  });

  it('un periodo futuro está en tiempo; pasado el último día, roja', () => {
    expect(
      evaluarSemaforo({
        periodoInicio: '2026-09-21',
        periodoFin: '2026-09-30',
        fechaInicio: new Date('2026-09-21T15:00:00.000Z'),
        estatus: 'Pendiente',
        ahora: AHORA,
      }).semaforo,
    ).toBe('verde');
    const vencida = evaluarSemaforo({
      periodoInicio: '2026-09-10',
      periodoFin: '2026-09-17',
      inicioRealAt: hace(60),
      estatus: 'En Proceso',
      ahora: AHORA,
    });
    expect(vencida.semaforo).toBe('rojo');
    expect(vencida.motivo).toBe('tope');
  });

  it('en un periodo ya empezado, pasar la hora de inicio sin arrancar es rojo', () => {
    const luz = evaluarSemaforo({
      periodoInicio: '2026-09-16',
      periodoFin: '2026-09-25',
      fechaInicio: hace(90),
      estatus: 'Pendiente',
      ahora: AHORA,
    });
    expect(luz.semaforo).toBe('rojo');
    expect(luz.motivo).toBe('inicio');
  });
});

describe('aviso de atraso, una vez', () => {
  it('avisa al entrar en rojo y no repite si el recordatorio está apagado', () => {
    expect(decisionAvisoAtraso({ enRojo: true, ahora: AHORA, horasRecordatorio: 0 })).toEqual({
      avisar: true,
      limpiar: false,
    });
    expect(
      decisionAvisoAtraso({ enRojo: true, overdueAlertedAt: hace(30), ahora: AHORA, horasRecordatorio: 0 }),
    ).toEqual({ avisar: false, limpiar: false });
  });

  it('el recordatorio sale pasado el plazo y se limpia al salir de rojo', () => {
    expect(
      decisionAvisoAtraso({ enRojo: true, overdueAlertedAt: hace(5 * 60), ahora: AHORA, horasRecordatorio: 4 }),
    ).toEqual({ avisar: true, limpiar: false });
    expect(
      decisionAvisoAtraso({ enRojo: true, overdueAlertedAt: hace(60), ahora: AHORA, horasRecordatorio: 4 }),
    ).toEqual({ avisar: false, limpiar: false });
    expect(
      decisionAvisoAtraso({ enRojo: false, overdueAlertedAt: hace(10), ahora: AHORA, horasRecordatorio: 4 }),
    ).toEqual({ avisar: false, limpiar: true });
  });

  it('el ajuste vacío o inválido deja el recordatorio apagado', () => {
    expect(horasRecordatorioDe(null)).toBe(0);
    expect(horasRecordatorioDe('no')).toBe(0);
    expect(horasRecordatorioDe('4')).toBe(4);
    expect(horasRecordatorioDe('9999')).toBe(24 * 7);
  });
});

describe('destinatarios del aviso', () => {
  const equipo = [
    { id: 13, managerId: 7, departmentId: 30, companyId: 1 },
    { id: 14, managerId: 7, departmentId: 30, companyId: 1 },
  ];

  it('avisa al equipo, a su jefe y a la coordinación del mismo departamento', () => {
    const ids = destinatariosDeAtraso(1, equipo, [
      { id: 7, managerId: 1, departmentId: 30, roleKey: 'coord_operaciones', companyId: 1 },
      { id: 8, managerId: null, departmentId: 31, roleKey: 'coord_operaciones', companyId: 1 },
      { id: 9, managerId: null, departmentId: 30, roleKey: 'ing_campo', companyId: 1 },
    ]);
    expect(ids.sort((a, b) => a - b)).toEqual([7, 13, 14]);
  });

  it('no cruza de empresa', () => {
    const ids = destinatariosDeAtraso(1, [{ id: 13, managerId: 70, departmentId: 30, companyId: 2 }], [
      { id: 7, managerId: null, departmentId: 30, roleKey: 'coord_operaciones', companyId: 2 },
    ]);
    expect(ids).toEqual([]);
  });

  it('Antonio cuenta como coordinación de su departamento', () => {
    const ids = destinatariosDeAtraso(1, equipo, [
      {
        id: 4,
        managerId: null,
        departmentId: 30,
        roleKey: 'ing_soporte',
        email: 'jose.ramirez@nexara.com.mx',
        companyId: 1,
      },
    ]);
    expect(ids).toContain(4);
  });
});

describe('texto del aviso', () => {
  it('al responsable le pide cumplirla, con el folio y el título', () => {
    expect(
      textoAvisoAtraso({
        anNumber: 'AN-1042',
        titulo: 'Actualizar archivo SLA',
        nombreResponsable: 'Carolina Juárez',
        paraQuienLaTiene: true,
      }),
    ).toEqual({
      title: 'Actividad atrasada',
      message:
        'Tu actividad AN-1042 · Actualizar archivo SLA está atrasada. Asegúrate de cumplirla en tiempo y forma.',
    });
  });

  it('al jefe le dice de quién es', () => {
    expect(
      textoAvisoAtraso({
        anNumber: 'AN-1042',
        titulo: 'Actualizar archivo SLA',
        nombreResponsable: 'Carolina Juárez',
        paraQuienLaTiene: false,
      }),
    ).toEqual({
      title: 'Actividad atrasada',
      message: 'La actividad AN-1042 · Actualizar archivo SLA de Carolina Juárez está atrasada.',
    });
  });
});
