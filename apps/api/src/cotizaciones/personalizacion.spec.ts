import { NotFoundException } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service.js';
import {
  condicionesPorOmision,
  contenidoDesdeCotizacion,
  normalizarContenidoPlantilla,
  normalizarOpciones,
  opcionesPorOmision,
} from './personalizacion.js';
import { borradorSobreGuardada } from './propuesta-vista-previa.js';
import { terminosDeCotizacion } from './terminos-segmento.js';

/** «Mayor personalización»: secciones, columnas, carta, condiciones, moneda, firmas y plantillas. */

describe('normalizarOpciones', () => {
  it('sin nada guardado: el comportamiento de siempre', () => {
    expect(normalizarOpciones(null)).toEqual(opcionesPorOmision());
    expect(normalizarOpciones(undefined).secciones).toEqual({ objetivo: true, alcance: true, planos: true, terminos: true, firma: true });
    expect(normalizarOpciones('basura').columnas).toEqual({ marcaModelo: false, imagen: false, descuento: false, precioUnitario: true });
  });

  it('mezcla lo que viene con los valores por omisión y limpia lo raro', () => {
    const o = normalizarOpciones({
      secciones: { planos: false, firma: 'no' },
      columnas: { imagen: true },
      carta: { dirigidaA: '  Ing. Pérez ', mensaje: 'Estimado…', extra: 1 },
      condiciones: { garantia: 'x'.repeat(5000) },
      autorizo: { nombre: 'Christian Del Pozo', cargo: 'Dirección', userId: '3' },
      otraCosa: true,
    });
    expect(o.secciones).toEqual({ objetivo: true, alcance: true, planos: false, terminos: true, firma: true });
    expect(o.columnas.imagen).toBe(true);
    expect(o.columnas.precioUnitario).toBe(true);
    expect(o.carta).toEqual({ dirigidaA: 'Ing. Pérez', mensaje: 'Estimado…' });
    expect(o.condiciones.garantia).toHaveLength(4000);
    expect(o.autorizo).toEqual({ nombre: 'Christian Del Pozo', cargo: 'Dirección', userId: 3 });
    expect(o).not.toHaveProperty('otraCosa');
  });

  it('una carta vacía es «sin carta»', () => {
    expect(normalizarOpciones({ carta: { dirigidaA: ' ', mensaje: '' } }).carta).toBeNull();
  });
});

describe('condiciones comerciales → términos', () => {
  it('sugeridas por segmento', () => {
    expect(condicionesPorOmision('LICITACION').anticipoPct).toBe(0);
    expect(condicionesPorOmision('COMERCIAL').tiempoEntrega).toMatch(/días hábiles/);
    expect(condicionesPorOmision('OBRA').garantia).toMatch(/mano de obra/);
  });

  it('el medio de pago completa la forma de pago; entrega y garantía son renglones propios', () => {
    const t = terminosDeCotizacion({
      segmento: 'OBRA',
      incluyeInstalacion: true,
      anticipoPct: 60,
      vigenciaDias: 15,
      condiciones: { formaPago: 'Transferencia electrónica.', tiempoEntrega: '10 días hábiles.', garantia: '1 año.' },
    });
    const pago = t.partes.find((p) => p.clave === 'pago')!;
    expect(pago.texto).toContain('60 % de anticipo');
    expect(pago.texto).toContain('Pago mediante transferencia electrónica.');
    expect(pago.personalizado).toBe(false);
    expect(t.partes.map((p) => p.clave)).toEqual(['pago', 'alcance', 'noIncluye', 'disponibilidad', 'entrega', 'garantia', 'vigencia']);
    expect(t.lineas).toContain('Tiempo de entrega: 10 días hábiles.');
  });

  it('sin condiciones, los términos de siempre', () => {
    const t = terminosDeCotizacion({ segmento: 'COMERCIAL', incluyeInstalacion: false });
    expect(t.partes.map((p) => p.clave)).toEqual(['pago', 'alcance', 'noIncluye', 'disponibilidad']);
  });
});

describe('vista previa con personalización', () => {
  it('las opciones del borrador pisan a las guardadas', () => {
    const q = borradorSobreGuardada({ id: 1, opciones: { secciones: { planos: false } } }, { opciones: { columnas: { imagen: true } } });
    expect(q.opciones.columnas.imagen).toBe(true);
    // El borrador manda las opciones completas: lo que no trae vuelve a su valor por omisión.
    expect(q.opciones.secciones.planos).toBe(true);
    const sin = borradorSobreGuardada({ id: 1, opciones: { secciones: { planos: false } } }, { projectName: 'x' });
    expect(sin.opciones).toEqual({ secciones: { planos: false } });
  });
});

