import zlib from 'zlib';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service.js';
import { LIMITES_VISTA_PREVIA, borradorSobreGuardada, validarTamanoBorrador } from './propuesta-vista-previa.js';
import { generarPropuestaTecnicaPdf, type SeccionesPropuesta } from './propuesta-tecnica-pdf.js';
import { payloadDePropuesta } from './propuesta-payload.js';
import type { UpdateCotizacionDto } from './dto/update-cotizacion.dto.js';

/**
 * Vista previa en vivo: el borrador del editor encima de la cotización guardada, sin guardar nada.
 */

/** Texto de un PDF de PDFKit (los TJ de cada hoja), para comprobar qué se imprimió. */
function textoDelPdf(pdf: Buffer): string {
  const partes: string[] = [];
  for (const [, crudo] of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let contenido: string;
    try {
      contenido = zlib.inflateSync(Buffer.from(crudo!, 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const [, arreglo] of contenido.matchAll(/\[([^\]]*)\] TJ/g)) {
      partes.push(
        [...arreglo!.matchAll(/<([0-9a-fA-F]*)>/g)].map(([, hex]) => Buffer.from(hex!, 'hex').toString('latin1')).join(''),
      );
    }
  }
  return partes.join('\n');
}

const guardada = () => ({
  id: 7,
  companyId: 1,
  quoteNumber: 'NEX-LJ75100126-0007',
  folioNomenclatura: 'LJ75100126',
  status: 'DRAFT',
  revision: 1,
  sentAt: null,
  segmento: 'COMERCIAL',
  issueDate: new Date('2026-09-18T00:00:00.000Z'),
  validUntil: new Date('2026-10-03T00:00:00.000Z'),
  clientName: 'Plaza Norte',
  clientCompany: 'Inmobiliaria Plaza Norte',
  clientEmail: 'compras@plazanorte.mx',
  clientPhone: '222 123 4567',
  clientAddress: null,
  projectName: 'Proyecto guardado',
  scope: 'Entrada guardada.',
  objetivo: 'Objetivo guardado.',
  alcanceBloques: [{ clave: 'libre-1', titulo: 'Bloque guardado', texto: 'Texto', vinetas: [] }],
  planos: [
    { url: '/uploads/cotizaciones/a.png', nombre: 'Plano A' },
    { url: '/uploads/cotizaciones/b.png', nombre: 'Plano B' },
  ],
  note: null,
  depositPercent: 50,
  currency: 'MXN',
  subtotal: 1000,
  taxTotal: 160,
  total: 1160,
  items: [{ id: 1, name: 'Cámara guardada', unit: 'Pieza', qty: 1, unitPrice: 1000, tax: 16, discount: 0, lineTotal: 1160 }],
  company: null,
});

describe('borradorSobreGuardada', () => {
  it('lo que viene en el borrador pisa a lo guardado; lo que no viene se conserva', () => {
    const base = guardada();
    const dto: UpdateCotizacionDto = {
      projectName: '  Proyecto en pantalla ',
      clientName: 'Cliente nuevo',
      scope: '',
      segmento: 'OBRA',
      issueDate: '2026-09-20',
    };
    const q = borradorSobreGuardada(base, dto);

    expect(q.projectName).toBe('Proyecto en pantalla');
    expect(q.clientName).toBe('Cliente nuevo');
    // Vacío es vacío (como en `update`), no «lo guardado».
    expect(q.scope).toBe('');
    expect(q.segmento).toBe('OBRA');
    expect((q.issueDate as Date).toISOString().slice(0, 10)).toBe('2026-09-20');
    // Lo que no vino, igual.
    expect(q.clientCompany).toBe('Inmobiliaria Plaza Norte');
    expect(q.objetivo).toBe('Objetivo guardado.');
    expect(q.items).toBe(base.items);
    expect(q.total).toBe(1160);
    // La guardada no se toca.
    expect(base.projectName).toBe('Proyecto guardado');
  });

  it('las partidas del borrador reemplazan a las guardadas y los totales se recalculan', () => {
    const q = borradorSobreGuardada(guardada(), {
      items: [
        { name: 'Cámara domo', unit: 'Pieza', qty: 4, unitPrice: 1500, tax: 16 } as any,
        { name: 'Instalación', unit: 'Servicio', qty: 4, unitPrice: 500, tax: 16 } as any,
      ],
    });
    expect(q.items).toHaveLength(2);
    expect(q.items[0].name).toBe('Cámara domo');
    expect(q.subtotal).toBe(8000);
    expect(q.taxTotal).toBe(1280);
    expect(q.total).toBe(9280);

    const vacio = borradorSobreGuardada(guardada(), { items: [] });
    expect(vacio.items).toEqual([]);
    expect(vacio.total).toBe(0);
  });

  it('no reescribe el folio emitido ni cambia el estado', () => {
    const q = borradorSobreGuardada(guardada(), { quoteNumber: 'OTRO-FOLIO', status: 'APROBADA' });
    expect(q.quoteNumber).toBe('NEX-LJ75100126-0007');
    expect(q.status).toBe('DRAFT');
  });

  it('los planos solo se reordenan y renombran: una URL nueva no entra', () => {
    const q = borradorSobreGuardada(guardada(), {
      planos: [
        { url: '/uploads/cotizaciones/b.png', nombre: 'Plano B (planta alta)' },
        { url: 'https://malicioso.example/x.png', nombre: 'Intruso' },
        { url: '/uploads/cotizaciones/a.png' },
      ],
    });
    expect(q.planos.map((p: any) => p.url)).toEqual(['/uploads/cotizaciones/b.png', '/uploads/cotizaciones/a.png']);
    expect(q.planos[0].nombre).toBe('Plano B (planta alta)');
  });

  it('el borrador llega al PDF', async () => {
    const q = borradorSobreGuardada(guardada(), {
      projectName: 'Renovación escrita hace un segundo',
      items: [{ name: 'Grabador NVR 16 canales', unit: 'Pieza', qty: 1, unitPrice: 9000, tax: 16 } as any],
    });
    const secciones: SeccionesPropuesta = {};
    const pdf = await generarPropuestaTecnicaPdf(payloadDePropuesta(q as any), secciones);
    const texto = textoDelPdf(pdf);
    expect(texto).toContain('Renovación escrita hace un segundo');
    expect(texto).toContain('Grabador NVR 16 canales');
    expect(texto).not.toContain('Cámara guardada');
    expect(secciones.portada).toBe(1);
    expect(secciones.objetivo).toBe(2);
    expect(secciones.cotizacion).toBeGreaterThan(secciones.objetivo!);
  });

  it('rechaza borradores desproporcionados', () => {
    expect(() => validarTamanoBorrador({}, LIMITES_VISTA_PREVIA.bytes + 1)).toThrow(BadRequestException);
    const muchas = Array.from({ length: LIMITES_VISTA_PREVIA.partidas + 1 }, () => ({ name: 'x', qty: 1, unitPrice: 1 }));
    expect(() => borradorSobreGuardada(guardada(), { items: muchas as any })).toThrow(BadRequestException);
  });
});

describe('CotizacionesService.vistaPreviaPdf', () => {
  /** Prisma de mentira: cualquier escritura revienta la prueba. */
  function prismaFalso(fila: ReturnType<typeof guardada>) {
    const escrituras: string[] = [];
    const prohibido = (nombre: string) =>
      jest.fn(() => {
        escrituras.push(nombre);
        throw new Error(`La vista previa no debe escribir (${nombre})`);
      });
    const prisma = {
      cotizacion: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === fila.id && (where.companyId == null || where.companyId === fila.companyId) ? fila : null,
        ),
        update: prohibido('cotizacion.update'),
        create: prohibido('cotizacion.create'),
        delete: prohibido('cotizacion.delete'),
        updateMany: prohibido('cotizacion.updateMany'),
      },
      cotizacionItem: {
        deleteMany: prohibido('cotizacionItem.deleteMany'),
        createMany: prohibido('cotizacionItem.createMany'),
      },
      cotizacionVersion: { create: prohibido('cotizacionVersion.create') },
      activityEvidence: { findMany: jest.fn(async () => []) },
      companyProfile: { findUnique: jest.fn(async () => null) },
      $transaction: prohibido('$transaction'),
    };
    return { prisma, escrituras };
  }

  const core = { participantesParaApi: jest.fn(async () => []) };
  const servicio = (prisma: unknown) =>
    new CotizacionesService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, core as any);

  it('arma el PDF del borrador sin guardar nada y dice dónde empieza cada sección', async () => {
    const fila = guardada();
    const { prisma, escrituras } = prismaFalso(fila);
    const { pdf, secciones } = await servicio(prisma).vistaPreviaPdf(
      7,
      { projectName: 'Solo en pantalla', items: [{ name: 'Switch PoE', qty: 2, unitPrice: 2500, tax: 16 } as any] },
      1,
      42,
    );

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(textoDelPdf(pdf)).toContain('Solo en pantalla');
    expect(secciones).toMatchObject({ portada: 1, objetivo: 2 });
    expect(escrituras).toEqual([]);
    // La fila que devolvió la base sigue como estaba.
    expect(fila.projectName).toBe('Proyecto guardado');
    expect(fila.items).toHaveLength(1);
  });

  it('respeta la empresa: la cotización de otra empresa no existe', async () => {
    const { prisma } = prismaFalso(guardada());
    await expect(servicio(prisma).vistaPreviaPdf(7, { projectName: 'x' }, 2, 42)).rejects.toBeInstanceOf(NotFoundException);
  });
});
