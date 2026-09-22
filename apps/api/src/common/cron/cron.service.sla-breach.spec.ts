import { CronService } from './cron.service';

const NOW = new Date('2026-09-22T20:00:00.000Z').getTime();

function build() {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);

  const prisma = {
    activity: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 101,
          anNumber: 'AN-0101',
          titulo: 'Mantenimiento de CCTV',
          prioridad: 'Alta',
          fechaAsignacion: new Date(NOW - 9 * 3600_000), // 9h atrás → > 8h (ALTA)
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
          responsableId: 9,
          companyId: 1,
          periodoInicio: null,
          periodoFin: null,
        },
      ]),
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
    // Publica evento de dominio agrupado por compañía
    expect(domainEvents.publishEntityLifecycle).toHaveBeenCalled();
  });
});

