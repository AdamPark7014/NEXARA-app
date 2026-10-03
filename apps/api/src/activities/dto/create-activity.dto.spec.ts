import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateActivityDto } from './create-activity.dto';
import { UpdateActivityDto } from './update-activity.dto';

/** El cuerpo que arma `/erp/pizarra/[userId]/asignar` (buildActivityPayload) para un servicio. */
function payloadAsignar(overrides: Record<string, unknown> = {}) {
  return {
    titulo: 'Revisar cámaras de la entrada principal',
    indicaciones: 'Llevar escalera',
    prioridad: 'MEDIA',
    activityType: 'INTERNAL',
    ticketType: 'CORRECTIVO',
    workType: 'ISSUE',
    clientId: 14,
    responsableId: 31,
    fechaInicio: '2026-09-30T15:00:00.000Z',
    fechaEntregaEsperada: '2026-09-30T15:00:00.000Z',
    fechaMaxima: '2026-09-30T15:00:00.000Z',
    evidencePhotoRequired: 4,
    coreKind: 'servicio',
    assignmentCharge: 'ejecucion',
    estatus: 'Pendiente',
    creadoPorId: 12,
    ...overrides,
  };
}

async function errores(cls: any, body: Record<string, unknown>) {
  const dto = plainToInstance(cls, body, { enableImplicitConversion: true });
  const errs = await validate(dto as object, { whitelist: true, forbidNonWhitelisted: true });
  return errs.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreateActivityDto', () => {
  it('acepta el cuerpo real de «Asignar actividad»', async () => {
    expect(await errores(CreateActivityDto, payloadAsignar())).toEqual([]);
  });

  it('un «¿Qué hay que hacer?» de más de 200 caracteres es 400 con mensaje, no un 500 de Postgres', async () => {
    const msgs = await errores(CreateActivityDto, payloadAsignar({ titulo: 'x'.repeat(201) }));
    expect(msgs.join(' ')).toMatch(/200 caracteres/);
  });

  it('un tiempo estimado de más de 12 horas se rechaza con el motivo; 12 h exactas pasan', async () => {
    const msgs = await errores(CreateActivityDto, payloadAsignar({ tiempoEstimadoMin: 721 }));
    expect(msgs.join(' ')).toMatch(/no puede durar más de 12 horas/);
    expect(await errores(CreateActivityDto, payloadAsignar({ tiempoEstimadoMin: 720 }))).toEqual([]);
    // Editar tampoco lo salta.
    expect((await errores(UpdateActivityDto, { tiempoEstimadoMin: 1440 })).join(' ')).toMatch(/12 horas/);
  });

  it('las indicaciones largas siguen permitidas (columna sin tope)', async () => {
    expect(await errores(CreateActivityDto, payloadAsignar({ indicaciones: 'y'.repeat(5000) }))).toEqual([]);
  });

  it('la sucursal respeta el largo de su columna', async () => {
    const msgs = await errores(CreateActivityDto, payloadAsignar({ branchAddress: 'z'.repeat(221) }));
    expect(msgs.join(' ')).toMatch(/220 caracteres/);
  });

  it('editar hereda los topes', async () => {
    const msgs = await errores(UpdateActivityDto, { titulo: 'x'.repeat(201) });
    expect(msgs.join(' ')).toMatch(/200 caracteres/);
    expect(await errores(UpdateActivityDto, { titulo: 'Corto' })).toEqual([]);
  });
});
