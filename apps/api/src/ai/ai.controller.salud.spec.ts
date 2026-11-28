import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RbacGuard } from '../common/rbac.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AiTriageService } from './ai-triage.service';
import { AsistenteActividadesService } from './asistente/asistente-actividades.service';
import { ClaudeService } from './claude/claude.service';
import { ComplejidadService } from './complejidad/complejidad.service';
import { EstandarService } from './estandar/estandar.service';
import { RevisionActividadService } from './revision/revision-actividad.service';
import { TranscriptorService } from './voz/transcriptor.service';
import { PERMISSIONS } from '../common/permissions';
import { ROLES } from '../common/rbac/roles.v2';
import { checkUrlAccess } from '../common/rbac/url-matrix';
import { AiController } from './ai.controller';
import { SaludIaService } from './salud/salud-ia.service';

/**
 * `GET /ai/salud` es de dirección y desarrollo. `console.admin` solo no basta: lo tienen otros roles (jefes de área).
 * La prueba es sobre la ruta y sobre su compuerta; lo que responde el servicio ya lo prueba `salud-ia.service.spec.ts`.
 */
describe('AiController: GET /ai/salud', () => {
  const EMPRESA = 7;
  const RESPUESTA = { estado: 'ok' };
  let estado: jest.Mock;
  let controller: AiController;

  beforeEach(() => {
    estado = jest.fn().mockResolvedValue(RESPUESTA);
    const sinUso = {} as never;
    controller = new AiController(sinUso, sinUso, sinUso, sinUso, sinUso, sinUso, { estado } as unknown as SaludIaService);
  });

  const conConsoleAdmin = (email: string | null, extra: Record<string, unknown> = {}) => ({
    id: 99,
    email,
    permissions: [PERMISSIONS.CONSOLE_ADMIN],
    ...extra,
  });

  it.each([
    ['la cuenta de desarrollo', 'developer@nexara.com.mx'],
    ['el CEO', 'gerencia@nexara.com.mx'],
    ['Dirección General', 'getzemani.delvalle@nexara.com.mx'],
    ['la cuenta de pruebas del CEO', 'claudia.bernal@nexara.com.mx'],
    ['el CEO escrito con mayúsculas y espacios', '  Gerencia@Nexara.com.mx '],
  ])('%s recibe el estado de la IA de su empresa', async (_quien, email) => {
    const resultado = await controller.salud(conConsoleAdmin(email), EMPRESA);
    expect(resultado).toBe(RESPUESTA);
    expect(estado).toHaveBeenCalledWith(EMPRESA);
  });

  it.each([
    ['un director con console.admin', 'director.operaciones@nexara.com.mx', { roleKey: ROLES.DIR_OPERACIONES }],
    ['un administrador con console.admin', 'admin.cualquiera@nexara.com.mx', { admin: true }],
    ['un usuario con console.admin y sin correo', null, {}],
    ['alguien con el correo de otra empresa que se parece al de desarrollo', 'developer@otra.com', {}],
  ])('%s recibe 403 y el servicio no se entera', async (_quien, email, extra) => {
    const intento = () => controller.salud(conConsoleAdmin(email, extra), EMPRESA);
    expect(intento).toThrow(ForbiddenException);
    expect(intento).toThrow('Solo dirección y desarrollo ven el estado de la IA.');
    expect(estado).not.toHaveBeenCalled();
  });

  it('un usuario ausente tampoco pasa', () => {
    expect(() => controller.salud(undefined, EMPRESA)).toThrow(ForbiddenException);
    expect(estado).not.toHaveBeenCalled();
  });

  it('sin empresa activa da 403 aunque sea desarrollo: la consulta es siempre de una empresa', () => {
    for (const empresa of [null, 0]) {
      expect(() => controller.salud(conConsoleAdmin('developer@nexara.com.mx'), empresa as never)).toThrow(ForbiddenException);
    }
    expect(estado).not.toHaveBeenCalled();
  });

  it('la ruta pide console.admin y es GET /ai/salud (el guardia revisa antes de llegar a la función)', () => {
    expect(Reflect.getMetadata('rbac', AiController.prototype.salud)).toEqual({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN] });
    expect(Reflect.getMetadata('path', AiController.prototype.salud)).toBe('salud');
    expect(Reflect.getMetadata('method', AiController.prototype.salud)).toBe(0); // RequestMethod.GET
    expect(Reflect.getMetadata('path', AiController)).toBe('ai');
  });

  it('la matriz de URLs deja pasar a dirección (GET /api/**) para que llegue al permiso y a la regla de la función', () => {
    expect(checkUrlAccess(ROLES.CEO, '/api/ai/salud', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(ROLES.SUPER_ADMIN, '/api/ai/salud', 'GET').allowed).toBe(true);
  });

  it('Nest resuelve el servicio de salud dentro del controlador (con la IA y la base reales del módulo)', async () => {
    const sinUso = { useValue: {} };
    const modulo = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        SaludIaService,
        ClaudeService,
        { provide: PrismaService, useValue: {} },
        { provide: AiTriageService, ...sinUso },
        { provide: AsistenteActividadesService, ...sinUso },
        { provide: TranscriptorService, ...sinUso },
        { provide: ComplejidadService, ...sinUso },
        { provide: EstandarService, ...sinUso },
        { provide: RevisionActividadService, ...sinUso },
      ],
    })
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();
    expect(modulo.get(AiController)).toBeInstanceOf(AiController);
    expect((modulo.get(AiController) as any).saludIa).toBe(modulo.get(SaludIaService));
  });
});
