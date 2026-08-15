import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesController } from './activities.controller.js';
import { ActivitiesService } from './activities.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { UsersService } from '../users/users.service.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { ExcelImportService } from '../common/excel-import.service.js';
import { RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * `GET /activities` enruta a un método distinto del servicio según el alcance
 * del usuario. Lo que importa verificar es ese enrutado y que la empresa activa
 * se propague siempre: un fallo aquí devuelve a un usuario actividades que no
 * le corresponden, o de otra empresa.
 */
describe('ActivitiesController', () => {
  let controller: ActivitiesController;
  let service: ActivitiesService;
  let usersService: { findUsersForConsoleActivityScope: jest.Mock };

  const COMPANY_ID = 7;
  const activity = (id: number, titulo: string) => ({ id, titulo });

  beforeEach(async () => {
    usersService = {
      findUsersForConsoleActivityScope: jest.fn().mockResolvedValue([{ id: 3 }, { id: 4 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [
        ActivitiesService,
        {
          provide: PrismaService,
          useValue: { activity: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() } },
        },
        {
          provide: NotificationHierarchyService,
          useValue: {
            notifyActivityAssigned: jest.fn(),
            notifyActivityUpdated: jest.fn(),
            notifyHierarchy: jest.fn(),
          },
        },
        { provide: UsersService, useValue: usersService },
        { provide: ExcelExportService, useValue: { exportToExcel: jest.fn() } },
        { provide: ExcelImportService, useValue: { importExcel: jest.fn() } },
      ],
    })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(CurrentUser)
      .useValue(jest.fn())
      .compile();

    controller = module.get<ActivitiesController>(ActivitiesController);
    service = module.get<ActivitiesService>(ActivitiesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns every activity for a super admin', async () => {
    const expected = [activity(1, 'Actividad CEO')];
    const spy = jest.spyOn(service, 'findAll').mockResolvedValueOnce(expected as any);

    const query = {} as any;
    const result = await controller.findAll({ isSuperAdmin: true } as any, COMPANY_ID, query);

    expect(result).toEqual(expected);
    expect(spy).toHaveBeenCalledWith(query, COMPANY_ID);
  });

  it('scopes an ops manager to the console activity user set', async () => {
    const expected = [activity(2, 'Actividad Supervisor')];
    const spy = jest.spyOn(service, 'findByAllowedUsers').mockResolvedValueOnce(expected as any);

    const user = { permissions: [PERMISSIONS.CONSOLE_ADMIN], departmentId: 2 };
    const result = await controller.findAll(user as any, COMPANY_ID, {} as any);

    expect(result).toEqual(expected);
    expect(usersService.findUsersForConsoleActivityScope).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith([3, 4], COMPANY_ID);
  });

  it('falls back to own activities for regular staff', async () => {
    const expected = [activity(3, 'Actividad Staff')];
    const spy = jest.spyOn(service, 'findByResponsible').mockResolvedValueOnce(expected as any);

    const user = { permissions: [PERMISSIONS.ACTIVITIES_VIEW], id: 3 };
    const result = await controller.findAll(user as any, COMPANY_ID, {} as any);

    expect(result).toEqual(expected);
    expect(spy).toHaveBeenCalledWith(3, COMPANY_ID);
  });

  it('honours scope=mine even for a super admin', async () => {
    const expected = [activity(4, 'Solo mías')];
    const spy = jest.spyOn(service, 'findByResponsible').mockResolvedValueOnce(expected as any);

    const user = { isSuperAdmin: true, id: 9 };
    const result = await controller.findAll(user as any, COMPANY_ID, { scope: 'mine' } as any);

    expect(result).toEqual(expected);
    expect(spy).toHaveBeenCalledWith(9, COMPANY_ID);
  });
});
