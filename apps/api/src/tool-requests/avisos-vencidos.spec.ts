import { ToolRequestsService } from './tool-requests.service.js';
import { prestamoVencido, textoDiaDePrestamo } from './plazo-prestamo.js';

/**
 * Aviso de préstamo vencido: uno al día y solo cuando el día pactado ya pasó. Corría cada hora
 * y creaba un aviso «URGENTE» nuevo cada vez.
 */

function build(prestamos: Array<Record<string, unknown>>, avisadosHoy: number[] = []) {
  const prisma = {
    toolRequest: { findMany: jest.fn().mockResolvedValue(prestamos) },
    toolRequestNotification: {
      findMany: jest.fn().mockResolvedValue(avisadosHoy.map((toolRequestId) => ({ toolRequestId }))),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new ToolRequestsService(prisma as any, {} as any, {} as any);
  return { service, prisma };
}

// 25 de noviembre, 9:00 de la mañana en México.
const AHORA = new Date('2026-11-25T15:00:00.000Z');

describe('aviso de préstamo vencido', () => {
  it('vencido es que el día pactado ya pasó; ese día completo sigue en plazo', () => {
    expect(prestamoVencido('2026-11-24T18:00:00.000Z', AHORA)).toBe(true);
    expect(prestamoVencido('2026-11-25T18:00:00.000Z', AHORA)).toBe(false);
    // Guardado por la web de antes a medianoche UTC: es el 25, no la tarde del 24.
    expect(prestamoVencido('2026-11-25T00:00:00.000Z', AHORA)).toBe(false);
    expect(prestamoVencido(null, AHORA)).toBe(false);
    expect(textoDiaDePrestamo('2026-11-24T18:00:00.000Z')).toBe('24 nov');
  });

  it('avisa una vez a quien la tiene, con el día escrito', async () => {
    const { service, prisma } = build([
      { id: 1, usuarioId: 3, toolName: 'Rotomartillo', expectedReturnDate: new Date('2026-11-24T18:00:00.000Z') },
      { id: 2, usuarioId: 4, toolName: 'Escalera', expectedReturnDate: new Date('2026-11-25T18:00:00.000Z') },
    ]);
    await expect(service.avisarPrestamosVencidos(AHORA)).resolves.toBe(1);
    expect(prisma.toolRequestNotification.create).toHaveBeenCalledTimes(1);
    const data = prisma.toolRequestNotification.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ toolRequestId: 1, usuarioId: 3, type: 'TOOL_EXPIRATION_DUE' });
    expect(data.message).toBe('La herramienta «Rotomartillo» debía regresar el 24 nov. Devuélvela o pide más plazo.');
  });

  it('si ya avisó hoy, no repite', async () => {
    const { service, prisma } = build(
      [{ id: 1, usuarioId: 3, toolName: 'Rotomartillo', expectedReturnDate: new Date('2026-11-24T18:00:00.000Z') }],
      [1],
    );
    await expect(service.avisarPrestamosVencidos(AHORA)).resolves.toBe(0);
    expect(prisma.toolRequestNotification.create).not.toHaveBeenCalled();
    // Busca solo los avisos de hoy (desde las 00:00 de México).
    const where = prisma.toolRequestNotification.findMany.mock.calls[0][0].where;
    expect(where.sentAt.gte.toISOString()).toBe('2026-11-25T06:00:00.000Z');
  });

  it('sin préstamos vencidos no consulta ni crea avisos', async () => {
    const { service, prisma } = build([
      { id: 2, usuarioId: 4, toolName: 'Escalera', expectedReturnDate: new Date('2026-11-25T18:00:00.000Z') },
    ]);
    await expect(service.avisarPrestamosVencidos(AHORA)).resolves.toBe(0);
    expect(prisma.toolRequestNotification.findMany).not.toHaveBeenCalled();
  });
});
