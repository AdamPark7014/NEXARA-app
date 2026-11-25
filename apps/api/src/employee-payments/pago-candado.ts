import { Prisma } from '@prisma/client';

/**
 * Un solo candado por persona y semana para las dos formas de pagar (pestaña «Pago» y lista de pagos):
 * la segunda espera a la primera y ya ve lo que registró. Se suelta al cerrar la transacción.
 */
export async function candadoPagoSemana(tx: Prisma.TransactionClient, companyId: number, lunes: string, userId: number) {
  const clave = `nomina-pago:${companyId}:${lunes}:${userId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clave}))`;
}

/** Registros que cuentan: los de un pago anulado o borrado en la lista ya no. */
export const REGISTRO_VIGENTE: Prisma.NominaPagoRegistroWhereInput = {
  OR: [{ employeePaymentId: null }, { employeePayment: { deletedAt: null, status: { not: 'Anulado' } } }],
};
