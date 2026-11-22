import { ActivitiesService } from './activities.service';
import { ActivityEvidenceService } from './evidence/activity-evidence.service';
import { VentasService } from '../ventas/ventas.service';

/**
 * Dónde empieza «hoy» en el tablero de despacho, en el aviso de prioridad y en los periodos de
 * Ventas.
 *
 * `setHours(0, 0, 0, 0)` usa el reloj del servidor, que corre en UTC: para él el día empieza a las
 * 18:00 de México del día anterior. Lo terminado ayer en la tarde seguía en «Completadas hoy», y
 * de las 6 de la tarde en adelante la columna se vaciaba aunque el día no hubiera terminado.
 */
describe('«hoy» empieza a la medianoche de la empresa', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  const reloj = (iso: string) =>
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date(iso));

  function tablero(filas: any[]) {
    const svc = Object.create(ActivitiesService.prototype) as any;
    svc.prisma = { activity: { findMany: jest.fn().mockResolvedValue(filas) }, user: { findMany: jest.fn().mockResolvedValue([]) } };
    return svc.getDispatchBoard(7) as Promise<any>;
  }
  const cerrada = (id: number, fechaFinalizacion: string) => ({
    id,
    anNumber: `AN-000${id}`,
    titulo: `Actividad ${id}`,
    estatus: 'Finalizada',
    prioridad: 'MEDIA',
    fechaFinalizacion: new Date(fechaFinalizacion),
    responsable: { id: 21, nombre: 'Persona Demo' },
    client: null,
  });

  it('por la mañana, lo terminado ayer a las 19:30 ya no cuenta como completado hoy', async () => {
    reloj('2026-11-21T16:00:00.000Z'); // 21 de noviembre, 10:00 en México
    const board = await tablero([
      cerrada(1, '2026-11-21T01:30:00.000Z'), // ayer 20, 19:30 en México
      cerrada(2, '2026-11-21T14:00:00.000Z'), // hoy 21, 08:00 en México
    ]);

    expect(board.columns.completadas_hoy.map((c: any) => c.id)).toEqual([2]);
  });

  it('por la tarde, lo terminado en la mañana sigue contando como completado hoy', async () => {
    reloj('2026-11-22T01:30:00.000Z'); // 21 de noviembre, 19:30 en México; en UTC ya es 22
    const board = await tablero([cerrada(2, '2026-11-21T14:00:00.000Z')]); // hoy 21, 08:00 en México

    expect(board.columns.completadas_hoy.map((c: any) => c.id)).toEqual([2]);
  });

  describe('al editar, el inicio puede ser de ayer pero no de antes', () => {
    const ALTO = new Error('alto: ya pasó la revisión de la ventana');
    function editar(fechaInicio: string) {
      const svc = Object.create(ActivitiesService.prototype) as any;
      svc.prisma = {
        activity: {
          findFirst: jest.fn().mockResolvedValue({
            estatus: 'Asignada',
            responsableId: 21,
            creadoPorId: 5,
            companyId: 7,
            titulo: 'Actividad demo',
            fechaInicio: new Date('2026-11-21T15:00:00.000Z'),
            fechaMaxima: null,
            fechaEntregaEsperada: null,
            periodoInicio: null,
            periodoFin: null,
          }),
          // Lo primero que se consulta después de la ventana: aquí se corta la prueba.
          update: jest.fn().mockRejectedValue(ALTO),
        },
        activityEvidenceField: { findMany: jest.fn().mockRejectedValue(ALTO) },
        $transaction: jest.fn().mockRejectedValue(ALTO),
      };
      return svc.update(1, { fechaInicio }, { id: 5 }, 7) as Promise<unknown>;
    }

    it('a las 19:30, un inicio de ayer a las 9 de la mañana sí entra en la ventana', async () => {
      reloj('2026-11-22T01:30:00.000Z'); // 21 de noviembre, 19:30 en México; en UTC ya es 22
      const error = await editar('2026-11-20T15:00:00.000Z').then(
        () => null,
        (e: Error) => e,
      );

      expect(String(error?.message ?? '')).not.toContain('fuera de la ventana permitida');
    });

    it('un inicio de antier sigue fuera de la ventana', async () => {
      reloj('2026-11-22T01:30:00.000Z');

      await expect(editar('2026-11-19T15:00:00.000Z')).rejects.toThrow('fechaInicio está fuera de la ventana permitida');
    });
  });

  it('el aviso de prioridad compara contra las actividades del mismo día de la empresa', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = Object.create(ActivityEvidenceService.prototype) as any;
    svc.prisma = { activityAssignee: { findMany } };

    // Inicia a las 19:30 del 21 en México (en UTC, 01:30 del 22).
    await svc.otraDeMasPrioridadSinTerminar({ id: 1, prioridad: 'BAJA' }, 21, new Date('2026-11-22T01:30:00.000Z'));

    const [porInicio] = findMany.mock.calls[0][0].where.activity.OR;
    expect(porInicio.fechaInicio).toEqual({
      gte: new Date('2026-11-21T06:00:00.000Z'),
      lt: new Date('2026-11-22T06:00:00.000Z'),
    });
  });

  it('en Ventas, semana, mes y año empiezan a la medianoche de la empresa', () => {
    reloj('2026-12-01T01:30:00.000Z'); // lunes 30 de noviembre, 19:30 en México
    const svc = Object.create(VentasService.prototype) as any;

    expect(svc.getPeriodStart('month')).toEqual(new Date('2026-11-01T06:00:00.000Z'));
    expect(svc.getPeriodStart('year')).toEqual(new Date('2026-01-01T06:00:00.000Z'));
    // La semana sigue empezando en domingo: el 29 de noviembre.
    expect(svc.getPeriodStart('week')).toEqual(new Date('2026-11-29T06:00:00.000Z'));
  });
});
