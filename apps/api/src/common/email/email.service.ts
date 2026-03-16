import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

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

  // ── Templates ───────────────────────────────────────────────────

  async sendPurchaseOrderReminder(to: string, poNumber: string, supplier: string, dueDate: Date) {
    return this.send({
      to,
      subject: `[NEXARA] Orden de compra ${poNumber} próxima a vencer`,
      html: this.wrapTemplate(`
        <h2>Recordatorio de Orden de Compra</h2>
        <p>La orden <strong>${this.esc(poNumber)}</strong> del proveedor <strong>${this.esc(supplier)}</strong> 
        vence el <strong>${dueDate.toLocaleDateString('es-MX')}</strong>.</p>
        <p>Por favor verifica el estado de entrega.</p>
      `),
    });
  }

  async sendMaintenanceDue(to: string, assetName: string, maintenanceType: string, dueDate: Date) {
    return this.send({
      to,
      subject: `[NEXARA] Mantenimiento ${maintenanceType} pendiente: ${assetName}`,
      html: this.wrapTemplate(`
        <h2>Mantenimiento Programado</h2>
        <p>El equipo <strong>${this.esc(assetName)}</strong> tiene mantenimiento 
        <strong>${this.esc(maintenanceType)}</strong> programado para el 
        <strong>${dueDate.toLocaleDateString('es-MX')}</strong>.</p>
      `),
    });
  }

  async sendInvoiceOverdue(to: string, invoiceNumber: string, clientName: string, amount: number, daysOverdue: number) {
    return this.send({
      to,
      subject: `[NEXARA] Factura ${invoiceNumber} vencida (${daysOverdue} días)`,
      html: this.wrapTemplate(`
        <h2>Factura Vencida</h2>
        <p>La factura <strong>${this.esc(invoiceNumber)}</strong> del cliente <strong>${this.esc(clientName)}</strong> 
        por <strong>$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong> 
        tiene <strong>${daysOverdue}</strong> día(s) de atraso.</p>
      `),
    });
  }

  async sendNCRNotification(to: string, ncrNumber: string, title: string, severity: string) {
    return this.send({
      to,
      subject: `[NEXARA] NCR ${ncrNumber} - ${severity}: ${title}`,
      html: this.wrapTemplate(`
        <h2>Reporte de No Conformidad</h2>
        <p>Se ha generado el NCR <strong>${this.esc(ncrNumber)}</strong></p>
        <p><strong>Severidad:</strong> ${this.esc(severity)}</p>
        <p><strong>Título:</strong> ${this.esc(title)}</p>
      `),
    });
  }

  async sendWorkflowPending(to: string, workflowType: string, entityRef: string) {
    return this.send({
      to,
      subject: `[NEXARA] Aprobación pendiente: ${workflowType}`,
      html: this.wrapTemplate(`
        <h2>Aprobación Pendiente</h2>
        <p>Tienes una aprobación pendiente de tipo <strong>${this.esc(workflowType)}</strong> 
        para <strong>${this.esc(entityRef)}</strong>.</p>
        <p>Ingresa al sistema para revisar y aprobar.</p>
      `),
    });
  }

  private wrapTemplate(body: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>body{font-family:Arial,sans-serif;background:#f4f4f4;padding:20px}
    .container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:30px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
    h2{color:#1a73e8;margin-top:0}p{line-height:1.6;color:#333}
    .footer{margin-top:20px;padding-top:15px;border-top:1px solid #eee;font-size:12px;color:#999}</style>
    </head><body><div class="container">${body}
    <div class="footer">NEXARA ERP — Este es un correo automático, no responder.</div>
    </div></body></html>`;
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
