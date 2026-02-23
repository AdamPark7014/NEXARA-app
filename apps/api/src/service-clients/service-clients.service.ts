import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateServiceClientDto } from './dto/create-service-client.dto.js';
import { UpdateServiceClientDto } from './dto/update-service-client.dto.js';
import * as bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { generateClientReportPdf } from './client-report-pdf.js';

@Injectable()
export class ServiceClientsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma as any;
  }

  private buildPortalEmail(name: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 20);
    const suffix = randomBytes(2).toString('hex');
    return `${slug || 'cliente'}+${suffix}@nexara.local`;
  }

  private buildPortalPassword() {
    return randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  }

  private buildTransporter() {
    const host = process.env['SMTP_HOST'];
    const port = Number(process.env['SMTP_PORT'] || 587);
    const user = process.env['SMTP_USER'];
    const pass = process.env['SMTP_PASS'];

    if (!host || !user || !pass) {
      throw new BadRequestException('SMTP no configurado');
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private async sendPortalCredentialsEmail(payload: {
    toEmail: string;
    clientName: string;
    portalEmail: string;
    portalPassword: string;
  }) {
    const transporter = this.buildTransporter();
    const from = process.env['SMTP_FROM'] || 'no-reply@nexara.com';
    const baseUrl = (process.env['PUBLIC_WEB_URL'] || 'https://nexara.com.mx').replace(/\/+$/, '');
    const logoUrl = (process.env['EMAIL_LOGO_URL'] || `${baseUrl}/logo-nexara.png`).trim();
    const portalUrl = `${baseUrl}/panel/tickets`;

    const html = `
      <div style="background-color:#f5f7fb;padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,sans-serif;">
          <tr>
            <td style="padding:20px 24px;background:linear-gradient(135deg,#0b1b2e,#0c243a);color:#ffffff;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${logoUrl}" alt="Nexara" width="120" height="40" style="display:block;border:0;" />
                  </td>
                  <td style="text-align:right;vertical-align:middle;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#c6d7ef;">
                    Accesos al portal de tickets
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px;color:#1f2a44;">
              <p style="margin:0 0 12px;font-size:16px;">Hola ${payload.clientName},</p>
              <p style="margin:0 0 18px;color:#45556f;line-height:1.6;">Se genero tu acceso para el portal de tickets Nexara.</p>
              <div style="background:#f1f5fb;border:1px solid #d7e1f2;border-radius:14px;padding:16px;color:#24324a;line-height:1.7;">
                <p style="margin:0 0 8px;"><strong>Usuario:</strong> ${payload.portalEmail}</p>
                <p style="margin:0 0 8px;"><strong>Password:</strong> ${payload.portalPassword}</p>
                <p style="margin:0;"><strong>Acceso:</strong> <a href="${portalUrl}">${portalUrl}</a></p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px 24px;color:#45556f;">
              <p style="margin:0 0 6px;">Si necesitas ayuda, responde a este correo.</p>
              <p style="margin:0;">Saludos,</p>
              <p style="margin:4px 0 0;font-weight:700;color:#12233b;">Equipo Nexara</p>
            </td>
          </tr>
        </table>
        <p style="text-align:center;color:#8a97ad;font-size:12px;margin:12px 0 0;">Este mensaje fue enviado desde el panel de Nexara.</p>
      </div>
    `;

    await transporter.sendMail({
      from,
      to: payload.toEmail,
      subject: 'Accesos al portal de tickets Nexara',
      html,
    });
  }

  private async sendClientSurveyEmail(payload: {
    toEmail: string;
    clientName: string;
    activityLabel: string;
  }) {
    const transporter = this.buildTransporter();
    const from = process.env['SMTP_FROM'] || 'no-reply@nexara.com';
    const baseUrl = (process.env['PUBLIC_WEB_URL'] || 'https://nexara.com.mx').replace(/\/+$/, '');
    const logoUrl = (process.env['EMAIL_LOGO_URL'] || `${baseUrl}/logo-nexara.png`).trim();
    const portalUrl = `${baseUrl}/panel/tickets`;

    const html = `
      <div style="background-color:#f5f7fb;padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,sans-serif;">
          <tr>
            <td style="padding:20px 24px;background:linear-gradient(135deg,#0b1b2e,#0c243a);color:#ffffff;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${logoUrl}" alt="Nexara" width="120" height="40" style="display:block;border:0;" />
                  </td>
                  <td style="text-align:right;vertical-align:middle;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#c6d7ef;">
                    Encuesta de servicio
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 8px;color:#1f2a44;">
              <p style="margin:0 0 12px;font-size:16px;">Hola ${payload.clientName},</p>
              <p style="margin:0 0 18px;color:#45556f;line-height:1.6;">El servicio ${payload.activityLabel} se marco como finalizado. Queremos confirmar que fue atendido correctamente y recibir tu opinion.</p>
              <div style="background:#f1f5fb;border:1px solid #d7e1f2;border-radius:14px;padding:16px;color:#24324a;line-height:1.7;">
                <p style="margin:0 0 8px;"><strong>Acceso:</strong> <a href="${portalUrl}">${portalUrl}</a></p>
                <p style="margin:0;">Por favor ingresa y completa la encuesta. Nos ayuda a mejorar.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 24px 24px;color:#45556f;">
              <p style="margin:0 0 6px;">Gracias por tu confianza.</p>
              <p style="margin:0;">Saludos,</p>
              <p style="margin:4px 0 0;font-weight:700;color:#12233b;">Equipo Nexara</p>
            </td>
          </tr>
        </table>
        <p style="text-align:center;color:#8a97ad;font-size:12px;margin:12px 0 0;">Este mensaje fue enviado desde el panel de Nexara.</p>
      </div>
    `;

    await transporter.sendMail({
      from,
      to: payload.toEmail,
      subject: 'Tu opinion sobre el servicio Nexara',
      html,
    });
  }

  async create(dto: CreateServiceClientDto, logoUrl?: string) {
    const generatedPassword = dto.portalPassword ? null : this.buildPortalPassword();
    const generatedEmail = dto.portalEmail ? null : this.buildPortalEmail(dto.name);

    const portalPasswordHash = dto.portalPassword || generatedPassword
      ? await bcrypt.hash(dto.portalPassword || generatedPassword || '', 10)
      : undefined;

    const client = await this.db.serviceClient.create({
      data: {
        name: dto.name.trim(),
        logoUrl,
        contactName: dto.contactName?.trim() || null,
        contactEmail: dto.contactEmail?.trim() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || null,
        country: dto.country?.trim() || null,
        accountCode: dto.accountCode?.trim() || null,
        portalEmail: (dto.portalEmail?.trim() || generatedEmail || null),
        portalPasswordHash,
        isActive: dto.isActive ?? true,
      },
    });

    if (generatedEmail || generatedPassword) {
      const recipient = dto.contactEmail?.trim() || (dto.portalEmail?.trim() || generatedEmail || null);
      if (recipient && generatedPassword) {
        try {
          await this.sendPortalCredentialsEmail({
            toEmail: recipient,
            clientName: dto.contactName?.trim() || dto.name.trim(),
            portalEmail: (dto.portalEmail?.trim() || generatedEmail || ''),
            portalPassword: generatedPassword,
          });
        } catch {
          // no-op: credentials still returned to admin UI
        }
      }
      return {
        client,
        credentials: {
          email: generatedEmail || dto.portalEmail?.trim() || null,
          password: generatedPassword,
        },
      };
    }

    return { client };
  }

  async findAll() {
    return this.db.serviceClient.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: number) {
    const client = await this.db.serviceClient.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  async update(id: number, dto: UpdateServiceClientDto, logoUrl?: string) {
    const existing = await this.db.serviceClient.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cliente no encontrado');

    const normalizeBoolean = (value: unknown) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
      }
      return undefined;
    };

    const normalizedIsActive = normalizeBoolean(dto.isActive);

    const portalPasswordHash = dto.portalPassword
      ? await bcrypt.hash(dto.portalPassword, 10)
      : undefined;

    return this.db.serviceClient.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        logoUrl: logoUrl || undefined,
        contactName: dto.contactName?.trim(),
        contactEmail: dto.contactEmail?.trim(),
        contactPhone: dto.contactPhone?.trim(),
        address: dto.address?.trim(),
        city: dto.city?.trim(),
        state: dto.state?.trim(),
        country: dto.country?.trim(),
        accountCode: dto.accountCode?.trim(),
        portalEmail: dto.portalEmail?.trim(),
        portalPasswordHash,
        isActive: normalizedIsActive,
      },
    });
  }

  async getPortalByEmail(email: string) {
    if (!email) throw new BadRequestException('Email requerido');
    const client = await this.db.serviceClient.findFirst({
      where: { portalEmail: email.toLowerCase() },
    });
    if (!client || !client.portalPasswordHash) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return client;
  }

  async generateReport(clientId: number, range?: { start: Date; end: Date }) {
    const client = await this.db.serviceClient.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    const rangeFilter = range && !Number.isNaN(range.start.getTime()) && !Number.isNaN(range.end.getTime())
      ? { fechaAsignacion: { gte: range.start, lte: range.end } }
      : undefined;

    const activities: any[] = await this.db.activity.findMany({
      where: { clientId, ...(rangeFilter ? rangeFilter : {}) },
      include: { responsable: true, evidencias: true },
      orderBy: { fechaAsignacion: 'desc' },
    });

    const totalTickets = activities.length;
    const closed = activities.filter((activity: any) => activity.estatus === 'Finalizada');
    const durations = closed
      .map((activity: any) => {
        if (!activity.fechaFinalizacion) return null;
        const start = activity.fechaInicio || activity.fechaAsignacion;
        if (!start) return null;
        return Math.round((activity.fechaFinalizacion.getTime() - start.getTime()) / 60000);
      })
      .filter((value: number | null): value is number => value !== null && !Number.isNaN(value));

    const avgDurationMin = durations.length
      ? Math.round(durations.reduce((acc: number, value: number) => acc + value, 0) / durations.length)
      : null;

    const pickEfficiency = (activity: any) => {
      const evidences = Array.isArray(activity?.evidencias) ? activity.evidencias : [];
      const scored = evidences
        .map((evidence: any) => evidence.calificacionEficiencia)
        .filter((value: string | null | undefined) => Boolean(value));
      return scored.length ? scored[scored.length - 1] : null;
    };

    const pdf = await generateClientReportPdf({
      clientName: client.name,
      clientLogoUrl: client.logoUrl,
      generatedAt: new Date(),
      totalTickets,
      closedTickets: closed.length,
      avgDurationMin,
      activities: activities.map((activity: any) => ({
        anNumber: activity.anNumber,
        titulo: activity.titulo,
        estatus: activity.estatus,
        prioridad: activity.prioridad,
        eficiencia: pickEfficiency(activity),
        ticketType: activity.ticketType,
        branchName: activity.branchName,
        branchCity: activity.branchCity,
        branchState: activity.branchState,
        assignedAt: activity.fechaAsignacion,
        startedAt: activity.fechaInicio,
        finishedAt: activity.fechaFinalizacion,
        durationMin: activity.fechaFinalizacion
          ? Math.round(((activity.fechaFinalizacion.getTime() - (activity.fechaInicio || activity.fechaAsignacion).getTime()) / 60000))
          : null,
        responsableName: activity.responsable?.nombre || null,
        evidences: (activity.evidencias || []).map((evidence: any) => ({
          archivoUrl: evidence.archivoUrl,
          tipoEvidencia: evidence.tipoEvidencia,
          latitud: evidence.latitud ?? null,
          longitud: evidence.longitud ?? null,
        })),
      })),
    });

    const dir = path.resolve(process.cwd(), 'uploads', 'client-reports');
    const filename = `reporte-clientes-${clientId}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outPath, pdf);

    const reportUrl = `/uploads/client-reports/${filename}`;
    await this.db.serviceClient.update({
      where: { id: clientId },
      data: { reportUrl, reportGeneratedAt: new Date() },
    });

    return { pdf, reportUrl };
  }

  async requestClientSurvey(activityId: number) {
    const activity = await this.db.activity.findUnique({
      where: { id: activityId },
      include: { client: true },
    });
    if (!activity?.clientId || !activity.client) return;

    if (activity.clientSurveyRequestedAt) return;

    await this.db.activity.update({
      where: { id: activityId },
      data: { clientSurveyRequestedAt: new Date() },
    });

    const recipient = activity.client.contactEmail || activity.client.portalEmail;
    if (!recipient) return;

    try {
      await this.sendClientSurveyEmail({
        toEmail: recipient,
        clientName: activity.client.contactName || activity.client.name,
        activityLabel: activity.anNumber || 'del ticket',
      });
    } catch {
      // no-op: email failure should not block flow
    }
  }
}
