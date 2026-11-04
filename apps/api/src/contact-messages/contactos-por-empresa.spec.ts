/**
 * Un mensaje del formulario trae nombre, correo y teléfono de una persona: solo le toca al personal de la empresa que
 * lo recibió. `emit()` lo mandaba a `SALA_PERSONAL`, el personal de todas. Aquí corre el gateway de verdad con un
 * servidor falso, para ver a qué sala sale cada aviso.
 */
import { ContactMessagesService } from './contact-messages.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

const EMPRESA_DEL_SITIO = 1;
const OTRA_EMPRESA = 2;

const armar = (sitio = EMPRESA_DEL_SITIO) => {
  const salidas: Array<{ sala: string; evento: string; payload: any }> = [];
  const gateway = new RealtimeGateway({} as any);
  gateway.server = {
    to: (sala: string) => ({
      emit: (evento: string, payload: unknown) => salidas.push({ sala, evento, payload }),
    }),
    emit: (evento: string, payload: unknown) => salidas.push({ sala: 'todos', evento, payload }),
  } as any;

  const prisma = {
    companyProfile: { findFirst: jest.fn(async () => ({ id: sitio })) },
    contactMessage: {
      create: jest.fn(async ({ data }: { data: object }) => ({ id: 10, ...data })),
      findFirst: jest.fn(async () => ({
        id: 10,
        companyId: OTRA_EMPRESA,
        name: 'Ana',
        email: 'ana@example.com',
        status: 'NEW',
      })),
      update: jest.fn(async ({ data }: { data: object }) => ({ id: 10, companyId: OTRA_EMPRESA, ...data })),
      // Con el filtro de empresa puesto, `delete` se vuelve `deleteMany`: regresa la cuenta, no la fila.
      delete: jest.fn(async () => ({ count: 1 })),
    },
    salesLead: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: object }) => ({ id: 20, ...data })),
    },
  };
  const servicio = new ContactMessagesService(prisma as any, gateway, { subscribe: jest.fn() } as any);
  return { servicio, salidas };
};

const delEvento = (salidas: Array<{ sala: string; evento: string }>, evento: string) =>
  salidas.filter((s) => s.evento === evento).map((s) => s.sala);

const mensaje = { name: 'Ana', email: 'ana@example.com', message: 'hola mundo' };

describe('los avisos de contacto van solo a la empresa que lo recibió', () => {
  beforeEach(() => {
    // Sin SMTP en pruebas, el correo interno falla y se registra; no es lo que se prueba aquí.
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('un mensaje nuevo no sale a todo el personal', async () => {
    const { servicio, salidas } = armar();
    await servicio.create(mensaje);
    expect(delEvento(salidas, 'contacts:changed')).toEqual([`company:${EMPRESA_DEL_SITIO}`]);
  });

  it('va a la empresa del sitio aunque no sea la principal', async () => {
    const { servicio, salidas } = armar(OTRA_EMPRESA);
    await servicio.create(mensaje);
    expect(delEvento(salidas, 'contacts:changed')).toEqual([`company:${OTRA_EMPRESA}`]);
  });

  it('lo mismo para un correo que llega de vuelta', async () => {
    const { servicio, salidas } = armar();
    await servicio.ingestInbound({ fromEmail: 'ana@example.com', body: 'hola mundo' } as any);
    expect(delEvento(salidas, 'contacts:changed')).toEqual([`company:${EMPRESA_DEL_SITIO}`]);
  });

  it('el mensaje de ventas tampoco sale por el aviso de prospecto', async () => {
    const { servicio, salidas } = armar();
    await servicio.create({ ...mensaje, category: 'VENTAS' });
    expect(delEvento(salidas, 'leads:changed')).toEqual([`company:${EMPRESA_DEL_SITIO}`]);
  });

  it('actualizar avisa a la empresa de la fila', async () => {
    const { servicio, salidas } = armar();
    await servicio.update(10, { status: 'IN_PROGRESS' } as any, OTRA_EMPRESA);
    expect(delEvento(salidas, 'contacts:changed')).toEqual([`company:${OTRA_EMPRESA}`]);
  });

  it('borrar avisa a la empresa de la fila, aunque `delete` solo regrese la cuenta', async () => {
    const { servicio, salidas } = armar();
    await servicio.remove(10, OTRA_EMPRESA);
    expect(delEvento(salidas, 'contacts:changed')).toEqual([`company:${OTRA_EMPRESA}`]);
  });

  it('el portal de esa empresa no recibe los datos', async () => {
    const { servicio, salidas } = armar();
    await servicio.create({ ...mensaje, category: 'VENTAS' });
    expect(salidas.filter((s) => s.sala.endsWith(':portal') && s.evento !== 'entity:updated')).toEqual([]);
  });
});
