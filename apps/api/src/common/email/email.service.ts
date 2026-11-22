import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { aTextoPlano, correoNexara, dato, escaparHtml, parrafo, titulo } from './correo-nexara.js';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!process.env.SMTP_USER) {
      this.logger.warn('SMTP no configurado, email descartado');
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: Array.isArray(options.to) ? options.to.join(',') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      });
      this.logger.log(`Email enviado a ${options.to}: ${options.subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Error enviando email: ${err}`);
      return false;
    }
  }

  // ── Avisos internos ─────────────────────────────────────────────

  async sendPurchaseOrderReminder(to: string, poNumber: string, supplier: string, dueDate: Date) {
    return this.send({
      to,
      subject: `[NEXARA] Orden de compra ${poNumber} próxima a vencer`,
      ...avisoInterno('Orden de compra por vencer', [
        parrafo(
          `La orden <strong>${escaparHtml(poNumber)}</strong> del proveedor <strong>${escaparHtml(supplier)}</strong> vence el <strong>${dueDate.toLocaleDateString('es-MX')}</strong>.`,
        ),
        parrafo('Revisa cómo va la entrega.'),
      ]),
    });
  }

  async sendMaintenanceDue(to: string, assetName: string, maintenanceType: string, dueDate: Date) {
    return this.send({
      to,
      subject: `[NEXARA] Mantenimiento ${maintenanceType} pendiente: ${assetName}`,
      ...avisoInterno('Mantenimiento programado', [
        parrafo(
          `El equipo <strong>${escaparHtml(assetName)}</strong> tiene mantenimiento <strong>${escaparHtml(maintenanceType)}</strong> programado para el <strong>${dueDate.toLocaleDateString('es-MX')}</strong>.`,
        ),
      ]),
    });
  }

  async sendInvoiceOverdue(to: string, invoiceNumber: string, clientName: string, amount: number, daysOverdue: number) {
    return this.send({
      to,
      subject: `[NEXARA] Factura ${invoiceNumber} vencida (${daysOverdue} ${daysOverdue === 1 ? 'día' : 'días'})`,
      ...avisoInterno('Factura vencida', [
        parrafo(
          `La factura <strong>${escaparHtml(invoiceNumber)}</strong> del cliente <strong>${escaparHtml(clientName)}</strong> por <strong>$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> tiene <strong>${daysOverdue}</strong> ${daysOverdue === 1 ? 'día' : 'días'} de atraso.`,
        ),
      ]),
    });
  }

  async sendNCRNotification(to: string, ncrNumber: string, title: string, severity: string) {
    return this.send({
      to,
      subject: `[NEXARA] NCR ${ncrNumber} - ${severity}: ${title}`,
      ...avisoInterno('Reporte de no conformidad', [
        parrafo(`Se generó el NCR <strong>${escaparHtml(ncrNumber)}</strong>.`),
        `<div style="margin:0 0 14px;">${dato('Severidad', escaparHtml(severity))}${dato('Título', escaparHtml(title), true)}</div>`,
      ]),
    });
  }

  async sendWorkflowPending(to: string, workflowType: string, entityRef: string) {
    return this.send({
      to,
      subject: `[NEXARA] Aprobación pendiente: ${workflowType}`,
      ...avisoInterno('Aprobación pendiente', [
        parrafo(
          `Tienes una aprobación pendiente de tipo <strong>${escaparHtml(workflowType)}</strong> para <strong>${escaparHtml(entityRef)}</strong>.`,
        ),
        parrafo('Entra a la plataforma para revisarla.'),
      ]),
    });
  }
}

/** Un aviso automático al personal: título, renglones y el mismo marco que el resto de los correos. */
export function avisoInterno(encabezado: string, renglones: string[]): { html: string; text: string } {
  const cuerpo = [titulo(escaparHtml(encabezado)), ...renglones].join('\n');
  return {
    html: correoNexara({
      etiqueta: 'Aviso',
      cuerpo,
      pie: 'Aviso automático de NEXARA. No hace falta responder.',
    }),
    text: aTextoPlano(cuerpo),
  };
}
