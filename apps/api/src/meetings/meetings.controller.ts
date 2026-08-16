import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MeetingsService } from './meetings.service.js';
import type {
  AgreementKind,
  AgreementStatus,
  MeetingStatus,
  MeetingType,
} from './meeting-rhythm.js';
import { RbacGuard } from '../common/rbac.guard.js';
import { StaffOnlyGuard } from '../common/security/staff-only.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

/**
 * Ritmo operativo: reuniones, acuerdos y lecciones aprendidas.
 *
 * Quién puede hacer qué lo decide la matriz de URLs (`MEETINGS_STAFF_URL_RULES`
 * y `MEETINGS_LEAD_URL_RULES`), no un decorador de permisos: todo el personal
 * lee y mueve lo suyo, y sólo quien conduce la reunión convoca, cierra y
 * registra acuerdos ajenos. `StaffOnlyGuard` mantiene fuera a los clientes del
 * portal — estas son reuniones internas.
 *
 * Las rutas literales (`mis-acuerdos`, `lecciones`, `acuerdos`) van declaradas
 * antes que `:id` para que Nest no las tome por el id de una reunión.
 */
@Controller('reuniones')
@UseGuards(AuthGuard('jwt'), StaffOnlyGuard, RbacGuard)
export class MeetingsController {
  constructor(private readonly service: MeetingsService) {}

  // ── Rutas literales ───────────────────────────────────────────────────

  /** Lo que me toca a mí. Todo el personal. */
  @Get('mis-acuerdos')
  myAgreements(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.myAgreements(Number(user?.id), companyId);
  }

  @Patch('mis-acuerdos/:agreementId')
  updateMyAgreement(
    @Param('agreementId', ParseIntPipe) agreementId: number,
    @Body() body: { estado?: AgreementStatus },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateMyAgreement(agreementId, Number(user?.id), body ?? {}, companyId);
  }

  /** Lecciones aprendidas de toda la empresa, buscables. */
  @Get('lecciones')
  lessons(@CurrentCompanyId() companyId: number | null, @Query('q') q?: string) {
    return this.service.lessons(companyId, q);
  }

  /** Acuerdos abiertos fuera de fecha: el tablero de la junta de cierre. */
  @Get('acuerdos/vencidos')
  overdue(@CurrentCompanyId() companyId: number | null) {
    return this.service.overdueAgreements(companyId);
  }

  // ── Reuniones ─────────────────────────────────────────────────────────

  @Get()
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('tipo') tipo?: string,
    @Query('estado') estado?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.service.list(companyId, { tipo, estado, desde, hasta });
  }

  @Post()
  create(
    @Body()
    body: {
      tipo: MeetingType;
      titulo?: string;
      fecha: string;
      horaInicio?: string;
      agenda?: string;
      facilitadorId?: number | null;
      asistentes?: number[];
    },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.create(body, Number(user?.id) || null, companyId);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.get(id, companyId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      titulo?: string;
      fecha?: string;
      horaInicio?: string;
      agenda?: string;
      notas?: string;
      facilitadorId?: number | null;
      estado?: MeetingStatus;
    },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.update(id, body ?? {}, companyId);
  }

  /** Cierra la junta y guarda la minuta. */
  @Post(':id/cerrar')
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { notas?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.close(id, body ?? {}, companyId);
  }

  @Put(':id/asistencia')
  attendance(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { asistentes: Array<{ userId: number; asistio?: boolean }> },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.setAttendance(id, body?.asistentes ?? [], companyId);
  }

  // ── Acuerdos, lecciones y riesgos de una reunión ───────────────────────

  @Post(':id/acuerdos')
  addAgreement(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      tipo?: AgreementKind;
      descripcion: string;
      responsableId?: number | null;
      fechaCompromiso?: string | null;
      activityId?: number | null;
    },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.addAgreement(id, body, companyId);
  }

  @Patch(':id/acuerdos/:agreementId')
  updateAgreement(
    @Param('id', ParseIntPipe) id: number,
    @Param('agreementId', ParseIntPipe) agreementId: number,
    @Body()
    body: {
      estado?: AgreementStatus;
      descripcion?: string;
      responsableId?: number | null;
      fechaCompromiso?: string | null;
      activityId?: number | null;
    },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateAgreement(id, agreementId, body ?? {}, companyId);
  }
}
