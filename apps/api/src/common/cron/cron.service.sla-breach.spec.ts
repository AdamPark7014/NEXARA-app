import { CronService } from './cron.service';

const NOW = new Date('2026-09-22T20:00:00.000Z').getTime();

const TICKETS_TABLA = [
  {
    id: 101,
    anNumber: 'AN-0101',
    titulo: 'Mantenimiento de CCTV',
    prioridad: 'Alta',
    fechaAsignacion: new Date(NOW - 9 * 3600_000), // 9h atrás → > 8h (ALTA)
    fechaEntregaEsperada: null,
    responsableId: 7,
    companyId: 1,
    periodoInicio: null,
    periodoFin: null,
  },
  {
    id: 202,
    anNumber: 'AN-0202',
    titulo: 'Instalación de Access Point',
    prioridad: 'Media',
    fechaAsignacion: new Date(NOW - 3 * 3600_000), // 3h atrás → dentro de 24h
    fechaEntregaEsperada: null,
    responsableId: 9,
    companyId: 1,
    periodoInicio: null,
    periodoFin: null,
  },
];

function build(now = NOW, tickets = TICKETS_TABLA, visitas: Array<{ activityId: number; contract: { slaResolutionHours: number | null } }> = []) {
  jest.spyOn(Date, 'now').mockReturnValue(now);

  const prisma = {
    activity: {
      findMany: jest.fn().mockResolvedValue(tickets),
    },
    maintenanceContractVisit: {
      findMany: jest.fn().mockResolvedValue(visitas),
    },
  };

  const notificationHierarchy = {
    notifyTicketSlaBreach: jest.fn().mockResolvedValue(undefined),
  };
  const maintenanceContracts = {} as any;
  const vehiclesService = {} as any;
  const domainEvents = { publishEntityLifecycle: jest.fn().mockReturnValue(undefined) };
  const email = {} as any;

  const service = new CronService(
    prisma as any,
    email,
    notificationHierarchy as any,
    maintenanceContracts,
    vehiclesService,
    domainEvents as any,
    undefined,
  );
  return { service, prisma, notificationHierarchy, domainEvents };
}

describe('SLA breach escalate', () => {
  it('notifica a responsable/jefes por cada actividad vencida', async () => {
    const { service, notificationHierarchy, domainEvents } = build();
    await service.handleSlaBreachEscalate();

    expect(notificationHierarchy.notifyTicketSlaBreach).toHaveBeenCalledTimes(1);
    expect(notificationHierarchy.notifyTicketSlaBreach).toHaveBeenCalledWith({
      activityId: 101,
      userId: 7,
    });
    // Publica evento de dominio agrupado por compañía. La prioridad del ticket no se reescribe.
    expect(domainEvents.publishEntityLifecycle).toHaveBeenCalledWith(
      'updated',
      expect.objectContaining({
        payload: expect.objectContaining({
          alertType: 'sla_breach',
          tickets: [expect.objectContaining({ id: 101, prioridad: 'Alta' })],
        }),
      }),
    );
  });

  it('no escala si la entrega esperada del caso todavía no vence', async () => {
    const { service, notificationHierarchy, domainEvents } = build(NOW, [
      {
        ...TICKETS_TABLA[0],
        fechaEntregaEsperada: new Date(NOW + 2 * 3600_000),
      },
    ]);
    await service.handleSlaBreachEscalate();

    expect(notificationHierarchy.notifyTicketSlaBreach).not.toHaveBeenCalled();
    expect(domainEvents.publishEntityLifecycle).not.toHaveBeenCalled();
  });

  it('escala cuando la entrega esperada ya pasó, aunque la tabla de prioridad daría más horas', async () => {
    const { service, notificationHierarchy } = build(NOW, [
      {
        ...TICKETS_TABLA[1],
        fechaEntregaEsperada: new Date(NOW - 3600_000),
      },
    ]);
    await service.handleSlaBreachEscalate();

    expect(notificationHierarchy.notifyTicketSlaBreach).toHaveBeenCalledTimes(1);
    expect(notificationHierarchy.notifyTicketSlaBreach).toHaveBeenCalledWith({
      activityId: 202,
      userId: 9,
    });
  });

  it('usa slaResolutionHours del contrato y la entrega esperada le gana', async () => {
    const porContrato = {
      ...TICKETS_TABLA[1],
      id: 303,
      prioridad: 'Baja',
      fechaAsignacion: new Date(NOW - 5 * 3600_000),
      fechaEntregaEsperada: null,
    };
    const entregaGana = {
      ...TICKETS_TABLA[0],
      id: 404,
      fechaEntregaEsperada: new Date(NOW + 4 * 3600_000),
    };
    const { service, notificationHierarchy } = build(NOW, [porContrato, entregaGana], [
      { activityId: 303, contract: { slaResolutionHours: 4 } },
      { activityId: 404, contract: { slaResolutionHours: 1 } },
    ]);
    await service.handleSlaBreachEscalate();

    expect(notificationHierarchy.notifyTicketSlaBreach).toHaveBeenCalledTimes(1);
    expect(notificationHierarchy.notifyTicketSlaBreach).toHaveBeenCalledWith({
      activityId: 303,
      userId: 9,
    });
  });

  it('un contrato sin horas válidas deja la tabla de prioridad', async () => {
    const { service, notificationHierarchy } = build(
      NOW,
      TICKETS_TABLA,
      [
        { activityId: 101, contract: { slaResolutionHours: 0 } },
        { activityId: 202, contract: { slaResolutionHours: null } },
      ],
    );
    await service.handleSlaBreachEscalate();

    expect(notificationHierarchy.notifyTicketSlaBreach).toHaveBeenCalledTimes(1);
    expect(notificationHierarchy.notifyTicketSlaBreach).toHaveBeenCalledWith({
      activityId: 101,
      userId: 7,
    });
  });

  it('de madrugada no manda avisos, pero el tablero se sigue actualizando', async () => {
    // 2026-09-23 03:00 en Ciudad de México.
    const { service, notificationHierarchy, domainEvents } = build(Date.parse('2026-09-23T09:00:00.000Z'));
    await service.handleSlaBreachEscalate();

    expect(notificationHierarchy.notifyTicketSlaBreach).not.toHaveBeenCalled();
    expect(domainEvents.publishEntityLifecycle).toHaveBeenCalled();
  });

  it('en domingo no manda avisos', async () => {
    // 2026-09-27 12:00 en Ciudad de México (domingo).
    const { service, notificationHierarchy } = build(Date.parse('2026-09-27T18:00:00.000Z'));
    await service.handleSlaBreachEscalate();

    expect(notificationHierarchy.notifyTicketSlaBreach).not.toHaveBeenCalled();
  });
});

