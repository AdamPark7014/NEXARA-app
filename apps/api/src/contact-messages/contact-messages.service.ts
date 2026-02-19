import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateContactMessageDto } from './dto/create-contact-message.dto.js';
import { InboundContactMessageDto } from './dto/inbound-contact-message.dto.js';
import { UpdateContactMessageDto } from './dto/update-contact-message.dto.js';
import { ContactStatus } from '@prisma/client';
import { NewsletterService } from '../newsletter/newsletter.service.js';
import nodemailer from 'nodemailer';

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
        message: createContactMessageDto.message,
        newsletter: createContactMessageDto.newsletter ?? false,
        source: createContactMessageDto.source || null,
        pageUrl: createContactMessageDto.pageUrl || null,
      },
    });

    this.realtimeGateway.emit('contacts:changed', {
      type: 'created',
      message,
    });

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

    return message;
  }

  async findAll(status?: string) {
    const normalizedStatus = this.normalizeStatus(status);
    return await this.db.contactMessage.findMany({
      where: normalizedStatus ? { status: normalizedStatus } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  private buildTransporter() {
    const host = process.env['SMTP_HOST'];
    const port = Number(process.env['SMTP_PORT'] || 587);
    const user = process.env['SMTP_USER'];
    const pass = process.env['SMTP_PASS'];

    if (!host || !user || !pass) {
      throw new InternalServerErrorException('SMTP no configurado');
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private async sendResponseEmail(payload: {
    toEmail: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
  }) {
    const transporter = this.buildTransporter();
    const from = process.env['SMTP_FROM'] || 'no-reply@nexara.com';
    const replyTo = process.env['SMTP_REPLY_TO'] || undefined;
    const bccRaw = process.env['SMTP_BCC_EMAILS'] || '';
    const bccEmails = bccRaw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    try {
      await transporter.sendMail({
        from,
        to: payload.toEmail,
        subject: payload.subject,
        html: payload.htmlContent,
        text: payload.textContent,
        replyTo,
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
                <p style="margin:4px 0 0;">Telefono: +52 1 55 3650 5044</p>
                <p style="margin:4px 0 0;"><a href="${baseUrl}" style="color:#2b7de9;text-decoration:none;">nexara.com.mx</a></p>
              </td>
            </tr>
          </table>
          <p style="text-align:center;color:#8a97ad;font-size:12px;margin:12px 0 0;">Este mensaje fue enviado desde el panel de Nexara.</p>
        </div>
      `;
      const textContent = `Hola ${existing.name},\n\nGracias por escribirnos. A continuacion te compartimos nuestra respuesta:\n\n${responseMessage}\n\nQuieres agendar una llamada? Escribenos por WhatsApp: ${waUrl}\n\nSaludos,\nEquipo Nexara\nTelefono: +52 1 55 3650 5044\n${baseUrl}`;
      await this.sendResponseEmail({
        toEmail: existing.email,
        subject,
        htmlContent,
        textContent,
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
