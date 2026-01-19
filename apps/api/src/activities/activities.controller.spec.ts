
import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesController } from './activities.controller.js';
import { ActivitiesService } from './activities.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
type UserPrismaMock = {
  id: number;
  nombre: string;
  email: string;
  password?: string;
  passwordHash: string;
  roleId: number;
  departmentId: number;
  fechaCreacion: Date;
};

describe('ActivitiesController', () => {
  let controller: ActivitiesController;
  let service: ActivitiesService;

  beforeEach(async () => {

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [
        ActivitiesService,
        { provide: PrismaService, useValue: { activity: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), } } },
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

  it('should return activities for CEO', async () => {
    const user = { nivelAutoridad: 100 };
    const responsable: UserPrismaMock = {
      id: 2,
      nombre: 'Juan',
      email: 'juan@mail.com',
      password: '',
      passwordHash: '',
      roleId: 1,
      departmentId: 1,
      fechaCreacion: new Date(),
    };
    const creador: UserPrismaMock = {
      id: 1,
      nombre: 'Admin',
      email: 'admin@mail.com',
      password: '',
      passwordHash: '',
      roleId: 1,
      departmentId: 1,
      fechaCreacion: new Date(),
    };
    const activity = {
      id: 1,
      anNumber: 'A-001',
      titulo: 'Actividad CEO',
      descripcion: null,
      estatus: 'Pendiente',
      prioridad: null,
      creadoPorId: creador.id,
      responsableId: responsable.id,
      eficienciaScore: null,
      comentariosFeedback: null,
      fechaAsignacion: new Date(),
      fechaEntregaEsperada: null,
      fechaFinalizacion: null,
      creador,
      responsable,
      evidencias: [],
      vehicleControls: [],
      expenses: [],
      locations: [],
    };
    jest.spyOn(service, 'findAll').mockResolvedValueOnce([activity]);
    // @ts-ignore
    const result = await controller.findAll(user);
    expect(result).toEqual([activity]);
  });

  it('should return activities for supervisor', async () => {
    const user = { nivelAutoridad: 50, departmentId: 2 };
    const responsable: UserPrismaMock = {
      id: 3,
      nombre: 'Ana',
      email: 'ana@mail.com',
      password: '',
      passwordHash: '',
      roleId: 2,
      departmentId: 2,
      fechaCreacion: new Date(),
    };
    const creador: UserPrismaMock = {
      id: 1,
      nombre: 'Admin',
      email: 'admin@mail.com',
      password: '',
      passwordHash: '',
      roleId: 1,
      departmentId: 1,
      fechaCreacion: new Date(),
    };
    const activity = {
      id: 2,
      anNumber: 'A-002',
      titulo: 'Actividad Supervisor',
      descripcion: null,
      estatus: 'Pendiente',
      prioridad: null,
      creadoPorId: creador.id,
      responsableId: responsable.id,
      eficienciaScore: null,
      comentariosFeedback: null,
      fechaAsignacion: new Date(),
      fechaEntregaEsperada: null,
      fechaFinalizacion: null,
      creador,
      responsable,
      evidencias: [],
      vehicleControls: [],
      expenses: [],
      locations: [],
    };
    jest.spyOn(service, 'findByDepartment').mockResolvedValueOnce([activity]);
    // @ts-ignore
    const result = await controller.findAll(user);
    expect(result).toEqual([activity]);
  });

  it('should return activities for staff', async () => {
    const user = { nivelAutoridad: 10, id: 3 };
    const responsable: UserPrismaMock = {
      id: 3,
      nombre: 'Ana',
      email: 'ana@mail.com',
      password: '',
      passwordHash: '',
      roleId: 2,
      departmentId: 2,
      fechaCreacion: new Date(),
    };
    const creador: UserPrismaMock = {
      id: 1,
      nombre: 'Admin',
      email: 'admin@mail.com',
      password: '',
      passwordHash: '',
      roleId: 1,
      departmentId: 1,
      fechaCreacion: new Date(),
    };
    const activity = {
      id: 3,
      anNumber: 'A-003',
      titulo: 'Actividad Staff',
      descripcion: null,
      estatus: 'Pendiente',
      prioridad: null,
      creadoPorId: creador.id,
      responsableId: responsable.id,
      eficienciaScore: null,
      comentariosFeedback: null,
      fechaAsignacion: new Date(),
      fechaEntregaEsperada: null,
      fechaFinalizacion: null,
      creador,
      responsable,
      evidencias: [],
      vehicleControls: [],
      expenses: [],
      locations: [],
    };
    jest.spyOn(service, 'findByResponsible').mockResolvedValueOnce([activity]);
    // @ts-ignore
    const result = await controller.findAll(user);
    expect(result).toEqual([activity]);
  });
});
