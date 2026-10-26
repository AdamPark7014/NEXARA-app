import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiTriageService } from './ai-triage.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { AsistenteActividadesService } from './asistente/asistente-actividades.service.js';
import { InterpretarInstruccionDto } from './asistente/dto/interpretar.dto.js';
import { TranscriptorService } from './voz/transcriptor.service.js';
import { extensionAudio } from './voz/transcriptor.js';
import { isChainTopAuthority } from '../activities/activity-superiors.js';

/** Un dictado son segundos o un par de minutos: 10 MB sobran en opus. */
const MAX_DICTADO_BYTES = 10 * 1024 * 1024;

@Controller('ai')
@UseGuards(RbacGuard)
export class AiController {
  constructor(
    private readonly triage: AiTriageService,
    private readonly asistente: AsistenteActividadesService,
    private readonly transcriptor: TranscriptorService,
  ) {}

  @Post('triage')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  triageTicket(
    @Body() body: { title: string; description?: string; clientName?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.triage.triageActivityText(body, companyId);
  }

  @Get('suggestions')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.BI_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  suggestions(@CurrentCompanyId() companyId: number | null) {
    return this.triage.suggestNextActions(companyId);
  }

  /**
   * ¿Hay IA configurada en el servidor? (la web oculta el asistente si no). «Asignar con IA»
   * es solo del CEO: la matriz no basta porque los directores tienen `/api/**`.
   */
  @Get('asistente/estado')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ACCESS] })
  estadoAsistente(@CurrentUser() user: any) {
    if (!isChainTopAuthority(user)) return { disponible: false };
    return this.asistente.estado();
  }

  /**
   * Instrucción en lenguaje natural → propuestas de actividad. No crea nada: la web
   * muestra las propuestas y, al confirmar, cada una va a `POST /activities`, que aplica
   * los permisos de siempre.
   */
  @Post('asistente/interpretar')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ACCESS] })
  interpretar(
    @Body() body: InterpretarInstruccionDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!isChainTopAuthority(user)) throw new ForbiddenException('«Asignar con IA» es solo del CEO.');
    return this.asistente.interpretar(body.texto, user, companyId);
  }

  /** ¿Hay transcriptor propio? Si no, la web dicta con el reconocimiento del navegador. */
  @Get('voz/estado')
  async estadoVoz() {
    return { disponible: await this.transcriptor.disponible() };
  }

  /**
   * Dictado con nuestro propio transcriptor: la web graba, sube el audio y recibe el texto.
   * El audio no se guarda.
   */
  @Post('voz/transcribir')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_DICTADO_BYTES } }))
  async transcribir(@UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) {
    if (!file?.buffer?.length) throw new BadRequestException('No llegó el audio.');
    const ext = extensionAudio(file.mimetype);
    if (!ext) throw new BadRequestException('Ese archivo no es de audio.');
    // El API corta toda petición a los 120 s: el dictado debe transcribirse antes.
    const texto = await this.transcriptor.dictar(file.buffer, `dictado.${ext}`, file.mimetype, 100_000);
    return { texto };
  }
}
