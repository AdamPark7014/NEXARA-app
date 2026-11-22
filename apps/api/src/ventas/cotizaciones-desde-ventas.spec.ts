import { CotizacionVisibleInterceptor } from '../common/visibilidad/cotizacion-visible.interceptor';
import { fijarCompartimentada } from '../common/visibilidad/visibilidad';
import { VentasCotizacionesController } from './ventas-cotizaciones.controller';
import { VentasService } from './ventas.service';

/**
 * Las cotizaciones vistas desde Ventas respetan «quién ve qué» (Adam, 20-11-2026): cada quien ve las
 * suyas, las que le mandaron y en las que participa; solo quien ve todas las ve todas.
 *
 * La lista y el detalle de `/ventas/cotizaciones` no pasaban por esa regla: con el interruptor prendido,
 * cualquiera con el panel de ventas listaba (y abría por id) las cotizaciones de los demás.
 */
describe('las cotizaciones vistas desde Ventas respetan «quién ve qué»', () => {
  afterEach(() => fijarCompartimentada(false));

  function ventas() {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = Object.create(VentasService.prototype) as any;
    svc.prisma = { cotizacion: { findMany } };
    const where = () => findMany.mock.calls[0][0].where;
    return { svc, where };
  }
  const QUIEN_COTIZA = { id: 30, roleKey: 'administrativo' };
  const SUYAS = { OR: [{ createdById: 30 }, { asignadoAId: 30 }, { participantes: { some: { userId: 30 } } }] };

  it('con las reglas prendidas, quien cotiza solo lista las suyas, las que le mandaron y en las que participa', async () => {
    fijarCompartimentada(true);
    const f = ventas();

    await f.svc.findCotizacionesForVentas(undefined, undefined, undefined, undefined, QUIEN_COTIZA);

    expect(f.where()).toEqual({ AND: [{}, SUYAS] });
  });

  it('los filtros de cliente, estado y fecha se conservan junto al de persona', async () => {
    fijarCompartimentada(true);
    const f = ventas();

    await f.svc.findCotizacionesForVentas('Cliente Demo', 'SENT', '2026-11-01', undefined, QUIEN_COTIZA);

    const [filtros, persona] = f.where().AND;
    expect(filtros.status).toBe('SENT');
    expect(filtros.OR).toHaveLength(2);
    expect(filtros.issueDate.gte).toEqual(new Date('2026-11-01'));
    expect(persona).toEqual(SUYAS);
  });

  it('quien ve todas no lleva filtro de persona', async () => {
    fijarCompartimentada(true);
    const f = ventas();

    await f.svc.findCotizacionesForVentas(undefined, 'SENT', undefined, undefined, { id: 1, isSuperAdmin: true });

    expect(f.where()).toEqual({ status: 'SENT' });
  });

  it('sin saber quién pregunta no se lista nada', async () => {
    fijarCompartimentada(true);
    const f = ventas();

    await f.svc.findCotizacionesForVentas();

    expect(f.where()).toEqual({ AND: [{}, { id: -1 }] });
  });

  it('con las reglas apagadas la lista queda como antes', async () => {
    const f = ventas();

    await f.svc.findCotizacionesForVentas(undefined, 'SENT', undefined, undefined, QUIEN_COTIZA);

    expect(f.where()).toEqual({ status: 'SENT' });
  });

  it('el controlador dice quién pregunta', () => {
    const service = { findCotizacionesForVentas: jest.fn().mockReturnValue([]) };
    const controller = new VentasCotizacionesController(service as any);

    controller.findAll(QUIEN_COTIZA, 'Cliente Demo', 'SENT', '2026-11-01', '2026-11-30');

    expect(service.findCotizacionesForVentas).toHaveBeenCalledWith('Cliente Demo', 'SENT', '2026-11-01', '2026-11-30', QUIEN_COTIZA);
  });

  it('abrir o ligar una cotización por id pasa por el interceptor que responde 404 si no la ve', () => {
    const interceptores = Reflect.getMetadata('__interceptors__', VentasCotizacionesController) ?? [];
    expect(interceptores).toContain(CotizacionVisibleInterceptor);
  });
});
