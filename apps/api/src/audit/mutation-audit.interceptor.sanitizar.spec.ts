import { lastValueFrom, of } from 'rxjs';
import { MutationAuditInterceptor, sanitizarCuerpoParaBitacora } from './mutation-audit.interceptor';

describe('bitácora de mutaciones · lo que queda de la petición (changes.request)', () => {
  it('las coordenadas no se guardan: la tabla de ubicaciones ya es su registro', () => {
    expect(
      sanitizarCuerpoParaBitacora({
        latitude: 19.0414,
        longitude: -98.2063,
        latitud: 19.04,
        longitud: -98.2,
        accuracy: 12.5,
        lat: 19.04,
        lng: -98.2,
        titulo: 'Visita a sucursal',
      }),
    ).toEqual({
      latitude: '[ubicación]',
      longitude: '[ubicación]',
      latitud: '[ubicación]',
      longitud: '[ubicación]',
      accuracy: '[ubicación]',
      lat: '[ubicación]',
      lng: '[ubicación]',
      titulo: 'Visita a sucursal',
    });
  });

  it('una foto en base64, sea cual sea su llave, queda como [archivo]', () => {
    const foto = 'data:image/jpeg;base64,' + '/9j/4AAQSkZJRgABAQ'.repeat(1000);
    expect(
      sanitizarCuerpoParaBitacora({
        photoUrl: foto,
        photoBase64: '/9j/4AAQSkZJRg',
        fotoBase64: '/9j/4AAQSkZJRg',
        foto: 'cualquier-cosa',
        comprobante: foto,
        notas: '  DATA:text/plain;base64,QUJD',
      }),
    ).toEqual({
      photoUrl: '[archivo]',
      photoBase64: '[archivo]',
      fotoBase64: '[archivo]',
      foto: '[archivo]',
      comprobante: '[archivo]',
      notas: '[archivo]',
    });
  });

  it('contraseñas, códigos y datos personales se tachan, también con otras mayúsculas', () => {
    const cuerpo = sanitizarCuerpoParaBitacora({
      password: 'a',
      passwordHash: 'b',
      newPassword: 'c',
      currentPassword: 'd',
      confirmPassword: 'e',
      contrasena: 'f',
      code: '123456',
      pin: '0000',
      curp: 'XXXX000000HXXXXX00',
      rfc: 'XXXX000000XXX',
      nss: '12345678901',
      clabe: '012345678901234567',
      apiKey: 'k',
      REFRESHTOKEN: 'r',
      MfaCode: '654321',
      otp: '1',
      secret: 's',
      token: 't',
      confirm: 'c',
      access_token: 'at',
    });
    expect(Object.values(cuerpo!).every((v) => v === '[redacted]')).toBe(true);
    expect(Object.keys(cuerpo!)).toHaveLength(20);
  });

  it('también se tachan por el nombre: portalPassword, counterpartyClabe y los RFC de las facturas', () => {
    // Campos reales de los DTO y controladores que la lista de nombres exactos dejaba pasar.
    const cuerpo = sanitizarCuerpoParaBitacora({
      portalPassword: 'ClaveSucursal#1',
      counterpartyClabe: '012345678901234567',
      counterpartyRfc: 'XAXX010101000',
      receptorRfc: 'XAXX010101000',
      emisorRfc: 'XAXX010101000',
      companyRfc: 'XAXX010101000',
      rfcEmisor: 'XAXX010101000',
      taxId: 'XAXX010101000',
      cardNumber: '4111111111111111',
      accountNumber: '0123456789',
      Portal_Password: 'x',
      clientSecret: 's',
      webhookToken: 't',
      accessToken: 'a',
      passwd: 'p',
      contraseña: 'c',
      empleado_nss: '12345678901',
      CURP_titular: 'XXXX000000HXXXXX00',
    });
    expect(Object.keys(cuerpo!)).toHaveLength(18);
    expect(Object.values(cuerpo!).every((v) => v === '[redacted]')).toBe(true);
    expect(JSON.stringify(cuerpo)).not.toMatch(/ClaveSucursal|012345678901234567|XAXX|4111|0123456789/);
  });

  it('un nombre que solo se parece a un secreto no se tacha (secretaria, rfc dentro de otra palabra)', () => {
    expect(
      sanitizarCuerpoParaBitacora({
        secretaria: 'Laura',
        secretario: 'Luis',
        nombre: 'Marfcom',
        cantidad: 2,
      }),
    ).toEqual({ secretaria: 'Laura', secretario: 'Luis', nombre: 'Marfcom', cantidad: 2 });
  });

  it('los campos de negocio quedan intactos y el texto largo se corta a 200 caracteres', () => {
    const cuerpo = sanitizarCuerpoParaBitacora({
      titulo: 'Instalación de cámaras',
      ticketType: 'SOPORTE',
      cantidad: 3,
      urgente: false,
      nota: null,
      detalle: 'x'.repeat(500),
      lista: [1, 2],
      anidado: { a: 1 },
    });
    expect(cuerpo).toEqual({
      titulo: 'Instalación de cámaras',
      ticketType: 'SOPORTE',
      cantidad: 3,
      urgente: false,
      nota: null,
      detalle: `${'x'.repeat(200)}…`,
    });
  });

  it('un cuerpo vacío, un arreglo o algo que no es un objeto da null', () => {
    expect(sanitizarCuerpoParaBitacora(undefined)).toBeNull();
    expect(sanitizarCuerpoParaBitacora(null)).toBeNull();
    expect(sanitizarCuerpoParaBitacora([{ a: 1 }])).toBeNull();
    expect(sanitizarCuerpoParaBitacora('texto')).toBeNull();
    expect(sanitizarCuerpoParaBitacora({ lista: [1] })).toBeNull();
  });

  it('una foto vacía o nula no se marca como archivo', () => {
    expect(sanitizarCuerpoParaBitacora({ foto: null, photoUrl: '' })).toEqual({ foto: null, photoUrl: '' });
  });

  it('una petición de fichaje queda en la fila sin coordenadas ni foto', async () => {
    const log = jest.fn().mockResolvedValue(undefined);
    const interceptor = new MutationAuditInterceptor({ log } as any);
    const contexto = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/attendance/check-in',
          headers: {},
          user: { id: 9 },
          body: {
            latitude: 19.04,
            longitude: -98.2,
            photoUrl: 'data:image/jpeg;base64,' + 'A'.repeat(5000),
            titulo: 'Entrada',
          },
        }),
      }),
    } as any;
    await lastValueFrom(interceptor.intercept(contexto, { handle: () => of({ id: 1 }) } as any));
    await new Promise((listo) => setImmediate(listo));
    const fila = log.mock.calls[0]![0];
    expect(fila.changes.request).toEqual({
      latitude: '[ubicación]',
      longitude: '[ubicación]',
      photoUrl: '[archivo]',
      titulo: 'Entrada',
    });
    expect(JSON.stringify(fila.changes)).not.toContain('AAAA');
  });
});
