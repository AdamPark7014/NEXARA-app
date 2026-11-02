/**
 * Lo que lleva más de 24 h sin revisar sube un nivel (Programa Velocidad Core, 01-11-2026): una sola
 * tarjeta al día por persona. Revisar sigue siendo del jefe directo; aquí solo se avisa.
 *
 * Módulo puro (sin Nest ni Prisma).
 */
export type EvidenciaEnEspera = { duenoId: number; companyId: number };
export type PersonaOrganigrama = { id: number; managerId: number | null; nombre: string; isActive: boolean };

export type TarjetaEscalada = {
  userId: number;
  companyId: number;
  /** Las de su gente directa. */
  tuyas: number;
  /** Las de los equipos debajo de él, por jefe. */
  deOtros: Array<{ jefe: string; n: number }>;
};

export function armarEscaladas(evidencias: EvidenciaEnEspera[], personas: PersonaOrganigrama[]): TarjetaEscalada[] {
  const porId = new Map(personas.map((p) => [p.id, p]));
  const tarjetas = new Map<number, { companyId: number; tuyas: number; deOtros: Map<string, number> }>();
  const tarjetaDe = (userId: number, companyId: number) => {
    const t = tarjetas.get(userId) ?? { companyId, tuyas: 0, deOtros: new Map<string, number>() };
    tarjetas.set(userId, t);
    return t;
  };

  for (const e of evidencias) {
    const jefe = porId.get(porId.get(e.duenoId)?.managerId ?? -1);
    if (!jefe?.isActive) continue;
    tarjetaDe(jefe.id, e.companyId).tuyas += 1;
    const arriba = porId.get(jefe.managerId ?? -1);
    if (arriba?.isActive) {
      const t = tarjetaDe(arriba.id, e.companyId);
      t.deOtros.set(jefe.nombre, (t.deOtros.get(jefe.nombre) ?? 0) + 1);
    }
  }

  return [...tarjetas.entries()].map(([userId, t]) => ({
    userId,
    companyId: t.companyId,
    tuyas: t.tuyas,
    deOtros: [...t.deOtros.entries()]
      .map(([jefe, n]) => ({ jefe, n }))
      .sort((a, b) => b.n - a.n || a.jefe.localeCompare(b.jefe)),
  }));
}

/** Primer nombre y apellido: el de la tarjeta tiene que caber en la notificación del teléfono. */
function corto(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).join(' ');
}

export function textoEscalada(t: TarjetaEscalada): { title: string; message: string } {
  const total = t.tuyas + t.deOtros.reduce((s, o) => s + o.n, 0);
  const partes = [
    ...(t.tuyas ? [`${t.tuyas} de tu gente`] : []),
    ...t.deOtros.map((o) => `${o.n} de ${corto(o.jefe)}`),
  ];
  return {
    title:
      total === 1 ? '1 evidencia lleva más de 24 h sin revisar' : `${total} evidencias llevan más de 24 h sin revisar`,
    message: partes.join(' · '),
  };
}
