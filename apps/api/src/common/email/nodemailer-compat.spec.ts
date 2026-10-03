import * as nodemailerNamespace from 'nodemailer';
import nodemailerDefault from 'nodemailer';

/**
 * nodemailer 10 se publica en TypeScript con build ESM y CJS. La API lo importa
 * de dos formas (`import * as` en EmailService; `import default` en
 * cotizaciones, contacto, noticias y clientes de servicio) y ninguna otra
 * prueba manda un correo: si una forma deja de traer `createTransport`, los
 * envíos fallan en producción con `tsc` en verde.
 */
const enviar = async (createTransport: typeof nodemailerDefault.createTransport) => {
  const transporter = createTransport({ jsonTransport: true });
  const info = await transporter.sendMail({
    from: 'NEXARA <no-reply@nexara.com.mx>',
    to: 'cliente@example.com',
    subject: 'Cotizacion COT-0001',
    html: '<p>Adjuntamos la cotización.</p>',
    attachments: [{ filename: 'cotizacion-COT-0001.pdf', content: Buffer.from('%PDF-1.4') }],
  });
  return JSON.parse(String(info.message)) as { subject: string; attachments: Array<{ filename: string }> };
};

describe('nodemailer: las dos formas de importarlo arman y envían el correo', () => {
  it('import * as', async () => {
    const mensaje = await enviar(nodemailerNamespace.createTransport);
    expect(mensaje.subject).toBe('Cotizacion COT-0001');
    expect(mensaje.attachments[0].filename).toBe('cotizacion-COT-0001.pdf');
  });

  it('import default', async () => {
    const mensaje = await enviar(nodemailerDefault.createTransport);
    expect(mensaje.subject).toBe('Cotizacion COT-0001');
    expect(mensaje.attachments[0].filename).toBe('cotizacion-COT-0001.pdf');
  });
});
