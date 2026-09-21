import { CotizacionesService } from './cotizaciones.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

/**
 * `GET /cotizaciones/core` sirve la lista de trabajo de cotizaciones, y devuelve
 * un arreglo pelado: si corta, nadie se entera.
 *
 * Cortaba. `PaginationQueryDto.take` es un *getter* (`this.limit ?? 20`), no una
 * propiedad opcional, y el ValidationPipe global tiene `transform: true`, así que
 * `query` siempre llega como instancia real y `query?.take` nunca es `undefined`.
 * El `?? 200` que aparentaba servir doscientas era código muerto y el tope real
 * eran veinte — el mismo error que dejó siete pantallas sin cargar con el tope
 * de 100.
 *
 * Estas pruebas miran el `take` que se le pasa a Prisma, que es donde se decide.
 */
function build() {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma: any = {
    cotizacion: { findMany },
    companyProfile: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const service = new CotizacionesService(
    prisma,
    { publishEntityLifecycle: jest.fn(), requestAutoApproval: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, findMany };
}

describe('listaCore — el tope que no se anunciaba', () => {
  it('sin `limit` sirve la lista entera, no veinte', async () => {
    const { service, findMany } = build();

    await service.listaCore(new PaginationQueryDto(), 1);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
  });

  it('respeta el `limit` que sí pide el cliente', async () => {
    const { service, findMany } = build();
    const query = new PaginationQueryDto();
    query.limit = 25;

    await service.listaCore(query, 1);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
  });

  it('pagina desde donde le digan', async () => {
    const { service, findMany } = build();
    const query = new PaginationQueryDto();
    query.limit = 10;
    query.page = 3;

    await service.listaCore(query, 1);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10, skip: 20 }));
  });

  it('el getter `take` sigue devolviendo 20: por eso no se puede leer', () => {
    // Si esto cambia algún día, el arreglo de `listaCore` deja de hacer falta
    // —pero mientras sea así, leer `take` en un servicio es leer un 20 disfrazado.
    expect(new PaginationQueryDto().take).toBe(20);
  });
});
