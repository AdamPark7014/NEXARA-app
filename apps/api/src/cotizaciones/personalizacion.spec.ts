import { NotFoundException } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service.js';
import {
  condicionesPorOmision,
  contenidoDesdeCotizacion,
  normalizarContenidoPlantilla,
  normalizarOpciones,
  opcionesDePropuesta,
  opcionesPorOmision,
} from './personalizacion.js';
import { payloadDePropuesta, type CotizacionParaPropuesta } from './propuesta-payload.js';
import { generarPropuestaTecnicaPdf } from './propuesta-tecnica-pdf.js';
import { borradorSobreGuardada } from './propuesta-vista-previa.js';
import { terminosDeCotizacion } from './terminos-segmento.js';

/** «Mayor personalización»: secciones, columnas, carta, condiciones, moneda, firmas y plantillas. */

const COTIZACION: CotizacionParaPropuesta = {
  quoteNumber: 'NEX-LJ75100126-0009',
  status: 'DRAFT',
  segmento: 'OBRA',
  issueDate: '2026-09-18T00:00:00.000Z',
  validUntil: '2026-10-03T00:00:00.000Z',
  clientName: 'Plaza Norte',
  projectName: 'CCTV',
  scope: 'Entrada.',
  alcanceBloques: [{ clave: 'libre-1', titulo: 'Mantenimiento', texto: 'Texto', vinetas: [] }],
  depositPercent: 50,
  currency: 'MXN',
  subtotal: 1000,
  taxTotal: 160,
  total: 1160,
  items: [
    { name: 'Cámara bala', unit: 'Pieza', qty: 2, unitPrice: 500, brand: 'Hikvision', model: 'DS-2CE16', discount: 10 } as any,
  ],
};
const EXTRAS = {
  planos: [{ url: '/uploads/x.png', nombre: 'Plano' }],
  participantes: [{ nombre: 'Luis Joel Aguilar', rolEtiqueta: 'Elaboró', siglas: 'LJ' }],
  autor: { nombre: 'Luis Joel Aguilar', cargo: 'Coordinador comercial' },
};

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
      condiciones: { garantia: 'x'.repeat(900) },
      autorizo: { nombre: 'Christian Del Pozo', cargo: 'Dirección', userId: '3' },
      otraCosa: true,
    });
    expect(o.secciones).toEqual({ objetivo: true, alcance: true, planos: false, terminos: true, firma: true });
    expect(o.columnas.imagen).toBe(true);
    expect(o.columnas.precioUnitario).toBe(true);
    expect(o.carta).toEqual({ dirigidaA: 'Ing. Pérez', mensaje: 'Estimado…' });
    expect(o.condiciones.garantia).toHaveLength(300);
    expect(o.autorizo).toEqual({ nombre: 'Christian Del Pozo', cargo: 'Dirección', userId: 3 });
    expect(o).not.toHaveProperty('otraCosa');
  });

  it('una carta vacía es «sin carta»', () => {
    expect(normalizarOpciones({ carta: { dirigidaA: ' ', mensaje: '' } }).carta).toBeNull();
  });
});

describe('opcionesDePropuesta (contrato del PDF)', () => {
  it('por omisión: una firma «Elaboró» con el autor y MXN', () => {
    expect(opcionesDePropuesta(opcionesPorOmision(), { moneda: 'MXN', autor: EXTRAS.autor })).toEqual({
      secciones: { objetivo: true, alcance: true, planos: true, terminos: true, firma: true },
      columnas: { marcaModelo: false, imagen: false, descuento: false, precioUnitario: true },
      carta: null,
      moneda: 'MXN',
      firmas: [{ nombre: 'Luis Joel Aguilar', cargo: 'Coordinador comercial', rol: 'Elaboró' }],
    });
  });

  it('Autorizó, otra persona en Elaboró y nota de tipo de cambio solo en USD', () => {
    const o = normalizarOpciones({
      elaboro: { nombre: 'Jorge Méndez' },
      autorizo: { nombre: 'Christian Del Pozo', cargo: 'Dirección' },
      tipoCambioNota: 'Tipo de cambio DOF del día de pago.',
    });
    const usd = opcionesDePropuesta(o, { moneda: 'usd', autor: EXTRAS.autor });
    expect(usd.moneda).toBe('USD');
    expect(usd.tipoCambioNota).toBe('Tipo de cambio DOF del día de pago.');
    expect(usd.firmas).toEqual([
      { nombre: 'Jorge Méndez', rol: 'Elaboró' },
      { nombre: 'Christian Del Pozo', cargo: 'Dirección', rol: 'Autorizó' },
    ]);
    expect(opcionesDePropuesta(o, { moneda: 'MXN' })).not.toHaveProperty('tipoCambioNota');
  });
});

describe('payloadDePropuesta con personalización', () => {
  it('sin opciones: mismo contenido que antes, más `opciones` por omisión', () => {
    const p = payloadDePropuesta(COTIZACION, EXTRAS);
    expect(p.alcance.length).toBeGreaterThan(0);
    expect(p.planos).toHaveLength(1);
    expect(p.participantes).toHaveLength(1);
    expect(p.terminos.lineas.length).toBeGreaterThan(0);
    expect(p.opciones.firmas).toEqual([{ nombre: 'Luis Joel Aguilar', cargo: 'Coordinador comercial', rol: 'Elaboró' }]);
    // Las partidas llevan marca, modelo y descuento para las columnas opcionales.
    expect(p.grupos[0]!.partidas[0]).toMatchObject({ marca: 'Hikvision', modelo: 'DS-2CE16', descuentoPct: 10, lineTotal: 900 });
  });

  it('lo que se apaga no llega al PDF (alcance, planos, términos y firmas)', () => {
    const p = payloadDePropuesta(
      { ...COTIZACION, opciones: { secciones: { alcance: false, planos: false, terminos: false, firma: false } } },
      EXTRAS,
    );
    expect(p.alcance).toEqual([]);
    expect(p.planos).toEqual([]);
    expect(p.terminos.lineas).toEqual([]);
    expect(p.participantes).toEqual([]);
    expect(p.opciones.secciones).toMatchObject({ alcance: false, planos: false, terminos: false, firma: false });
  });

  it('el generador actual ignora lo que no conoce y sigue armando el PDF', async () => {
    const pdf = await generarPropuestaTecnicaPdf(
      payloadDePropuesta(
        {
          ...COTIZACION,
          currency: 'USD',
          opciones: { columnas: { imagen: true, marcaModelo: true }, carta: { dirigidaA: 'Ing. Pérez', mensaje: 'Hola' } },
        },
        EXTRAS,
      ),
    );
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
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
