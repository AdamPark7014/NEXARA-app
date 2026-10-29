import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from '../../users/users.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { ClaudeService, type UsoClaude } from '../claude/claude.service.js';
import {
  CONFIG_ASISTENTE,
  construirPropuesta,
  peticionAsistente,
  planDeSalida,
  type CatalogosNexara,
  type PropuestaActividad,
  type SalidaIA,
} from './asistente-actividades.js';
import { nombresPropiosDe } from './nombres.js';

/** Actividades recientes de las que se toman los nombres ya usados («Toks»). */
const ACTIVIDADES_PARA_NOMBRES = 400;

export type RespuestaAsistente = {
  propuestas: PropuestaActividad[];
  aclaracion: string | null;
  uso: UsoClaude;
  /**
   * Clientes y proyectos activos para que la tarjeta pueda cambiar el tipo (un servicio pide
   * cliente; una obra, proyecto) sin otra llamada. No van a la IA: no cuestan tokens.
   */
  opciones: {
    clientes: Array<{ id: number; nombre: string }>;
    proyectos: Array<{ id: number; nombre: string; clientId: number }>;
    /** Sucursales activas: el lugar de la tarjeta se elige de aquí o se escribe. */
    sucursales: Array<{
      id: number;
      nombre: string;
      clientId: number;
      branchNumber: string | null;
      city: string | null;
      state: string | null;
      address: string | null;
    }>;
  };
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
      modelo: process.env.ANTHROPIC_ASSISTANT_MODEL || CONFIG_ASISTENTE.modelo,
    };
  }

  async interpretar(texto: string, user: any, companyId: number | null): Promise<RespuestaAsistente> {
    const tenantId = requireCompanyId(companyId);
    const instruccion = (texto || '').trim();
    if (!instruccion) throw new BadRequestException('Escribe qué necesitas.');

    const catalogos = await this.catalogos(user, tenantId);
    const ahora = new Date();
    const peticion = peticionAsistente(instruccion, catalogos, ahora, user?.nombre ?? null);
    const { datos: salida, uso } = await this.claude.json<SalidaIA>({
      ...peticion,
      proceso: 'asistente-actividades',
      companyId: tenantId,
      modelo: process.env.ANTHROPIC_ASSISTANT_MODEL || peticion.modelo,
    });

    const datos = planDeSalida(salida);
    const acciones = datos.acciones.slice(0, 10);
    return {
      propuestas: acciones.map((a) => construirPropuesta(a, catalogos, { creadoPorId: Number(user.id), ahora, instruccion })),
      aclaracion: datos?.aclaracion ?? (acciones.length ? null : 'No encontré ninguna actividad en el texto: ¿qué hay que hacer y quién?'),
      uso,
      opciones: {
        clientes: catalogos.clientes
          .map((c) => ({ id: c.id, nombre: c.name }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
        proyectos: catalogos.proyectos.map((p) => ({ id: p.id, nombre: p.title, clientId: p.clientId })),
        sucursales: catalogos.sucursales.map((s) => ({
          id: s.id,
          nombre: s.name,
          clientId: s.clientId,
          branchNumber: s.branchNumber ?? null,
          city: s.city ?? null,
          state: s.state ?? null,
          address: s.address ?? null,
        })),
      },
    };
  }

  private async catalogos(user: any, companyId: number): Promise<CatalogosNexara> {
    const conRol = await this.users.findOne(user.id, companyId);
    const [personas, clientes, sucursales, proyectos, recientes] = await Promise.all([
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
      this.prisma.activity.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { id: 'desc' },
        take: ACTIVIDADES_PARA_NOMBRES,
        select: { titulo: true, branchName: true },
      }),
    ]);
    return {
      personas: (personas as any[]).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        puesto: p.puesto ?? null,
        email: p.email,
        horaEntrada: p.horaEntrada ?? null,
      })),
      clientes,
      sucursales: sucursales.map(({ client, ...s }) => ({ ...s, clientName: client?.name ?? '' })),
      proyectos: proyectos.map(({ client, ...p }) => ({ ...p, clientName: client?.name ?? '' })),
      nombresUsados: nombresPropiosDe(recientes.map((a) => ({ titulo: a.titulo, lugar: a.branchName }))),
    };
  }
}
