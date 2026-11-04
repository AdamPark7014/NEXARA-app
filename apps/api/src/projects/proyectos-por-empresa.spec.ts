/**
 * `projects:changed` lleva el proyecto completo: solo le toca al personal de su empresa. `emit()` lo mandaba a
 * `SALA_PERSONAL`, el personal de todas. Aquí corre el gateway de verdad con un servidor falso, para ver a qué sala
 * sale cada aviso.
 */
import { ProjectsService } from './projects.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

const EMPRESA = 7;
const OTRA_EMPRESA = 2;

const imagen = (nombre: string) => ({
  fieldname: 'x',
  originalname: `${nombre}.jpg`,
  encoding: '7bit',
  mimetype: 'image/jpeg',
  size: 1,
  buffer: Buffer.from('x'),
});

const dto = {
  title: 'Torre',
  sector: 'Salud',
  summary: 'Resumen',
  impact: 'Impacto',
  services: ['CCTV'],
  tags: ['obra'],
  highlights: ['uno'],
} as any;

const armar = () => {
  const salidas: Array<{ sala: string; evento: string; payload: any }> = [];
  const gateway = new RealtimeGateway({} as any);
  gateway.server = {
    to: (sala: string) => ({
      emit: (evento: string, payload: unknown) => salidas.push({ sala, evento, payload }),
    }),
    emit: (evento: string, payload: unknown) => salidas.push({ sala: 'todos', evento, payload }),
  } as any;

  const fila = { id: 10, slug: 'torre', title: 'Torre', mainImage: null, gallery: [], companyId: OTRA_EMPRESA };
  const prisma = {
    project: {
      findFirst: jest.fn(async ({ where }: { where: { slug?: string } }) => (where.slug ? null : fila)),
      create: jest.fn(async ({ data }: { data: object }) => ({ id: 10, ...data })),
      update: jest.fn(async ({ data }: { data: object }) => ({ ...fila, ...data })),
      // Con el filtro de empresa puesto, `delete` se vuelve `deleteMany`: regresa la cuenta, no la fila.
      delete: jest.fn(async () => ({ count: 1 })),
    },
  };
  const servicio = new ProjectsService(prisma as any, gateway);
  // No se prueban las imágenes: sin esto escribiría en la carpeta de subidas.
  jest.spyOn(servicio as any, 'saveImage').mockResolvedValue('/imagen.jpg');
  jest.spyOn(servicio as any, 'saveImages').mockResolvedValue(Array(8).fill('/imagen.jpg'));
  return { servicio, salidas };
};

const delEvento = (salidas: Array<{ sala: string; evento: string }>) =>
  salidas.filter((s) => s.evento === 'projects:changed').map((s) => s.sala);

const archivos = { mainImage: imagen('principal'), gallery: Array.from({ length: 8 }, (_, i) => imagen(`g${i}`)) };

describe('los avisos de proyectos van solo a su empresa', () => {
  afterEach(() => jest.restoreAllMocks());

  it('un proyecto nuevo no sale a todo el personal', async () => {
    const { servicio, salidas } = armar();
    await servicio.create(dto, archivos, EMPRESA);
    expect(delEvento(salidas)).toEqual([`company:${EMPRESA}`]);
  });

  it('va a su empresa, aunque no sea la principal', async () => {
    const { servicio, salidas } = armar();
    await servicio.create(dto, archivos, OTRA_EMPRESA);
    expect(delEvento(salidas)).toEqual([`company:${OTRA_EMPRESA}`]);
  });

  it('actualizar avisa a la empresa de la fila', async () => {
    const { servicio, salidas } = armar();
    await servicio.update(10, { title: 'Torre B' } as any, {}, OTRA_EMPRESA);
    expect(delEvento(salidas)).toEqual([`company:${OTRA_EMPRESA}`]);
  });

  it('borrar avisa a la empresa de la fila, aunque `delete` solo regrese la cuenta', async () => {
    const { servicio, salidas } = armar();
    await servicio.remove(10, OTRA_EMPRESA);
    expect(delEvento(salidas)).toEqual([`company:${OTRA_EMPRESA}`]);
  });

  it('el portal de esa empresa no recibe el proyecto', async () => {
    const { servicio, salidas } = armar();
    await servicio.create(dto, archivos, EMPRESA);
    expect(salidas.filter((s) => s.sala.endsWith(':portal'))).toEqual([]);
  });
});
