import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateContactMessageDto } from './dto/create-contact-message.dto.js';
import { InboundContactMessageDto } from './dto/inbound-contact-message.dto.js';
import { UpdateContactMessageDto } from './dto/update-contact-message.dto.js';
import { ContactStatus } from '@prisma/client';
import { NewsletterService } from '../newsletter/newsletter.service.js';
import nodemailer from 'nodemailer';
import { resolvePublicCompanyId, resolveRequiredCompanyId, companyWhere, requireCompanyId, assertCompanyAccess } from '../common/tenant/tenant-scope.js';
import { withTenantBypassAsync } from '../common/tenant/tenant-context.js';
import { remitenteConNombre } from '../common/email/correo-nexara.js';
import { correoDeNuevoContacto, correoDeRespuestaAContacto } from './correos-contacto.js';

@Injectable()
export class ContactMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly newsletterService: NewsletterService,
  ) {}

  private get db() {
    return this.prisma;
  }

  async create(createContactMessageDto: CreateContactMessageDto) {
    const companyId = await withTenantBypassAsync(() => resolvePublicCompanyId(this.db));
    const message = await withTenantBypassAsync(() =>
      this.db.contactMessage.create({
        data: {
          name: createContactMessageDto.name,
          email: createContactMessageDto.email,
          phone: createContactMessageDto.phone || null,
          company: createContactMessageDto.company || null,
          subject: createContactMessageDto.subject || null,
          category: createContactMessageDto.category || 'SOPORTE',
          message: createContactMessageDto.message,
          newsletter: createContactMessageDto.newsletter ?? false,
          source: createContactMessageDto.source || null,
          pageUrl: createContactMessageDto.pageUrl || null,
          companyId,
        },
      }),
    );

    // Trae nombre y correo: solo al personal de la empresa que lo recibió.
    this.realtimeGateway.emitToCompany(message.companyId, 'contacts:changed', {
      type: 'created',
      message,
    });

    // Send notification email to the corresponding team + BCC gerencia
    try {
      await this.sendInternalNotification(message);
    } catch (err) {
      console.warn('[contact-messages] Internal notification email failed', err);
    }

    if (createContactMessageDto.newsletter) {
      try {
        await this.newsletterService.subscribe({
          email: message.email,
          name: message.name,
          source: message.source || 'contact-message',
          pageUrl: message.pageUrl || undefined,
        }, message.companyId);
      } catch (err) {
        console.warn('[contact-messages] Newsletter sync failed', err);
      }
    }

    // Auto-conversión a Lead del CRM cuando es una solicitud comercial.
    if (message.category === 'VENTAS') {
      try {
        await this.createLeadFromContact(message);
      } catch (err) {
        console.warn('[contact-messages] Lead auto-creation failed', err);
      }
    }

    return message;
  }

  /**
   * Crea un SalesLead automáticamente desde un ContactMessage con scoring inicial heurístico.
   * Score = base 30 + signals (empresa +20, teléfono +15, mensaje >100 chars +10, dominio empresarial +10).
   */
  private async createLeadFromContact(message: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    subject: string | null;
    message: string;
    source: string | null;
    pageUrl: string | null;
    companyId: number;
  }) {
    const existing = await this.db.salesLead.findFirst({
      where: { email: message.email, companyId: message.companyId },
    });
    if (existing) {
      return existing;
    }

    let score = 30;
    if (message.company && message.company.trim().length > 2) score += 20;
    if (message.phone && message.phone.trim().length >= 8) score += 15;
    if ((message.message || '').length > 100) score += 10;
    const isCorpDomain = !/(@gmail\.|@hotmail\.|@yahoo\.|@outlook\.|@live\.|@icloud\.)/i.test(message.email);
    if (isCorpDomain) score += 10;
    if ((message.subject || message.message || '').match(/cctv|cableado|licitaci|proyecto|presupuesto|cotiza|sucursal/i)) score += 10;
    score = Math.min(score, 99);

    const companyId = message.companyId || (await resolveRequiredCompanyId(this.db));
    const lead = await this.db.salesLead.create({
      data: {
        name: message.name,
        company: message.company || null,
        email: message.email,
        phone: message.phone || null,
        source: message.source || 'web.nexara.com.mx',
        status: 'NEW',
        score,
        notes: `Origen: ${message.source || 'web'}. Página: ${message.pageUrl || 'n/a'}.\n\n${message.message || ''}`,
        companyId,
      },
    });

    this.realtimeGateway.emitToCompany(companyId, 'leads:changed', { type: 'created', lead });
    return lead;
  }

  async findAll(status?: string, category?: string, query?: PaginationQueryDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const normalizedStatus = this.normalizeStatus(status);
    const normalizedCategory = category?.toUpperCase().trim();
    const validCategory = normalizedCategory === 'SOPORTE' || normalizedCategory === 'VENTAS' ? normalizedCategory : undefined;
    const where: any = { ...companyWhere(tenantId) };
    if (normalizedStatus) where.status = normalizedStatus;
    if (validCategory) where.category = validCategory;
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.db.contactMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
        this.db.contactMessage.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return await this.db.contactMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Build SMTP transporter for the given category */
  private buildTransporterForCategory(category: 'SOPORTE' | 'VENTAS' = 'SOPORTE') {
    const host = process.env['SMTP_HOST'];
    const port = Number(process.env['SMTP_PORT'] || 587);

    let user: string | undefined;
    let pass: string | undefined;

    if (category === 'VENTAS') {
      user = process.env['SMTP_VENTAS_USER'] || process.env['SMTP_USER'];
      pass = process.env['SMTP_VENTAS_PASS'] || process.env['SMTP_PASS'];
    } else {
      user = process.env['SMTP_SOPORTE_USER'] || process.env['SMTP_USER'];
      pass = process.env['SMTP_SOPORTE_PASS'] || process.env['SMTP_PASS'];
    }

    if (!host || !user || !pass) {
      throw new InternalServerErrorException('SMTP no configurado');
    }

    return { transporter: nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } }), from: user };
  }

  /** Notify the responsible team when a new contact arrives */
  private async sendInternalNotification(message: any) {
    const category = message.category || 'SOPORTE';
    const { transporter, from } = this.buildTransporterForCategory(category);
    const gerenciaEmail = process.env['SMTP_USER'] || 'gerencia@nexara.com.mx';

    const categoryLabel = category === 'VENTAS' ? 'Ventas y Productos' : 'Soporte y Ayuda';
    const correo = correoDeNuevoContacto({
      categoria: categoryLabel,
      nombre: message.name,
      correo: message.email,
      telefono: message.phone,
      empresa: message.company,
      asunto: message.subject,
      mensaje: message.message,
      origen: message.source,
    });

    // Send to the category email, BCC to gerencia always
    const bcc = from.toLowerCase() !== gerenciaEmail.toLowerCase() ? [gerenciaEmail] : [];

    await transporter.sendMail({
      from,
      to: from,
      subject: correo.subject,
      html: correo.html,
      text: correo.text,
      bcc: bcc.length ? bcc : undefined,
    });
  }

  private async sendResponseEmail(payload: {
    toEmail: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
    category?: 'SOPORTE' | 'VENTAS';
  }) {
    const { transporter, from } = this.buildTransporterForCategory(payload.category || 'SOPORTE');
    const gerenciaEmail = process.env['SMTP_USER'] || 'gerencia@nexara.com.mx';

    // BCC to gerencia always
    const bccEmails: string[] = [];
    if (from.toLowerCase() !== gerenciaEmail.toLowerCase()) {
      bccEmails.push(gerenciaEmail);
    }
    // Also include any extra BCCs from env
    const bccRaw = process.env['SMTP_BCC_EMAILS'] || '';
    bccRaw.split(',').map((v) => v.trim()).filter((v) => v.length > 0).forEach((v) => {
      if (!bccEmails.includes(v)) bccEmails.push(v);
    });

    try {
      await transporter.sendMail({
        from: remitenteConNombre(from),
        to: payload.toEmail,
        subject: payload.subject,
        html: payload.htmlContent,
        text: payload.textContent,
        replyTo: from,
        bcc: bccEmails.length ? bccEmails : undefined,
      });
    } catch {
      throw new InternalServerErrorException('No se pudo enviar el correo');
    }
  }

  async findOne(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const message = await this.db.contactMessage.findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(message, tenantId, 'Contacto');
    return message;
  }

  async ingestInbound(inboundContactMessageDto: InboundContactMessageDto) {
    const messageText = inboundContactMessageDto.body?.trim() || 'Respuesta de correo';
    const name =
      inboundContactMessageDto.fromName?.trim() ||
      inboundContactMessageDto.fromEmail.split('@')[0] ||
      'Cliente';
    const subject = inboundContactMessageDto.subject?.trim() || 'Respuesta recibida';

    const payload: CreateContactMessageDto = {
      name,
      email: inboundContactMessageDto.fromEmail,
      message: messageText,
      subject,
      source: 'email-reply',
      pageUrl: inboundContactMessageDto.threadId || undefined,
      newsletter: false,
      phone: undefined,
      company: undefined,
    };

    return this.create(payload);
  }

  async update(id: number, updateContactMessageDto: UpdateContactMessageDto, companyId?: number | null) {
    const existing = await this.findOne(id, companyId);

    const status = this.normalizeStatus(updateContactMessageDto.status);
    const responseMessage = updateContactMessageDto.responseMessage || undefined;
    const sendChannel = updateContactMessageDto.sendChannel?.toUpperCase();
    const resolvedChannel = sendChannel || 'EMAIL';
    const sendResponse = updateContactMessageDto.sendResponse === true;
    const statusForSend = status ?? existing.status;
    const shouldSendEmail =
      resolvedChannel === 'EMAIL' &&
      !!responseMessage &&
      statusForSend === ContactStatus.RESPONDED &&
      (sendResponse || (!sendChannel && existing.status !== ContactStatus.RESPONDED));

    if (shouldSendEmail) {
      const baseUrl = (process.env.WEB_URL || 'https://nexara.com.mx').replace(/\/+$/, '');
      const waPhone = '5215536505044';
      const waMessage = '¡Hola! Quiero agendar una llamada, ¿me apoyan por favor?';
      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`;
      const correo = correoDeRespuestaAContacto({
        nombre: existing.name,
        asuntoOriginal: existing.subject,
        respuesta: responseMessage,
        ligaDeWhatsApp: waUrl,
        telefono: '+52 1 55 3650 5044',
        sitio: baseUrl,
      });
      await this.sendResponseEmail({
        toEmail: existing.email,
        subject: correo.subject,
        htmlContent: correo.html,
        textContent: correo.text,
        category: (existing as any).category || 'SOPORTE',
      });
    }

    const { sendChannel: _sendChannel, sendResponse: _sendResponse, ...updateData } =
      updateContactMessageDto;

    const message = await this.db.contactMessage.update({
      where: { id },
      data: {
        ...updateData,
        status,
        responseMessage,
        respondedAt: status === ContactStatus.RESPONDED ? new Date() : undefined,
      },
    });

    this.realtimeGateway.emitToCompany(existing.companyId, 'contacts:changed', {
      type: 'updated',
      message,
    });

    return message;
  }

  async remove(id: number, companyId?: number | null) {
    const existing = await this.findOne(id, companyId);
    const removed = await this.db.contactMessage.delete({
      where: { id },
    });

    // De `existing`: con el filtro de empresa puesto, `delete` regresa la cuenta, no la fila.
    this.realtimeGateway.emitToCompany(existing.companyId, 'contacts:changed', {
      type: 'deleted',
      message: removed,
    });

    return removed;
  }

  private normalizeStatus(status?: string) {
    if (!status) return undefined;
    const value = status.toUpperCase().trim();
    return Object.values(ContactStatus).includes(value as ContactStatus)
      ? (value as ContactStatus)
      : undefined;
  }
}
