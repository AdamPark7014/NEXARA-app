/**
 * `GET studio/page-content/:section` no pide sesión. Entregaba la fila completa: lo que Studio tuviera sin publicar y
 * el nombre de quien lo editó, a cualquiera. La web solo lee `content` (`fetchPageSection`).
 */
import { NotFoundException } from '@nestjs/common';
import { PageContentService } from './page-content.service.js';

const SITIO = 1;

const fila = {
  id: 9,
  companyId: SITIO,
  section: 'page_home',
  content: { titulo: 'publicado' },
  draftContent: { titulo: 'borrador sin publicar' },
  updatedBy: 'Editora de Studio',
  publishedBy: 'Quien publicó',
  publishedAt: new Date('2026-11-01T00:00:00Z'),
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-11-02T00:00:00Z'),
};

const servicio = (encontrada: typeof fila | null = fila) =>
  new PageContentService({
    companyProfile: { findFirst: jest.fn(async () => ({ id: SITIO })) },
    pageContent: { findUnique: jest.fn(async () => encontrada) },
  } as any);

describe('PageContentService.findPublished, lo que ve el público', () => {
  it('entrega solo la sección y lo publicado', async () => {
    await expect(servicio().findPublished('page_home')).resolves.toEqual({
      section: 'page_home',
      content: { titulo: 'publicado' },
    });
  });

  it('no deja rastro del borrador ni de quién editó', async () => {
    const texto = JSON.stringify(await servicio().findPublished('page_home'));
    expect(texto).not.toContain('borrador');
    expect(texto).not.toContain('Editora');
    expect(texto).not.toContain('Quien publicó');
    expect(texto).not.toContain('hasUnpublishedChanges');
  });

  it('sin fila sigue siendo 404, y fetchPageSection cae a sus textos de respaldo', async () => {
    await expect(servicio(null).findPublished('page_home')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PageContentService.findDraft, lo que ve Studio con sesión', () => {
  it('sigue entregando el borrador y quién lo editó', async () => {
    const vista = await servicio().findDraft('page_home', SITIO);
    expect(vista).toMatchObject({
      content: { titulo: 'borrador sin publicar' },
      draftContent: { titulo: 'borrador sin publicar' },
      updatedBy: 'Editora de Studio',
      isDraft: true,
      hasUnpublishedChanges: true,
    });
  });
});
