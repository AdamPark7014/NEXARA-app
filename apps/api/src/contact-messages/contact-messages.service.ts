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
import { resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';

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
    const message = await this.db.contactMessage.create({
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
      },
    });

    // Notify the new contact via realtime
    this.realtimeGateway.emit('contacts:changed', {
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
        });
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
  private async createLeadFromContact(message: { id: number; name: string; email: string; phone: string | null; company: string | null; subject: string | null; message: string; source: string | null; pageUrl: string | null }) {
    const existing = await this.db.salesLead.findFirst({ where: { email: message.email } });
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

    const companyId = await resolveRequiredCompanyId(this.db);
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

    this.realtimeGateway.emit('leads:changed', { type: 'created', lead });
    return lead;
  }

  async findAll(status?: string, category?: string, query?: PaginationQueryDto) {
    const normalizedStatus = this.normalizeStatus(status);
    const normalizedCategory = category?.toUpperCase().trim();
    const validCategory = normalizedCategory === 'SOPORTE' || normalizedCategory === 'VENTAS' ? normalizedCategory : undefined;
    const where: any = {};
    if (normalizedStatus) where.status = normalizedStatus;
    if (validCategory) where.category = validCategory;
    const finalWhere = Object.keys(where).length ? where : undefined;
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.db.contactMessage.findMany({ where: finalWhere, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
        this.db.contactMessage.count({ where: finalWhere }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return await this.db.contactMessage.findMany({
      where: finalWhere,
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
    const subject = `Nuevo contacto [${categoryLabel}]: ${message.name}`;
    const baseUrl = (process.env['PUBLIC_WEB_URL'] || 'https://nexara.com.mx').replace(/\/+$/, '');
    const logoUrl = (process.env['EMAIL_LOGO_URL'] || `${baseUrl}/logo-nexara.png`).trim();

    const html = `
      <div style="background-color:#f5f7fb;padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,sans-serif;">
          <tr>
            <td style="padding:20px 24px;background:linear-gradient(135deg,#0b1b2e,#0c243a);color:#ffffff;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align:middle;"><img src="${logoUrl}" alt="Nexara" width="120" height="40" style="display:block;border:0;" /></td>
                  <td style="text-align:right;vertical-align:middle;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#c6d7ef;">Nuevo contacto</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#1f2a44;">
              <p style="margin:0 0 6px;font-size:13px;opacity:0.6;">Categoria: <strong>${categoryLabel}</strong></p>
              <p style="margin:0 0 12px;font-size:16px;font-weight:700;">${this.escapeHtml(message.name)}</p>
              <table cellpadding="4" cellspacing="0" style="font-size:14px;color:#45556f;">
                <tr><td style="font-weight:600;">Email:</td><td>${this.escapeHtml(message.email)}</td></tr>
                ${message.phone ? `<tr><td style="font-weight:600;">Tel:</td><td>${this.escapeHtml(message.phone)}</td></tr>` : ''}
                ${message.company ? `<tr><td style="font-weight:600;">Empresa:</td><td>${this.escapeHtml(message.company)}</td></tr>` : ''}
                ${message.subject ? `<tr><td style="font-weight:600;">Asunto:</td><td>${this.escapeHtml(message.subject)}</td></tr>` : ''}
              </table>
              <div style="margin-top:16px;background:#f1f5fb;border:1px solid #d7e1f2;border-radius:14px;padding:14px;color:#24324a;line-height:1.6;">
                ${this.escapeHtml(message.message).replace(/\n/g, '<br />')}
              </div>
              <p style="margin:16px 0 0;font-size:13px;opacity:0.5;">Origen: ${message.source || 'formulario'}</p>
            </td>
          </tr>
        </table>
      </div>
    `;

    // Send to the category email, BCC to gerencia always
    const bcc = from.toLowerCase() !== gerenciaEmail.toLowerCase() ? [gerenciaEmail] : [];

    await transporter.sendMail({
      from,
      to: from,
      subject,
      html,
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
        from,
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

  async findOne(id: number) {
    const message = await this.db.contactMessage.findUnique({ where: { id } });
    if (!message) {
      throw new NotFoundException(`Contacto con ID ${id} no encontrado`);
    }
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

  async update(id: number, updateContactMessageDto: UpdateContactMessageDto) {
    const existing = await this.findOne(id);

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
      const subject = existing.subject
        ? `Respuesta: ${existing.subject}`
        : 'Respuesta de Nexara';
      const baseUrl = (process.env.WEB_URL || 'https://nexara.com.mx').replace(/\/+$/, '');
      const logoUrl = (process.env.EMAIL_LOGO_URL || `${baseUrl}/logo-nexara.png`).trim();
      const waPhone = '5215536505044';
      const waMessage = 'Hola! Quiero agendar mi llamada, me apoyan por favor?';
      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`;
      const safeMessage = this.escapeHtml(responseMessage).replace(/\n/g, '<br />');
      const htmlContent = `
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
                      Respuesta a tu solicitud
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px;color:#1f2a44;">
                <p style="margin:0 0 12px;font-size:16px;">Hola ${existing.name},</p>
                <p style="margin:0 0 18px;color:#45556f;line-height:1.6;">Gracias por escribirnos. A continuacion te compartimos nuestra respuesta:</p>
                <div style="background:#f1f5fb;border:1px solid #d7e1f2;border-radius:14px;padding:16px;color:#24324a;line-height:1.7;">
                  ${safeMessage}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 24px 24px;color:#45556f;">
                <p style="margin:0 0 6px;">Si tienes mas dudas, responde a este correo y te ayudamos con gusto.</p>
                <p style="margin:16px 0 18px;">
                  <a href="${waUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:linear-gradient(135deg,#2b7de9,#f08a24);color:#ffffff;text-decoration:none;font-weight:700;">Agendar llamada por WhatsApp</a>
                </p>
                <p style="margin:0;">Saludos,</p>
                <p style="margin:4px 0 0;font-weight:700;color:#12233b;">Equipo Nexara</p>
                <p style="margin:4px 0 0;">Teléfono: +52 1 55 3650 5044</p>
                <p style="margin:4px 0 0;"><a href="${baseUrl}" style="color:#2b7de9;text-decoration:none;">nexara.com.mx</a></p>
              </td>
            </tr>
          </table>
          <p style="text-align:center;color:#8a97ad;font-size:12px;margin:12px 0 0;">Este mensaje fue enviado desde el panel de Nexara.</p>
        </div>
      `;
      const textContent = `Hola ${existing.name},\n\nGracias por escribirnos. A continuación te compartimos nuestra respuesta:\n\n${responseMessage}\n\n¿Quieres agendar una llamada? Escríbenos por WhatsApp: ${waUrl}\n\nSaludos,\nEquipo Nexara\nTeléfono: +52 1 55 3650 5044\n${baseUrl}`;
      await this.sendResponseEmail({
        toEmail: existing.email,
        subject,
        htmlContent,
        textContent,
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

    this.realtimeGateway.emit('contacts:changed', {
      type: 'updated',
      message,
    });

    return message;
  }

  async remove(id: number) {
    await this.findOne(id);
    const removed = await this.db.contactMessage.delete({
      where: { id },
    });

    this.realtimeGateway.emit('contacts:changed', {
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

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
