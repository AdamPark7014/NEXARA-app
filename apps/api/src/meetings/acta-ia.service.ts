import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { ClaudeService, type UsoClaude } from '../ai/claude/claude.service.js';
import {
  ESQUEMA_ACTA,
  MAX_CARACTERES_TRANSCRIPCION,
  PROMPT_ACTA,
  bloquePersonasActa,
  construirActa,
  mensajeActa,
  type ActaPlan,
  type ActaPropuesta,
} from './acta-ia.js';

/**
 * Propone el acta de una reunión a partir de su transcripción o notas. No guarda nada:
 * la web guarda la minuta y los acuerdos que la persona confirme.
 *
 * Modelo: `ANTHROPIC_ACTAS_MODEL` (Sonnet 5.5 por omisión: un resumen de horas de junta
 * gana mucho con un modelo mejor y sigue costando centavos por reunión).
 */
@Injectable()
export class ActaIaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
  ) {}

  async proponer(
    meetingId: number,
    transcripcion: string,
    companyId: number | null,
  ): Promise<ActaPropuesta & { uso: UsoClaude }> {
    const tenantId = requireCompanyId(companyId);
    const texto = (transcripcion || '').trim();
    if (texto.length < 40) throw new BadRequestException('Pega la transcripción o las notas de la reunión.');
    if (texto.length > MAX_CARACTERES_TRANSCRIPCION) {
      throw new BadRequestException('La transcripción es demasiado larga (más de 4 horas). Divídela en partes.');
    }

    const reunion = await this.prisma.operationalMeeting.findFirst({
      where: { id: meetingId, ...companyWhere(tenantId) },
      select: {
        titulo: true,
        fecha: true,
        agenda: true,
        asistentes: { select: { user: { select: { nombre: true } } } },
      },
    });
    if (!reunion) throw new NotFoundException('Reunión no encontrada');

    // `User` no lleva `companyId`: la pertenencia vive en `UserCompany`.
    const personas = await this.prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true, nombre: true, puesto: true },
      orderBy: { nombre: 'asc' },
    });

    const { datos, uso } = await this.claude.json<ActaPlan>({
      proceso: 'acta-reunion',
      companyId: tenantId,
      sistema: [PROMPT_ACTA, bloquePersonasActa(personas)],
      usuario: mensajeActa(
        {
          titulo: reunion.titulo,
          fecha: reunion.fecha,
          agenda: reunion.agenda,
          asistentes: reunion.asistentes.map((a) => a.user?.nombre).filter(Boolean) as string[],
        },
        texto,
      ),
      esquema: ESQUEMA_ACTA,
      modelo: process.env.ANTHROPIC_ACTAS_MODEL || 'claude-sonnet-5-5',
      // El API corta toda petición a los 120 s (APP_REQUEST_TIMEOUT_MS): el acta debe caber antes.
      maxTokens: 8_000,
      esfuerzo: 'low',
      timeoutMs: 110_000,
    });

    return { ...construirActa(datos, personas), uso };
  }
}
