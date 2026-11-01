/** Redondeo a `d` decimales que no tropieza con 1.005 (el mismo cuidado que `roundMoney`). */
export function redondear(n: number, d = 2): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
}

/** Número sano desde lo que venga de Prisma (`Decimal`, texto o null). */
export function numero(valor: unknown, omision = 0): number {
  if (valor == null || valor === '') return omision;
  const n = Number(valor);
  return Number.isFinite(n) ? n : omision;
}
