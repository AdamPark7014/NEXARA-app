import { ERROR_CORTO_MAX, errorCorto } from './error-corto';

describe('errorCorto', () => {
  it('enmascara correos', () => {
    const r = errorCorto(new Error('No se pudo enviar a ana.lopez@ejemplo.com.mx por falta de cuota'));
    expect(r).toBe('No se pudo enviar a [correo] por falta de cuota');
    expect(r).not.toContain('ana.lopez');
  });

  it('enmascara «Bearer xxx»', () => {
    const r = errorCorto(new Error('401 con Authorization: Bearer abc.def-ghi_123 en la llamada'));
    expect(r).toContain('Bearer [token]');
    expect(r).not.toContain('abc.def');
  });

  it('enmascara tokens JWT', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const r = errorCorto(new Error(`token inválido ${jwt}`));
    expect(r).toBe('token inválido [token]');
    expect(r).not.toContain('eyJ');
  });

  it('enmascara números de 9 o más dígitos pero deja los cortos', () => {
    expect(errorCorto(new Error('cuenta 123456789012 rechazada'))).toBe('cuenta # rechazada');
    expect(errorCorto(new Error('teléfono 2221234567 inválido'))).toBe('teléfono # inválido');
    expect(errorCorto(new Error('actividad 12345 no existe, fila 8'))).toBe('actividad 12345 no existe, fila 8');
  });

  it('de un mensaje de Prisma de varias líneas deja solo la primera con texto', () => {
    const mensaje =
      '\nInvalid `prisma.user.findMany()` invocation:\n\n{\n  where: {\n    email: "ana@ejemplo.com",\n    rfc: "XAXX010101000"\n  }\n}\n\nUnique constraint failed';
    const prisma = Object.assign(new Error(mensaje), { name: 'PrismaClientKnownRequestError', code: 'P2002' });
    const r = errorCorto(prisma);
    expect(r).toBe('PrismaClientKnownRequestError [P2002]: Invalid `prisma.user.findMany()` invocation:');
    expect(r).not.toContain('ana@');
    expect(r).not.toContain('XAXX');
  });

  it('antepone el nombre del error solo cuando no es el genérico', () => {
    expect(errorCorto(new Error('falló'))).toBe('falló');
    expect(errorCorto(new TypeError('x no es una función'))).toBe('TypeError: x no es una función');
  });

  it('corta a 200 caracteres como máximo', () => {
    const r = errorCorto(new Error('a'.repeat(5000)));
    expect(r.length).toBeLessThanOrEqual(ERROR_CORTO_MAX);
    expect(r.endsWith('…')).toBe(true);
    const conNombre = errorCorto(Object.assign(new Error('b'.repeat(500)), { name: 'ErrorLargoDeVerdad' }));
    expect(conNombre.length).toBeLessThanOrEqual(ERROR_CORTO_MAX);
  });

  it('un mensaje enorme y sin saltos de línea no tarda', () => {
    const inicio = Date.now();
    errorCorto(new Error('a@'.repeat(200_000) + '1'.repeat(200_000)));
    expect(Date.now() - inicio).toBeLessThan(500);
  });

  it('acepta valores que no son Error sin lanzar', () => {
    expect(errorCorto('fallo suelto')).toBe('fallo suelto');
    expect(errorCorto({ message: 'objeto con mensaje' })).toBe('objeto con mensaje');
    expect(errorCorto({ otra: 'cosa' })).toBe('error sin detalle');
    expect(errorCorto(undefined)).toBe('error sin detalle');
    expect(errorCorto(null)).toBe('error sin detalle');
    expect(errorCorto(42)).toBe('42');
    expect(errorCorto('')).toBe('error sin detalle');
  });

  it('un objeto con getters que lanzan tampoco rompe', () => {
    const raro = {
      get message(): string {
        throw new Error('getter roto');
      },
    };
    expect(errorCorto(raro)).toBe('error sin detalle');
  });
});
