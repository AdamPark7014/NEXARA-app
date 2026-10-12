import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from '../../users/users.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { ClaudeService, type UsoClaude } from '../claude/claude.service.js';
import {
  ESQUEMA_PLAN,
  PROMPT_SISTEMA,
  bloquePersonas,
  construirPropuesta,
  mensajeUsuario,
  type CatalogosNexara,
  type PlanAsistente,
  type PropuestaActividad,
} from './asistente-actividades.js';

export type RespuestaAsistente = {
  propuestas: PropuestaActividad[];
  aclaracion: string | null;
  uso: UsoClaude;
};

/** Interpreta instrucciones en lenguaje natural y propone actividades (no crea nada). */
@Injectable()
export class AsistenteActividadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly claude: ClaudeService,
  ) {}

  estado() {
    return {
      disponible: this.claude.disponible(),
      modelo: process.env.ANTHROPIC_ASSISTANT_MODEL || 'claude-haiku-5-5',
    };
  }

  async interpretar(texto: string, user: any, companyId: number | null): Promise<RespuestaAsistente> {
    const tenantId = requireCompanyId(companyId);
    const instruccion = (texto || '').trim();
    if (!instruccion) throw new BadRequestException('Escribe qué necesitas.');

    const catalogos = await this.catalogos(user, tenantId);
    const { datos, uso } = await this.claude.json<PlanAsistente>({
      proceso: 'asistente-actividades',
      companyId: tenantId,
      // Prompt fijo + personas de la empresa: cambian poco, así que se reutilizan de la caché.
      sistema: [PROMPT_SISTEMA, bloquePersonas(catalogos.personas)],
      usuario: mensajeUsuario(instruccion, new Date(), user?.nombre ?? null),
      esquema: ESQUEMA_PLAN,
      modelo: process.env.ANTHROPIC_ASSISTANT_MODEL || undefined,
      maxTokens: 4096,
    });

    const ahora = new Date();
    const acciones = Array.isArray(datos?.acciones) ? datos.acciones.slice(0, 10) : [];
    return {
      propuestas: acciones.map((a) => construirPropuesta(a, catalogos, { creadoPorId: Number(user.id), ahora })),
      aclaracion: datos?.aclaracion ?? (acciones.length ? null : 'No encontré ninguna actividad en el texto. ¿Qué hay que hacer y quién?'),
      uso,
    };
  }

  private async catalogos(user: any, companyId: number): Promise<CatalogosNexara> {
    const conRol = await this.users.findOne(user.id, companyId);
    const [personas, clientes, sucursales, proyectos] = await Promise.all([
      this.users.findAssignableUsers({ ...user, role: conRol?.role }, companyId),
      this.prisma.serviceClient.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.serviceClientBranch.findMany({
        where: { companyId, isActive: true },
        select: {
          id: true,
          clientId: true,
          name: true,
          branchNumber: true,
          address: true,
          city: true,
          state: true,
          client: { select: { name: true } },
        },
      }),
      this.prisma.operationalProject.findMany({
        where: { companyId, deletedAt: null, status: { in: ['ACTIVE', 'PLANNED', 'ON_HOLD'] } },
        select: { id: true, title: true, clientId: true, client: { select: { name: true } } },
      }),
    ]);
    return {
      personas: (personas as any[]).map((p) => ({ id: p.id, nombre: p.nombre, puesto: p.puesto ?? null, email: p.email })),
      clientes,
      sucursales: sucursales.map(({ client, ...s }) => ({ ...s, clientName: client?.name ?? '' })),
      proyectos: proyectos.map(({ client, ...p }) => ({ ...p, clientName: client?.name ?? '' })),
    };
  }
}
