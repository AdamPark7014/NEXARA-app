/**
 * Una consulta de Prisma no corre al crearla, sino al esperarla. `withTenantBypassAsync(() => prisma.x.find())`
 * la devuelve sin esperar, así que corre ya fuera del contexto y con el filtro de empresa de la petición.
 * Por eso los simulacros de aquí son perezosos: uno inmediato no ve el problema.
 *
 * Lo que se defiende: el sitio público lee y escribe en su empresa, venga la petición con la empresa que venga.
 */
import 'reflect-metadata';
import { getTenantStore, runWithTenantAsync, withTenantBypassAsync } from './tenant-context.js';
import { planTenantQuery } from '../../prisma/prisma.service.js';
import { KbService } from '../../kb/kb.service.js';
import { NewsletterService } from '../../newsletter/newsletter.service.js';
import { PageContentService } from '../../page-content/page-content.service.js';

const SITIO_PUBLICO = 1;
const OTRA_EMPRESA = 2;

/** Lo que pone `TenantInterceptor` cuando la petición dice ser de otra empresa. */
const comoOtraEmpresa = <T>(fn: () => Promise<T>) =>
  runWithTenantAsync({ companyId: OTRA_EMPRESA, bypass: false }, fn);

/** Como Prisma: guarda con qué contexto corrió cuando alguien la esperó, no cuando la crearon. */
const perezosa = <T>(contextos: unknown[], valor: T) => ({
  then(resolver: (fila: T) => unknown, rechazo?: (error: unknown) => unknown) {
    contextos.push(getTenantStore());
    return Promise.resolve(valor).then(resolver, rechazo);
  },
});

describe('las tres formas de llamar withTenantBypassAsync', () => {
  const correr = async (forma: (consulta: () => PromiseLike<string>) => Promise<unknown>) => {
    const contextos: unknown[] = [];
    await comoOtraEmpresa(() => forma(() => perezosa(contextos, 'fila')));
    return contextos[0];
  };

  // Si esto cambia, alguien tocó la función compartida: revisar lo que anota `.ai/RELEVO.md` antes de seguir,
  // porque sí cambia quién recibe los avisos en tiempo real y qué dice la auditoría de las escrituras públicas.
  it('devolver la consulta sin esperarla deja el filtro de la petición', async () => {
    const contexto = await correr((consulta) => withTenantBypassAsync(consulta as () => Promise<string>));
    expect(contexto).toMatchObject({ companyId: OTRA_EMPRESA, bypass: false });
  });

  it('una función async que la espera adentro sí lo quita', async () => {
    const contexto = await correr((consulta) =>
      withTenantBypassAsync(async () => {
        return await consulta();
      }),
    );
    expect(contexto).toMatchObject({ bypass: true });
  });

  it('Promise.all también lo quita', async () => {
    const contexto = await correr((consulta) =>
      withTenantBypassAsync(() => Promise.all([consulta() as Promise<string>])),
    );
    expect(contexto).toMatchObject({ bypass: true });
  });
});

describe('PageContentService.findPublished', () => {
  const fila = { id: 9, companyId: SITIO_PUBLICO, section: 'page_home', content: { de: 'sitio' }, draftContent: null };

  it('lee la sección de la empresa del sitio, no la de la petición', async () => {
    const contextos: unknown[] = [];
    const findUnique = jest.fn(() => perezosa(contextos, fila));
    const prisma = {
      companyProfile: { findFirst: jest.fn(async () => ({ id: SITIO_PUBLICO })) },
      pageContent: { findUnique },
    } as any;

    const vista = await comoOtraEmpresa(() => new PageContentService(prisma).findPublished('page_home'));

    expect(vista.content).toEqual({ de: 'sitio' });
    expect(findUnique).toHaveBeenCalledWith({
      where: { companyId_section: { companyId: SITIO_PUBLICO, section: 'page_home' } },
    });
    // Con el filtro puesto, el middleware cambia la empresa de esa llave por la de la petición.
    expect(contextos[0]).toMatchObject({ bypass: true });
  });
});

describe('NewsletterService.subscribe', () => {
  const armar = (existente: { id: number; email: string; name: string | null } | null) => {
    const update = jest.fn(async ({ data }: { data: object }) => ({ ...existente, ...data }));
    const create = jest.fn(async ({ data }: { data: object }) => ({ id: 77, ...data }));
    const prisma = {
      companyProfile: { findFirst: jest.fn(async () => ({ id: SITIO_PUBLICO })) },
      newsletterSubscriber: { findFirst: jest.fn(async () => existente), update, create },
    } as any;
    const brevo = { upsertContact: jest.fn(async () => undefined) } as any;
    return { service: new NewsletterService(prisma, brevo), update, create };
  };

  it('quien ya estaba suscrito se actualiza en su empresa, aunque la petición diga otra', async () => {
    const { service, update } = armar({ id: 5, email: 'ana@example.com', name: null });

    const suscriptor = await comoOtraEmpresa(() => service.subscribe({ email: 'ana@example.com', name: 'Ana' }));

    expect(suscriptor).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
    const args = update.mock.calls[0][0];
    // Con solo `{ id }`, el middleware lo cambia por la empresa de la petición: 0 filas, null y error 500.
    expect(planTenantQuery('update', args, OTRA_EMPRESA)).toMatchObject({
      type: 'query',
      action: 'update',
      args: { where: { id: 5, companyId: SITIO_PUBLICO } },
    });
  });

  it('quien es nuevo queda en la empresa del sitio', async () => {
    const { service, create } = armar(null);

    await comoOtraEmpresa(() => service.subscribe({ email: 'ana@example.com' }));

    expect(create.mock.calls[0][0].data).toMatchObject({ companyId: SITIO_PUBLICO });
    expect(planTenantQuery('create', create.mock.calls[0][0], OTRA_EMPRESA)).toMatchObject({ type: 'query' });
  });
});

describe('KbService.getArticle', () => {
  it('cuenta la vista en el artículo de la empresa del sitio, aunque la petición diga otra', async () => {
    const update = jest.fn(async () => ({ id: 3, viewCount: 1 }));
    const prisma = {
      companyProfile: { findFirst: jest.fn(async () => ({ id: SITIO_PUBLICO })) },
      kbArticle: { findFirst: jest.fn(async () => ({ id: 3, companyId: SITIO_PUBLICO })), update },
    } as any;

    await comoOtraEmpresa(() => new KbService(prisma).getArticle('articulo', null, true));

    expect(planTenantQuery('update', update.mock.calls[0][0], OTRA_EMPRESA)).toMatchObject({
      type: 'query',
      action: 'update',
      args: { where: { id: 3, companyId: SITIO_PUBLICO } },
    });
  });
});

describe('KbService.markHelpful', () => {
  it('cuenta en el artículo de la empresa del sitio, aunque la petición diga otra', async () => {
    const update = jest.fn(async () => ({ id: 3, helpfulCount: 1 }));
    const prisma = {
      companyProfile: { findFirst: jest.fn(async () => ({ id: SITIO_PUBLICO })) },
      kbArticle: { findFirst: jest.fn(async () => ({ id: 3, companyId: SITIO_PUBLICO })), update },
    } as any;

    await comoOtraEmpresa(() => new KbService(prisma).markHelpful(3));

    expect(planTenantQuery('update', update.mock.calls[0][0], OTRA_EMPRESA)).toMatchObject({
      type: 'query',
      action: 'update',
      args: { where: { id: 3, companyId: SITIO_PUBLICO } },
    });
  });
});
