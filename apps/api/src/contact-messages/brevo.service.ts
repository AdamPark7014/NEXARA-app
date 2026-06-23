import { Injectable, InternalServerErrorException } from '@nestjs/common';

interface SendEmailInput {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  replyToEmail?: string;
  replyToName?: string;
  bccEmails?: string[];
}

interface UpsertContactInput {
  email: string;
  name?: string;
  listId?: number;
}

@Injectable()
export class BrevoService {
  private get apiKey() {
    return process.env.BREVO_API_KEY || process.env.NEXT_PUBLIC_BREVO_API_KEY || '';
  }

  private get senderEmail() {
    return process.env.BREVO_SENDER_EMAIL || 'ventas@nexara.com.mx';
  }

  private get senderName() {
    return process.env.BREVO_SENDER_NAME || 'Nexara';
  }

  async sendEmail({
    toEmail,
    toName,
    subject,
    htmlContent,
    textContent,
    replyToEmail,
    replyToName,
    bccEmails,
  }: SendEmailInput) {
    if (!this.apiKey) {
      throw new InternalServerErrorException('BREVO_API_KEY no configurada');
    }

    const payload: Record<string, unknown> = {
      sender: {
        email: this.senderEmail,
        name: this.senderName,
      },
      to: [
        {
          email: toEmail,
          name: toName || toEmail,
        },
      ],
      subject,
      htmlContent,
      textContent,
    };

    if (replyToEmail) {
      payload.replyTo = {
        email: replyToEmail,
        name: replyToName || replyToEmail,
      };
    }

    if (bccEmails && bccEmails.length > 0) {
      payload.bcc = bccEmails.map((email) => ({ email }));
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      const status = response.status;
      throw new InternalServerErrorException(
        `Error al enviar correo (status ${status})${details ? `: ${details}` : ''}`,
      );
    }
  }

  async upsertContact({ email, name, listId }: UpsertContactInput) {
    if (!this.apiKey) {
      throw new InternalServerErrorException('BREVO_API_KEY no configurada');
    }

    const payload: Record<string, unknown> = {
      email,
      updateEnabled: true,
    };

    if (name) {
      payload.attributes = { FIRSTNAME: name };
    }

    if (listId) {
      payload.listIds = [listId];
    }

    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      const status = response.status;
      throw new InternalServerErrorException(
        `Error al registrar contacto (status ${status})${details ? `: ${details}` : ''}`,
      );
    }
  }
}