describe('plantillas de cotización', () => {
  const guardada = {
    id: 9,
    companyId: 1,
    segmento: 'OBRA',
    quoteNumber: 'NEX-LJ75100126-0009',
    clientName: 'Plaza Norte',
    clientEmail: 'compras@plazanorte.mx',
    projectName: 'Renovación del CCTV',
    scope: 'Entrada del alcance.',
    objetivo: 'Beneficios:\n1. Más cobertura.',
    alcanceBloques: [{ clave: 'plantilla:mantenimiento', titulo: 'Mantenimiento', texto: 'Texto', vinetas: ['Uno'] }],
    note: 'No incluye:\nObra civil.',
    depositPercent: 60,
    currency: 'USD',
    opciones: { columnas: { marcaModelo: true }, autorizo: { nombre: 'Christian' }, carta: { dirigidaA: 'Ing. Pérez', mensaje: 'Hola' } },
    items: [{ name: 'Cámara', unit: 'Pieza', qty: 3, unitPrice: 800, discount: 0, tax: 16, brand: 'Hikvision', grupo: 'EQUIPOS' }],
  };

  it('ida y vuelta: textos, secciones, columnas y términos; sin cliente, folio ni «Autorizó»', () => {
    const contenido = contenidoDesdeCotizacion(guardada, true);
    const vuelta = normalizarContenidoPlantilla(JSON.parse(JSON.stringify(contenido)));
    expect(vuelta).toEqual(contenido);
    expect(vuelta).toMatchObject({
      segmento: 'OBRA',
      projectName: 'Renovación del CCTV',
      scope: 'Entrada del alcance.',
      note: 'No incluye:\nObra civil.',
      depositPercent: 60,
      currency: 'USD',
    });
    expect(vuelta.opciones.columnas.marcaModelo).toBe(true);
    expect(vuelta.opciones.carta).toEqual({ dirigidaA: 'Ing. Pérez', mensaje: 'Hola' });
    expect(vuelta.opciones.autorizo).toBeNull();
    expect(vuelta.items).toEqual([
      expect.objectContaining({ name: 'Cámara', qty: 3, unitPrice: 800, brand: 'Hikvision', grupo: 'EQUIPOS' }),
    ]);
    expect(JSON.stringify(vuelta)).not.toMatch(/Plaza Norte|compras@|NEX-LJ/);
  });

  it('sin «con partidas», la plantilla no lleva precios', () => {
    expect(contenidoDesdeCotizacion(guardada, false).items).toEqual([]);
  });

  it('el servicio guarda de la cotización de su empresa y lista solo las de su empresa', async () => {
    const creadas: any[] = [];
    const prisma = {
      cotizacion: {
        findFirst: jest.fn(async ({ where }: any) => (where.id === 9 && where.companyId === 1 ? { ...guardada } : null)),
      },
      companyProfile: { findFirst: jest.fn(async () => ({ id: 1 })), findUnique: jest.fn(async () => ({ id: 1 })) },
      cotizacionPlantilla: {
        create: jest.fn(async ({ data }: any) => {
          const fila = { id: creadas.length + 1, archivadaAt: null, updatedAt: new Date(), ...data };
          creadas.push(fila);
          return fila;
        }),
        findMany: jest.fn(async ({ where }: any) => creadas.filter((f) => f.companyId === where.companyId && !f.archivadaAt)),
        findFirst: jest.fn(async ({ where }: any) => creadas.find((f) => f.id === where.id && f.companyId === where.companyId) ?? null),
        update: jest.fn(async ({ where, data }: any) => Object.assign(creadas.find((f) => f.id === where.id), data)),
      },
    };
    const servicio = new CotizacionesService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    const hecha = await servicio.guardarPlantilla({ nombre: '  CCTV   obra ', cotizacionId: 9, conPartidas: true }, 1, 1);
    expect(hecha).toEqual({ id: 1, nombre: 'CCTV obra', conPartidas: true, partidas: 1 });
    await expect(servicio.guardarPlantilla({ nombre: 'Ajena', cotizacionId: 9 }, 1, 2)).rejects.toBeInstanceOf(NotFoundException);

    const lista = await servicio.listarPlantillasGuardadas(1);
    expect(lista).toEqual([expect.objectContaining({ id: 1, nombre: 'CCTV obra', segmento: 'OBRA', partidas: 1, conPartidas: true })]);
    const completa = await servicio.plantillaGuardada(1, 1);
    expect(completa.contenido.projectName).toBe('Renovación del CCTV');
    await expect(servicio.plantillaGuardada(1, 2)).rejects.toBeInstanceOf(NotFoundException);

    await servicio.archivarPlantilla(1, 1);
    expect(await servicio.listarPlantillasGuardadas(1)).toEqual([]);
  });
});
