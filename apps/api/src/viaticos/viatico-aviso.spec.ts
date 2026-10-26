import { ViaticosService } from './viaticos.service.js';

const EMPRESA = 7;

/** El viático real: $1,200 solicitados, todavía sin entregar. */
const SOLICITADO = {
  id: 50,
  usuarioId: 3,
  companyId: EMPRESA,
  estatus: 'Solicitado',
  montoSolicitado: 1200,
  montoAprobado: null,
  montoComprobado: null,
  approvalTrail: [],
  approvalStep: 0,
};

const DUENO = { id: 3, nombre: 'Alejandro', permissions: ['viatics.create'] };
const OTRA_PERSONA = { id: 4, nombre: 'Carolina', permissions: ['viatics.create'] };
const ADMIN = { id: 1, nombre: 'Contabilidad', permissions: ['viatics.manage'] };

/**
 * Las cinco frases de antes, en dos oraciones. La prueba las cita para que
 * volver a partir el aviso rompa aquí, no en la pantalla.
 */
const TEXTO_VIEJO = [
  'Este viático está en «Solicitado»: todavía no se ha entregado dinero que comprobar. Espera a que se autorice y vuelve a intentarlo.',
  'Lo comprobado supera al doble de lo entregado. Revisa la cifra; si de verdad se gastó tanto de más, levanta un viático nuevo por la diferencia en vez de inflar este.',
  'Solo puedes comprobar tus propios viáticos. Este es de otra persona: pídeselo a quien administra viáticos.',
  'El monto autorizado tiene que ser mayor que cero. Si no vas a autorizar nada, rechaza la solicitud.',
  'No puedes autorizar más de lo solicitado (1200.00). Si hace falta más dinero, que la persona levante otro viático por la diferencia.',
] as const;

function build(viatico: Record<string, unknown>) {
  const prisma: any = {
    viatico: {
      findFirst: jest.fn().mockResolvedValue({ ...viatico }),
      findUnique: jest.fn().mockResolvedValue({ ...viatico }),
      update: jest.fn().mockImplementation(({ data }: any) => ({ ...viatico, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const service = new ViaticosService(
    prisma,
    { notifyViaticRequested: jest.fn(), notifyViaticReview: jest.fn(), notifyViaticAssignedToUser: jest.fn() } as any,
    { publishEntityLifecycle: jest.fn(), requestAutoApproval: jest.fn() } as any,
    { postOperationalDisbursement: jest.fn() } as any,
    { log: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return service;
}

async function aviso(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) return error.message;
    throw error;
  }
  throw new Error('se esperaba un aviso');
}

describe('avisos del viático en una sola frase', () => {
  it('cita el texto viejo y deja cada aviso en una frase', async () => {
    const service = build(SOLICITADO);
    const estado = SOLICITADO.estatus;
    const solicitado = Number(SOLICITADO.montoSolicitado);
    const cifra = (Math.round(solicitado * 100) / 100).toFixed(2);

    const sinEntregar = await aviso(() =>
      service.comprobar(SOLICITADO.id, { montoComprobado: 100 }, DUENO, EMPRESA),
    );
    const sobreElDoble = await aviso(() =>
      build({ ...SOLICITADO, estatus: 'Aprobado', montoAprobado: solicitado }).comprobar(
        SOLICITADO.id,
        { montoComprobado: solicitado * 2 + 0.01 },
        DUENO,
        EMPRESA,
      ),
    );
    const deOtraPersona = await aviso(() =>
      build({ ...SOLICITADO, estatus: 'Aprobado', montoAprobado: solicitado }).comprobar(
        SOLICITADO.id,
        { montoComprobado: 100 },
        OTRA_PERSONA,
        EMPRESA,
      ),
    );
    const autorizador = { ...ADMIN, isSuperAdmin: true };
    const enCero = await aviso(() =>
      service.approveOrReject(SOLICITADO.id, autorizador, 'approve', undefined, EMPRESA, 0),
    );
    const porEncima = await aviso(() =>
      service.approveOrReject(SOLICITADO.id, autorizador, 'approve', undefined, EMPRESA, solicitado + 0.01),
    );

    const frases = [sinEntregar, sobreElDoble, deOtraPersona, enCero, porEncima];
    expect(frases).toEqual([
      `Este viático está en «${estado}»: todavía no se ha entregado dinero que comprobar, espera a que se autorice y vuelve a intentarlo.`,
      'Lo comprobado supera al doble de lo entregado: revisa la cifra y, si de verdad se gastó tanto de más, levanta un viático nuevo por la diferencia en vez de inflar este.',
      'Solo puedes comprobar tus propios viáticos: este es de otra persona, pídeselo a quien administra viáticos.',
      'El monto autorizado tiene que ser mayor que cero: si no vas a autorizar nada, rechaza la solicitud.',
      `No puedes autorizar más de lo solicitado (${cifra}): si hace falta más dinero, que la persona levante otro viático por la diferencia.`,
    ]);
    expect(cifra).toBe('1200.00');
    expect(estado).toBe('Solicitado');
    frases.forEach((frase, i) => expect(frase).not.toBe(TEXTO_VIEJO[i]));

    // El tope sigue siendo el doble de lo entregado, y quien administra sigue pudiendo comprobar el de otra persona.
    const entregado = { ...SOLICITADO, estatus: 'Aprobado', montoAprobado: solicitado };
    await expect(
      build(entregado).comprobar(SOLICITADO.id, { montoComprobado: solicitado * 2 }, DUENO, EMPRESA),
    ).resolves.toEqual(expect.objectContaining({ montoComprobado: solicitado * 2 }));
    await expect(
      build(entregado).comprobar(SOLICITADO.id, { montoComprobado: 100 }, ADMIN, EMPRESA),
    ).resolves.toEqual(expect.objectContaining({ comprobadoPorId: ADMIN.id }));
  });
});
